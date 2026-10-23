import { Router, Response } from 'express';
import db from '../db/index.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

/**
 * Lister tous les utilisateurs du serveur
 */
router.get('/', (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = db
      .prepare(`
      SELECT id, username, role, display_name, auth_provider, simkl_token, jellyfin_token, seer_user_id, created_at
      FROM users
      ORDER BY created_at ASC
    `)
      .all() as any[];

    res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        displayName: u.display_name,
        authProvider: u.auth_provider || 'local',
        simklConnected: Boolean(u.simkl_token),
        jellyfinConnected: Boolean(u.jellyfin_token),
        seerUserId: u.seer_user_id || null,
        createdAt: u.created_at,
      }))
    );
  } catch (err: any) {
    serverError(res, err, 'UsersList');
  }
});

/**
 * Modifier le rôle d'un utilisateur ('admin' | 'user')
 */
router.put('/:id/role', (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({ error: 'Rôle invalide.' });
      return;
    }

    if (targetId === req.user!.id && role !== 'admin') {
      res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur.' });
      return;
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);
    res.json({ success: true, message: 'Rôle mis à jour.' });
  } catch (err: any) {
    serverError(res, err, 'UsersUpdateRole');
  }
});

/**
 * Supprimer un compte utilisateur
 */
router.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id, 10);

    if (targetId === req.user!.id) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' });
      return;
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    res.json({ success: true, message: 'Utilisateur supprimé avec succès.' });
  } catch (err: any) {
    serverError(res, err, 'UsersDelete');
  }
});

export default router;
