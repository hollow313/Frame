import { Router, Response } from 'express';
import { JellyfinService } from '../services/jellyfinService.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { setSetting } from '../services/settingsService.js';
import db from '../db/index.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

router.use(authenticateToken);

/**
 * Obtenir l'URL du serveur Jellyfin configuré sur le serveur
 */
router.get('/server-info', (req: AuthenticatedRequest, res: Response) => {
  const userRow = db.prepare('SELECT jellyfin_server_url FROM users WHERE id = ?').get(req.user!.id) as any;
  const serverUrl = userRow?.jellyfin_server_url || JellyfinService.getServerUrl();
  res.json({
    serverUrl: serverUrl || '',
    isConfigured: Boolean(serverUrl),
  });
});

/**
 * Tester la connexion au serveur Jellyfin (réservé aux administrateurs - F-02)
 */
router.post('/test-server', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url } = req.body;
    const result = await JellyfinService.testServer(url);
    res.json(result);
  } catch (err: any) {
    serverError(res, err, 'JellyfinTestServer');
  }
});

/**
 * Lier le compte Jellyfin personnel d'un utilisateur Frame (par mot de passe OU par clé API)
 */
router.post('/link', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, password, apiKey, serverUrl } = req.body;

    // Utiliser l'URL du serveur global par défaut, sauf si l'admin en soumet une nouvelle
    const cleanServerUrl =
      req.user!.role === 'admin' && serverUrl
        ? String(serverUrl).replace(/\/$/, '').trim()
        : JellyfinService.getServerUrl();

    if (!cleanServerUrl) {
      res.status(400).json({ error: "Veuillez configurer l'URL du serveur Jellyfin dans l'administration." });
      return;
    }

    let authResult: { userId: string; accessToken: string; serverUrl: string; username?: string };

    if (apiKey && String(apiKey).trim() !== '') {
      authResult = await JellyfinService.authenticateWithApiKey(String(apiKey), username, cleanServerUrl);
    } else {
      if (!username) {
        res.status(400).json({ error: "Nom d'utilisateur Jellyfin requis." });
        return;
      }
      authResult = await JellyfinService.authenticateUser(String(username), password, cleanServerUrl);
    }

    // Sauvegarder comme URL globale si aucune n'était encore définie et que l'utilisateur est admin
    if (req.user!.role === 'admin' && !JellyfinService.getServerUrl() && authResult.serverUrl) {
      setSetting('JELLYFIN_URL', authResult.serverUrl);
    }

    db.prepare('UPDATE users SET jellyfin_user_id = ?, jellyfin_token = ?, jellyfin_server_url = ? WHERE id = ?').run(
      authResult.userId,
      authResult.accessToken,
      authResult.serverUrl,
      req.user!.id
    );

    // Synchroniser immédiatement les vues Jellyfin
    let syncInfo = '';
    try {
      const syncRes = await JellyfinService.syncWatchedFromJellyfin(req.user!.id);
      syncInfo = ` (${syncRes.importedMovies} films et ${syncRes.importedShows} séries synchronisés)`;
    } catch {
      // Ignorer si la synchro initiale échoue
    }

    res.json({
      success: true,
      message: `Compte Jellyfin lié avec succès${syncInfo} !`,
      userId: authResult.userId,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible de lier le compte Jellyfin.' });
  }
});

/**
 * Délier le compte Jellyfin
 */
router.post('/unlink', (req: AuthenticatedRequest, res: Response) => {
  try {
    db.prepare('UPDATE users SET jellyfin_user_id = NULL, jellyfin_token = NULL WHERE id = ?').run(req.user!.id);
    res.json({ success: true, message: 'Compte Jellyfin délié.' });
  } catch (err: any) {
    serverError(res, err, 'JellyfinUnlink');
  }
});

/**
 * Obtenir la lecture en cours (Now Playing) sur Jellyfin pour l'utilisateur connecté
 */
router.get('/now-playing', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await JellyfinService.getCurrentlyPlaying(req.user!.id);
    res.json({ active: items.length > 0, items });
  } catch (err: any) {
    serverError(res, err, 'JellyfinNowPlaying');
  }
});

/**
 * Vérifier si un film ou une série est disponible sur Jellyfin (avec son itemId pour lancement direct)
 */
router.get('/check/:mediaType/:tmdbId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = req.params.mediaType as 'movie' | 'tv';
    const tmdbId = parseInt(req.params.tmdbId, 10);
    const title = req.query.title as string | undefined;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const result = await JellyfinService.findItemByTmdbId(req.user!.id, mediaType, tmdbId, title, year);
    res.json(result);
  } catch (err: any) {
    serverError(res, err, 'JellyfinCheck');
  }
});

/**
 * Synchroniser l'historique des médias déjà vus depuis Jellyfin
 */
router.post('/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await JellyfinService.syncWatchedFromJellyfin(req.user!.id);
    res.json({
      success: true,
      message: `Synchronisation Jellyfin terminée : ${result.importedMovies} films et ${result.importedShows} séries importés.`,
      result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erreur lors de la synchronisation Jellyfin.' });
  }
});

export default router;
