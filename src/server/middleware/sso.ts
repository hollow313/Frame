import { Response, NextFunction } from 'express';
import db from '../db/index.js';
import { getSetting } from '../services/settingsService.js';
import { AuthenticatedRequest, AuthUser } from './auth.js';

export function ssoMiddleware(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const ssoEnabled = getSetting('SSO_ENABLED') === 'true';
  if (!ssoEnabled) {
    return next();
  }

  const headerName = (getSetting('SSO_HEADER') || 'Remote-User').toLowerCase();
  const remoteUser = req.headers[headerName] as string | undefined;

  if (!remoteUser || remoteUser.trim().length === 0) {
    return next();
  }

  const cleanUsername = remoteUser.trim().toLowerCase();
  const displayName = (req.headers['remote-name'] as string) || (req.headers['remote-email'] as string) || cleanUsername;

  try {
    const stmt = db.prepare('SELECT id, username, role, display_name FROM users WHERE username = ?');
    let user = stmt.get(cleanUsername) as any;

    if (!user) {
      // Vérifier s'il s'agit du tout premier utilisateur
      const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
      const count = (countStmt.get() as { count: number }).count;
      const role = count === 0 ? 'admin' : 'user';

      const insertStmt = db.prepare(`
        INSERT INTO users (username, password_hash, role, display_name, auth_provider)
        VALUES (?, 'SSO_MANAGED_ACCOUNT', ?, ?, 'sso')
      `);
      const res = insertStmt.run(cleanUsername, role, displayName);
      user = {
        id: Number(res.lastInsertRowid),
        username: cleanUsername,
        role,
        display_name: displayName,
      };
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
    };
  } catch (err) {
    console.error('[SSO] Erreur middleware:', err);
  }

  next();
}
