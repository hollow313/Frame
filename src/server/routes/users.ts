import { Router, Response } from 'express';
import db from '../db/index.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { LdapService } from '../services/ldapService.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

/**
 * Lister tous les utilisateurs du serveur (synchronise automatiquement le groupe LDAP si activé)
 */
router.get('/', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    if (LdapService.isEnabled()) {
      await LdapService.syncUsersFromLdap();
    }

    const users = db
      .prepare(`
      SELECT u.id, u.username, u.role, u.display_name, u.auth_provider, u.simkl_token, u.jellyfin_token, u.seer_user_id, u.created_at,
             (SELECT COUNT(*) FROM watched_items w WHERE w.user_id = u.id AND w.season_number = 0 AND w.episode_number = 0) AS watched_count,
             (SELECT COUNT(*) FROM watchlist wl WHERE wl.user_id = u.id) AS watchlist_count
      FROM users u
      ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.created_at ASC
    `)
      .all() as any[];

    res.json(
      users.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        displayName: u.display_name || u.username,
        display_name: u.display_name || u.username,
        authProvider: u.auth_provider || 'local',
        auth_provider: u.auth_provider || 'local',
        simklConnected: Boolean(u.simkl_token),
        jellyfinConnected: Boolean(u.jellyfin_token),
        seerUserId: u.seer_user_id || null,
        watchedCount: Number(u.watched_count) || 0,
        watched_count: Number(u.watched_count) || 0,
        watchlistCount: Number(u.watchlist_count) || 0,
        watchlist_count: Number(u.watchlist_count) || 0,
        createdAt: u.created_at,
        created_at: u.created_at,
      }))
    );
  } catch (err: any) {
    serverError(res, err, 'UsersList');
  }
});

/**
 * Synchroniser manuellement les utilisateurs du groupe LDAP configuré vers Frame
 */
router.post('/sync-ldap', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    if (!LdapService.isEnabled()) {
      res.status(400).json({ error: "L'authentification LDAP / LLDAP n'est pas activée." });
      return;
    }

    const syncRes = await LdapService.syncUsersFromLdap();
    if (syncRes.error) {
      res.status(400).json({ error: syncRes.error });
      return;
    }
    res.json({
      success: true,
      totalLdapUsers: syncRes.totalLdapUsers,
      importedCount: syncRes.importedCount,
      message: `${syncRes.totalLdapUsers} utilisateur(s) trouvé(s) dans le groupe LDAP (${syncRes.importedCount} nouveau(x) ajouté(s)).`,
    });
  } catch (err: any) {
    serverError(res, err, 'UsersSyncLdap');
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
