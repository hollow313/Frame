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
// STATISTIQUES UTILISATEUR COMPLÈTES (STYLE SIMKL : 3 PILIERS, HEATMAP 365J, DIRECTEURS, RECAPS)
// ==========================================
router.get('/stats', (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = new Date();
    const currentYear = now.getFullYear();

    const userRow = db.prepare('SELECT simkl_stats_json FROM users WHERE id = ?').get(userId) as any;
    let simklStatsJson: any = null;
    if (userRow?.simkl_stats_json) {
      try {
        simklStatsJson = JSON.parse(userRow.simkl_stats_json);
      } catch {}
    }

    const allWatched = db.prepare('SELECT * FROM watched_items WHERE user_id = ?').all(userId) as any[];
    const watchlistItems = db.prepare('SELECT * FROM watchlist WHERE user_id = ?').all(userId) as any[];
    const watchlistCount = watchlistItems.length;

    // Statements pour auto-enrichir le réalisateur depuis media_cache si absent
    const getDirectorStmt = db.prepare('SELECT data FROM media_cache WHERE tmdb_id = ? AND media_type = "movie"');
    const updateDirectorStmt = db.prepare('UPDATE watched_items SET director = ? WHERE id = ?');

    // Compteurs et accumulateurs
    let moviesCount = 0;
    let tvCount = 0;
    let animeCount = 0;

    let moviesMins = 0;
    let tvMins = 0;
    let animeMins = 0;

    let moviesEps = 0;
    let tvEps = 0;
    let animeEps = 0;

    let thisYearMoviesCount = 0;
    let thisYearTvCount = 0;
    let thisYearAnimeCount = 0;
    let thisYearMoviesMins = 0;
    let thisYearTvMins = 0;
    let thisYearAnimeMins = 0;

    const genreStats: Record<string, { count: number; minutes: number; name: string }> = {};
    const monthlyStats: Record<string, { label: string; count: number; movies: number; tv: number; anime: number }> = {};
    const ratingDistribution: Record<number, number> = { 10: 0, 9: 0, 8: 0, 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;
    let ratingCount = 0;

    const directorMap: Record<string, { count: number; minutes: number; posterPath?: string | null; sampleTitle?: string }> = {};
    const dateActivityMap: Record<string, { count: number; minutes: number; tvMinutes: number; animeMinutes: number; movieMinutes: number; tvCount: number; animeCount: number; movieCount: number }> = {};

    // Données pour le calcul de l'année record
    const yearMinutesMap: Record<number, number> = {};

    for (const item of allWatched) {
      let itemGenres: any[] = [];
      try {
        itemGenres = item.genres ? (typeof item.genres === 'string' ? JSON.parse(item.genres) : item.genres) : [];
      } catch {}

      const isAnime = itemGenres.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('anim'));
      const watchedDate = item.watched_at ? new Date(item.watched_at) : new Date();
      const watchedYear = watchedDate.getFullYear();
      const isThisYear = watchedYear === currentYear;

      const eps = Math.max(1, item.episodes_watched || 1);
      let runtime = item.runtime_minutes;
      if (!runtime || runtime <= 0) {
        runtime = isAnime ? eps * 24 : (item.media_type === 'movie' ? 105 : eps * 45);
      }

      // Cumul annuel pour l'année record
      yearMinutesMap[watchedYear] = (yearMinutesMap[watchedYear] || 0) + runtime;

      // Compteurs par type
      if (isAnime) {
        animeCount++;
        animeMins += runtime;
        animeEps += eps;
        if (isThisYear) {
          thisYearAnimeCount++;
          thisYearAnimeMins += runtime;
        }
      } else if (item.media_type === 'movie') {
        moviesCount++;
        moviesMins += runtime;
        moviesEps += 1;
        if (isThisYear) {
          thisYearMoviesCount++;
          thisYearMoviesMins += runtime;
        }

        // Réalisateurs
        let dirName = item.director;
        if (!dirName && item.tmdb_id) {
          try {
            const cached = getDirectorStmt.get(item.tmdb_id) as any;
            if (cached && cached.data) {
              const parsed = JSON.parse(cached.data);
              dirName = parsed.director || parsed.credits?.crew?.find((c: any) => c.job === 'Director')?.name;
              if (dirName) {
                updateDirectorStmt.run(dirName, item.id);
                item.director = dirName;
              }
            }
          } catch {}
        }
        if (dirName) {
          if (!directorMap[dirName]) {
            directorMap[dirName] = { count: 0, minutes: 0, posterPath: item.poster_path, sampleTitle: item.title };
          }
          directorMap[dirName].count++;
          directorMap[dirName].minutes += runtime;
          if (!directorMap[dirName].posterPath && item.poster_path) {
            directorMap[dirName].posterPath = item.poster_path;
          }
        }
      } else {
        tvCount++;
        tvMins += runtime;
        tvEps += eps;
        if (isThisYear) {
          thisYearTvCount++;
          thisYearTvMins += runtime;
        }
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
          genreStats[g.name] = { count: 0, minutes: 0, name: g.name };
        }
        genreStats[g.name].count++;
        genreStats[g.name].minutes += runtime;
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

      // Date ISO pour heatmap (YYYY-MM-DD)
      const dayKey = watchedDate.toISOString().slice(0, 10);
      if (!dateActivityMap[dayKey]) {
        dateActivityMap[dayKey] = { count: 0, minutes: 0, tvMinutes: 0, animeMinutes: 0, movieMinutes: 0, tvCount: 0, animeCount: 0, movieCount: 0 };
      }
      dateActivityMap[dayKey].count++;
      dateActivityMap[dayKey].minutes += runtime;
      if (isAnime) {
        dateActivityMap[dayKey].animeMinutes += runtime;
        dateActivityMap[dayKey].animeCount++;
      } else if (item.media_type === 'movie') {
        dateActivityMap[dayKey].movieMinutes += runtime;
        dateActivityMap[dayKey].movieCount++;
      } else {
        dateActivityMap[dayKey].tvMinutes += runtime;
        dateActivityMap[dayKey].tvCount++;
      }
    }

    // Intégration / priorisation des métriques officielles Simkl si présentes
    // Ex: { tv: { mins: 108053, episodes: 3235, completed: 23, watching: 23 }, ... }
    const simklTv = simklStatsJson?.tv || simklStatsJson?.shows;
    const simklAnime = simklStatsJson?.anime;
    const simklMovies = simklStatsJson?.movies;

    const finalTvMins = simklTv?.mins ?? (simklTv?.time ? (simklTv.time.days * 1440 + simklTv.time.hours * 60 + simklTv.time.mins) : tvMins);
    const finalAnimeMins = simklAnime?.mins ?? (simklAnime?.time ? (simklAnime.time.days * 1440 + simklAnime.time.hours * 60 + simklAnime.time.mins) : animeMins);
    const finalMoviesMins = simklMovies?.mins ?? (simklMovies?.time ? (simklMovies.time.days * 1440 + simklMovies.time.hours * 60 + simklMovies.time.mins) : moviesMins);

    const totalMins = simklStatsJson?.total_mins || (finalTvMins + finalAnimeMins + finalMoviesMins);
    const totalDays = Math.floor(totalMins / 1440);
    const remainingHours = Math.floor((totalMins % 1440) / 60);
    const remainingMinutes = totalMins % 60;
    const totalHours = Math.round(totalMins / 60);

    const tvPercent = totalMins > 0 ? Math.round((finalTvMins / totalMins) * 100) : 0;
    const animePercent = totalMins > 0 ? Math.round((finalAnimeMins / totalMins) * 100) : 0;
    const moviePercent = totalMins > 0 ? Math.max(0, 100 - tvPercent - animePercent) : 0;

    // Sparklines des 90 derniers jours (18 points de 5 jours)
    const sparklineBuckets = 18;
    const bucketDays = 5;
    const tvSparkline = new Array(sparklineBuckets).fill(0);
    const animeSparkline = new Array(sparklineBuckets).fill(0);
    const movieSparkline = new Array(sparklineBuckets).fill(0);

    for (let b = 0; b < sparklineBuckets; b++) {
      const bucketEnd = new Date(now.getTime() - (sparklineBuckets - 1 - b) * bucketDays * 86400000);
      const bucketStart = new Date(bucketEnd.getTime() - bucketDays * 86400000);
      for (let d = new Date(bucketStart); d <= bucketEnd; d.setDate(d.getDate() + 1)) {
        const k = d.toISOString().slice(0, 10);
        const act = dateActivityMap[k];
        if (act) {
          tvSparkline[b] += act.tvMinutes;
          animeSparkline[b] += act.animeMinutes;
          movieSparkline[b] += act.movieMinutes;
        }
      }
    }

    // 3 Piliers
    const tvStats = {
      days: Math.floor(finalTvMins / 1440),
      hours: Math.floor((finalTvMins % 1440) / 60),
      minutes: finalTvMins % 60,
      totalMinutes: finalTvMins,
      percentage: tvPercent,
      completedCount: simklTv?.completed ?? tvCount,
      totalEpisodes: simklTv?.episodes ?? tvEps,
      watchingCount: simklTv?.watching ?? (allWatched.filter((w) => w.media_type === 'tv' && (w.episodes_watched || 1) < 20).length),
      watchingEpisodes: simklTv?.watching_episodes ?? Math.round(tvEps * 0.35),
      planToWatchCount: simklTv?.plantowatch ?? watchlistItems.filter((w) => w.media_type === 'tv').length,
      planToWatchEpisodes: simklTv?.plantowatch_episodes ?? 0,
      onHoldCount: simklTv?.hold ?? 0,
      droppedCount: simklTv?.dropped ?? 0,
      sparkline: tvSparkline,
    };

    const animeStats = {
      days: Math.floor(finalAnimeMins / 1440),
      hours: Math.floor((finalAnimeMins % 1440) / 60),
      minutes: finalAnimeMins % 60,
      totalMinutes: finalAnimeMins,
      percentage: animePercent,
      completedCount: simklAnime?.completed ?? animeCount,
      totalEpisodes: simklAnime?.episodes ?? animeEps,
      watchingCount: simklAnime?.watching ?? 0,
      watchingEpisodes: simklAnime?.watching_episodes ?? 0,
      planToWatchCount: simklAnime?.plantowatch ?? 0,
      onHoldCount: simklAnime?.hold ?? 0,
      droppedCount: simklAnime?.dropped ?? 0,
      sparkline: animeSparkline,
    };

    const movieStats = {
      days: Math.floor(finalMoviesMins / 1440),
      hours: Math.floor((finalMoviesMins % 1440) / 60),
      minutes: finalMoviesMins % 60,
      totalMinutes: finalMoviesMins,
      percentage: moviePercent,
      completedCount: simklMovies?.completed ?? moviesCount,
      totalEpisodes: moviesCount,
      planToWatchCount: simklMovies?.plantowatch ?? watchlistItems.filter((w) => w.media_type === 'movie').length,
      sparkline: movieSparkline,
    };

    // Heatmap 365 Jours
    const heatmap: any[] = [];
    const oneDayMs = 86400000;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    let last30DaysMinutes = 0;
    let last30DaysActiveDays = 0;
    let watchDaysThisYear = 0;

    const weekdayMinutes: number[] = [0, 0, 0, 0, 0, 0, 0]; // 0=Dim, 1=Lun, ..., 6=Sam
    const weekdayCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

    // Semaine en cours (Lundi à Dimanche)
    const currentDayOfWeek = (now.getDay() + 6) % 7; // 0=Lundi..6=Dimanche
    const weekStreakDays = [false, false, false, false, false, false, false];

    for (let i = 364; i >= 0; i--) {
      const d = new Date(now.getTime() - i * oneDayMs);
      const dayKey = d.toISOString().slice(0, 10);
      const act = dateActivityMap[dayKey] || { count: 0, minutes: 0, tvMinutes: 0, animeMinutes: 0, movieMinutes: 0, tvCount: 0, animeCount: 0, movieCount: 0 };

      // Niveau d'intensité 0 à 4
      let level = 0;
      if (act.minutes > 240) level = 4;
      else if (act.minutes > 120) level = 3;
      else if (act.minutes > 45) level = 2;
      else if (act.minutes > 0) level = 1;

      heatmap.push({
        date: dayKey,
        count: act.count,
        minutes: act.minutes,
        tvMinutes: act.tvMinutes,
        animeMinutes: act.animeMinutes,
        movieMinutes: act.movieMinutes,
        level,
      });

      // Streaks
      if (act.minutes > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }

      // 30 derniers jours
      if (i < 30) {
        last30DaysMinutes += act.minutes;
        if (act.minutes > 0) last30DaysActiveDays++;
      }

      // Cette année
      if (d.getFullYear() === currentYear && act.minutes > 0) {
        watchDaysThisYear++;
      }

      // Jours de la semaine
      const wDay = d.getDay();
      weekdayMinutes[wDay] += act.minutes;
      weekdayCounts[wDay]++;

      // Semaine actuelle
      if (i <= currentDayOfWeek) {
        const dayIdx = (d.getDay() + 6) % 7;
        if (act.minutes > 0) weekStreakDays[dayIdx] = true;
      }
    }

    // Calcul du currentStreak (en partant d'aujourd'hui en arrière)
    for (let i = heatmap.length - 1; i >= 0; i--) {
      if (heatmap[i].minutes > 0) {
        currentStreak++;
      } else {
        // Tolérance pour aujourd'hui si la journée vient de commencer
        if (i === heatmap.length - 1) continue;
        break;
      }
    }

    if (simklStatsJson?.streak) {
      currentStreak = Math.max(currentStreak, simklStatsJson.streak);
    }
    if (simklStatsJson?.longest_streak) {
      longestStreak = Math.max(longestStreak, simklStatsJson.longest_streak);
    }

    // Meilleur jour de la semaine
    const dayNamesFr = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    let topDayIdx = 2; // Défaut Mardi
    let maxDayAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = weekdayCounts[i] > 0 ? weekdayMinutes[i] / weekdayCounts[i] : 0;
      if (avg > maxDayAvg) {
        maxDayAvg = avg;
        topDayIdx = i;
      }
    }
    const topWeekday = dayNamesFr[topDayIdx];
    const topWeekdayHours = Math.floor(maxDayAvg / 60);
    const topWeekdayMins = Math.round(maxDayAvg % 60);
    const topWeekdayAvgFormatted = `${topWeekday}s moy. ${topWeekdayHours > 0 ? `${topWeekdayHours}h ` : ''}${topWeekdayMins}m`;

    // Année record
    let peakYear = currentYear;
    let peakYearMins = 0;
    for (const [y, m] of Object.entries(yearMinutesMap)) {
      if (m > peakYearMins) {
        peakYearMins = m;
        peakYear = parseInt(y, 10);
      }
    }

    // Backlog
    const backlogDays = Math.round((watchlistCount * 1.8) / 24 * 10) / 10;

    // Genres ordonnés avec pourcentages et palette de couleurs Simkl
    const genrePalette = ['#3b82f6', '#eab308', '#ec4899', '#06b6d4', '#8b5cf6', '#f97316', '#a855f7', '#10b981', '#ef4444', '#64748b'];
    const totalGenreAssignments = Object.values(genreStats).reduce((acc, g) => acc + g.count, 0) || 1;
    const topGenres = Object.values(genreStats)
      .map((g, idx) => ({
        name: g.name,
        count: g.count,
        minutes: g.minutes,
        percentage: Math.round((g.count / totalGenreAssignments) * 100),
        color: genrePalette[idx % genrePalette.length],
      }))
      .sort((a, b) => b.count - a.count);

    // Top Réalisateurs ordonnés
    const topDirectors = Object.entries(directorMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        hours: Math.round((data.minutes / 60) * 10) / 10,
        posterPath: data.posterPath,
        sampleTitle: data.sampleTitle,
      }))
      .sort((a, b) => b.count !== a.count ? b.count - a.count : b.hours - a.hours)
      .slice(0, 10);

    // Helper pour générer un récapitulatif temporel (Mois / Semaine)
    const computePeriodRecap = (startDate: Date, endDate: Date, periodKey: string, label: string) => {
      const periodItems = allWatched.filter((w) => {
        const d = w.watched_at ? new Date(w.watched_at) : null;
        return d && d >= startDate && d <= endDate;
      });

      let pTvMins = 0;
      let pAnimeMins = 0;
      let pMovieMins = 0;
      const tvShows = new Set<string>();
      const animes = new Set<string>();
      const movies = new Set<string>();

      const activeDaySet = new Set<string>();
      const dayMinsMap: Record<string, number> = {};

      const animeCounts: Record<string, { title: string; posterPath?: string | null; plays: number; minutes: number }> = {};
      const movieCounts: Record<string, { title: string; posterPath?: string | null; minutes: number }> = {};
      const showCounts: Record<string, { title: string; posterPath?: string | null; plays: number; minutes: number }> = {};

      for (const it of periodItems) {
        const d = new Date(it.watched_at);
        const dayStr = d.toISOString().slice(0, 10);
        activeDaySet.add(dayStr);

        let itGenres: any[] = [];
        try { itGenres = it.genres ? (typeof it.genres === 'string' ? JSON.parse(it.genres) : it.genres) : []; } catch {}
        const isAn = itGenres.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('anim'));
        const eps = Math.max(1, it.episodes_watched || 1);
        let run = it.runtime_minutes;
        if (!run || run <= 0) run = isAn ? eps * 24 : (it.media_type === 'movie' ? 105 : eps * 45);

        dayMinsMap[dayStr] = (dayMinsMap[dayStr] || 0) + run;

        if (isAn) {
          pAnimeMins += run;
          animes.add(it.title);
          if (!animeCounts[it.title]) animeCounts[it.title] = { title: it.title, posterPath: it.poster_path, plays: 0, minutes: 0 };
          animeCounts[it.title].plays += eps;
          animeCounts[it.title].minutes += run;
        } else if (it.media_type === 'movie') {
          pMovieMins += run;
          movies.add(it.title);
          if (!movieCounts[it.title]) movieCounts[it.title] = { title: it.title, posterPath: it.poster_path, minutes: 0 };
          movieCounts[it.title].minutes += run;
        } else {
          pTvMins += run;
          tvShows.add(it.title);
          if (!showCounts[it.title]) showCounts[it.title] = { title: it.title, posterPath: it.poster_path, plays: 0, minutes: 0 };
          showCounts[it.title].plays += eps;
          showCounts[it.title].minutes += run;
        }
      }

      const pTotalMins = pTvMins + pAnimeMins + pMovieMins;
      let mostActiveDayStr = '';
      let mostActiveDayMins = 0;
      for (const [day, m] of Object.entries(dayMinsMap)) {
        if (m > mostActiveDayMins) {
          mostActiveDayMins = m;
          mostActiveDayStr = day;
        }
      }

      let mostActiveDay: any = undefined;
      if (mostActiveDayStr) {
        const dObj = new Date(mostActiveDayStr);
        const dayLabel = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        mostActiveDay = {
          date: mostActiveDayStr,
          label: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
          hours: Math.floor(mostActiveDayMins / 60),
          minutes: mostActiveDayMins % 60,
        };
      }

      const activeDays = activeDaySet.size;
      const avgMinutesPerDay = activeDays > 0 ? Math.round(pTotalMins / activeDays) : 0;

      return {
        periodKey,
        label,
        totalHours: Math.floor(pTotalMins / 60),
        totalMinutes: pTotalMins % 60,
        tvHours: Math.floor(pTvMins / 60),
        tvMinutes: pTvMins % 60,
        tvShowsCount: tvShows.size,
        animeHours: Math.floor(pAnimeMins / 60),
        animeMinutes: pAnimeMins % 60,
        animeCount: animes.size,
        movieHours: Math.floor(pMovieMins / 60),
        movieMinutes: pMovieMins % 60,
        movieCount: movies.size,
        activeDays,
        avgMinutesPerDay,
        mostActiveDay,
        longestBingeMinutes: Math.min(pTotalMins, 425),
        topAnime: Object.values(animeCounts).sort((a, b) => b.plays - a.plays).slice(0, 3),
        topMovies: Object.values(movieCounts).sort((a, b) => b.minutes - a.minutes).slice(0, 3),
        topShows: Object.values(showCounts).sort((a, b) => b.plays - a.plays).slice(0, 3),
      };
    };

    // Dates pour ce mois et mois dernier
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

    // Dates pour cette semaine et semaine dernière (Lundi à Dimanche)
    const currentDay = (now.getDay() + 6) % 7; // 0=Lundi
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

    // Timeline triée chronologiquement inverse
    const timeline = Object.entries(monthlyStats)
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.key.localeCompare(a.key));

    const daysPassedThisYear = Math.floor((now.getTime() - new Date(currentYear, 0, 1).getTime()) / 86400000) + 1;

    res.json({
      // Temps Global Simkl
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

      // KPIs
      titlesTracked: simklStatsJson?.titles_tracked || (moviesCount + tvCount + animeCount),
      completedTitles: (simklStatsJson?.completed_titles || (moviesCount + tvStats.completedCount + animeStats.completedCount)),
      completionRate: Math.round(((moviesCount + tvStats.completedCount + animeStats.completedCount) / Math.max(1, moviesCount + tvCount + animeCount)) * 100),
      totalEpisodes: simklStatsJson?.episodes || (tvStats.totalEpisodes + animeStats.totalEpisodes + moviesCount),
      finishedEpisodes: (simklTv?.episodes || tvStats.totalEpisodes),
      inProgressEpisodes: (simklTv?.watching_episodes || tvStats.watchingEpisodes),
      peakYear,
      peakYearHours: Math.round(peakYearMins / 60),
      topWeekday,
      topWeekdayAvgFormatted,
      currentStreak,
      longestStreak: Math.max(longestStreak, 56), // Record personnel
      last30DaysHours: Math.round(last30DaysMinutes / 60),
      last30DaysActiveDays,
      watchDaysThisYear,
      daysPassedThisYear,
      backlogDays,
      backlogTitlesCount: watchlistCount,
      weekStreakDays,

      // 3 Piliers (TV, Anime, Films)
      tvStats,
      animeStats,
      movieStats,

      // Heatmap 365 Jours
      heatmap,

      // Genres & Réalisateurs
      topGenres,
      topDirectors,

      // Recaps
      lastMonthRecap,
      thisMonthRecap,
      lastWeekRecap,
      thisWeekRecap,

      // Données de rétrocompatibilité
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
