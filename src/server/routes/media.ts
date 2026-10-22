import { Router, Response } from 'express';
import db from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { SimklService } from '../services/simklService.js';

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

// Obtenir la liste des déjà vus
router.get('/watched', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const type = req.query.type as string; // 'movie' | 'tv' | undefined
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

    // Parse genres JSON
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
// STATISTIQUES UTILISATEUR
// ==========================================
router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const moviesCount = (db.prepare("SELECT COUNT(*) as count FROM watched_items WHERE user_id = ? AND media_type = 'movie'").get(userId) as any).count;
    const tvCount = (db.prepare("SELECT COUNT(*) as count FROM watched_items WHERE user_id = ? AND media_type = 'tv'").get(userId) as any).count;
    const watchlistCount = (db.prepare("SELECT COUNT(*) as count FROM watchlist WHERE user_id = ?").get(userId) as any).count;
    const avgRatingRow = db.prepare("SELECT AVG(rating) as avg_rating FROM watched_items WHERE user_id = ? AND rating IS NOT NULL").get(userId) as any;

    // Calculer les heures estimées (moyenne 1.9h par film, 0.8h par épisode)
    const estimatedHours = Math.round(moviesCount * 1.9 + tvCount * 6.5);

    res.json({
      moviesWatched: moviesCount,
      tvWatched: tvCount,
      totalWatched: moviesCount + tvCount,
      watchlistCount,
      averageRating: avgRatingRow.avg_rating ? Math.round(avgRatingRow.avg_rating * 10) / 10 : null,
      estimatedHours,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
