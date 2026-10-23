import crypto from 'crypto';
import { Router, Response } from 'express';
import { SimklService } from '../services/simklService.js';
import { setSetting, getSetting } from '../services/settingsService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

router.use(authenticateToken);

/**
 * Obtenir l'état détaillé de la synchronisation Simkl de l'utilisateur courant (U-04)
 */
router.get('/status', (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = db
      .prepare(
        'SELECT simkl_token, simkl_last_sync_at, simkl_last_sync_status, simkl_last_sync_error, simkl_auto_sync FROM users WHERE id = ?'
      )
      .get(req.user!.id) as any;

    const lastSyncAt = row?.simkl_last_sync_at || null;
    const autoSync = row?.simkl_auto_sync !== 0;
    const nextSyncAt =
      lastSyncAt && autoSync
        ? new Date(new Date(lastSyncAt).getTime() + 6 * 60 * 60 * 1000).toISOString()
        : null;

    res.json({
      connected: Boolean(row?.simkl_token),
      autoSync,
      lastSyncAt,
      lastSyncStatus: row?.simkl_last_sync_status || null,
      lastSyncError: row?.simkl_last_sync_error || null,
      nextSyncAt,
    });
  } catch (err: any) {
    serverError(res, err, 'SimklStatus');
  }
});

/**
 * Activer / Désactiver la synchronisation automatique Simkl toutes les 6h (U-04)
 */
router.put('/settings', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { autoSync } = req.body;
    db.prepare('UPDATE users SET simkl_auto_sync = ? WHERE id = ?').run(autoSync !== false ? 1 : 0, req.user!.id);
    res.json({
      success: true,
      autoSync: autoSync !== false,
      message: autoSync !== false
        ? 'Synchronisation automatique Simkl (toutes les 6h) activée.'
        : 'Synchronisation automatique Simkl désactivée.',
    });
  } catch (err: any) {
    serverError(res, err, 'SimklSettings');
  }
});

/**
 * 1A. Initialiser le flux OAuth 2.0 Simkl avec PKCE (S256)
 */
router.post('/oauth/init', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body;
    const cleanClientId = (clientId || SimklService.getClientId()).trim();
    const cleanSecret = (clientSecret || SimklService.getClientSecret()).trim();

    if (!cleanClientId) {
      res.status(400).json({ error: 'Veuillez renseigner votre Client ID Simkl.' });
      return;
    }

    if (!redirectUri) {
      res.status(400).json({ error: 'redirectUri est requis.' });
      return;
    }

    db.prepare('UPDATE users SET simkl_client_id = ?, simkl_client_secret = ? WHERE id = ?').run(
      cleanClientId,
      cleanSecret || null,
      req.user!.id
    );

    if (!getSetting('SIMKL_CLIENT_ID')) {
      setSetting('SIMKL_CLIENT_ID', cleanClientId);
    }
    if (cleanSecret && !getSetting('SIMKL_CLIENT_SECRET')) {
      setSetting('SIMKL_CLIENT_SECRET', cleanSecret);
    }

    const { codeVerifier, codeChallenge } = SimklService.generatePkcePair();
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = SimklService.buildAuthorizationUrl({
      clientId: cleanClientId,
      redirectUri,
      state,
      codeChallenge,
    });

    res.json({
      authUrl,
      state,
      codeVerifier,
      clientId: cleanClientId,
      redirectUri,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 1B. Échanger le code OAuth 2.0 (ou l'URL complète contenant ?code=...) contre un access_token
 */
router.post('/oauth/callback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    let { code, codeVerifier, redirectUri, clientId, clientSecret } = req.body;

    if (!code) {
      res.status(400).json({ error: "Code d'autorisation Simkl manquant." });
      return;
    }

    let extractedCode = String(code).trim();
    if (extractedCode.includes('code=')) {
      try {
        const parsedUrl = new URL(
          extractedCode.startsWith('http')
            ? extractedCode
            : `https://simkl.com/?${extractedCode.replace(/^\?/, '')}`
        );
        extractedCode = parsedUrl.searchParams.get('code') || extractedCode;
      } catch {
        const match = extractedCode.match(/[?&]code=([^&#\s]+)/);
        if (match && match[1]) extractedCode = decodeURIComponent(match[1]);
      }
    }

    const userRow = db
      .prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?')
      .get(req.user!.id) as any;

    const cleanClientId = (clientId || userRow?.simkl_client_id || SimklService.getClientId()).trim();
    const cleanSecret = (clientSecret || userRow?.simkl_client_secret || SimklService.getClientSecret()).trim();

    if (!cleanClientId) {
      res.status(400).json({ error: 'Client ID Simkl introuvable.' });
      return;
    }

    const tokenRes = await SimklService.exchangeCodeForToken({
      code: extractedCode,
      clientId: cleanClientId,
      clientSecret: cleanSecret || undefined,
      redirectUri: redirectUri || 'https://simkl.com',
      codeVerifier,
    });

    const validation = await SimklService.validateAccessToken(tokenRes.accessToken, cleanClientId);

    db.prepare(
      'UPDATE users SET simkl_token = ?, simkl_refresh_token = COALESCE(?, simkl_refresh_token), simkl_user_id = ?, simkl_client_id = ?, simkl_client_secret = ? WHERE id = ?'
    ).run(
      tokenRes.accessToken,
      tokenRes.refreshToken || null,
      validation.accountId || null,
      cleanClientId,
      cleanSecret || null,
      req.user!.id
    );

    let syncStats = null;
    try {
      syncStats = await SimklService.syncWatchedItems(req.user!.id);
    } catch {
      // Ignorer si la synchro initiale échoue
    }

    res.json({
      success: true,
      message: syncStats
        ? `Compte Simkl (${validation.name || 'Connecté'}) lié avec succès ! ${syncStats.importedMovies} films, ${syncStats.importedShows} séries, ${syncStats.importedAnime} animés et ${syncStats.importedManga} mangas importés.`
        : `Compte Simkl (${validation.name || 'Connecté'}) lié avec succès !`,
      user: validation,
      stats: syncStats,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 1C. Générer un code PIN Simkl pour lier facilement un compte sans saisir d'URL de callback
 */
router.get('/pin', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const customClientId = req.query.clientId as string | undefined;
    const customClientSecret = req.query.clientSecret as string | undefined;
    const pinData = await SimklService.getDevicePin(customClientId, customClientSecret, req.user!.id);
    res.json(pinData);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 2. Vérifier si le code PIN a été validé par l'utilisateur et sauvegarder son token
 */
router.post('/pin/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userCode, clientId, deviceCode, clientSecret } = req.body;
    if (!userCode) {
      res.status(400).json({ error: 'userCode est requis.' });
      return;
    }

    const result = await SimklService.checkDevicePin(userCode, clientId, deviceCode, clientSecret, req.user!.id);

    if (result.result === 'OK' && result.access_token) {
      const userRow = db
        .prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?')
        .get(req.user!.id) as any;
      const cleanClientId = (clientId || userRow?.simkl_client_id || SimklService.getClientId()).trim();
      const cleanSecret = (clientSecret || userRow?.simkl_client_secret || SimklService.getClientSecret()).trim();
      const validation = await SimklService.validateAccessToken(result.access_token, cleanClientId);

      db.prepare(
        'UPDATE users SET simkl_token = ?, simkl_refresh_token = COALESCE(?, simkl_refresh_token), simkl_user_id = ?, simkl_client_id = ?, simkl_client_secret = COALESCE(?, simkl_client_secret) WHERE id = ?'
      ).run(
        result.access_token,
        result.refresh_token || null,
        validation.accountId || null,
        cleanClientId,
        cleanSecret || null,
        req.user!.id
      );

      let syncStats = null;
      try {
        syncStats = await SimklService.syncWatchedItems(req.user!.id);
      } catch {
        // Ignorer
      }

      res.json({
        authorized: true,
        message: syncStats
          ? `Compte Simkl (${validation.name || 'Connecté'}) lié avec succès ! ${syncStats.importedMovies} films, ${syncStats.importedShows} séries et ${syncStats.importedAnime} animés synchronisés.`
          : `Compte Simkl (${validation.name || 'Connecté'}) lié avec succès !`,
        user: validation,
        stats: syncStats,
      });
      return;
    }

    res.json({
      authorized: false,
      message: result.message || 'Code non encore validé sur Simkl.',
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 3. Lier directement un Access Token Simkl (et Client ID optionnel) pour l'utilisateur courant
 */
router.post('/link', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accessToken, clientId } = req.body;
    if (!accessToken) {
      res.status(400).json({ error: "Jeton d'accès Simkl requis." });
      return;
    }

    if (clientId && clientId.trim() !== '' && !getSetting('SIMKL_CLIENT_ID')) {
      setSetting('SIMKL_CLIENT_ID', clientId.trim());
    }

    const validation = await SimklService.validateAccessToken(accessToken, clientId);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error || 'Jeton Simkl invalide.' });
      return;
    }

    const cleanClientId = clientId ? clientId.trim() : SimklService.getClientId();

    db.prepare(
      'UPDATE users SET simkl_token = ?, simkl_user_id = ?, simkl_client_id = ? WHERE id = ?'
    ).run(accessToken.trim(), validation.accountId || null, cleanClientId, req.user!.id);

    let syncStats = null;
    try {
      syncStats = await SimklService.syncWatchedItems(req.user!.id);
    } catch {
      // Ignorer
    }

    res.json({
      success: true,
      message: syncStats
        ? `Compte Simkl (${validation.name}) lié et synchronisé (${syncStats.importedMovies} films, ${syncStats.importedShows} séries, ${syncStats.importedAnime} animés, ${syncStats.importedManga} mangas) !`
        : `Compte Simkl (${validation.name}) lié avec succès !`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * 4. Délier le compte Simkl de l'utilisateur courant
 */
router.post('/unlink', (req: AuthenticatedRequest, res: Response) => {
  try {
    db.prepare('UPDATE users SET simkl_token = NULL, simkl_refresh_token = NULL, simkl_user_id = NULL WHERE id = ?').run(
      req.user!.id
    );
    res.json({ success: true, message: 'Compte Simkl délié.' });
  } catch (err: any) {
    serverError(res, err, 'SimklUnlink');
  }
});

/**
 * 5. Synchroniser manuellement l'historique et la watchlist depuis Simkl
 */
router.post('/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await SimklService.syncWatchedItems(req.user!.id);
    res.json({
      success: true,
      message: `Synchronisation terminée : ${result.importedMovies} films, ${result.importedShows} séries, ${result.importedAnime} animés, ${result.importedManga} mangas et ${result.importedWatchlist} titres à voir importés.`,
      stats: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
