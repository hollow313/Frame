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
  for (const entry of trustedList) {
    const item = entry.trim();
    if (!item) continue;
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

  return blockList.check(cleanAddr, addrFamily);
}

/**
 * Middleware d'authentification SSO / Reverse Proxy (ex: Authelia, Authentik, Traefik)
 * Durci selon F-07 :
 * - Ne fait confiance à l'en-tête SSO que si l'IP source figure dans SSO_TRUSTED_PROXIES
 * - N'attribue jamais automatiquement le rôle 'admin' via SSO
 */
export function ssoMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const ssoEnabled = getSetting('SSO_ENABLED') === 'true';
    if (!ssoEnabled) {
      return next();
    }

    // Si l'utilisateur possède déjà un cookie ou un token JWT, laisser le flux normal gérer
    if (req.headers['authorization'] || (req.cookies && req.cookies.frame_token)) {
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

    const headerName = (getSetting('SSO_HEADER') || 'Remote-User').toLowerCase();
    const rawHeaderVal = req.headers[headerName];
    const remoteUser = typeof rawHeaderVal === 'string' ? rawHeaderVal.trim() : '';

    if (!remoteUser || !/^[a-zA-Z0-9._@-]{1,64}$/.test(remoteUser)) {
      return next();
    }

    const remoteName = (req.headers['remote-name'] as string) || remoteUser;

    // Vérifier ou créer l'utilisateur dans SQLite (toujours avec le rôle 'user', jamais 'admin' automatique)
    let user = db
      .prepare('SELECT id, username, role, display_name FROM users WHERE lower(username) = lower(?)')
      .get(remoteUser) as any;

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
  } catch (e) {
    logger.error('SSO', 'Erreur dans ssoMiddleware', { error: String(e) });
  }

  next();
}
