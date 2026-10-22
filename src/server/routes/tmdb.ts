import { Router, Response } from 'express';
import { TMDBService } from '../services/tmdbService.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';
import jwt from 'jsonwebtoken';
import { getSetting } from '../services/settingsService.js';

const router = Router();

// Middleware optionnel pour extraire l'utilisateur s'il est connecté
function optionalAuth(req: AuthenticatedRequest, _res: Response, next: () => void) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token && req.cookies && req.cookies.frame_token) {
    token = req.cookies.frame_token;
  }
  if (token) {
    try {
      const secret = getSetting('JWT_SECRET');
      req.user = jwt.verify(token, secret) as any;
    } catch (e) {
      // Ignorer si token invalide
    }
  }
  next();
}

router.use(optionalAuth);

// Annoter les médias avec les statuts de l'utilisateur (vu / dans watchlist)
function annotateWithUserData(items: any[], userId?: number) {
  if (!userId || !items || items.length === 0) return items;

  try {
    const watchedStmt = db.prepare('SELECT tmdb_id, media_type, rating FROM watched_items WHERE user_id = ?');
    const watched = watchedStmt.all(userId) as any[];
    const watchedMap = new Map<string, { rating: number | null }>();
    for (const w of watched) {
      watchedMap.set(`${w.media_type}-${w.tmdb_id}`, { rating: w.rating });
    }

    const watchlistStmt = db.prepare('SELECT tmdb_id, media_type, status FROM watchlist WHERE user_id = ?');
    const watchlist = watchlistStmt.all(userId) as any[];
    const watchlistMap = new Map<string, string>();
    for (const wl of watchlist) {
      watchlistMap.set(`${wl.media_type}-${wl.tmdb_id}`, wl.status);
    }

    return items.map((item) => {
      const key = `${item.media_type}-${item.id}`;
      const watchedInfo = watchedMap.get(key);
      const watchlistStatus = watchlistMap.get(key);

      return {
        ...item,
        isWatched: Boolean(watchedInfo),
        userRating: watchedInfo ? watchedInfo.rating : null,
        inWatchlist: Boolean(watchlistStatus),
        watchlistStatus: watchlistStatus || null,
      };
    });
  } catch (e) {
    return items;
  }
}

// Tendances
router.get('/trending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const timeWindow = (req.query.timeWindow as 'day' | 'week') || 'week';
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.getTrending(timeWindow, page);
    data.results = annotateWithUserData(data.results, req.user?.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Films populaires
router.get('/popular/movies', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.getPopularMovies(page);
    data.results = annotateWithUserData(data.results, req.user?.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Séries populaires
router.get('/popular/tv', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.getPopularTV(page);
    data.results = annotateWithUserData(data.results, req.user?.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recherche globale
router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = (req.query.q as string) || '';
    const page = parseInt(req.query.page as string, 10) || 1;
    const data = await TMDBService.search(query, page);
    data.results = annotateWithUserData(data.results, req.user?.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Découvrir par genre
router.get('/discover', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = (req.query.type as 'movie' | 'tv') || 'movie';
    const genreId = parseInt(req.query.genreId as string, 10);
    const page = parseInt(req.query.page as string, 10) || 1;

    if (!genreId) {
      res.status(400).json({ error: 'genreId requis' });
      return;
    }

    const data = await TMDBService.discoverByGenre(mediaType, genreId, page);
    data.results = annotateWithUserData(data.results, req.user?.id);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Détails d'un film ou d'une série
router.get('/:mediaType/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = req.params.mediaType as 'movie' | 'tv';
    const id = parseInt(req.params.id, 10);

    if (mediaType !== 'movie' && mediaType !== 'tv') {
      res.status(400).json({ error: 'Type invalide (movie ou tv)' });
      return;
    }

    const details = await TMDBService.getDetails(mediaType, id);
    const annotated = annotateWithUserData([details], req.user?.id)[0];
    res.json(annotated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
