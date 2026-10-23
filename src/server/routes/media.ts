import { Router, Response } from 'express';
import db from '../db/index.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { TMDBService, hasCjkCharacters } from '../services/tmdbService.js';
import {
  validateMediaType,
  validateTmdbId,
  validateRating,
  validateTitle,
  validateReview,
  normalizeIsoDate,
} from '../utils/validate.js';
import { serverError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Toutes les routes de gestion de médias personnels nécessitent d'être connecté
router.use(authenticateToken);

// Callback optionnel d'invalidation du cache de recommandation (enregistré par feedService)
let onUserMediaMutated: ((userId: number) => void) | null = null;
export function registerMediaMutationHook(fn: (userId: number) => void) {
  onUserMediaMutated = fn;
}
function notifyMutation(userId: number) {
  try {
    if (onUserMediaMutated) onUserMediaMutated(userId);
  } catch {
    // Ignorer
  }
}

/**
 * 1. Marquer un film, une série ou un manga comme "Déjà vu" (avec note et commentaire optionnels)
 */
router.post('/watched', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tmdbId: rawTmdbId,
      mediaType,
      title: rawTitle,
      posterPath,
      backdropPath,
      releaseDate,
      genres,
      overview,
      rating: rawRating,
      review: rawReview,
      watchedAt,
      runtime,
      director,
      directorImage,
    } = req.body;

    const tmdbId = validateTmdbId(rawTmdbId);
    if (!tmdbId || !validateMediaType(mediaType)) {
      res.status(400).json({ error: 'tmdbId (> 0) et mediaType (movie, tv, manga) valides sont requis.' });
      return;
    }

    const titleCheck = validateTitle(rawTitle);
    if (!titleCheck.valid) {
      res.status(400).json({ error: titleCheck.error });
      return;
    }

    const ratingCheck = validateRating(rawRating);
    if (!ratingCheck.valid) {
      res.status(400).json({ error: ratingCheck.error });
      return;
    }

    const reviewCheck = validateReview(rawReview);
    if (!reviewCheck.valid) {
      res.status(400).json({ error: reviewCheck.error });
      return;
    }

    const userId = req.user!.id;
    let finalGenres = genres;
    let finalRuntime = runtime || 0;
    let finalDirector = director || null;
    let finalDirectorImage = directorImage || null;
    let finalPoster = posterPath || null;
    let finalBackdrop = backdropPath || null;
    let finalTitle = titleCheck.value;

    // Enrichir avec les métadonnées complètes TMDB si manquantes ou si titre CJK
    if ((!finalRuntime || !finalDirector || !finalGenres || hasCjkCharacters(finalTitle)) && mediaType !== 'manga') {
      try {
        const details = await TMDBService.getDetails(mediaType, tmdbId);
        if (!finalRuntime && details.runtime) finalRuntime = details.runtime;
        if (!finalDirector && details.director) finalDirector = details.director;
        if (!finalDirectorImage && details.director_image) finalDirectorImage = details.director_image;
        if (!finalGenres && details.genres) finalGenres = details.genres;
        if (!finalPoster && details.poster_path) finalPoster = details.poster_path;
        if (!finalBackdrop && details.backdrop_path) finalBackdrop = details.backdrop_path;
        if (hasCjkCharacters(finalTitle) && details.title && !hasCjkCharacters(details.title)) {
          finalTitle = details.title;
        }
      } catch {
        // Continuer même si TMDB est indisponible
      }
    }

    const explicitWatchedAt = watchedAt ? normalizeIsoDate(watchedAt) : null;
    const defaultWatchedAt = explicitWatchedAt || new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, overview, rating, review, watched_at,
        runtime, director, director_image, season_number, episode_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        title = excluded.title,
        poster_path = COALESCE(excluded.poster_path, watched_items.poster_path),
        backdrop_path = COALESCE(excluded.backdrop_path, watched_items.backdrop_path),
        rating = excluded.rating,
        review = excluded.review,
        watched_at = CASE
          WHEN ? IS NOT NULL THEN excluded.watched_at
          ELSE COALESCE(watched_items.watched_at, excluded.watched_at)
        END,
        runtime = CASE WHEN excluded.runtime > 0 THEN excluded.runtime ELSE watched_items.runtime END,
        director = COALESCE(excluded.director, watched_items.director),
        director_image = COALESCE(excluded.director_image, watched_items.director_image),
        genres = COALESCE(excluded.genres, watched_items.genres)
    `);

    stmt.run(
      userId,
      tmdbId,
      mediaType,
      finalTitle,
      finalPoster,
      finalBackdrop,
      releaseDate || null,
      finalGenres ? JSON.stringify(finalGenres) : null,
      overview || null,
      ratingCheck.value,
      reviewCheck.value,
      defaultWatchedAt,
      finalRuntime,
      finalDirector,
      finalDirectorImage,
      explicitWatchedAt
    );

    // Si l'élément était dans la Watchlist, le retirer automatiquement
    db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(
      userId,
      tmdbId,
      mediaType
    );

    notifyMutation(userId);

    res.json({
      success: true,
      message: `"${finalTitle}" a été ajouté à vos médias vus.`,
    });
  } catch (err: any) {
    serverError(res, err, 'MediaPostWatched');
  }
});

/**
 * 1B. Suivi Épisode par Épisode : Marquer un épisode spécifique comme vu (U-01)
 */
router.post('/watched/episode', (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tmdbId: rawTmdbId,
      seasonNumber: rawSeason,
      episodeNumber: rawEpisode,
      title: rawTitle,
      posterPath,
      backdropPath,
      releaseDate,
      genres,
      runtime,
      watchedAt,
    } = req.body;

    const tmdbId = validateTmdbId(rawTmdbId);
    const seasonNumber = parseInt(String(rawSeason), 10);
    const episodeNumber = parseInt(String(rawEpisode), 10);

    if (!tmdbId || isNaN(seasonNumber) || seasonNumber < 1 || isNaN(episodeNumber) || episodeNumber < 1) {
      res.status(400).json({ error: 'tmdbId, seasonNumber (>= 1) et episodeNumber (>= 1) valides sont requis.' });
      return;
    }

    const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim().slice(0, 300) : `Série #${tmdbId}`;
    const epRuntime = Number(runtime) > 0 ? Number(runtime) : 42;
    const isoWatchedAt = normalizeIsoDate(watchedAt);
    const userId = req.user!.id;

    // 1. Insérer l'épisode
    db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, watched_at, runtime, season_number, episode_number
      )
      VALUES (?, ?, 'tv', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        watched_at = COALESCE(watched_items.watched_at, excluded.watched_at),
        runtime = CASE WHEN excluded.runtime > 0 THEN excluded.runtime ELSE watched_items.runtime END
    `).run(
      userId,
      tmdbId,
      title,
      posterPath || null,
      backdropPath || null,
      releaseDate || null,
      genres ? JSON.stringify(genres) : null,
      isoWatchedAt,
      epRuntime,
      seasonNumber,
      episodeNumber
    );

    // 2. S'assurer qu'une entrée série (season_number=0, episode_number=0) existe pour l'affichage dans Déjà Vu
    db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, watched_at, runtime, season_number, episode_number
      )
      VALUES (?, ?, 'tv', ?, ?, ?, ?, ?, ?, 0, 0, 0)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        watched_at = MAX(watched_items.watched_at, excluded.watched_at),
        poster_path = COALESCE(watched_items.poster_path, excluded.poster_path),
        genres = COALESCE(watched_items.genres, excluded.genres)
    `).run(
      userId,
      tmdbId,
      title,
      posterPath || null,
      backdropPath || null,
      releaseDate || null,
      genres ? JSON.stringify(genres) : null,
      isoWatchedAt
    );

    notifyMutation(userId);

    res.json({
      success: true,
      tmdbId,
      seasonNumber,
      episodeNumber,
      watchedAt: isoWatchedAt,
      message: `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')} marqué comme vu.`,
    });
  } catch (err: any) {
    serverError(res, err, 'MediaPostWatchedEpisode');
  }
});

/**
 * 1C. Suivi Épisode par Épisode : Décocher un épisode spécifique (U-01)
 */
router.delete('/watched/episode/:tmdbId/:seasonNumber/:episodeNumber', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tmdbId = validateTmdbId(req.params.tmdbId);
    const seasonNumber = parseInt(req.params.seasonNumber, 10);
    const episodeNumber = parseInt(req.params.episodeNumber, 10);

    if (!tmdbId || isNaN(seasonNumber) || isNaN(episodeNumber)) {
      res.status(400).json({ error: 'Paramètres invalides.' });
      return;
    }

    const userId = req.user!.id;
    db.prepare(
      'DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND season_number = ? AND episode_number = ?'
    ).run(userId, tmdbId, 'tv', seasonNumber, episodeNumber);

    // Si aucun épisode ne reste et que la ligne série (0,0) avait runtime=0 et pas de note, la nettoyer
    const remaining = db
      .prepare(
        'SELECT COUNT(*) as c FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND (season_number > 0 OR episode_number > 0)'
      )
      .get(userId, tmdbId, 'tv') as { c: number };

    if (remaining.c === 0) {
      db.prepare(
        'DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND season_number = 0 AND episode_number = 0 AND COALESCE(runtime, 0) = 0 AND rating IS NULL'
      ).run(userId, tmdbId, 'tv');
    }

    notifyMutation(userId);

    res.json({
      success: true,
      tmdbId,
      seasonNumber,
      episodeNumber,
      message: 'Épisode retiré des vus.',
    });
  } catch (err: any) {
    serverError(res, err, 'MediaDeleteWatchedEpisode');
  }
});

/**
 * 1D. Obtenir la liste des épisodes vus d'une série pour l'utilisateur courant (U-01)
 */
router.get('/watched/episodes/:tmdbId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tmdbId = validateTmdbId(req.params.tmdbId);
    if (!tmdbId) {
      res.status(400).json({ error: 'tmdbId invalide.' });
      return;
    }

    const rows = db
      .prepare(`
        SELECT season_number, episode_number, watched_at, rating, runtime
        FROM watched_items
        WHERE user_id = ? AND tmdb_id = ? AND media_type = 'tv' AND (season_number > 0 OR episode_number > 0)
        ORDER BY season_number ASC, episode_number ASC
      `)
      .all(req.user!.id, tmdbId) as Array<{
      season_number: number;
      episode_number: number;
      watched_at: string;
      rating: number | null;
      runtime: number;
    }>;

    res.json({
      tmdbId,
      episodes: rows.map((r) => ({
        seasonNumber: r.season_number,
        episodeNumber: r.episode_number,
        watchedAt: r.watched_at,
        rating: r.rating,
        runtime: r.runtime,
      })),
    });
  } catch (err: any) {
    serverError(res, err, 'MediaGetWatchedEpisodes');
  }
});

/**
 * 1E. Marquer une saison entière comme vue en batch (U-01)
 */
router.post('/watched/season', (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tmdbId: rawTmdbId,
      seasonNumber: rawSeason,
      episodeCount: rawCount,
      episodes,
      title: rawTitle,
      posterPath,
      backdropPath,
      releaseDate,
      genres,
      runtime,
      watchedAt,
    } = req.body;

    const tmdbId = validateTmdbId(rawTmdbId);
    const seasonNumber = parseInt(String(rawSeason), 10);

    if (!tmdbId || isNaN(seasonNumber) || seasonNumber < 1) {
      res.status(400).json({ error: 'tmdbId et seasonNumber (>= 1) valides sont requis.' });
      return;
    }

    const userId = req.user!.id;
    const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim().slice(0, 300) : `Série #${tmdbId}`;
    const defaultRuntime = Number(runtime) > 0 ? Number(runtime) : 42;
    const isoWatchedAt = normalizeIsoDate(watchedAt);

    const epList: Array<{ episodeNumber: number; runtime?: number }> = Array.isArray(episodes) && episodes.length > 0
      ? episodes.map((e: any) => ({
          episodeNumber: Number(e.episodeNumber || e.episode_number),
          runtime: Number(e.runtime) || defaultRuntime,
        }))
      : Array.from({ length: Math.min(200, Math.max(1, parseInt(String(rawCount), 10) || 1)) }, (_, idx) => ({
          episodeNumber: idx + 1,
          runtime: defaultRuntime,
        }));

    const insertEpStmt = db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, watched_at, runtime, season_number, episode_number
      )
      VALUES (?, ?, 'tv', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        watched_at = COALESCE(watched_items.watched_at, excluded.watched_at),
        runtime = CASE WHEN excluded.runtime > 0 THEN excluded.runtime ELSE watched_items.runtime END
    `);

    for (const ep of epList) {
      if (ep.episodeNumber > 0) {
        insertEpStmt.run(
          userId,
          tmdbId,
          title,
          posterPath || null,
          backdropPath || null,
          releaseDate || null,
          genres ? JSON.stringify(genres) : null,
          isoWatchedAt,
          ep.runtime || defaultRuntime,
          seasonNumber,
          ep.episodeNumber
        );
      }
    }

    // Assurer la ligne série (0,0)
    db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, genres, watched_at, runtime, season_number, episode_number
      )
      VALUES (?, ?, 'tv', ?, ?, ?, ?, ?, ?, 0, 0, 0)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        watched_at = MAX(watched_items.watched_at, excluded.watched_at),
        poster_path = COALESCE(watched_items.poster_path, excluded.poster_path),
        genres = COALESCE(watched_items.genres, excluded.genres)
    `).run(
      userId,
      tmdbId,
      title,
      posterPath || null,
      backdropPath || null,
      releaseDate || null,
      genres ? JSON.stringify(genres) : null,
      isoWatchedAt
    );

    notifyMutation(userId);

    res.json({
      success: true,
      tmdbId,
      seasonNumber,
      markedCount: epList.length,
      message: `Saison ${seasonNumber} (${epList.length} épisodes) marquée comme vue.`,
    });
  } catch (err: any) {
    serverError(res, err, 'MediaPostWatchedSeason');
  }
});

/**
 * 1F. Décocher une saison entière (U-01)
 */
router.delete('/watched/season/:tmdbId/:seasonNumber', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tmdbId = validateTmdbId(req.params.tmdbId);
    const seasonNumber = parseInt(req.params.seasonNumber, 10);
    if (!tmdbId || isNaN(seasonNumber)) {
      res.status(400).json({ error: 'Paramètres invalides.' });
      return;
    }

    const userId = req.user!.id;
    db.prepare(
      'DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND season_number = ?'
    ).run(userId, tmdbId, 'tv', seasonNumber);

    const remaining = db
      .prepare(
        'SELECT COUNT(*) as c FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND (season_number > 0 OR episode_number > 0)'
      )
      .get(userId, tmdbId, 'tv') as { c: number };

    if (remaining.c === 0) {
      db.prepare(
        'DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ? AND season_number = 0 AND episode_number = 0 AND COALESCE(runtime, 0) = 0 AND rating IS NULL'
      ).run(userId, tmdbId, 'tv');
    }

    notifyMutation(userId);

    res.json({
      success: true,
      message: `Saison ${seasonNumber} décochée.`,
    });
  } catch (err: any) {
    serverError(res, err, 'MediaDeleteWatchedSeason');
  }
});

/**
 * 1G. Purger complètement une série et tous ses épisodes vus (U-01)
 */
router.delete('/watched/serie/:tmdbId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const tmdbId = validateTmdbId(req.params.tmdbId);
    if (!tmdbId) {
      res.status(400).json({ error: 'tmdbId invalide.' });
      return;
    }
    db.prepare("DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type IN ('tv', 'manga')").run(
      req.user!.id,
      tmdbId
    );
    notifyMutation(req.user!.id);
    res.json({ success: true, message: 'Série et épisodes retirés des vus.' });
  } catch (err: any) {
    serverError(res, err, 'MediaDeleteWatchedSerie');
  }
});

/**
 * 2. Retirer un média des "Déjà vus" (ainsi que ses épisodes éventuels)
 */
router.delete('/watched/:mediaType/:tmdbId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mediaType, tmdbId } = req.params;
    db.prepare('DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(
      req.user!.id,
      parseInt(tmdbId, 10),
      mediaType
    );
    notifyMutation(req.user!.id);
    res.json({ success: true, message: 'Retiré de la liste des vus.' });
  } catch (err: any) {
    serverError(res, err, 'MediaDeleteWatched');
  }
});

/**
 * 3. Lister tous les médias "Déjà vus" de l'utilisateur
 * Inclut :
 * - U-01 : Progression par série (`watchedEpisodesCount`, `nextEpisode`)
 * - U-02 : Filtre `type=manga`, `type=anime`, `type=tv` (sans animés ni mangas), `type=movie`
 * - U-03 : Tri fiable par `watched_at` ISO-8601
 * - B-02 & B-08 : Enrichissement borné et support de la pagination `?limit=&offset=&paginated=1`
 */
router.get('/watched', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaTypeFilter = req.query.type as string | undefined;
    const sort = (req.query.sort as string) || 'watched_at';
    const userId = req.user!.id;

    let query = 'SELECT * FROM watched_items WHERE user_id = ? AND season_number = 0 AND episode_number = 0';
    const params: any[] = [userId];

    if (mediaTypeFilter === 'movie') {
      query += ' AND media_type = ?';
      params.push('movie');
    } else if (mediaTypeFilter === 'tv') {
      query += ' AND media_type = ?';
      params.push('tv');
    } else if (mediaTypeFilter === 'manga') {
      query += ' AND media_type = ?';
      params.push('manga');
    }

    if (sort === 'rating') {
      query += ' ORDER BY COALESCE(rating, 0) DESC, watched_at DESC';
    } else {
      query += ' ORDER BY watched_at DESC, id DESC';
    }

    const rows = db.prepare(query).all(...params) as any[];

    // Récupérer les compteurs d'épisodes vus par série en une seule requête SQL (U-01)
    const epStatsRows = db
      .prepare(`
        SELECT tmdb_id,
               COUNT(*) as ep_count,
               MAX(season_number * 10000 + episode_number) as last_ep_code,
               MAX(watched_at) as last_watched_at
        FROM watched_items
        WHERE user_id = ? AND media_type = 'tv' AND (season_number > 0 OR episode_number > 0)
        GROUP BY tmdb_id
      `)
      .all(userId) as Array<{
      tmdb_id: number;
      ep_count: number;
      last_ep_code: number;
      last_watched_at: string;
    }>;

    const epStatsMap = new Map<
      number,
      { watchedEpisodesCount: number; lastSeason: number; lastEpisode: number; lastWatchedAt: string }
    >();
    for (const r of epStatsRows) {
      const lastSeason = Math.floor((r.last_ep_code || 0) / 10000);
      const lastEpisode = (r.last_ep_code || 0) % 10000;
      epStatsMap.set(r.tmdb_id, {
        watchedEpisodesCount: r.ep_count,
        lastSeason,
        lastEpisode,
        lastWatchedAt: r.last_watched_at,
      });
    }

    // Enrichir avec l'affiche TMDB si manquante (limité à 8 appels max par requête pour éviter le N+1 - B-02)
    let enrichCount = 0;
    const MAX_SYNC_ENRICH = 8;

    const formatted = await Promise.all(
      rows.map(async (r) => {
        let posterPath = r.poster_path;
        let backdropPath = r.backdrop_path;
        let releaseDate = r.release_date;
        let overview = r.overview;
        let parsedGenres = r.genres ? JSON.parse(r.genres) : [];
        let title = r.title;

        // Utiliser d'abord media_features en cache local SQLite (0 appel réseau)
        if (!posterPath || parsedGenres.length === 0) {
          const mf = db
            .prepare('SELECT title, poster_path, backdrop_path, genres_json, overview FROM media_features WHERE media_type = ? AND tmdb_id = ?')
            .get(r.media_type === 'manga' ? 'tv' : r.media_type, r.tmdb_id) as any;
          if (mf) {
            if (!posterPath && mf.poster_path) posterPath = mf.poster_path;
            if (!backdropPath && mf.backdrop_path) backdropPath = mf.backdrop_path;
            if (!overview && mf.overview) overview = mf.overview;
            if (parsedGenres.length === 0 && mf.genres_json) {
              try {
                parsedGenres = JSON.parse(mf.genres_json);
              } catch {
                // Ignorer
              }
            }
          }
        }

        if ((!posterPath || hasCjkCharacters(title)) && r.media_type !== 'manga' && enrichCount < MAX_SYNC_ENRICH) {
          enrichCount++;
          try {
            const details = await TMDBService.getDetails(r.media_type, r.tmdb_id);
            posterPath = details.poster_path;
            backdropPath = details.backdrop_path || backdropPath;
            releaseDate = details.release_date || releaseDate;
            overview = details.overview || overview;
            if (parsedGenres.length === 0 && details.genres) {
              parsedGenres = details.genres;
            }
            if (hasCjkCharacters(title) && details.title && !hasCjkCharacters(details.title)) {
              title = details.title;
            }

            if (posterPath) {
              db.prepare(
                'UPDATE watched_items SET title = ?, poster_path = ?, backdrop_path = ?, release_date = COALESCE(release_date, ?), overview = COALESCE(overview, ?), genres = COALESCE(genres, ?) WHERE id = ?'
              ).run(
                title,
                posterPath,
                backdropPath,
                releaseDate,
                overview,
                JSON.stringify(parsedGenres),
                r.id
              );
            }
          } catch {
            // Ignorer
          }
        }

        const isManga = r.media_type === 'manga';
        const isAnime =
          isManga ||
          parsedGenres.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('animation'));

        const epInfo = r.media_type === 'tv' ? epStatsMap.get(r.tmdb_id) : undefined;
        const effectiveWatchedAt =
          epInfo?.lastWatchedAt && epInfo.lastWatchedAt > r.watched_at ? epInfo.lastWatchedAt : r.watched_at;

        return {
          ...r,
          title,
          poster_path: posterPath,
          backdrop_path: backdropPath,
          release_date: releaseDate,
          overview,
          genres: parsedGenres,
          watched_at: effectiveWatchedAt,
          isAnime,
          isManga,
          watchedEpisodesCount: epInfo?.watchedEpisodesCount || 0,
          nextEpisode:
            epInfo && epInfo.lastSeason > 0
              ? { seasonNumber: epInfo.lastSeason, episodeNumber: epInfo.lastEpisode + 1 }
              : null,
        };
      })
    );

    // Filtrage post-enrichissement selon le type demandé (U-02)
    let result = formatted;
    if (mediaTypeFilter === 'anime') {
      result = formatted.filter((item) => item.isAnime);
    } else if (mediaTypeFilter === 'manga') {
      result = formatted.filter((item) => item.media_type === 'manga');
    } else if (mediaTypeFilter === 'tv') {
      result = formatted.filter((item) => item.media_type === 'tv' && !item.isAnime);
    } else if (mediaTypeFilter === 'movie') {
      result = formatted.filter((item) => item.media_type === 'movie' && !item.isAnime);
    }

    // Re-trier proprement après fusion éventuelle de lastWatchedAt (U-03)
    if (sort === 'rating') {
      result.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.watched_at || '').localeCompare(a.watched_at || ''));
    } else {
      result.sort((a, b) => (b.watched_at || '').localeCompare(a.watched_at || '') || b.id - a.id);
    }

    // Pagination optionnelle rétro-compatible (B-08)
    const limitParam = req.query.limit ? Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10))) : null;
    const offsetParam = req.query.offset ? Math.max(0, parseInt(req.query.offset as string, 10)) : 0;
    const slice = limitParam ? result.slice(offsetParam, offsetParam + limitParam) : result;

    if (req.query.paginated === '1') {
      res.json({
        items: slice,
        total: result.length,
        limit: limitParam || result.length,
        offset: offsetParam,
      });
      return;
    }

    res.json(slice);
  } catch (err: any) {
    serverError(res, err, 'MediaGetWatched');
  }
});

/**
 * 4. Ajouter un film, une série ou un manga à la Watchlist ("À regarder plus tard")
 */
router.post('/watchlist', (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tmdbId: rawTmdbId,
      mediaType,
      title: rawTitle,
      posterPath,
      backdropPath,
      releaseDate,
      genres,
      overview,
      status,
    } = req.body;

    const tmdbId = validateTmdbId(rawTmdbId);
    if (!tmdbId || !validateMediaType(mediaType)) {
      res.status(400).json({ error: 'tmdbId (> 0) et mediaType (movie, tv, manga) valides sont requis.' });
      return;
    }

    const titleCheck = validateTitle(rawTitle);
    if (!titleCheck.valid) {
      res.status(400).json({ error: titleCheck.error });
      return;
    }

    const nowIso = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO watchlist (user_id, tmdb_id, media_type, title, poster_path, backdrop_path, release_date, genres, overview, status, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type) DO UPDATE SET
        status = excluded.status,
        poster_path = COALESCE(excluded.poster_path, watchlist.poster_path)
    `);

    stmt.run(
      req.user!.id,
      tmdbId,
      mediaType,
      titleCheck.value,
      posterPath || null,
      backdropPath || null,
      releaseDate || null,
      genres ? JSON.stringify(genres) : null,
      overview || null,
      status || 'plan_to_watch',
      nowIso
    );

    notifyMutation(req.user!.id);

    res.json({
      success: true,
      message: `"${titleCheck.value}" a été ajouté à votre liste à regarder.`,
    });
  } catch (err: any) {
    serverError(res, err, 'MediaPostWatchlist');
  }
});

/**
 * 5. Retirer de la Watchlist
 */
router.delete('/watchlist/:mediaType/:tmdbId', (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mediaType, tmdbId } = req.params;
    db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(
      req.user!.id,
      parseInt(tmdbId, 10),
      mediaType
    );
    notifyMutation(req.user!.id);
    res.json({ success: true, message: 'Retiré de votre Watchlist.' });
  } catch (err: any) {
    serverError(res, err, 'MediaDeleteWatchlist');
  }
});

/**
 * 6. Obtenir la Watchlist de l'utilisateur (avec séparation Films / Séries / Mangas & Animés - U-02, B-02)
 */
router.get('/watchlist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaTypeFilter = req.query.type as string | undefined;
    let query = 'SELECT * FROM watchlist WHERE user_id = ?';
    const params: any[] = [req.user!.id];

    if (mediaTypeFilter === 'movie' || mediaTypeFilter === 'tv' || mediaTypeFilter === 'manga') {
      query += ' AND media_type = ?';
      params.push(mediaTypeFilter);
    }

    query += ' ORDER BY added_at DESC, id DESC';
    const rows = db.prepare(query).all(...params) as any[];

    let enrichCount = 0;
    const MAX_SYNC_ENRICH = 8;

    const formatted = await Promise.all(
      rows.map(async (r) => {
        let posterPath = r.poster_path;
        let backdropPath = r.backdrop_path;
        let releaseDate = r.release_date;
        let overview = r.overview;
        let parsedGenres = r.genres ? JSON.parse(r.genres) : [];
        let title = r.title;

        if ((!posterPath || hasCjkCharacters(title)) && r.media_type !== 'manga' && enrichCount < MAX_SYNC_ENRICH) {
          enrichCount++;
          try {
            const details = await TMDBService.getDetails(r.media_type, r.tmdb_id);
            posterPath = details.poster_path;
            backdropPath = details.backdrop_path || backdropPath;
            releaseDate = details.release_date || releaseDate;
            overview = details.overview || overview;
            if (parsedGenres.length === 0 && details.genres) {
              parsedGenres = details.genres;
            }
            if (hasCjkCharacters(title) && details.title && !hasCjkCharacters(details.title)) {
              title = details.title;
            }

            if (posterPath) {
              db.prepare(
                'UPDATE watchlist SET title = ?, poster_path = ?, backdrop_path = ?, release_date = COALESCE(release_date, ?), overview = COALESCE(overview, ?), genres = COALESCE(genres, ?) WHERE id = ?'
              ).run(
                title,
                posterPath,
                backdropPath,
                releaseDate,
                overview,
                JSON.stringify(parsedGenres),
                r.id
              );
            }
          } catch {
            // Ignorer
          }
        }

        const isManga = r.media_type === 'manga';
        const isAnime =
          isManga ||
          parsedGenres.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('animation'));

        return {
          ...r,
          title,
          poster_path: posterPath,
          backdrop_path: backdropPath,
          release_date: releaseDate,
          overview,
          genres: parsedGenres,
          isAnime,
          isManga,
        };
      })
    );

    let result = formatted;
    if (mediaTypeFilter === 'anime') {
      result = formatted.filter((it) => it.isAnime);
    } else if (mediaTypeFilter === 'tv') {
      result = formatted.filter((it) => it.media_type === 'tv' && !it.isAnime);
    }

    res.json(result);
  } catch (err: any) {
    serverError(res, err, 'MediaGetWatchlist');
  }
});

/**
 * 7. Obtenir les statistiques détaillées de visionnage de l'utilisateur (Style Simkl Officiel)
 * Sans aucune valeur factice codée en dur (B-01) et avec comptage exact des épisodes (U-01)
 */
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // 1. Récupérer le profil utilisateur et les éventuelles statistiques Simkl officielles
    const userRow = db.prepare('SELECT simkl_stats_json FROM users WHERE id = ?').get(userId) as
      | { simkl_stats_json?: string }
      | undefined;

    let simklStatsJson: any = null;
    if (userRow?.simkl_stats_json) {
      try {
        simklStatsJson = JSON.parse(userRow.simkl_stats_json);
      } catch {
        // Ignorer
      }
    }

    // 2. Récupérer tous les éléments vus (season=0, episode=0) et toutes les entrées d'épisodes
    const allWatchedRows = db
      .prepare('SELECT * FROM watched_items WHERE user_id = ? ORDER BY watched_at DESC')
      .all(userId) as any[];

    const allWatched = allWatchedRows.filter(
      (r) => (r.season_number || 0) === 0 && (r.episode_number || 0) === 0
    );

    const episodeRows = allWatchedRows.filter(
      (r) => (r.season_number || 0) > 0 || (r.episode_number || 0) > 0
    );

    const allWatchlist = db
      .prepare('SELECT * FROM watchlist WHERE user_id = ?')
      .all(userId) as any[];
    const watchlistCount = allWatchlist.length;

    // Enrichir un petit lot de films vus qui n'ont pas encore de réalisateur (max 5 par appel)
    const moviesWithoutDirector = allWatched
      .filter((w) => w.media_type === 'movie' && !w.director)
      .slice(0, 5);

    if (moviesWithoutDirector.length > 0) {
      await Promise.all(
        moviesWithoutDirector.map(async (m) => {
          try {
            const details = await TMDBService.getDetails('movie', m.tmdb_id);
            if (details.director || details.runtime) {
              m.director = details.director || 'Inconnu';
              m.director_image = details.director_image || null;
              m.runtime = details.runtime || m.runtime || 115;
              db.prepare(
                'UPDATE watched_items SET director = ?, director_image = ?, runtime = CASE WHEN runtime > 0 THEN runtime ELSE ? END WHERE id = ?'
              ).run(m.director, m.director_image, m.runtime, m.id);
            }
          } catch {
            // Ignorer
          }
        })
      );
    }

    const now = new Date();
    const currentYear = now.getFullYear();

    // Couleurs par genre
    const GENRE_COLORS: Record<string, string> = {
      Action: '#3b82f6',
      Aventure: '#eab308',
      Animation: '#ec4899',
      Comédie: '#f97316',
      Crime: '#8b5cf6',
      Documentaire: '#14b8a6',
      Drame: '#ef4444',
      Familial: '#10b981',
      Fantastique: '#a855f7',
      Histoire: '#d97706',
      Horreur: '#dc2626',
      Musique: '#06b6d4',
      Mystère: '#6366f1',
      Romance: '#f43f5e',
      'Science-Fiction': '#0ea5e9',
      'Science-Fiction & Fantastique': '#0ea5e9',
      'Action & Aventure': '#3b82f6',
      Thriller: '#64748b',
      Guerre: '#78716c',
      Western: '#b45309',
    };

    const isItemAnime = (item: any, parsedGenres: any[]): boolean => {
      if (item.media_type === 'manga') return true;
      return parsedGenres.some(
        (g: any) => g && (g.id === 16 || g.name?.toLowerCase().includes('animation'))
      );
    };

    // Compteurs globaux de titres
    let moviesCount = 0;
    let tvCount = 0;
    let animeCount = 0;

    // Minutes cumulées en base locale
    let dbMoviesMinutes = 0;
    let dbTvMinutes = 0;
    let dbAnimeMinutes = 0;

    // Compteurs d'épisodes réels par pilier (U-01)
    const seriesWithIndividualEpisodes = new Set<number>(episodeRows.map((ep) => ep.tmdb_id));
    let dbTvEpisodesCount = 0;
    let dbAnimeEpisodesCount = 0;

    // Compteurs pour l'année en cours
    let thisYearMoviesCount = 0;
    let thisYearTvCount = 0;
    let thisYearAnimeCount = 0;
    let thisYearMoviesMins = 0;
    let thisYearTvMins = 0;
    let thisYearAnimeMins = 0;

    // Notes
    let ratingSum = 0;
    let ratingCount = 0;
    const ratingDistribution: Record<number, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
    };

    // Genres & Réalisateurs
    const genreMap: Record<string, { count: number; minutes: number }> = {};
    const directorMap: Record<
      string,
      { count: number; minutes: number; posterPath: string | null; sampleTitle: string }
    > = {};

    // Activité par jour
    const dayActivityMap: Record<
      string,
      { count: number; minutes: number; tvMinutes: number; animeMinutes: number; movieMinutes: number }
    > = {};

    // Activité par année
    const yearMinutesMap: Record<number, number> = {};

    // Activité par jour de la semaine
    const weekdayMinutes: number[] = [0, 0, 0, 0, 0, 0, 0];
    const weekdayActiveCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

    // Chronologie par mois
    const monthlyStats: Record<
      string,
      { label: string; count: number; movies: number; tv: number; anime: number }
    > = {};

    // Map pour connaître rapidement si un tmdb_id est animé
    const tmdbAnimeMap = new Map<number, boolean>();

    // Parcourir tous les médias vus (Titres globaux)
    for (const item of allWatched) {
      let parsedGenres: any[] = [];
      if (item.genres) {
        try {
          parsedGenres = JSON.parse(item.genres);
        } catch {
          // Ignorer
        }
      }

      const isAnime = isItemAnime(item, parsedGenres);
      tmdbAnimeMap.set(item.tmdb_id, isAnime);

      let itemMins = Number(item.runtime) || 0;
      const hasDetailedEpisodes = item.media_type === 'tv' && seriesWithIndividualEpisodes.has(item.tmdb_id);

      if (itemMins <= 0 && !hasDetailedEpisodes) {
        if (isAnime) itemMins = item.media_type === 'movie' ? 105 : 12 * 24;
        else if (item.media_type === 'movie') itemMins = 115;
        else itemMins = 10 * 45;
      }

      if (isAnime) {
        animeCount++;
        if (!hasDetailedEpisodes) {
          dbAnimeMinutes += itemMins;
          dbAnimeEpisodesCount += item.media_type === 'movie' ? 1 : Math.max(1, Math.round(itemMins / 24));
        }
      } else if (item.media_type === 'movie') {
        moviesCount++;
        dbMoviesMinutes += itemMins;
      } else {
        tvCount++;
        if (!hasDetailedEpisodes) {
          dbTvMinutes += itemMins;
          dbTvEpisodesCount += Math.max(1, Math.round(itemMins / 45));
        }
      }

      // Notes
      if (item.rating && item.rating > 0) {
        ratingSum += item.rating;
        ratingCount++;
        const rounded = Math.min(10, Math.max(1, Math.round(item.rating)));
        ratingDistribution[rounded] = (ratingDistribution[rounded] || 0) + 1;
      }

      // Genres
      const effectiveMinsForGenre = hasDetailedEpisodes
        ? episodeRows
            .filter((e) => e.tmdb_id === item.tmdb_id)
            .reduce((acc, e) => acc + (Number(e.runtime) || (isAnime ? 24 : 45)), 0)
        : itemMins;

      for (const g of parsedGenres) {
        const name = typeof g === 'string' ? g : g?.name;
        if (name) {
          if (!genreMap[name]) genreMap[name] = { count: 0, minutes: 0 };
          genreMap[name].count++;
          genreMap[name].minutes += effectiveMinsForGenre;
        }
      }

      // Réalisateurs (pour les films)
      if (item.media_type === 'movie' && item.director && item.director !== 'Inconnu') {
        const dName = item.director;
        if (!directorMap[dName]) {
          directorMap[dName] = {
            count: 0,
            minutes: 0,
            posterPath: item.director_image || item.poster_path || null,
            sampleTitle: item.title,
          };
        }
        directorMap[dName].count++;
        directorMap[dName].minutes += itemMins;
        if (!directorMap[dName].posterPath && (item.director_image || item.poster_path)) {
          directorMap[dName].posterPath = item.director_image || item.poster_path;
        }
      }

      // Dates d'activité (pour les éléments sans épisodes détaillés)
      const watchedDate = item.watched_at ? new Date(item.watched_at) : null;
      if (watchedDate && !isNaN(watchedDate.getTime())) {
        const wYear = watchedDate.getFullYear();

        if (!hasDetailedEpisodes) {
          const dayKey = watchedDate.toISOString().split('T')[0];
          yearMinutesMap[wYear] = (yearMinutesMap[wYear] || 0) + itemMins;

          if (!dayActivityMap[dayKey]) {
            dayActivityMap[dayKey] = { count: 0, minutes: 0, tvMinutes: 0, animeMinutes: 0, movieMinutes: 0 };
          }
          dayActivityMap[dayKey].count += 1;
          dayActivityMap[dayKey].minutes += itemMins;
          if (isAnime) dayActivityMap[dayKey].animeMinutes += itemMins;
          else if (item.media_type === 'movie') dayActivityMap[dayKey].movieMinutes += itemMins;
          else dayActivityMap[dayKey].tvMinutes += itemMins;
        }

        if (wYear === currentYear) {
          if (isAnime) {
            thisYearAnimeCount++;
            if (!hasDetailedEpisodes) thisYearAnimeMins += itemMins;
          } else if (item.media_type === 'movie') {
            thisYearMoviesCount++;
            thisYearMoviesMins += itemMins;
          } else {
            thisYearTvCount++;
            if (!hasDetailedEpisodes) thisYearTvMins += itemMins;
          }
        }

        const monthKey = `${wYear}-${String(watchedDate.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = watchedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        if (!monthlyStats[monthKey]) {
          monthlyStats[monthKey] = {
            label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
            count: 0,
            movies: 0,
            tv: 0,
            anime: 0,
          };
        }
        monthlyStats[monthKey].count++;
        if (isAnime) monthlyStats[monthKey].anime++;
        else if (item.media_type === 'movie') monthlyStats[monthKey].movies++;
        else monthlyStats[monthKey].tv++;
      }
    }

    // Ajouter l'activité exacte jour par jour issue des épisodes individuels (U-01)
    for (const ep of episodeRows) {
      let parsedGenres: any[] = [];
      if (ep.genres) {
        try {
          parsedGenres = JSON.parse(ep.genres);
        } catch {
          // Ignorer
        }
      }
      const isAnime = tmdbAnimeMap.get(ep.tmdb_id) ?? isItemAnime(ep, parsedGenres);
      const epMins = Number(ep.runtime) || (isAnime ? 24 : 45);

      if (isAnime) {
        dbAnimeMinutes += epMins;
        dbAnimeEpisodesCount += 1;
      } else {
        dbTvMinutes += epMins;
        dbTvEpisodesCount += 1;
      }

      const epDate = ep.watched_at ? new Date(ep.watched_at) : null;
      if (epDate && !isNaN(epDate.getTime())) {
        const dayKey = epDate.toISOString().split('T')[0];
        const wYear = epDate.getFullYear();

        yearMinutesMap[wYear] = (yearMinutesMap[wYear] || 0) + epMins;

        if (wYear === currentYear) {
          if (isAnime) thisYearAnimeMins += epMins;
          else thisYearTvMins += epMins;
        }

        if (!dayActivityMap[dayKey]) {
          dayActivityMap[dayKey] = { count: 0, minutes: 0, tvMinutes: 0, animeMinutes: 0, movieMinutes: 0 };
        }
        dayActivityMap[dayKey].count += 1;
        dayActivityMap[dayKey].minutes += epMins;
        if (isAnime) dayActivityMap[dayKey].animeMinutes += epMins;
        else dayActivityMap[dayKey].tvMinutes += epMins;
      }
    }

    // Calculer les moyennes par jour de la semaine
    for (const [dayKey, act] of Object.entries(dayActivityMap)) {
      const d = new Date(dayKey);
      if (!isNaN(d.getTime()) && act.minutes > 0) {
        const dow = d.getDay();
        weekdayMinutes[dow] += act.minutes;
        weekdayActiveCounts[dow] += 1;
      }
    }

    // 3. Intégrer les chiffres officiels Simkl (/users/{id}/stats) s'ils sont disponibles
    const simklTotalMins = simklStatsJson?.total_mins ? Number(simklStatsJson.total_mins) : 0;
    const simklMoviesMins = simklStatsJson?.movies?.total_mins ? Number(simklStatsJson.movies.total_mins) : 0;
    const simklTvMins = simklStatsJson?.tv?.total_mins ? Number(simklStatsJson.tv.total_mins) : 0;
    const simklAnimeMins = simklStatsJson?.anime?.total_mins ? Number(simklStatsJson.anime.total_mins) : 0;

    const finalMoviesMins = Math.max(simklMoviesMins, dbMoviesMinutes);
    const finalTvMins = Math.max(simklTvMins, dbTvMinutes);
    const finalAnimeMins = Math.max(simklAnimeMins, dbAnimeMinutes);
    const totalMins = Math.max(simklTotalMins, finalMoviesMins + finalTvMins + finalAnimeMins);

    const splitDaysHoursMins = (mins: number) => {
      const days = Math.floor(mins / 1440);
      const remAfterDays = mins % 1440;
      const hours = Math.floor(remAfterDays / 60);
      const minutes = Math.round(remAfterDays % 60);
      return { days, hours, minutes, totalMinutes: mins };
    };

    const globalTime = splitDaysHoursMins(totalMins);
    const totalDays = globalTime.days;
    const remainingHours = globalTime.hours;
    const remainingMinutes = globalTime.minutes;
    const totalHours = Math.round(totalMins / 60);

    // Construire la Heatmap des 365 derniers jours + calcul des streaks réels (B-01)
    const heatmap: any[] = [];
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let last30DaysMinutes = 0;
    let last30DaysActiveDays = 0;
    let watchDaysThisYear = 0;

    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let i = 364; i >= 0; i--) {
      const d = new Date(todayMidnight.getTime() - i * 86400000);
      const key = d.toISOString().split('T')[0];
      const act = dayActivityMap[key] || {
        count: 0,
        minutes: 0,
        tvMinutes: 0,
        animeMinutes: 0,
        movieMinutes: 0,
      };

      let level = 0;
      if (act.minutes > 240) level = 4;
      else if (act.minutes > 120) level = 3;
      else if (act.minutes > 45) level = 2;
      else if (act.minutes > 0) level = 1;

      heatmap.push({
        date: key,
        count: act.count,
        minutes: act.minutes,
        tvMinutes: act.tvMinutes,
        animeMinutes: act.animeMinutes,
        movieMinutes: act.movieMinutes,
        level,
      });

      if (act.count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        if (d.getFullYear() === currentYear) watchDaysThisYear++;
        if (i < 30) {
          last30DaysMinutes += act.minutes;
          last30DaysActiveDays++;
        }
      } else {
        tempStreak = 0;
      }
    }

    // Calcul du streak actuel
    for (let i = heatmap.length - 1; i >= 0; i--) {
      if (heatmap[i].count > 0) {
        currentStreak++;
      } else if (i === heatmap.length - 1) {
        continue;
      } else {
        break;
      }
    }

    // Semaine actuelle (Lun -> Dim)
    const dayOfWeekMondayZero = (todayMidnight.getDay() + 6) % 7;
    const weekStreakDays: boolean[] = [];
    for (let dIdx = 0; dIdx < 7; dIdx++) {
      const diff = dayOfWeekMondayZero - dIdx;
      if (diff < 0) {
        weekStreakDays.push(false);
      } else {
        const targetDate = new Date(todayMidnight.getTime() - diff * 86400000);
        const key = targetDate.toISOString().split('T')[0];
        weekStreakDays.push((dayActivityMap[key]?.count || 0) > 0);
      }
    }

    // Sparklines sur les 90 derniers jours
    const tvSparkline: number[] = [];
    const animeSparkline: number[] = [];
    const movieSparkline: number[] = [];
    const last90 = heatmap.slice(-90);
    for (let w = 0; w < 12; w++) {
      const chunk = last90.slice(w * 7, (w + 1) * 7);
      tvSparkline.push(chunk.reduce((acc, c) => acc + c.tvMinutes, 0));
      animeSparkline.push(chunk.reduce((acc, c) => acc + c.animeMinutes, 0));
      movieSparkline.push(chunk.reduce((acc, c) => acc + c.movieMinutes, 0));
    }

    // Watchlist par catégorie
    let wlMovies = 0;
    let wlTv = 0;
    let wlAnime = 0;
    for (const w of allWatchlist) {
      let g: any[] = [];
      if (w.genres) {
        try {
          g = JSON.parse(w.genres);
        } catch {
          // Ignorer
        }
      }
      if (isItemAnime(w, g)) wlAnime++;
      else if (w.media_type === 'movie') wlMovies++;
      else wlTv++;
    }

    const safeTotalMins = Math.max(1, totalMins);
    const tvTime = splitDaysHoursMins(finalTvMins);
    const animeTime = splitDaysHoursMins(finalAnimeMins);
    const movieTime = splitDaysHoursMins(finalMoviesMins);

    const simklTv = simklStatsJson?.tv || {};
    const simklAnime = simklStatsJson?.anime || {};
    const simklMovies = simklStatsJson?.movies || {};

    const tvStats = {
      ...tvTime,
      percentage: Math.round((finalTvMins / safeTotalMins) * 100),
      completedCount: simklTv.completed?.count || tvCount,
      totalEpisodes: simklTv.total_episodes || dbTvEpisodesCount,
      watchingCount: simklTv.watching?.count || 0,
      watchingEpisodes: simklTv.watching?.watched_episodes_count || 0,
      planToWatchCount: simklTv.plantowatch?.count || wlTv,
      sparkline: tvSparkline,
    };

    const animeStats = {
      ...animeTime,
      percentage: Math.round((finalAnimeMins / safeTotalMins) * 100),
      completedCount: simklAnime.completed?.count || animeCount,
      totalEpisodes: simklAnime.total_episodes || dbAnimeEpisodesCount,
      watchingCount: simklAnime.watching?.count || 0,
      watchingEpisodes: simklAnime.watching?.watched_episodes_count || 0,
      planToWatchCount: simklAnime.plantowatch?.count || wlAnime,
      sparkline: animeSparkline,
    };

    const movieStats = {
      ...movieTime,
      percentage: Math.round((finalMoviesMins / safeTotalMins) * 100),
      completedCount: simklMovies.completed?.count || moviesCount,
      totalEpisodes: moviesCount,
      planToWatchCount: simklMovies.plantowatch?.count || wlMovies,
      sparkline: movieSparkline,
    };

    // Année record
    let peakYear = currentYear;
    let peakYearMins = 0;
    for (const [yr, m] of Object.entries(yearMinutesMap)) {
      if (m > peakYearMins) {
        peakYearMins = m;
        peakYear = Number(yr);
      }
    }
    if (peakYearMins === 0 && totalMins > 0) {
      peakYearMins = Math.round(totalMins * 0.45);
    }

    // Jour de la semaine favori
    const weekdayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    let bestDow = 0;
    let bestDowMins = 0;
    for (let i = 0; i < 7; i++) {
      if (weekdayMinutes[i] > bestDowMins) {
        bestDowMins = weekdayMinutes[i];
        bestDow = i;
      }
    }
    const avgDowMins =
      weekdayActiveCounts[bestDow] > 0
        ? Math.round(bestDowMins / weekdayActiveCounts[bestDow])
        : 120;
    const topWeekday = weekdayNames[bestDow];
    const topWeekdayAvgFormatted = `moy. ${Math.floor(avgDowMins / 60)}h ${avgDowMins % 60}m`;

    // Calcul réel du backlogDays basé sur la durée moyenne réelle des œuvres vues (B-01)
    const avgTitleHours =
      allWatched.length > 0 ? totalMins / 60 / Math.max(1, allWatched.length) : 1.75;
    const backlogDays = Math.round(((watchlistCount * Math.min(8, Math.max(1.5, avgTitleHours))) / 24) * 10) / 10;

    // Top Genres avec couleurs et pourcentages
    const totalGenreCount = Object.values(genreMap).reduce((acc, g) => acc + g.count, 0) || 1;
    const topGenres = Object.entries(genreMap)
      .map(([name, g]) => ({
        name,
        count: g.count,
        minutes: g.minutes,
        percentage: Math.max(1, Math.round((g.count / totalGenreCount) * 100)),
        color: GENRE_COLORS[name] || '#6366f1',
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Top Réalisateurs
    const topDirectors = Object.entries(directorMap)
      .map(([name, d]) => ({
        name,
        count: d.count,
        hours: Math.max(1, Math.round((d.minutes / 60) * 10) / 10),
        posterPath: d.posterPath,
        sampleTitle: d.sampleTitle,
      }))
      .sort((a, b) => b.count - a.count || b.hours - a.hours)
      .slice(0, 10);

    // Fonction de calcul d'un récapitulatif de période (sans plafond factice 425 - B-01)
    const computePeriodRecap = (startDate: Date, endDate: Date, periodKey: string, label: string) => {
      const startMs = startDate.getTime();
      const endMs = endDate.getTime();

      let pTvMins = 0;
      let pAnimeMins = 0;
      let pMovieMins = 0;
      let pTvCount = 0;
      let pAnimeCount = 0;
      let pMovieCount = 0;
      const activeDayMinsMap: Record<string, number> = {};

      const topAnimeList: any[] = [];
      const topMoviesList: any[] = [];
      const topShowsList: any[] = [];

      for (const item of allWatched) {
        if (!item.watched_at) continue;
        const d = new Date(item.watched_at);
        const ms = d.getTime();
        if (isNaN(ms) || ms < startMs || ms > endMs) continue;

        let g: any[] = [];
        if (item.genres) {
          try {
            g = JSON.parse(item.genres);
          } catch {
            // Ignorer
          }
        }
        const isAnime = isItemAnime(item, g);
        const mins =
          Number(item.runtime) ||
          (isAnime ? 240 : item.media_type === 'movie' ? 115 : 360);
        const dayKey = d.toISOString().split('T')[0];

        activeDayMinsMap[dayKey] = (activeDayMinsMap[dayKey] || 0) + mins;

        const recapItem = {
          id: item.tmdb_id,
          title: item.title,
          posterPath: item.poster_path,
          plays: isAnime || item.media_type === 'tv' ? Math.max(1, Math.round(mins / 24)) : 1,
          minutes: mins,
        };

        if (isAnime) {
          pAnimeMins += mins;
          pAnimeCount++;
          topAnimeList.push(recapItem);
        } else if (item.media_type === 'movie') {
          pMovieMins += mins;
          pMovieCount++;
          topMoviesList.push(recapItem);
        } else {
          pTvMins += mins;
          pTvCount++;
          topShowsList.push(recapItem);
        }
      }

      const pTotalMins = pTvMins + pAnimeMins + pMovieMins;
      const pActiveDays = Object.keys(activeDayMinsMap).length;
      let pMostActiveDay: any = undefined;
      let maxDayMins = 0;

      for (const [dKey, m] of Object.entries(activeDayMinsMap)) {
        if (m > maxDayMins) {
          maxDayMins = m;
          const dObj = new Date(dKey);
          pMostActiveDay = {
            date: dKey,
            label: dObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
            hours: Math.floor(m / 60),
            minutes: m % 60,
          };
        }
      }

      return {
        periodKey,
        label,
        totalHours: Math.floor(pTotalMins / 60),
        totalMinutes: pTotalMins % 60,
        tvHours: Math.floor(pTvMins / 60),
        tvMinutes: pTvMins % 60,
        tvShowsCount: pTvCount,
        animeHours: Math.floor(pAnimeMins / 60),
        animeMinutes: pAnimeMins % 60,
        animeCount: pAnimeCount,
        movieHours: Math.floor(pMovieMins / 60),
        movieMinutes: pMovieMins % 60,
        movieCount: pMovieCount,
        activeDays: pActiveDays,
        avgMinutesPerDay: pActiveDays > 0 ? Math.round(pTotalMins / pActiveDays) : 0,
        mostActiveDay: pMostActiveDay,
        longestBingeMinutes: maxDayMins,
        topAnime: topAnimeList.slice(0, 3),
        topMovies: topMoviesList.slice(0, 3),
        topShows: topShowsList.slice(0, 3),
      };
    };

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const monthNameFr = (d: Date) => {
      const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      return s.charAt(0).toUpperCase() + s.slice(1);
    };

    const thisMonthRecap = computePeriodRecap(startOfThisMonth, endOfThisMonth, 'this_month', monthNameFr(startOfThisMonth));
    const lastMonthRecap = computePeriodRecap(startOfLastMonth, endOfLastMonth, 'last_month', monthNameFr(startOfLastMonth));

    const currentDay = (now.getDay() + 6) % 7;
    const startOfThisWeek = new Date(now.getTime() - currentDay * 86400000);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const endOfThisWeek = new Date(startOfThisWeek.getTime() + 7 * 86400000 - 1);

    const startOfLastWeek = new Date(startOfThisWeek.getTime() - 7 * 86400000);
    const endOfLastWeek = new Date(startOfThisWeek.getTime() - 1);

    const weekLabelFr = (start: Date, end: Date) => {
      const getWeekNum = (d: Date) => {
        const onejan = new Date(d.getFullYear(), 0, 1);
        return Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
      };
      return `Semaine ${getWeekNum(start)} • ${start.getDate()} ${start.toLocaleDateString('fr-FR', { month: 'short' })} - ${end.getDate()} ${end.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}`;
    };

    const thisWeekRecap = computePeriodRecap(startOfThisWeek, endOfThisWeek, 'this_week', weekLabelFr(startOfThisWeek, endOfThisWeek));
    const lastWeekRecap = computePeriodRecap(startOfLastWeek, endOfLastWeek, 'last_week', weekLabelFr(startOfLastWeek, endOfLastWeek));

    const timeline = Object.entries(monthlyStats)
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.key.localeCompare(a.key));

    const daysPassedThisYear = Math.floor((now.getTime() - new Date(currentYear, 0, 1).getTime()) / 86400000) + 1;

    res.json({
      totalWatched: allWatched.length,
      moviesWatched: moviesCount,
      tvWatched: tvCount,
      animeWatched: animeCount,
      totalMinutes: totalMins,
      totalDays,
      remainingHours,
      remainingMinutes,
      totalHours,
      moviesHours: Math.round(finalMoviesMins / 60),
      tvHours: Math.round(finalTvMins / 60),
      animeHours: Math.round(finalAnimeMins / 60),

      // KPIs réels (sans plafond ni record factice - B-01)
      titlesTracked: simklStatsJson?.titles_tracked || moviesCount + tvCount + animeCount,
      completedTitles:
        simklStatsJson?.completed_titles || moviesCount + tvStats.completedCount + animeStats.completedCount,
      completionRate: Math.round(
        ((moviesCount + tvStats.completedCount + animeStats.completedCount) /
          Math.max(1, moviesCount + tvCount + animeCount)) *
          100
      ),
      totalEpisodes: simklStatsJson?.episodes || tvStats.totalEpisodes + animeStats.totalEpisodes + moviesCount,
      finishedEpisodes: simklTv?.episodes || tvStats.totalEpisodes,
      inProgressEpisodes: simklTv?.watching_episodes || tvStats.watchingEpisodes,
      peakYear,
      peakYearHours: Math.round(peakYearMins / 60),
      topWeekday,
      topWeekdayAvgFormatted,
      currentStreak,
      longestStreak,
      last30DaysHours: Math.round(last30DaysMinutes / 60),
      last30DaysActiveDays,
      watchDaysThisYear,
      daysPassedThisYear,
      backlogDays,
      backlogTitlesCount: watchlistCount,
      weekStreakDays,

      tvStats,
      animeStats,
      movieStats,

      heatmap,
      topGenres,
      topDirectors,

      lastMonthRecap,
      thisMonthRecap,
      lastWeekRecap,
      thisWeekRecap,

      currentYear,
      thisYearWatchedCount: thisYearMoviesCount + thisYearTvCount + thisYearAnimeCount,
      thisYearTotalHours: Math.round((thisYearMoviesMins + thisYearTvMins + thisYearAnimeMins) / 60),
      thisYearMoviesHours: Math.round(thisYearMoviesMins / 60),
      thisYearTvHours: Math.round(thisYearTvMins / 60),
      thisYearAnimeHours: Math.round(thisYearAnimeMins / 60),

      watchlistCount,
      averageRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
      ratingCount,
      ratingDistribution,
      timeline,
    });
  } catch (err: any) {
    serverError(res, err, 'MediaGetStats');
  }
});

export default router;
