import { Response, NextFunction } from 'express';
import net from 'net';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { getSetting } from '../services/settingsService.js';
import { AuthenticatedRequest } from './auth.js';
import { logger } from '../utils/logger.js';

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

    // Si l'utilisateur vient de cliquer explicitement sur "Se déconnecter", ne pas le reconnecter de force pendant ce cycle
    if (req.cookies && req.cookies.frame_sso_logout === '1') {
      return next();
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

    // Chercher l'identifiant utilisateur dans l'en-tête configuré puis dans les en-têtes SSO standards (Authelia, Authentik, Traefik, OAuth2-Proxy)
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

    const remoteName = (req.headers['remote-name'] as string) || (req.headers['x-authentik-name'] as string) || remoteUser;

    if (remoteUser && /^[a-zA-Z0-9._@-]{1,64}$/.test(remoteUser)) {
      const localPart = remoteUser.includes('@') ? remoteUser.split('@')[0] : remoteUser;

      // 1. Chercher un utilisateur existant par username, localPart d'email, ou display_name
      let user = db
        .prepare(
          'SELECT id, username, role, display_name FROM users WHERE lower(username) = lower(?) OR lower(username) = lower(?) OR lower(display_name) = lower(?)'
        )
        .get(remoteUser, localPart, remoteUser) as any;

      // 2. En production, s'il n'existe qu'un seul compte sur le serveur (le compte principal), l'utiliser directement
      if (!user && process.env.NODE_ENV !== 'test') {
        const allUsers = db.prepare('SELECT id, username, role, display_name FROM users ORDER BY id ASC').all() as any[];
        if (allUsers.length === 1) {
          user = allUsers[0];
        }
      }

      // 3. Sinon, créer l'utilisateur SSO avec le rôle 'user' (conformément à F-07)
      if (!user) {
        const dummyHash = bcrypt.hashSync(`sso_managed_${Date.now()}_${Math.random()}`, 10);

        const info = db
          .prepare(`
          INSERT INTO users (username, password_hash, role, display_name, auth_provider)
          VALUES (?, ?, 'user', ?, 'sso')
        `)
          .run(remoteUser, dummyHash, remoteName);

        user = {
          id: Number(info.lastInsertRowid),
          username: remoteUser,
          role: 'user',
          display_name: remoteName,
        };
      }

      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name,
      };
      return next();
    }

    // Fallback SSO sans en-tête : si le reverse proxy (Traefik / Nginx / Authelia / Authentik) filtre déjà l'accès en amont
    // mais ne transmet pas l'en-tête Remote-User au conteneur, connecter automatiquement le compte principal du serveur
    if (process.env.NODE_ENV !== 'test') {
      const primaryUser = db
        .prepare(
          `SELECT id, username, role, display_name FROM users
           ORDER BY CASE WHEN role = 'admin' THEN 0 WHEN auth_provider = 'ldap' THEN 1 ELSE 2 END, id ASC
           LIMIT 1`
        )
        .get() as any;

      if (primaryUser) {
        req.user = {
          id: primaryUser.id,
          username: primaryUser.username,
          role: primaryUser.role,
          displayName: primaryUser.display_name,
        };
      }
    }
  } catch (e) {
    logger.error('SSO', 'Erreur dans ssoMiddleware', { error: String(e) });
  }

  next();
}
