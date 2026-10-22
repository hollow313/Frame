import { Router, Response } from 'express';
import db from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { SimklService } from '../services/simklService.js';
import { TMDBService } from '../services/tmdbService.js';

const router = Router();
router.use(authenticateToken);

// ==========================================
// VU / DÉJÀ VU (WATCHED ITEMS)
// ==========================================

// Marquer comme vu
router.post('/watched', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { tmdbId, mediaType, title, posterPath, backdropPath, releaseDate, genres, overview, rating, review, watchedAt } = req.body;

    if (!tmdbId || !mediaType || !title) {
      res.status(400).json({ error: 'tmdbId, mediaType et title sont requis.' });
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, overview, rating, review, watched_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        rating = excluded.rating,
        review = excluded.review,
        watched_at = excluded.watched_at
    `);

    stmt.run(
      userId,
      tmdbId,
      mediaType,
      title,
      posterPath || null,
      backdropPath || null,
      releaseDate || null,
      genres ? (typeof genres === 'string' ? genres : JSON.stringify(genres)) : null,
      overview || null,
      rating !== undefined ? rating : null,
      review || null,
      watchedAt || null
    );

    // Retirer automatiquement de la watchlist si présent
    db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(userId, tmdbId, mediaType);

    // Si l'utilisateur a lié un compte Simkl, synchroniser en arrière-plan
    const userStmt = db.prepare('SELECT simkl_access_token FROM users WHERE id = ?');
    const user = userStmt.get(userId) as any;
    if (user && user.simkl_access_token) {
      SimklService.markAsWatchedOnSimkl({
        accessToken: user.simkl_access_token,
        mediaType,
        tmdbId,
        title,
        year: releaseDate ? new Date(releaseDate).getFullYear() : undefined,
      }).catch(() => {});
    }

    res.json({ success: true, message: `Marqué comme vu : ${title}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Supprimer des déjà vus
router.delete('/watched/:mediaType/:tmdbId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { mediaType, tmdbId } = req.params;

    const stmt = db.prepare('DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ?');
    stmt.run(userId, parseInt(tmdbId, 10), mediaType);

    res.json({ success: true, message: 'Retiré des médias vus' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir la liste des déjà vus (avec enrichissement automatique des affiches manquantes)
router.get('/watched', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as string; // 'all' | 'movie' | 'tv' | 'anime'
    const sort = (req.query.sort as string) || 'watched_at';

    let sql = 'SELECT * FROM watched_items WHERE user_id = ?';
    const params: any[] = [userId];

    if (type === 'movie' || type === 'tv') {
      sql += ' AND media_type = ?';
      params.push(type);
    }

    if (sort === 'rating') {
      sql += ' ORDER BY rating DESC NULLS LAST, watched_at DESC';
    } else {
      sql += ' ORDER BY watched_at DESC';
    }

    const stmt = db.prepare(sql);
    const items = stmt.all(...params) as any[];

    // Auto-enrichir les affiches manquantes (poster_path == null)
    const updateStmt = db.prepare('UPDATE watched_items SET poster_path = ?, backdrop_path = COALESCE(backdrop_path, ?) WHERE id = ?');
    const cacheStmt = db.prepare('SELECT data FROM media_cache WHERE tmdb_id = ? AND media_type = ?');

    for (const item of items) {
      if (!item.poster_path && item.tmdb_id) {
        try {
          const cached = cacheStmt.get(item.tmdb_id, item.media_type) as any;
          if (cached && cached.data) {
            const parsedCache = JSON.parse(cached.data);
            if (parsedCache.poster_path) {
              item.poster_path = parsedCache.poster_path;
              item.backdrop_path = parsedCache.backdrop_path || item.backdrop_path;
              updateStmt.run(item.poster_path, item.backdrop_path || null, item.id);
            }
          } else {
            const details = await TMDBService.getDetails(item.media_type, item.tmdb_id);
            if (details.poster_path) {
              item.poster_path = details.poster_path;
              item.backdrop_path = details.backdrop_path || item.backdrop_path;
              updateStmt.run(item.poster_path, item.backdrop_path || null, item.id);
            }
          }
        } catch {
          // Fallback muet
        }
      }
    }

    // Parse genres JSON & identification Anime/Manga
    const parsed = items.map((item) => {
      let genresList: any[] = [];
      try {
        genresList = item.genres ? JSON.parse(item.genres) : [];
      } catch {}

      const isAnime = genresList.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('anim'));

      return {
        ...item,
        isAnime,
        genres: genresList,
      };
    });

    if (type === 'anime') {
      res.json(parsed.filter((p) => p.isAnime));
      return;
    }

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// WATCHLIST (À VOIR)
// ==========================================

// Ajouter à la watchlist
router.post('/watchlist', (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { tmdbId, mediaType, title, posterPath, backdropPath, releaseDate, genres, overview, status } = req.body;

    if (!tmdbId || !mediaType || !title) {
      res.status(400).json({ error: 'tmdbId, mediaType et title sont requis.' });
      return;
    }

    const stmt = db.prepare(`
      INSERT INTO watchlist (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, overview, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type) DO UPDATE SET
        status = excluded.status
    `);

    stmt.run(
      userId,
      tmdbId,
      mediaType,
      title,
      posterPath || null,
      backdropPath || null,
      releaseDate || null,
      genres ? (typeof genres === 'string' ? genres : JSON.stringify(genres)) : null,
      overview || null,
      status || 'plan_to_watch'
    );

    res.json({ success: true, message: `Ajouté à votre liste : ${title}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Retirer de la watchlist
router.delete('/watchlist/:mediaType/:tmdbId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { mediaType, tmdbId } = req.params;

    const stmt = db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?');
    stmt.run(userId, parseInt(tmdbId, 10), mediaType);

    res.json({ success: true, message: 'Retiré de votre liste' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Obtenir la watchlist
router.get('/watchlist', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as string;

    let sql = 'SELECT * FROM watchlist WHERE user_id = ?';
    const params: any[] = [userId];

    if (type === 'movie' || type === 'tv') {
      sql += ' AND media_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY added_at DESC';

    const stmt = db.prepare(sql);
    const items = stmt.all(...params) as any[];

    const parsed = items.map((item) => ({
      ...item,
      genres: item.genres ? JSON.parse(item.genres) : [],
    }));

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// STATISTIQUES UTILISATEUR COMPLÈTES (TOTAL, CETTE ANNÉE, PAR GENRE, TIMELINE)
// ==========================================
router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const currentYear = new Date().getFullYear();

    const allWatched = db.prepare('SELECT * FROM watched_items WHERE user_id = ?').all(userId) as any[];
    const watchlistCount = (db.prepare('SELECT COUNT(*) as count FROM watchlist WHERE user_id = ?').get(userId) as any).count;

    let moviesCount = 0;
    let tvCount = 0;
    let animeCount = 0;

    let thisYearMoviesCount = 0;
    let thisYearTvCount = 0;
    let thisYearAnimeCount = 0;

    const genreStats: Record<string, { count: number; name: string }> = {};
    const monthlyStats: Record<string, { label: string; count: number; movies: number; tv: number; anime: number }> = {};
    const ratingDistribution: Record<number, number> = { 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;
    let ratingCount = 0;

    for (const item of allWatched) {
      let itemGenres: any[] = [];
      try {
        itemGenres = item.genres ? JSON.parse(item.genres) : [];
      } catch {}

      const isAnime = itemGenres.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('anim'));
      const watchedDate = item.watched_at ? new Date(item.watched_at) : new Date();
      const isThisYear = watchedDate.getFullYear() === currentYear;

      // Compteurs par type
      if (isAnime) {
        animeCount++;
        if (isThisYear) thisYearAnimeCount++;
      } else if (item.media_type === 'movie') {
        moviesCount++;
        if (isThisYear) thisYearMoviesCount++;
      } else {
        tvCount++;
        if (isThisYear) thisYearTvCount++;
      }

      // Notes
      if (item.rating) {
        const r = Math.min(10, Math.max(1, Math.round(item.rating)));
        ratingDistribution[r] = (ratingDistribution[r] || 0) + 1;
        ratingSum += item.rating;
        ratingCount++;
      }

      // Genres
      for (const g of itemGenres) {
        if (!genreStats[g.name]) {
          genreStats[g.name] = { count: 0, name: g.name };
        }
        genreStats[g.name].count++;
      }

      // Timeline mensuelle
      const monthKey = `${watchedDate.getFullYear()}-${String(watchedDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyStats[monthKey]) {
        const monthLabel = watchedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        monthlyStats[monthKey] = { label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), count: 0, movies: 0, tv: 0, anime: 0 };
      }
      monthlyStats[monthKey].count++;
      if (isAnime) monthlyStats[monthKey].anime++;
      else if (item.media_type === 'movie') monthlyStats[monthKey].movies++;
      else monthlyStats[monthKey].tv++;
    }

    // Heures estimées : 1.9h par film, 6.5h par série, 4.5h par animé
    const moviesHours = Math.round(moviesCount * 1.9);
    const tvHours = Math.round(tvCount * 6.5);
    const animeHours = Math.round(animeCount * 4.5);
    const totalHours = moviesHours + tvHours + animeHours;

    const thisYearMoviesHours = Math.round(thisYearMoviesCount * 1.9);
    const thisYearTvHours = Math.round(thisYearTvCount * 6.5);
    const thisYearAnimeHours = Math.round(thisYearAnimeCount * 4.5);
    const thisYearTotalHours = thisYearMoviesHours + thisYearTvHours + thisYearAnimeHours;

    // Genres ordonnés avec pourcentages
    const totalGenreAssignments = Object.values(genreStats).reduce((acc, g) => acc + g.count, 0) || 1;
    const topGenres = Object.values(genreStats)
      .map((g) => ({
        name: g.name,
        count: g.count,
        percentage: Math.round((g.count / totalGenreAssignments) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    // Timeline triée chronologiquement inverse
    const timeline = Object.entries(monthlyStats)
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.key.localeCompare(a.key));

    res.json({
      // Compteurs totaux
      totalWatched: allWatched.length,
      moviesWatched: moviesCount,
      tvWatched: tvCount,
      animeWatched: animeCount,
      totalHours,
      moviesHours,
      tvHours,
      animeHours,

      // Cette année (2026)
      currentYear,
      thisYearWatchedCount: thisYearMoviesCount + thisYearTvCount + thisYearAnimeCount,
      thisYearTotalHours,
      thisYearMoviesHours,
      thisYearTvHours,
      thisYearAnimeHours,

      // Notes & Watchlist
      watchlistCount,
      averageRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      ratingCount,
      ratingDistribution,

      // Répartition détaillée
      topGenres,
      timeline,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
