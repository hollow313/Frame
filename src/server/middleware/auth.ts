import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getSetting } from '../services/settingsService.js';
import db from '../db/index.js';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  displayName?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  ssoAuthenticated?: boolean;
  ssoCookieHash?: string;
  ssoIdentity?: AuthUser & { ssoUsername: string };
  authSource?: 'password' | 'sso';
}

function loadDbUser(id: number): AuthUser | null {
  const dbUser = db
    .prepare('SELECT id, username, role, display_name FROM users WHERE id = ?')
    .get(id) as { id: number; username: string; role: 'admin' | 'user'; display_name?: string } | undefined;
  if (!dbUser) return null;
  return {
    id: dbUser.id,
    username: dbUser.username,
    role: dbUser.role,
    displayName: dbUser.display_name,
  };
}

/**
 * Extrait et valide l'utilisateur courant à partir du jeton (cookie / Authorization) ou de la session SSO,
 * puis vérifie son existence et son rôle en temps réel dans SQLite (F-05, D-05).
 *
 * Priorités :
 *  1. Jeton issu d'une connexion manuelle (identifiant + mot de passe) : choix explicite de l'utilisateur
 *  2. Identité SSO du navigateur (User A / User B)
 *  3. Jeton SSO précédent (invalidé si la session SSO du navigateur a changé)
 */
export function extractUser(req: AuthenticatedRequest): AuthUser | null {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token && req.cookies && req.cookies.frame_token) {
    token = req.cookies.frame_token;
  }

  let tokenPayload: { id: number; ssoHash?: string; src?: string } | null = null;
  if (token) {
    try {
      const secret = getSetting('JWT_SECRET');
      if (secret) {
        const payload = jwt.verify(token, secret) as { id: number; ssoHash?: string; src?: string };
        if (payload && typeof payload.id === 'number') {
          tokenPayload = payload;
        }
      }
    } catch {
      // Token invalide ou expiré
    }
  }

  // 1. Identité SSO active validée par le reverse proxy de confiance
  if (req.ssoAuthenticated && req.user) {
    const u = loadDbUser(req.user.id);
    if (u) {
      req.authSource = 'sso';
      return u;
    }
  }

  // 2. Connexion explicite par identifiant / mot de passe (local ou LAN)
  if (tokenPayload && tokenPayload.src === 'password') {
    const u = loadDbUser(tokenPayload.id);
    if (u) {
      req.authSource = 'password';
      return u;
    }
  }

  // 3. Jeton SSO / historique
  if (tokenPayload) {
    // Si la session SSO du navigateur a changé (ex: passage de User A à User B sur le portail SSO),
    // invalider immédiatement le token de l'ancien utilisateur.
    if (
      getSetting('SSO_ENABLED') === 'true' &&
      tokenPayload.ssoHash &&
      req.ssoCookieHash &&
      tokenPayload.ssoHash !== req.ssoCookieHash
    ) {
      return null;
    }
    const u = loadDbUser(tokenPayload.id);
    if (u) {
      req.authSource = tokenPayload.src === 'sso' || tokenPayload.ssoHash ? 'sso' : undefined;
      return u;
    }
    return null;
  }

  if (req.user) {
    // Injecté par le middleware SSO (si proxy de confiance vérifié)
    const dbUser = db
      .prepare('SELECT id, username, role, display_name FROM users WHERE id = ?')
      .get(req.user.id) as { id: number; username: string; role: 'admin' | 'user'; display_name?: string } | undefined;
    if (!dbUser) return null;
    return {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      displayName: dbUser.display_name,
    };
  }

  return null;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const user = extractUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentification requise ou session expirée.' });
    return;
  }
  req.user = user;
  next();
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const user = extractUser(req);
  if (user) {
    req.user = user;
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Accès refusé : privilèges administrateur requis.' });
    return;
  }
  next();
}

export function generateToken(user: AuthUser, ssoCookieHash?: string, src?: 'password' | 'sso'): string {
  const secret = getSetting('JWT_SECRET');
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      ...(ssoCookieHash && src !== 'password' ? { ssoHash: ssoCookieHash } : {}),
      ...(src ? { src } : {}),
    },
    secret,
    { expiresIn: '365d' }
  );
}
