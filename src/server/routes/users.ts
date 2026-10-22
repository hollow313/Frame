import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Toutes les routes utilisateurs requièrent authentification + droits admin
router.use(authenticateToken);
router.use(requireAdmin);

// Lister tous les utilisateurs avec statistiques
router.get('/', (_req: AuthenticatedRequest, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        u.id, 
        u.username, 
        u.role, 
        u.display_name, 
        u.created_at,
        (SELECT COUNT(*) FROM watched_items WHERE user_id = u.id) as watched_count,
        (SELECT COUNT(*) FROM watchlist WHERE user_id = u.id) as watchlist_count
      FROM users u
      ORDER BY u.created_at ASC
    `);
    const users = stmt.all();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mettre à jour le rôle
router.put('/:id/role', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { role } = req.body;

    if (role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'Rôle invalide. Doit être "admin" ou "user".' });
      return;
    }

    // Empêcher de s'auto-dégrader si c'est le seul admin
    if (req.user!.id === targetUserId && role !== 'admin') {
      const adminCountStmt = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'");
      const count = (adminCountStmt.get() as { count: number }).count;
      if (count <= 1) {
        res.status(400).json({ error: 'Impossible de rétrograder le dernier administrateur.' });
        return;
      }
    }

    const stmt = db.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(role, targetUserId);

    res.json({ success: true, message: 'Rôle mis à jour' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer un utilisateur
router.delete('/:id', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const targetUserId = parseInt(req.params.id, 10);

    if (req.user!.id === targetUserId) {
      res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte ici.' });
      return;
    }

    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run(targetUserId);

    res.json({ success: true, message: 'Utilisateur supprimé' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
