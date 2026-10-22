import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getSetting } from '../services/settingsService.js';

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'user';
  displayName?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token && req.cookies && req.cookies.frame_token) {
    token = req.cookies.frame_token;
  }

  if (!token) {
    res.status(401).json({ error: 'Accès non autorisé. Veuillez vous connecter.' });
    return;
  }

  const secret = getSetting('JWT_SECRET');

  try {
    const decoded = jwt.verify(token, secret) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Session expirée ou invalide.' });
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Action réservée aux administrateurs.' });
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
    { expiresIn: '30d' }
  );
}
