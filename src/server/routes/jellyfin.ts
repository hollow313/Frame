import { Router, Response } from 'express';
import { JellyfinService } from '../services/jellyfinService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';

const router = Router();
router.use(authenticateToken);

// Vérifier si un média spécifique est présent dans Jellyfin pour cet utilisateur
router.get('/check/:mediaType/:tmdbId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { mediaType, tmdbId } = req.params;
    const title = req.query.title as string | undefined;

    const userStmt = db.prepare('SELECT jellyfin_user_id, jellyfin_access_token FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;

    if (!user || !user.jellyfin_access_token || !user.jellyfin_user_id) {
      res.json({ inJellyfin: false, message: 'Compte Jellyfin non lié' });
      return;
    }

    const check = await JellyfinService.findItemByTmdbId(
      user.jellyfin_access_token,
      user.jellyfin_user_id,
      parseInt(tmdbId, 10),
      title,
      mediaType as 'movie' | 'tv'
    );

    res.json({
      inJellyfin: check.found,
      itemId: check.itemId,
      name: check.name,
      serverUrl: check.serverUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tester le serveur Jellyfin
router.get('/test-server', async (_req, res) => {
  try {
    const test = await JellyfinService.testServer();
    res.json(test);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lier son compte Jellyfin personnel avec identifiant et mot de passe
router.post('/link', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Identifiant et mot de passe Jellyfin requis' });
      return;
    }

    const auth = await JellyfinService.authenticateUser(username, password);

    const stmt = db.prepare('UPDATE users SET jellyfin_user_id = ?, jellyfin_access_token = ? WHERE id = ?');
    stmt.run(auth.userId, auth.accessToken, userId);

    res.json({
      success: true,
      message: `Compte Jellyfin « ${username} » lié avec succès !`,
      userId: auth.userId,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Échec de connexion à Jellyfin' });
  }
});

// Déconnecter son compte Jellyfin
router.post('/unlink', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stmt = db.prepare('UPDATE users SET jellyfin_user_id = NULL, jellyfin_access_token = NULL WHERE id = ?');
    stmt.run(userId);
    res.json({ success: true, message: 'Compte Jellyfin délié' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Synchroniser les œuvres visionnées sur Jellyfin vers Frame
router.post('/sync', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userStmt = db.prepare('SELECT jellyfin_user_id, jellyfin_access_token FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;

    if (!user || !user.jellyfin_access_token || !user.jellyfin_user_id) {
      res.status(400).json({ error: 'Compte Jellyfin non associé. Veuillez d\'abord lier votre compte dans vos paramètres.' });
      return;
    }

    const result = await JellyfinService.syncWatchedFromJellyfin(userId, user.jellyfin_access_token, user.jellyfin_user_id);

    res.json({
      success: true,
      message: `Synchronisation Jellyfin terminée ! ${result.importedCount} œuvres marquées comme vues.`,
      result,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir la lecture en cours sur Jellyfin pour l'utilisateur connecté
router.get('/now-playing', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userStmt = db.prepare('SELECT jellyfin_user_id, jellyfin_access_token FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;

    if (!user || !user.jellyfin_access_token || !user.jellyfin_user_id) {
      res.json({ active: false, items: [] });
      return;
    }

    const playing = await JellyfinService.getCurrentlyPlaying(user.jellyfin_access_token, user.jellyfin_user_id);
    res.json({ active: playing.length > 0, items: playing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
