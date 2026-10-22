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
router.get('/pin', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userStmt = db.prepare('SELECT simkl_client_id FROM users WHERE id = ?');
    const userRow = userStmt.get(userId) as any;

    const clientIdParam = (req.query.clientId as string)?.trim() || userRow?.simkl_client_id || undefined;

    const pinData = await SimklService.getPin(clientIdParam);

    // Mémoriser le Client ID pour cet utilisateur
    if (clientIdParam) {
      db.prepare('UPDATE users SET simkl_client_id = ? WHERE id = ?').run(clientIdParam, userId);
    }

    res.json(pinData);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible de générer le code PIN Simkl' });
  }
});

// 2. Vérifier si l'utilisateur a approuvé le code PIN
router.post('/pin/check', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { userCode, clientId } = req.body;

    if (!userCode) {
      res.status(400).json({ error: 'Code utilisateur requis' });
      return;
    }

    const userStmt = db.prepare('SELECT simkl_client_id FROM users WHERE id = ?');
    const userRow = userStmt.get(userId) as any;
    const effectiveClientId = clientId?.trim() || userRow?.simkl_client_id || undefined;

    const check = await SimklService.checkPin(userCode, effectiveClientId);

    if (check.authorized && check.access_token) {
      // Tester le token et enregistrer
      const test = await SimklService.testToken(check.access_token, effectiveClientId);
      const stmt = db.prepare('UPDATE users SET simkl_access_token = ?, simkl_user_id = ?, simkl_client_id = ? WHERE id = ?');
      stmt.run(check.access_token, test.user?.id ? test.user.id.toString() : null, effectiveClientId || null, userId);

      res.json({
        authorized: true,
        message: `Compte Simkl lié avec succès (${test.user?.name || 'Utilisateur'}) !`,
      });
      return;
    }

    res.json({ authorized: false, message: check.message || 'En attente de validation sur Simkl...' });
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
    const { accessToken, clientId } = req.body;

    if (!accessToken) {
      res.status(400).json({ error: "Token d'accès Simkl requis." });
      return;
    }

    const test = await SimklService.testToken(accessToken, clientId?.trim());
    if (!test.success) {
      res.status(400).json({ error: test.message });
      return;
    }

    const stmt = db.prepare('UPDATE users SET simkl_access_token = ?, simkl_user_id = ?, simkl_client_id = ? WHERE id = ?');
    stmt.run(accessToken, test.user?.id ? test.user.id.toString() : null, clientId?.trim() || null, userId);

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
    res.json({ success: true, message: 'Compte Simkl déconnecté.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Synchroniser les vues depuis Simkl vers Frame
router.post('/sync', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userStmt = db.prepare('SELECT simkl_access_token, simkl_client_id FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;

    if (!user || !user.simkl_access_token) {
      res.status(400).json({ error: 'Compte Simkl non associé. Veuillez d\'abord lier votre compte.' });
      return;
    }

    const stats = await SimklService.syncSimklToFrame(userId, user.simkl_access_token, user.simkl_client_id);

    res.json({
      success: true,
      message: `Synchronisation Simkl réussie ! ${stats.importedMovies} films et ${stats.importedShows} séries importés dans Frame.`,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
