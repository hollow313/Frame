import { Router, Response } from 'express';
import { SimklService } from '../services/simklService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';

const router = Router();
router.use(authenticateToken);

// ==========================================
// FLUX PIN CODE SIMKL (FACILE & SANS REDIRECT)
// ==========================================

// 1. Obtenir un nouveau code PIN Simkl pour l'utilisateur
router.get('/pin', async (_req, res: Response): Promise<void> => {
  try {
    const pinData = await SimklService.getPin();
    res.json(pinData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Vérifier si l'utilisateur a approuvé le code PIN
router.post('/pin/check', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { userCode } = req.body;

    if (!userCode) {
      res.status(400).json({ error: 'Code utilisateur requis' });
      return;
    }

    const check = await SimklService.checkPin(userCode);

    if (check.authorized && check.access_token) {
      // Tester le token et enregistrer
      const test = await SimklService.testToken(check.access_token);
      const stmt = db.prepare('UPDATE users SET simkl_access_token = ?, simkl_user_id = ? WHERE id = ?');
      stmt.run(check.access_token, test.user?.id ? test.user.id.toString() : null, userId);

      res.json({
        authorized: true,
        message: `Compte Simkl lié avec succès (${test.user?.name || 'Utilisateur'}) !`,
      });
      return;
    }

    res.json({ authorized: false, message: check.message || 'En attente...' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// TOKEN DIRECT & SYNCHRONISATION
// ==========================================

// Lier manuellement avec un Access Token
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
      res.status(400).json({ error: 'Aucun compte Simkl associé. Veuillez d\'abord lier votre compte Simkl.' });
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
