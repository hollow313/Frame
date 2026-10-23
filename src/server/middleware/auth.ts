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
}

/**
 * Extrait et valide l'utilisateur courant à partir du cookie ou de l'en-tête Authorization,
 * puis vérifie son existence et son rôle en temps réel dans SQLite (F-05, D-05).
 */
export function extractUser(req: AuthenticatedRequest): AuthUser | null {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token && req.cookies && req.cookies.frame_token) {
    token = req.cookies.frame_token;
  }

  if (!token) {
    if (req.user) {
      // Déjà injecté par le middleware SSO (si proxy de confiance vérifié)
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

  try {
    const secret = getSetting('JWT_SECRET');
    if (!secret) return null;
    const payload = jwt.verify(token, secret) as { id: number };
    if (!payload || typeof payload.id !== 'number') return null;

    const dbUser = db
      .prepare('SELECT id, username, role, display_name FROM users WHERE id = ?')
      .get(payload.id) as { id: number; username: string; role: 'admin' | 'user'; display_name?: string } | undefined;

    if (!dbUser) return null;

    return {
      id: dbUser.id,
      username: dbUser.username,
      role: dbUser.role,
      displayName: dbUser.display_name,
    };
  } catch {
    return null;
  }
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

export function generateToken(user: AuthUser): string {
  const secret = getSetting('JWT_SECRET');
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
    },
    secret,
    { expiresIn: '7d' }
  );
}
