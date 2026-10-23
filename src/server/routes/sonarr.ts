import { Router, Response } from 'express';
import { SonarrService } from '../services/sonarrService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

// Authentification requise sur toutes les routes Sonarr / Radarr (F-13)
router.use(authenticateToken);

/**
 * Obtenir le statut combiné de Sonarr & Radarr
 */
router.get('/status', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [sonarr, radarr] = await Promise.all([
      SonarrService.getSonarrStatus(),
      SonarrService.getRadarrStatus(),
    ]);
    res.json({ sonarr, radarr });
  } catch (err: any) {
    serverError(res, err, 'SonarrStatus');
  }
});

/**
 * Vérifier la présence d'une série dans Sonarr
 */
router.get('/check/series', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const title = req.query.title as string;
    const tvdbId = req.query.tvdbId ? parseInt(req.query.tvdbId as string, 10) : undefined;
    const status = await SonarrService.checkSeriesStatus(tvdbId, title);
    res.json(status);
  } catch (err: any) {
    serverError(res, err, 'SonarrCheckSeries');
  }
});

/**
 * Vérifier la présence d'un film dans Radarr par son TMDB ID
 */
router.get('/check/movie/:tmdbId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    const status = await SonarrService.checkMovieStatus(tmdbId);
    res.json(status);
  } catch (err: any) {
    serverError(res, err, 'RadarrCheckMovie');
  }
});

/**
 * Synchroniser automatiquement toutes les séries et animés "Unmonitored" de Sonarr vers "Déjà vu"
 */
router.post('/sync-unmonitored', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await SonarrService.syncUnmonitoredToWatched(req.user!.id);
    res.json({
      ...result,
      message: `${result.totalImported} œuvres non monitorées importées depuis Sonarr (${result.importedShows} séries, ${result.importedAnime} mangas/animés).`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erreur lors de la synchronisation Sonarr.' });
  }
});

export default router;
