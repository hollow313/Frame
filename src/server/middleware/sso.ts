import { Response, NextFunction } from 'express';
import net from 'net';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { getSetting } from '../services/settingsService.js';
import { AuthenticatedRequest } from './auth.js';
import { logger } from '../utils/logger.js';

interface SsoResolvedIdentity {
  username: string;
  displayName: string;
  expiresAt: number;
}

// Cache mémoire court (2 minutes) associant le hash du cookie de session SSO à l'identité résolue auprès du portail SSO
const ssoSessionCache = new Map<string, SsoResolvedIdentity>();
let discoveredSsoOrigin: string | null = null;

function isTrustedProxyIp(remoteAddr: string | undefined, trustedList: string[]): boolean {
  if (!remoteAddr || trustedList.length === 0) return false;

  // Normaliser les adresses IPv4 mappées en IPv6 (ex: ::ffff:172.18.0.5 -> 172.18.0.5)
  const cleanAddr = remoteAddr.replace(/^::ffff:/i, '');
  const addrVersion = net.isIP(cleanAddr);
  if (addrVersion === 0) return false;
  const addrFamily = addrVersion === 6 ? 'ipv6' : 'ipv4';

  const blockList = new net.BlockList();
  let hasExplicit10Rule = false;

  for (const entry of trustedList) {
    const item = entry.trim();
    if (!item) continue;
    if (item.startsWith('10.')) hasExplicit10Rule = true;
    if (item.includes('/')) {
      const [subnet, prefixStr] = item.split('/');
      const cleanSubnet = subnet.replace(/^::ffff:/i, '');
      const ver = net.isIP(cleanSubnet);
      const prefix = parseInt(prefixStr, 10);
      if (ver !== 0 && !isNaN(prefix)) {
        blockList.addSubnet(cleanSubnet, prefix, ver === 6 ? 'ipv6' : 'ipv4');
      }
    } else {
      const cleanIp = item.replace(/^::ffff:/i, '');
      const ver = net.isIP(cleanIp);
      if (ver !== 0) {
        blockList.addAddress(cleanIp, ver === 6 ? 'ipv6' : 'ipv4');
      }
    }
  }

  // En environnement Docker / TrueNAS / Kubernetes, le reverse proxy (Traefik, Nginx, Authelia)
  // contacte le conteneur via l'interface bridge interne (172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8).
  // Dès lors qu'au moins un proxy de confiance est configuré, on autorise automatiquement ces sous-réseaux locaux/conteneurs.
  blockList.addSubnet('127.0.0.0', 8, 'ipv4');
  blockList.addSubnet('172.16.0.0', 12, 'ipv4');
  blockList.addSubnet('192.168.0.0', 16, 'ipv4');
  if (!hasExplicit10Rule) {
    blockList.addSubnet('10.0.0.0', 8, 'ipv4');
  }
  blockList.addAddress('::1', 'ipv6');
  blockList.addSubnet('fc00::', 7, 'ipv6');
  blockList.addSubnet('fe80::', 10, 'ipv6');

  return blockList.check(cleanAddr, addrFamily);
}

/**
 * Extrait les cookies tiers (SSO) en excluant les cookies internes de Frame
 */
export function extractExternalSsoCookies(cookieHeader: string | undefined): string {
  if (!cookieHeader) return '';
  return cookieHeader
    .split(';')
    .map((c) => c.trim())
    .filter((c) => {
      const lower = c.toLowerCase();
      return (
        Boolean(c) &&
        !lower.startsWith('frame_token=') &&
        !lower.startsWith('frame_sso_logout=')
      );
    })
    .sort()
    .join('; ');
}

export function hashSsoCookies(externalCookies: string): string {
  return crypto.createHash('sha256').update(externalCookies).digest('hex').slice(0, 32);
}

/**
 * Tente d'extraire un identifiant utilisateur depuis un éventuel cookie JWT (ex: CF_Authorization, Authentik, OIDC)
 */
function tryDecodeJwtCookie(externalCookies: string): { username: string; displayName: string } | null {
  const parts = externalCookies.split(';').map((s) => s.trim());
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const val = part.slice(eqIdx + 1).trim();
    const jwtParts = val.split('.');
    if (jwtParts.length === 3 && val.startsWith('eyJ')) {
      try {
        const payloadJson = Buffer.from(jwtParts[1], 'base64url').toString('utf8');
        const payload = JSON.parse(payloadJson);
        const candidate =
          payload.preferred_username ||
          payload.username ||
          payload.upn ||
          payload.email ||
          payload.sub;
        if (typeof candidate === 'string' && /^[a-zA-Z0-9._@-]{1,64}$/.test(candidate.trim())) {
          const username = candidate.trim();
          const displayName =
            (typeof payload.name === 'string' && payload.name.trim()) ||
            (typeof payload.display_name === 'string' && payload.display_name.trim()) ||
            username;
          return { username, displayName };
        }
      } catch {
        // Pas un JWT JSON valide
      }
    }
  }
  return null;
}

/**
 * Effectue une requête HTTP/HTTPS (avec support SNI direct vers l'IP du reverse proxy local pour contourner les soucis DNS/Hairpin Docker)
 */
function requestSsoEndpoint(options: {
  targetOrigin: string;
  path: string;
  cookieHeader?: string;
  extraHeaders?: Record<string, string>;
  proxyIp?: string;
  timeoutMs?: number;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(options.targetOrigin);
      const isHttps = parsed.protocol === 'https:';
      const targetHostname = parsed.hostname;
      const connectHost =
        options.proxyIp && net.isIP(options.proxyIp) && !net.isIP(targetHostname)
          ? options.proxyIp
          : targetHostname;
      const port = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;

      const reqHeaders: Record<string, string> = {
        Host: parsed.host,
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Frame-SSO-Verifier/1.0',
        ...(options.extraHeaders || {}),
      };
      if (options.cookieHeader) {
        reqHeaders.Cookie = options.cookieHeader;
      }

      const reqOpts: https.RequestOptions = {
        host: connectHost,
        port,
        path: options.path,
        method: 'GET',
        headers: reqHeaders,
        timeout: options.timeoutMs || 1800,
      };

      if (isHttps) {
        reqOpts.servername = targetHostname;
        reqOpts.rejectUnauthorized = false;
      }

      const lib = isHttps ? https : http;
      const clientReq = lib.request(reqOpts, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length < 16384) body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      });

      clientReq.on('timeout', () => {
        clientReq.destroy(new Error('Timeout'));
      });
      clientReq.on('error', (err) => {
        reject(err);
      });
      clientReq.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Interroge un portail SSO candidat (Authelia, Authentik, etc.) avec le cookie de session du navigateur
 * afin de résoudre exactement quel utilisateur (User A vs User B) est connecté sur le SSO.
 */
async function probeSsoOriginForUser(
  origin: string,
  externalCookies: string,
  forwardedHost: string,
  forwardedProto: string,
  proxyIp?: string
): Promise<{ username: string; displayName: string } | null> {
  const originalUrl = `${forwardedProto}://${forwardedHost}/`;
  const forwardAuthHeaders = {
    'X-Original-URL': originalUrl,
    'X-Original-Method': 'GET',
    'X-Forwarded-Method': 'GET',
    'X-Forwarded-Proto': forwardedProto,
    'X-Forwarded-Host': forwardedHost,
    'X-Forwarded-URI': '/',
  };

  // Liste des endpoints standards Authelia & Authentik
  const endpoints = [
    { path: '/api/user/info', extraHeaders: {} },
    { path: '/api/verify', extraHeaders: forwardAuthHeaders },
    { path: '/api/authz/forward-auth', extraHeaders: forwardAuthHeaders },
    { path: '/outpost.goauthentik.io/auth/traefik', extraHeaders: forwardAuthHeaders },
    { path: '/outpost.goauthentik.io/auth/nginx', extraHeaders: forwardAuthHeaders },
    { path: '/api/v3/core/users/me/', extraHeaders: {} },
  ];

  // Tester à la fois via l'IP du reverse proxy local (SNI direct) et en résolution DNS directe
  const proxyVariants = proxyIp ? [proxyIp, undefined] : [undefined];

  for (const currentProxyIp of proxyVariants) {
    const results = await Promise.allSettled(
      endpoints.map((ep) =>
        requestSsoEndpoint({
          targetOrigin: origin,
          path: ep.path,
          cookieHeader: externalCookies,
          extraHeaders: ep.extraHeaders,
          proxyIp: currentProxyIp,
          timeoutMs: 1500,
        })
      )
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      const { statusCode, headers, body } = r.value;
      if (statusCode < 200 || statusCode >= 300) continue;

      // 1. Vérifier les en-têtes de réponse ForwardAuth (Authelia / Authentik)
      const headerCandidates = [
        'remote-user',
        'x-authentik-username',
        'x-forwarded-user',
        'x-auth-request-user',
        'x-auth-request-preferred-username',
        'remote-email',
        'x-authentik-email',
      ];
      for (const hc of headerCandidates) {
        const val = headers[hc];
        const strVal = Array.isArray(val) ? val[0] : val;
        if (typeof strVal === 'string' && /^[a-zA-Z0-9._@-]{1,64}$/.test(strVal.trim())) {
          const rawName = headers['remote-name'] || headers['x-authentik-name'];
          const displayName =
            (Array.isArray(rawName) ? rawName[0] : rawName) || strVal.trim();
          discoveredSsoOrigin = origin;
          return { username: strVal.trim(), displayName: String(displayName).trim() };
        }
      }

      // 2. Vérifier le corps JSON (/api/user/info d'Authelia ou /api/v3/core/users/me/ d'Authentik)
      if (body && body.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(body);
          const dataObj = parsed?.data || parsed?.user || parsed;
          const rawUser =
            dataObj?.username ||
            dataObj?.preferred_username ||
            dataObj?.uid ||
            (Array.isArray(dataObj?.emails) ? dataObj.emails[0] : dataObj?.email);
          if (typeof rawUser === 'string' && /^[a-zA-Z0-9._@-]{1,64}$/.test(rawUser.trim())) {
            const displayName =
              dataObj?.display_name ||
              dataObj?.name ||
              dataObj?.cn ||
              rawUser.trim();
            discoveredSsoOrigin = origin;
            return { username: rawUser.trim(), displayName: String(displayName).trim() };
          }
        } catch {
          // Ignorer JSON invalide
        }
      }
    }
  }

  return null;
}

/**
 * Résout dynamiquement l'identité de l'utilisateur SSO à partir des cookies du navigateur
 * lorsque le reverse proxy ne transmet pas directement l'en-tête Remote-User.
 */
async function resolveUserFromSsoCookies(
  req: AuthenticatedRequest,
  externalCookies: string,
  trustedList: string[]
): Promise<{ username: string; displayName: string } | null> {
  const cookieHash = hashSsoCookies(externalCookies);
  const now = Date.now();
  const cached = ssoSessionCache.get(cookieHash);
  if (cached && cached.expiresAt > now) {
    return { username: cached.username, displayName: cached.displayName };
  }

  // 1. Tester si le cookie est directement un JWT signé contenant le username
  const jwtIdentity = tryDecodeJwtCookie(externalCookies);
  if (jwtIdentity) {
    ssoSessionCache.set(cookieHash, { ...jwtIdentity, expiresAt: now + 2 * 60 * 1000 });
    return jwtIdentity;
  }

  // 2. Déterminer le domaine et l'IP du reverse proxy
  const forwardedHost =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host'].split(',')[0].trim()) ||
    (typeof req.headers.host === 'string' && req.headers.host.trim()) ||
    '';
  const forwardedProto =
    (typeof req.headers['x-forwarded-proto'] === 'string' && req.headers['x-forwarded-proto'].split(',')[0].trim()) ||
    'https';

  const proxyIp = trustedList.find((ip) => net.isIP(ip.trim()) !== 0)?.trim();

  // Extraire le domaine racine (ex: frame.example.com -> example.com, ou depuis LDAP_BASE_DN dc=example,dc=com)
  let baseDomain = '';
  const hostWithoutPort = forwardedHost.split(':')[0];
  if (hostWithoutPort && !net.isIP(hostWithoutPort) && hostWithoutPort.includes('.')) {
    const parts = hostWithoutPort.split('.');
    baseDomain = parts.length > 2 ? parts.slice(1).join('.') : hostWithoutPort;
  }
  if (!baseDomain) {
    const ldapBase = getSetting('LDAP_BASE_DN') || '';
    const dcParts = ldapBase
      .split(',')
      .map((p) => p.trim())
      .filter((p) => /^dc=/i.test(p))
      .map((p) => p.replace(/^dc=/i, ''));
    if (dcParts.length >= 2) {
      baseDomain = dcParts.join('.');
    }
  }

  const candidateOrigins = new Set<string>();
  if (discoveredSsoOrigin) {
    candidateOrigins.add(discoveredSsoOrigin);
  }

  // Si l'en-tête Referer provient du portail d'authentification
  if (typeof req.headers.referer === 'string') {
    try {
      const refOrigin = new URL(req.headers.referer).origin;
      if (refOrigin && !refOrigin.includes(forwardedHost)) {
        candidateOrigins.add(refOrigin);
      }
    } catch {
      // Ignorer
    }
  }

  // Découverte automatique via une requête non authentifiée sur l'hôte courant pour lire la redirection 302 Location du Reverse Proxy
  if (forwardedHost && !net.isIP(hostWithoutPort)) {
    try {
      const selfOrigin = `${forwardedProto}://${forwardedHost}`;
      const probeRes = await requestSsoEndpoint({
        targetOrigin: selfOrigin,
        path: '/',
        proxyIp,
        timeoutMs: 1200,
      });
      const loc = probeRes.headers.location;
      if (typeof loc === 'string' && loc.startsWith('http')) {
        const locOrigin = new URL(loc).origin;
        candidateOrigins.add(locOrigin);
      }
    } catch {
      // Ignorer
    }
  }

  if (baseDomain) {
    for (const sub of ['auth', 'sso', 'login', 'authelia', 'authentik', 'id']) {
      candidateOrigins.add(`https://${sub}.${baseDomain}`);
    }
  }

  if (proxyIp) {
    candidateOrigins.add(`http://${proxyIp}:9091`);
    candidateOrigins.add(`https://${proxyIp}:9091`);
    candidateOrigins.add(`http://${proxyIp}:9000`);
    candidateOrigins.add(`https://${proxyIp}:9443`);
  }

  for (const origin of candidateOrigins) {
    const resolved = await probeSsoOriginForUser(
      origin,
      externalCookies,
      forwardedHost || `frame.${baseDomain || 'local'}`,
      forwardedProto,
      proxyIp
    );
    if (resolved) {
      ssoSessionCache.set(cookieHash, {
        ...resolved,
        expiresAt: now + 2 * 60 * 1000,
      });
      return resolved;
    }
  }

  return null;
}

/**
 * Associe l'identifiant SSO résolu (`remoteUser`) à son compte SQLite propre (ou le crée avec le rôle 'user')
 */
function attachSsoUserToRequest(req: AuthenticatedRequest, remoteUser: string, remoteName: string): void {
  const localPart = remoteUser.includes('@') ? remoteUser.split('@')[0] : remoteUser;

  // 1. Chercher l'utilisateur correspondant dans SQLite par username, localPart d'email, ou display_name
  let user = db
    .prepare(
      'SELECT id, username, role, display_name FROM users WHERE lower(username) = lower(?) OR lower(username) = lower(?) OR lower(display_name) = lower(?)'
    )
    .get(remoteUser, localPart, remoteUser) as any;

  // 2. S'il n'existe pas encore, créer son propre compte (toujours avec le rôle 'user' conformément à F-07)
  if (!user) {
    const dummyHash = bcrypt.hashSync(`sso_managed_${Date.now()}_${Math.random()}`, 10);
    const cleanUsername = localPart.toLowerCase();

    const info = db
      .prepare(`
      INSERT INTO users (username, password_hash, role, display_name, auth_provider)
      VALUES (?, ?, 'user', ?, 'sso')
    `)
      .run(cleanUsername, dummyHash, remoteName || cleanUsername);

    user = {
      id: Number(info.lastInsertRowid),
      username: cleanUsername,
      role: 'user',
      display_name: remoteName || cleanUsername,
    };
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
  };
  req.ssoAuthenticated = true;
}

/**
 * Middleware d'authentification SSO / Reverse Proxy (ex: Authelia, Authentik, Traefik, Nginx Proxy Manager)
 * Durci selon F-07 :
 * - Ne fait confiance au SSO que si SSO_TRUSTED_PROXIES est renseigné et l'IP source est de confiance
 * - N'attribue jamais automatiquement le rôle 'admin' lors de la création d'un nouvel utilisateur SSO inconnu
 */
export function ssoMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const ssoEnabled = getSetting('SSO_ENABLED') === 'true';
    if (!ssoEnabled) {
      return next();
    }

    // Calculer l'empreinte des cookies SSO externes pour détecter immédiatement tout changement d'utilisateur SSO sur un même navigateur
    const externalCookies = extractExternalSsoCookies(req.headers?.cookie);
    if (externalCookies) {
      req.ssoCookieHash = hashSsoCookies(externalCookies);
    }

    // Vérifier que la requête provient bien d'un reverse proxy de confiance (F-07)
    const trustedRaw = getSetting('SSO_TRUSTED_PROXIES') || process.env.SSO_TRUSTED_PROXIES || '';
    const trusted = trustedRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (trusted.length === 0) {
      // Tant que SSO_TRUSTED_PROXIES est vide, ignorer l'en-tête SSO
      return next();
    }

    const remoteAddr = req.socket?.remoteAddress;
    if (!isTrustedProxyIp(remoteAddr, trusted)) {
      logger.warn('SSO', 'En-tête SSO ignoré car IP source non listée dans SSO_TRUSTED_PROXIES', {
        remoteAddr,
      });
      return next();
    }

    // 1. Chercher l'identifiant utilisateur dans l'en-tête configuré puis dans les en-têtes SSO standards
    const configuredHeader = (getSetting('SSO_HEADER') || 'Remote-User').toLowerCase();
    const candidateHeaders = [
      configuredHeader,
      'remote-user',
      'x-forwarded-user',
      'x-authentik-username',
      'x-auth-request-user',
      'x-auth-request-preferred-username',
      'x-forwarded-preferred-username',
      'x-webauth-user',
      'remote-email',
      'x-forwarded-email',
      'cf-access-authenticated-user-email',
      'x-amzn-oidc-identity',
      'x-user',
      'auth-user',
      'remote-name',
    ];

    let remoteUser = '';
    for (const h of candidateHeaders) {
      const val = req.headers[h];
      if (typeof val === 'string' && val.trim()) {
        remoteUser = val.trim();
        break;
      }
    }

    const remoteName =
      (req.headers['remote-name'] as string) ||
      (req.headers['x-authentik-name'] as string) ||
      remoteUser;

    // Chemin synchrone immédiat lorsque l'en-tête est présent
    if (remoteUser && /^[a-zA-Z0-9._@-]{1,64}$/.test(remoteUser)) {
      attachSsoUserToRequest(req, remoteUser, remoteName);
      return next();
    }

    // 2. Si le reverse proxy n'a pas injecté l'en-tête Remote-User mais a transmis le cookie de session SSO du domaine (ex: authelia_session),
    // interroger le portail SSO avec ce cookie pour identifier précisément l'utilisateur courant (User A vs User B).
    if (externalCookies && process.env.NODE_ENV !== 'test') {
      resolveUserFromSsoCookies(req, externalCookies, trusted)
        .then((resolved) => {
          if (resolved) {
            attachSsoUserToRequest(req, resolved.username, resolved.displayName);
          }
          next();
        })
        .catch(() => {
          next();
        });
      return;
    }
  } catch (e) {
    logger.error('SSO', 'Erreur dans ssoMiddleware', { error: String(e) });
  }

  next();
}
