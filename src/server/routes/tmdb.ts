import { Router, Request, Response } from 'express';
import { TMDBService } from '../services/tmdbService.js';
import db from '../db/index.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/auth.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

// Middleware optionnel pour enrichir avec le statut "Déjà vu" ou "Watchlist" de l'utilisateur courant (D-05)
router.use(optionalAuth);

function enrichWithUserStatus(userId: number | undefined, items: any[]) {
  if (!userId || items.length === 0) return items;

  const watchedRows = db
    .prepare('SELECT tmdb_id, media_type, rating, season_number, episode_number FROM watched_items WHERE user_id = ?')
    .all(userId) as { tmdb_id: number; media_type: string; rating: number | null; season_number: number; episode_number: number }[];

  const watchlistRows = db
    .prepare('SELECT tmdb_id, media_type, status FROM watchlist WHERE user_id = ?')
    .all(userId) as { tmdb_id: number; media_type: string; status: string }[];

  const watchedMap = new Map<string, number | null>();
  for (const w of watchedRows) {
    const key = `${w.media_type === 'manga' ? 'tv' : w.media_type}-${w.tmdb_id}`;
    if (!watchedMap.has(key) || (w.season_number === 0 && w.episode_number === 0 && w.rating !== null)) {
      watchedMap.set(key, w.rating);
    }
  }

  const watchlistMap = new Map(
    watchlistRows.map((w) => [`${w.media_type === 'manga' ? 'tv' : w.media_type}-${w.tmdb_id}`, w.status])
  );

  return items.map((item) => {
    const key = `${item.media_type}-${item.id}`;
    return {
      ...item,
      isWatched: watchedMap.has(key),
      userRating: watchedMap.get(key) ?? null,
      inWatchlist: watchlistMap.has(key),
      watchlistStatus: watchlistMap.get(key) ?? null,
    };
  });
}

router.get('/trending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const timeWindow = (req.query.timeWindow as 'day' | 'week') || 'week';
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.getTrending(timeWindow, page);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBTrending');
  }
});

router.get('/popular/movies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.getPopularMovies(page);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBPopularMovies');
  }
});

router.get('/popular/tv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.getPopularTV(page);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBPopularTV');
  }
});

router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = req.query.q as string;
    const page = parseInt(req.query.page as string, 10) || 1;
    if (!query || !query.trim()) {
      res.json({ results: [], page: 1, total_pages: 1 });
      return;
    }
    const data = await TMDBService.searchMulti(query, page);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBSearch');
  }
});

router.get('/discover', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = (req.query.type as 'movie' | 'tv') || 'movie';
    const genreId = parseInt(req.query.genreId as string, 10);
    const page = parseInt(req.query.page as string, 10) || 1;

    if (!genreId) {
      res.status(400).json({ error: 'genreId est requis.' });
      return;
    }

    const data = await TMDBService.discoverByGenre(mediaType, genreId, page);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBDiscover');
  }
});

router.get('/providers/discover', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = (req.query.type as 'movie' | 'tv') || 'movie';
    const providerId = parseInt(req.query.providerId as string, 10);
    const genreId = req.query.genreId ? parseInt(req.query.genreId as string, 10) : undefined;
    const page = parseInt(req.query.page as string, 10) || 1;
    const recentOnly = req.query.recentOnly === 'true';

    if (!providerId) {
      res.status(400).json({ error: 'providerId est requis.' });
      return;
    }

    const data = await TMDBService.discoverByProvider(mediaType, providerId, genreId, page, recentOnly);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBProvidersDiscover');
  }
});

router.get('/anime', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const type = (req.query.type as 'tv' | 'movie') || 'tv';
    const data = await TMDBService.discoverAnime(page, type);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBAnime');
  }
});

/**
 * Route de découverte unifiée (Films, Séries, Mangas/Animés, Plateformes, Genres, Dates, Tris)
 */
router.get('/unified-discover', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const type = (req.query.type as 'all' | 'movie' | 'tv' | 'anime') || 'all';
    const animeType = (req.query.animeType as 'tv' | 'movie') || 'tv';
    const providerId = req.query.providerId ? parseInt(req.query.providerId as string, 10) : undefined;
    const genreId = req.query.genreId ? parseInt(req.query.genreId as string, 10) : undefined;
    const recentOnly = req.query.recentOnly === 'true';
    const dateFilter = (req.query.dateFilter as any) || undefined;
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const sortBy = (req.query.sortBy as any) || 'popularity.desc';
    const page = parseInt(req.query.page as string, 10) || 1;

    const data = await TMDBService.unifiedDiscover({
      type,
      animeType,
      providerId,
      genreId,
      recentOnly,
      dateFilter,
      year,
      sortBy,
      page,
    });

    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBUnifiedDiscover');
  }
});

/**
 * Calendrier des prochaines sorties (Films / Séries / Animés)
 */
router.get('/upcoming', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const type = (req.query.type as 'all' | 'movie' | 'tv' | 'anime') || 'all';
    const page = parseInt(req.query.page as string, 10) || 1;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const data = await TMDBService.getUpcomingReleases(type, page, startDate, endDate);
    res.json({
      ...data,
      results: enrichWithUserStatus(req.user?.id, data.results),
    });
  } catch (err: any) {
    serverError(res, err, 'TMDBUpcoming');
  }
});

/**
 * Obtenir la liste des épisodes d'une saison de série TV
 */
router.get('/tv/:id/season/:seasonNumber', async (req: Request, res: Response) => {
  try {
    const tvId = parseInt(req.params.id, 10);
    const seasonNumber = parseInt(req.params.seasonNumber, 10);
    const data = await TMDBService.getTvSeasonDetails(tvId, seasonNumber);
    res.json(data);
  } catch (err: any) {
    serverError(res, err, 'TMDBSeasonDetails');
  }
});

router.get('/:mediaType/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = (req.params.mediaType === 'manga' ? 'tv' : req.params.mediaType) as 'movie' | 'tv';
    const id = parseInt(req.params.id, 10);

    if (mediaType !== 'movie' && mediaType !== 'tv') {
      res.status(400).json({ error: 'Type de média invalide (movie ou tv attendu).' });
      return;
    }

    const details = await TMDBService.getDetails(mediaType, id);
    const [enriched] = enrichWithUserStatus(req.user?.id, [details]);

    if (req.user?.id) {
      const watchedRecord = db
        .prepare(
          'SELECT watched_at, rating FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type IN (?, ?) ORDER BY season_number ASC, watched_at DESC LIMIT 1'
        )
        .get(req.user.id, id, mediaType, 'manga') as { watched_at: string; rating: number | null } | undefined;

      if (watchedRecord) {
        enriched.watched_at = watchedRecord.watched_at;
        if (watchedRecord.rating !== null) {
          enriched.userRating = watchedRecord.rating;
        }
      }
    }

    res.json(enriched);
  } catch (err: any) {
    serverError(res, err, 'TMDBDetails');
  }
});

export default router;
