import { Router, Response } from 'express';
import { SimklService } from '../services/simklService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';

const router = Router();
router.use(authenticateToken);

// ==========================================
// FLUX OAUTH 2.0 (RECOMMANDÉ - AUTH V2 BROWSER SIGN-IN)
// ==========================================

// 1. Initialiser le flux OAuth 2.0 avec PKCE
router.post('/oauth/init', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { clientId, clientSecret, redirectUri } = req.body;

    const userStmt = db.prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?');
    const userRow = userStmt.get(userId) as any;

    const effectiveClientId = clientId?.trim() || userRow?.simkl_client_id || undefined;
    const effectiveClientSecret = clientSecret?.trim() || userRow?.simkl_client_secret || undefined;
    const effectiveRedirectUri = (redirectUri?.trim() || '').replace(/\/$/, '');

    if (!effectiveRedirectUri) {
      res.status(400).json({ error: 'URL de redirection requise' });
      return;
    }

    const oauthInit = SimklService.initOAuth2({
      clientId: effectiveClientId,
      clientSecret: effectiveClientSecret,
      redirectUri: effectiveRedirectUri,
    });

    // Sauvegarder clientId, clientSecret, codeVerifier et redirectUri en base pour persistance robuste
    db.prepare(`
      UPDATE users 
      SET simkl_client_id = COALESCE(?, simkl_client_id), 
          simkl_client_secret = COALESCE(?, simkl_client_secret),
          simkl_oauth_verifier = ?,
          simkl_oauth_redirect_uri = ?
      WHERE id = ?
    `).run(effectiveClientId || null, effectiveClientSecret || null, oauthInit.codeVerifier, effectiveRedirectUri, userId);

    res.json({
      authUrl: oauthInit.authUrl,
      state: oauthInit.state,
      codeVerifier: oauthInit.codeVerifier,
      clientId: effectiveClientId,
      redirectUri: effectiveRedirectUri,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible d\'initialiser OAuth Simkl' });
  }
});

// 2. Échanger le code OAuth 2.0 reçu contre un token d'accès
router.post('/oauth/callback', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    let { code, codeVerifier, redirectUri, clientId, clientSecret } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Code d\'autorisation Simkl manquant.' });
      return;
    }

    // Si l'utilisateur a copié-collé une URL complète (ex: https://simkl.com/?code=XYZ...)
    let cleanCode = String(code).trim();
    if (cleanCode.includes('code=')) {
      try {
        const match = cleanCode.match(/[?&#]code=([^&#]+)/);
        if (match && match[1]) {
          cleanCode = decodeURIComponent(match[1]);
        }
      } catch {
        // En cas d'échec de parsing, conserver tel quel
      }
    }

    const userStmt = db.prepare('SELECT simkl_client_id, simkl_client_secret, simkl_oauth_verifier, simkl_oauth_redirect_uri FROM users WHERE id = ?');
    const userRow = userStmt.get(userId) as any;

    const effectiveClientId = clientId?.trim() || userRow?.simkl_client_id || undefined;
    const effectiveClientSecret = clientSecret?.trim() || userRow?.simkl_client_secret || undefined;
    const effectiveVerifier = (codeVerifier && String(codeVerifier).trim()) || userRow?.simkl_oauth_verifier || undefined;
    const effectiveRedirectUri = (redirectUri && String(redirectUri).trim()) || userRow?.simkl_oauth_redirect_uri || 'https://simkl.com';

    if (!effectiveVerifier) {
      res.status(400).json({ error: 'Vérificateur PKCE introuvable. Veuillez relancer l\'étape 1 d\'autorisation.' });
      return;
    }

    const tokenData = await SimklService.exchangeOAuth2Code({
      code: cleanCode,
      codeVerifier: effectiveVerifier,
      redirectUri: effectiveRedirectUri,
      clientId: effectiveClientId,
      clientSecret: effectiveClientSecret,
    });

    // Tester le token et récupérer le profil Simkl
    const test = await SimklService.testToken(tokenData.access_token, effectiveClientId);

    // Enregistrer en base de données
    const stmt = db.prepare(`
      UPDATE users 
      SET simkl_access_token = ?, 
          simkl_refresh_token = ?, 
          simkl_user_id = ?, 
          simkl_client_id = COALESCE(?, simkl_client_id), 
          simkl_client_secret = COALESCE(?, simkl_client_secret)
      WHERE id = ?
    `);
    stmt.run(
      tokenData.access_token,
      tokenData.refresh_token || null,
      test.user?.id ? test.user.id.toString() : null,
      effectiveClientId || null,
      effectiveClientSecret || null,
      userId
    );

    // Déclencher automatiquement la synchronisation initiale Simkl -> Frame
    SimklService.syncSimklToFrame(userId, tokenData.access_token, effectiveClientId)
      .then((stats) => console.log(`[Simkl] Auto-sync réussie pour user ${userId}: ${stats.importedMovies} films, ${stats.importedShows} séries`))
      .catch((err) => console.error(`[Simkl] Erreur auto-sync pour user ${userId}:`, err));

    res.json({
      success: true,
      message: `Compte Simkl lié avec succès (${test.user?.name || 'Utilisateur'}) ! Synchronisation de votre historique lancée.`,
      user: test.user,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erreur lors de la validation OAuth Simkl' });
  }
});

// ==========================================
// FLUX PIN CODE / DEVICE FLOW (V2 & V1)
// ==========================================

// 1. Obtenir un nouveau code PIN Simkl pour l'utilisateur
router.get('/pin', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userStmt = db.prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?');
    const userRow = userStmt.get(userId) as any;

    const clientIdParam = (req.query.clientId as string)?.trim() || userRow?.simkl_client_id || undefined;
    const clientSecretParam = (req.query.clientSecret as string)?.trim() || userRow?.simkl_client_secret || undefined;

    const pinData = await SimklService.getPin(clientIdParam, clientSecretParam);

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
    const { userCode, clientId, deviceCode, clientSecret } = req.body;

    if (!userCode) {
      res.status(400).json({ error: 'Code utilisateur requis' });
      return;
    }

    const userStmt = db.prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?');
    const userRow = userStmt.get(userId) as any;
    const effectiveClientId = clientId?.trim() || userRow?.simkl_client_id || undefined;
    const effectiveClientSecret = clientSecret?.trim() || userRow?.simkl_client_secret || undefined;

    const check = await SimklService.checkPin(userCode, effectiveClientId, deviceCode, effectiveClientSecret);

    if (check.authorized && check.access_token) {
      // Tester le token et enregistrer
      const test = await SimklService.testToken(check.access_token, effectiveClientId);
      const stmt = db.prepare(`
        UPDATE users 
        SET simkl_access_token = ?, 
            simkl_refresh_token = ?, 
            simkl_user_id = ?, 
            simkl_client_id = COALESCE(?, simkl_client_id),
            simkl_client_secret = COALESCE(?, simkl_client_secret)
        WHERE id = ?
      `);
      stmt.run(
        check.access_token,
        check.refresh_token || null,
        test.user?.id ? test.user.id.toString() : null,
        effectiveClientId || null,
        effectiveClientSecret || null,
        userId
      );

      // Déclencher automatiquement la synchronisation initiale Simkl -> Frame
      SimklService.syncSimklToFrame(userId, check.access_token, effectiveClientId)
        .then((stats) => console.log(`[Simkl PIN] Auto-sync réussie pour user ${userId}: ${stats.importedMovies} films, ${stats.importedShows} séries`))
        .catch((err) => console.error(`[Simkl PIN] Erreur auto-sync pour user ${userId}:`, err));

      res.json({
        authorized: true,
        message: `Compte Simkl lié avec succès (${test.user?.name || 'Utilisateur'}) ! Synchronisation de votre historique lancée.`,
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
    stmt.run(accessToken.trim(), test.user?.id ? test.user.id.toString() : null, clientId?.trim() || null, userId);

    // Déclencher automatiquement la synchronisation initiale Simkl -> Frame
    SimklService.syncSimklToFrame(userId, accessToken.trim(), clientId?.trim())
      .then((stats) => console.log(`[Simkl Link] Auto-sync réussie pour user ${userId}: ${stats.importedMovies} films, ${stats.importedShows} séries`))
      .catch((err) => console.error(`[Simkl Link] Erreur auto-sync pour user ${userId}:`, err));

    res.json({ success: true, message: `Compte Simkl lié avec succès (${test.user?.name || 'Utilisateur'}) ! Synchronisation de votre historique lancée.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Déconnecter Simkl
router.post('/unlink', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stmt = db.prepare('UPDATE users SET simkl_access_token = NULL, simkl_refresh_token = NULL, simkl_user_id = NULL WHERE id = ?');
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
      message: `Synchronisation Simkl réussie ! ${stats.importedMovies} films, ${stats.importedShows} séries et ${stats.importedAnime} animés importés dans Frame.`,
      stats,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
