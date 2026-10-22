import { Router, Response } from 'express';
import { SimklService } from '../services/simklService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';

const router = Router();
router.use(authenticateToken);

// Lier un compte Simkl avec un Access Token
router.post('/link', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { accessToken } = req.body;

    if (!accessToken) {
      res.status(400).json({ error: 'Token d\'accès Simkl requis.' });
      return;
    }

    const test = await SimklService.testToken(accessToken);
    if (!test.success) {
      res.status(400).json({ error: test.message });
      return;
    }

    const stmt = db.prepare('UPDATE users SET simkl_access_token = ?, simkl_user_id = ? WHERE id = ?');
    stmt.run(accessToken, test.user?.id ? test.user.id.toString() : null, userId);

    res.json({ success: true, message: `Compte Simkl lié avec succès (${test.user?.name || 'Utilisateur'}) !` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Déconnecter Simkl
router.post('/unlink', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stmt = db.prepare('UPDATE users SET simkl_access_token = NULL, simkl_user_id = NULL WHERE id = ?');
    stmt.run(userId);
    res.json({ success: true, message: 'Compte Simkl délié' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Lancer la synchronisation des vues Simkl vers Frame
router.post('/sync', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const stmt = db.prepare('SELECT simkl_access_token FROM users WHERE id = ?');
    const user = stmt.get(userId) as any;

    if (!user || !user.simkl_access_token) {
      res.status(400).json({ error: 'Aucun compte Simkl associé. Veuillez d\'abord renseigner votre token Simkl.' });
      return;
    }

    const stats = await SimklService.syncSimklToFrame(userId, user.simkl_access_token);
    res.json({
      success: true,
      message: `Synchronisation terminée ! ${stats.importedMovies} films et ${stats.importedShows} séries importés.`,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
