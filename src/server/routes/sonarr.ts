import { Router } from 'express';
import { ArrService } from '../services/sonarrService.js';

const router = Router();

// Statut des connexions Sonarr et Radarr
router.get('/status', async (_req, res) => {
  try {
    const sonarrTest = await ArrService.testSonarr();
    const radarrTest = await ArrService.testRadarr();

    res.json({
      sonarr: {
        configured: ArrService.isSonarrConfigured(),
        connected: sonarrTest.success,
        version: sonarrTest.version,
        message: sonarrTest.message,
      },
      radarr: {
        configured: ArrService.isRadarrConfigured(),
        connected: radarrTest.success,
        version: radarrTest.version,
        message: radarrTest.message,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vérifier une série dans Sonarr
router.get('/check/series', async (req, res) => {
  try {
    const title = (req.query.title as string) || '';
    const status = await ArrService.checkSonarrSeries(title);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vérifier un film dans Radarr
router.get('/check/movie/:tmdbId', async (req, res) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId, 10);
    const status = await ArrService.checkRadarrMovie(tmdbId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
