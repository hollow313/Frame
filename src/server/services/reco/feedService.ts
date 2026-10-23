import db from '../../db/index.js';
import { TMDBService, TMDBMediaItem } from '../tmdbService.js';
import {
  MediaFeatures,
  WatchedEvent,
  Candidate,
  ScoredCandidate,
  TasteProfile,
  computeTaste,
  scoreCandidate,
  selectMMR,
  explain,
  eventWeight,
  LinUCB,
  DEFAULT_RECO_WEIGHTS,
} from './engine.js';
import { registerMediaMutationHook } from '../../routes/media.js';
import { logger } from '../../utils/logger.js';

export interface EnrichedRecoMediaItem extends TMDBMediaItem {
  score?: number;
  reasons?: string[];
  recommendationReason?: string;
  categoryTag?: 'Film' | 'Série' | 'Animé / Manga';
}

export interface RecommendationSection {
  key?: string;
  title: string;
  subtitle?: string;
  reason?: string;
  items: EnrichedRecoMediaItem[];
}

export interface RecommendationResponse {
  generatedAt: string;
  profileStrength: 'cold' | 'warming' | 'mature';
  hasEnoughData: boolean;
  heroItems: EnrichedRecoMediaItem[];
  topGenres: { id: number; name: string; count: number }[];
  sections: RecommendationSection[];
}

// Cache mémoire de 10 minutes par utilisateur
const FEED_CACHE_TTL_MS = 10 * 60 * 1000;
const feedCache = new Map<number, { data: RecommendationResponse; expiresAt: number }>();

export function invalidateUserRecoCache(userId: number): void {
  feedCache.delete(userId);
}

// Connecter l'invalidation automatique lors des ajouts/suppressions dans watched_items et watchlist
registerMediaMutationHook(invalidateUserRecoCache);

function rowToMediaFeatures(row: any): MediaFeatures {
  let genres: { id: number; name: string }[] = [];
  let keywords: { id: number; name: string }[] = [];
  let directors: { id: number; name: string }[] = [];
  let cast: { id: number; name: string }[] = [];
  let countries: string[] = [];

  try {
    if (row.genres_json) genres = JSON.parse(row.genres_json);
  } catch {}
  try {
    if (row.keywords_json) keywords = JSON.parse(row.keywords_json);
  } catch {}
  try {
    if (row.directors_json) directors = JSON.parse(row.directors_json);
  } catch {}
  try {
    if (row.cast_json) cast = JSON.parse(row.cast_json);
  } catch {}
  try {
    if (row.countries_json) countries = JSON.parse(row.countries_json);
  } catch {}

  const mediaType = (row.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
  return {
    key: `${mediaType}:${row.tmdb_id}`,
    mediaType,
    tmdbId: Number(row.tmdb_id),
    title: row.title || 'Sans titre',
    originalLang: row.original_lang || undefined,
    releaseYear: row.release_year ? Number(row.release_year) : undefined,
    runtime: row.runtime ? Number(row.runtime) : undefined,
    voteAverage: Number(row.vote_average) || 0,
    voteCount: Number(row.vote_count) || 0,
    popularity: Number(row.popularity) || 0,
    genres,
    keywords,
    directors,
    cast,
    countries,
    collectionId: row.collection_id ? Number(row.collection_id) : null,
    isAnime: Boolean(row.is_anime),
    posterPath: row.poster_path || null,
    backdropPath: row.backdrop_path || null,
    overview: row.overview || '',
  };
}

export function tmdbItemToFeatures(item: TMDBMediaItem): MediaFeatures {
  // Vérifier si on a déjà des features plus riches en base
  const existingRow = db
    .prepare('SELECT * FROM media_features WHERE media_type = ? AND tmdb_id = ?')
    .get(item.media_type, item.id) as any;

  const baseGenres =
    item.genres && item.genres.length > 0
      ? item.genres
      : (item.genre_ids || []).map((id) => ({ id, name: TMDBService.getGenreName(id) }));

  if (existingRow) {
    const mf = rowToMediaFeatures(existingRow);
    return {
      ...mf,
      title: item.title || mf.title,
      posterPath: item.poster_path || mf.posterPath,
      backdropPath: item.backdrop_path || mf.backdropPath,
      overview: item.overview || mf.overview,
      voteAverage: item.vote_average || mf.voteAverage,
      voteCount: item.vote_count || mf.voteCount,
      popularity: item.popularity || mf.popularity,
      genres: mf.genres.length > 0 ? mf.genres : baseGenres,
    };
  }

  const releaseYear = item.release_date ? parseInt(item.release_date.slice(0, 4), 10) || undefined : undefined;
  const isAnime = baseGenres.some((g) => g.id === 16);

  return {
    key: `${item.media_type}:${item.id}`,
    mediaType: item.media_type,
    tmdbId: item.id,
    title: item.title,
    originalLang: item.original_language,
    releaseYear,
    runtime: item.runtime || undefined,
    voteAverage: item.vote_average || 0,
    voteCount: item.vote_count || 0,
    popularity: item.popularity || 0,
    genres: baseGenres,
    keywords: item.keywords || [],
    directors: item.directors || [],
    cast: (item.cast || []).slice(0, 5).map((c) => ({ id: c.id, name: c.name })),
    countries: item.production_countries || [],
    collectionId: item.collection_id || null,
    isAnime,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    overview: item.overview || '',
  };
}

function scoredToMediaItem(sc: ScoredCandidate, reasons: string[]): EnrichedRecoMediaItem {
  const f = sc.features;
  return {
    id: f.tmdbId,
    media_type: f.mediaType,
    title: f.title,
    overview: f.overview || '',
    poster_path: f.posterPath || null,
    backdrop_path: f.backdropPath || null,
    release_date: f.releaseYear ? `${f.releaseYear}-01-01` : '',
    vote_average: f.voteAverage,
    vote_count: f.voteCount,
    popularity: f.popularity,
    genre_ids: f.genres.map((g) => g.id),
    genres: f.genres,
    score: Math.round(sc.score * 100) / 100,
    reasons,
    recommendationReason: reasons[0] || 'Recommandé pour votre profil',
    categoryTag: f.isAnime ? 'Animé / Manga' : f.mediaType === 'movie' ? 'Film' : 'Série',
  };
}

function loadUserBandit(userId: number): LinUCB {
  try {
    const row = db
      .prepare('SELECT a_json, b_json FROM user_reco_weights WHERE user_id = ?')
      .get(userId) as { a_json: string; b_json: string } | undefined;
    if (row) {
      return new LinUCB(0.35, {
        A: JSON.parse(row.a_json),
        b: JSON.parse(row.b_json),
      });
    }
  } catch {}
  return new LinUCB(0.35);
}

function saveUserBandit(userId: number, bandit: LinUCB): void {
  try {
    const state = bandit.toJSON();
    db.prepare(`
      INSERT INTO user_reco_weights (user_id, a_json, b_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        a_json = excluded.a_json,
        b_json = excluded.b_json,
        updated_at = excluded.updated_at
    `).run(userId, JSON.stringify(state.A), JSON.stringify(state.b), new Date().toISOString());
  } catch {}
}

export class RecoFeedService {
  /**
   * Construit l'historique d'événements et la carte de features d'un utilisateur
   */
  public static async buildUserTasteAndHistory(userId: number): Promise<{
    taste: TasteProfile;
    events: WatchedEvent[];
    featuresById: Map<string, MediaFeatures>;
    excludedKeys: Set<string>;
    allowMovies: boolean;
    allowTv: boolean;
    allowAnime: boolean;
    hasWatchedAnime: boolean;
    topGenres: { id: number; name: string; count: number }[];
  }> {
    const userPrefs = db
      .prepare('SELECT pref_include_movies, pref_include_tv, pref_include_anime FROM users WHERE id = ?')
      .get(userId) as any;
    const allowMovies = userPrefs ? userPrefs.pref_include_movies !== 0 : true;
    const allowTv = userPrefs ? userPrefs.pref_include_tv !== 0 : true;
    const userExplicitlyWantsAnime = userPrefs ? userPrefs.pref_include_anime === 1 : false;

    const watchedRows = db
      .prepare(`
        SELECT tmdb_id, media_type, title, rating, genres, watched_at, poster_path, backdrop_path, overview, release_date
        FROM watched_items
        WHERE user_id = ? AND season_number = 0 AND episode_number = 0
        ORDER BY watched_at DESC
        LIMIT 150
      `)
      .all(userId) as any[];

    const watchlistRows = db
      .prepare('SELECT tmdb_id, media_type, title, genres, added_at FROM watchlist WHERE user_id = ?')
      .all(userId) as any[];

    const exclusionRows = db
      .prepare('SELECT tmdb_id, media_type, created_at FROM reco_exclusions WHERE user_id = ?')
      .all(userId) as Array<{ tmdb_id: number; media_type: string; created_at: string }>;

    const excludedKeys = new Set<string>();
    for (const w of watchedRows) {
      const mType = w.media_type === 'manga' ? 'tv' : w.media_type;
      excludedKeys.add(`${mType}:${w.tmdb_id}`);
      excludedKeys.add(`${w.media_type}:${w.tmdb_id}`);
    }
    for (const wl of watchlistRows) {
      const mType = wl.media_type === 'manga' ? 'tv' : wl.media_type;
      excludedKeys.add(`${mType}:${wl.tmdb_id}`);
    }
    for (const ex of exclusionRows) {
      excludedKeys.add(`${ex.media_type}:${ex.tmdb_id}`);
    }

    // Enrichir jusqu'à 6 éléments de l'historique qui ne sont pas encore dans media_features
    const missingInFeatures = watchedRows
      .filter((w) => {
        if (w.media_type === 'manga') return false;
        const exists = db
          .prepare('SELECT 1 FROM media_features WHERE media_type = ? AND tmdb_id = ?')
          .get(w.media_type, w.tmdb_id);
        return !exists;
      })
      .slice(0, 6);

    if (missingInFeatures.length > 0) {
      await Promise.all(
        missingInFeatures.map(async (w) => {
          try {
            await TMDBService.getDetails(w.media_type, w.tmdb_id);
          } catch {}
        })
      );
    }

    const featuresById = new Map<string, MediaFeatures>();
    const events: WatchedEvent[] = [];
    let hasWatchedAnime = false;
    const genreCounts = new Map<number, { name: string; count: number; score: number }>();

    for (const w of watchedRows) {
      const mType = (w.media_type === 'tv' || w.media_type === 'manga' ? 'tv' : 'movie') as 'movie' | 'tv';
      const key = `${mType}:${w.tmdb_id}`;

      const mfRow = db
        .prepare('SELECT * FROM media_features WHERE media_type = ? AND tmdb_id = ?')
        .get(mType, w.tmdb_id) as any;

      let feat: MediaFeatures;
      if (mfRow) {
        feat = rowToMediaFeatures(mfRow);
      } else {
        let parsedGenres: { id: number; name: string }[] = [];
        try {
          if (w.genres) parsedGenres = JSON.parse(w.genres);
        } catch {}
        const releaseYear = w.release_date ? parseInt(String(w.release_date).slice(0, 4), 10) || undefined : undefined;
        feat = {
          key,
          mediaType: mType,
          tmdbId: w.tmdb_id,
          title: w.title,
          releaseYear,
          voteAverage: w.rating || 7,
          voteCount: 100,
          popularity: 50,
          genres: parsedGenres,
          keywords: [],
          directors: [],
          cast: [],
          countries: [],
          isAnime: w.media_type === 'manga' || parsedGenres.some((g) => g.id === 16),
          posterPath: w.poster_path,
          backdropPath: w.backdrop_path,
          overview: w.overview || '',
        };
      }

      if (feat.isAnime || feat.genres.some((g) => g.id === 16)) {
        hasWatchedAnime = true;
      }

      for (const g of feat.genres) {
        const cur = genreCounts.get(g.id) || { name: g.name, count: 0, score: 0 };
        cur.count += 1;
        cur.score += w.rating ? Math.max(0.5, w.rating - 4) : 2;
        genreCounts.set(g.id, cur);
      }

      featuresById.set(key, feat);
      events.push({
        key,
        mediaType: mType,
        tmdbId: w.tmdb_id,
        title: w.title,
        rating: w.rating,
        watchedAt: w.watched_at || new Date().toISOString(),
        signal: 'watched',
      });
    }

    // Ajouter les exclusions ("Pas intéressé") comme signaux négatifs forts (-2.0)
    for (const ex of exclusionRows) {
      const mType = (ex.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
      const key = `${mType}:${ex.tmdb_id}`;
      const mfRow = db
        .prepare('SELECT * FROM media_features WHERE media_type = ? AND tmdb_id = ?')
        .get(mType, ex.tmdb_id) as any;
      if (mfRow) {
        featuresById.set(key, rowToMediaFeatures(mfRow));
        events.push({
          key,
          mediaType: mType,
          tmdbId: ex.tmdb_id,
          title: mfRow.title || 'Exclu',
          rating: 1,
          watchedAt: ex.created_at || new Date().toISOString(),
          signal: 'not_interested',
        });
      }
    }

    const taste = computeTaste(events, featuresById);

    // Sauvegarder le profil pré-calculé dans user_taste
    try {
      db.prepare(`
        INSERT INTO user_taste (user_id, vec_long_json, vec_short_json, stats_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          vec_long_json = excluded.vec_long_json,
          vec_short_json = excluded.vec_short_json,
          stats_json = excluded.stats_json,
          updated_at = excluded.updated_at
      `).run(
        userId,
        JSON.stringify(taste.long),
        JSON.stringify(taste.short),
        JSON.stringify({ meanRating: taste.meanRating, totalWatched: watchedRows.length }),
        new Date().toISOString()
      );
    } catch {}

    const topGenres = Array.from(genreCounts.entries())
      .map(([id, data]) => ({ id, name: data.name, count: data.count, score: data.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const allowAnime = userExplicitlyWantsAnime || hasWatchedAnime;

    return {
      taste,
      events,
      featuresById,
      excludedKeys,
      allowMovies,
      allowTv,
      allowAnime,
      hasWatchedAnime,
      topGenres,
    };
  }

  /**
   * Génère le flux complet de recommandations personnalisées (avec cache 10 min)
   */
  public static async getPersonalizedFeed(userId: number, forceRefresh = false): Promise<RecommendationResponse> {
    if (!forceRefresh) {
      const cached = feedCache.get(userId);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
      }
    }

    const {
      taste,
      events,
      excludedKeys,
      allowMovies,
      allowTv,
      allowAnime,
      hasWatchedAnime,
      topGenres,
    } = await this.buildUserTasteAndHistory(userId);

    const watchedEvents = events.filter((e) => e.signal === 'watched');
    const profileStrength: 'cold' | 'warming' | 'mature' =
      watchedEvents.length < 2 ? 'cold' : watchedEvents.length < 10 ? 'warming' : 'mature';

    const isAllowedCandidate = (item: TMDBMediaItem): boolean => {
      if (item.media_type === 'movie' && !allowMovies) return false;
      if (item.media_type === 'tv' && !allowTv) return false;
      const isAnime =
        item.genre_ids?.includes(16) ||
        item.genres?.some((g) => g.id === 16);
      if (isAnime && !allowAnime) return false;
      return !excludedKeys.has(`${item.media_type}:${item.id}`);
    };

    // ---------------- CAS COLD START (N < 2) ----------------
    if (profileStrength === 'cold') {
      const trending = await TMDBService.getTrending('week');
      const popularMovies = allowMovies ? await TMDBService.getPopularMovies() : { results: [] };
      const popularTV = allowTv ? await TMDBService.getPopularTV() : { results: [] };
      const anime = allowAnime ? await TMDBService.discoverAnime() : { results: [] };

      const heroItems: EnrichedRecoMediaItem[] = [];
      for (const t of trending.results) {
        if (isAllowedCandidate(t) && !heroItems.some((h) => h.id === t.id)) {
          heroItems.push({
            ...t,
            reasons: ['Tendance incontournable cette semaine'],
            recommendationReason: 'Tendance incontournable cette semaine',
            categoryTag: t.media_type === 'movie' ? 'Film' : 'Série',
          });
          if (heroItems.length >= 5) break;
        }
      }

      const defaultSections: RecommendationSection[] = [
        {
          key: 'trending',
          title: 'Tendances du moment',
          subtitle: 'Marquez vos premiers films et séries comme « Vu » pour activer le moteur hybride sur-mesure.',
          reason: 'Populaire cette semaine',
          items: trending.results.filter(isAllowedCandidate).slice(0, 14),
        },
      ];

      if (allowMovies && popularMovies.results.length > 0) {
        defaultSections.push({
          key: 'popular_movies',
          title: 'Films incontournables',
          reason: 'Films les plus populaires',
          items: popularMovies.results.filter(isAllowedCandidate).slice(0, 14),
        });
      }

      if (allowTv && popularTV.results.length > 0) {
        defaultSections.push({
          key: 'popular_tv',
          title: 'Séries à ne pas manquer',
          reason: 'Séries acclamées',
          items: popularTV.results.filter(isAllowedCandidate).slice(0, 14),
        });
      }

      if (allowAnime && anime.results.length > 0) {
        defaultSections.push({
          key: 'popular_anime',
          title: 'Animés & Mangas populaires',
          reason: 'Animation japonaise',
          items: anime.results.filter(isAllowedCandidate).slice(0, 14),
        });
      }

      const coldRes: RecommendationResponse = {
        generatedAt: new Date().toISOString(),
        profileStrength: 'cold',
        hasEnoughData: false,
        heroItems,
        topGenres: [],
        sections: defaultSections,
      };
      feedCache.set(userId, { data: coldRes, expiresAt: Date.now() + FEED_CACHE_TTL_MS });
      return coldRes;
    }

    // ---------------- GÉNÉRATION DES CANDIDATS (5 SOURCES C1..C5) ----------------
    const candidateMap = new Map<string, Candidate>();

    const registerCandidate = (
      item: TMDBMediaItem,
      collabWeight = 0,
      seedInfo?: { title: string; rating: number | null; rank: number }
    ) => {
      if (!isAllowedCandidate(item)) return;
      const key = `${item.media_type}:${item.id}`;
      let existing = candidateMap.get(key);
      if (!existing) {
        existing = {
          features: tmdbItemToFeatures(item),
          collabVoteSum: 0,
          collabSeeds: [],
        };
        candidateMap.set(key, existing);
      }
      if (collabWeight > 0) {
        existing.collabVoteSum += collabWeight;
      }
      if (seedInfo && !existing.collabSeeds.some((s) => s.title === seedInfo.title)) {
        existing.collabSeeds.push(seedInfo);
      }
    };

    // Sélection des seeds pour C1 : 4 mieux notés + 2 plus récents
    const positiveWatched = watchedEvents.filter((e) => (e.rating == null || e.rating >= 6.5));
    const topRatedSeeds = [...positiveWatched]
      .sort((a, b) => (b.rating || 7.2) - (a.rating || 7.2))
      .slice(0, 4);
    const recentSeeds = [...positiveWatched]
      .sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || ''))
      .filter((r) => !topRatedSeeds.some((t) => t.key === r.key))
      .slice(0, 2);
    const allSeeds = [...topRatedSeeds, ...recentSeeds];

    const seedRecsBySeedKey = new Map<string, { seed: WatchedEvent; items: TMDBMediaItem[] }>();

    // Exécuter les collectes de candidats en parallèle
    await Promise.all([
      // Source C1 : Graphe collaboratif multi-seeds TMDB
      ...allSeeds.map(async (seed) => {
        if ((seed.mediaType === 'movie' && !allowMovies) || (seed.mediaType === 'tv' && !allowTv)) {
          return;
        }
        try {
          const recs = await TMDBService.getRecommendations(seed.mediaType, seed.tmdbId);
          seedRecsBySeedKey.set(seed.key, { seed, items: recs });
          const seedW = Math.max(0.4, eventWeight(seed));
          recs.forEach((item, idx) => {
            const rankWeight = seedW / Math.log2(idx + 2);
            registerCandidate(item, rankWeight, {
              title: seed.title,
              rating: seed.rating,
              rank: idx + 1,
            });
          });
        } catch {}
      }),

      // Source C2 & C4 : Découverte multi-critères sur les genres dominants
      ...topGenres.slice(0, 3).map(async (g) => {
        if (g.id === 16 && !allowAnime) return;
        try {
          if (allowMovies) {
            const discM = await TMDBService.discoverByGenre('movie', g.id, 1);
            discM.results.forEach((it) => registerCandidate(it));
          }
          if (allowTv) {
            const discT = await TMDBService.discoverByGenre('tv', g.id, 1);
            discT.results.forEach((it) => registerCandidate(it));
          }
        } catch {}
      }),

      // Source Animé dédiée si autorisé
      (async () => {
        if (!allowAnime) return;
        try {
          const animeDisc = await TMDBService.discoverAnime(1, 'tv');
          animeDisc.results.forEach((it) => registerCandidate(it));
        } catch {}
      })(),

      // Source C5 : Exploration contrôlée via tendances
      (async () => {
        try {
          const trending = await TMDBService.getTrending('week', 1);
          trending.results.forEach((it) => registerCandidate(it));
        } catch {}
      })(),
    ]);

    // ---------------- SCORING HYBRIDE & BANDIT CONTEXTUEL ----------------
    const bandit = loadUserBandit(userId);
    const weights = bandit.getWeights() || DEFAULT_RECO_WEIGHTS;

    const scoredPool: ScoredCandidate[] = [];
    for (const cand of candidateMap.values()) {
      scoredPool.push(scoreCandidate(cand, taste, weights));
    }
    scoredPool.sort((a, b) => b.score - a.score);

    // Ensemble global pour éviter qu'un même titre apparaisse dans plusieurs rails (anti-répétition inter-rails)
    const globalSeen = new Set<string>();

    // 1. Sélection Hero Carousel (6 items diversifiés via MMR lambda=0.68)
    const heroScored = selectMMR(
      scoredPool,
      6,
      0.68,
      { perGenre: 2, perDirector: 1, perDecade: 4 },
      new Set<string>() // On garde une copie légère pour le Hero
    );
    const heroItems: EnrichedRecoMediaItem[] = heroScored.map((sc) => {
      const reasons = explain(sc, taste, watchedEvents);
      return scoredToMediaItem(sc, reasons);
    });

    // Garantir au moins 5 propositions dans le Hero Carousel
    if (heroItems.length < 5) {
      for (const sc of scoredPool) {
        if (!heroItems.some((h) => h.id === sc.features.tmdbId && h.media_type === sc.features.mediaType)) {
          const reasons = explain(sc, taste, watchedEvents);
          heroItems.push(scoredToMediaItem(sc, reasons));
          if (heroItems.length >= 5) break;
        }
      }
    }

    const sections: RecommendationSection[] = [];

    // Rail 1 : « Choisis pour vous ce soir » (Top MMR hybride global)
    const topForYou = selectMMR(
      scoredPool,
      14,
      0.72,
      { perGenre: 4, perDirector: 2, perDecade: 5 },
      globalSeen
    );
    if (topForYou.length >= 3) {
      sections.push({
        key: 'for_you',
        title: 'Choisis pour vous ce soir',
        subtitle: 'Sélection hybride calculée selon vos affinités long-terme et votre humeur récente',
        reason: 'Affinité maximale',
        items: topForYou.map((sc) => scoredToMediaItem(sc, explain(sc, taste, watchedEvents))),
      });
    }

    // Rail 2 & 3 : « Parce que vous avez aimé « X » » (basé sur les meilleurs seeds collaboratifs)
    for (const seed of topRatedSeeds.slice(0, 2)) {
      const seedPool = scoredPool.filter((sc) =>
        sc.collabSeeds.some((s) => s.title === seed.title)
      );
      const picked = selectMMR(
        seedPool,
        12,
        0.75,
        { perGenre: 5, perDirector: 2, perDecade: 6 },
        globalSeen
      );
      if (picked.length >= 3) {
        sections.push({
          key: `because_${seed.mediaType}_${seed.tmdbId}`,
          title: `Parce que vous avez aimé « ${seed.title} »`,
          subtitle: seed.rating ? `Noté ${seed.rating}/10 dans votre historique` : 'Dans vos coups de cœur',
          reason: `Inspiré par ${seed.title}`,
          items: picked.map((sc) => scoredToMediaItem(sc, explain(sc, taste, watchedEvents))),
        });
      }
    }

    // Rail 4 : « Pépites critiques dans vos goûts » (voteAverage >= 7.6, faible popularité mainstream)
    const hiddenGemsPool = scoredPool.filter(
      (sc) => sc.features.voteAverage >= 7.6 && sc.breakdown.sLong >= 0.15
    );
    const hiddenGemsPicked = selectMMR(
      hiddenGemsPool,
      12,
      0.74,
      { perGenre: 4, perDirector: 2, perDecade: 5 },
      globalSeen
    );
    if (hiddenGemsPicked.length >= 3) {
      sections.push({
        key: 'hidden_gems',
        title: 'Pépites critiques dans vos goûts',
        subtitle: 'Œuvres acclamées par la critique et hautement compatibles avec votre profil',
        reason: 'Haute note critique',
        items: hiddenGemsPicked.map((sc) => scoredToMediaItem(sc, explain(sc, taste, watchedEvents))),
      });
    }

    // Rail 5 : Animés & Mangas recommandés (si autorisé)
    if (allowAnime) {
      const animePool = scoredPool.filter((sc) => sc.features.isAnime);
      const animePicked = selectMMR(
        animePool,
        12,
        0.75,
        { perGenre: 8, perDirector: 3, perDecade: 6 },
        globalSeen
      );
      if (animePicked.length >= 3) {
        sections.push({
          key: 'anime_for_you',
          title: 'Animés & Mangas recommandés',
          subtitle: "Le meilleur de l'animation japonaise classé selon vos goûts",
          reason: hasWatchedAnime ? 'Adapté à vos animés vus' : 'Sélection Animation Japonaise',
          items: animePicked.map((sc) => scoredToMediaItem(sc, explain(sc, taste, watchedEvents))),
        });
      }
    }

    // Rail 6 : Exploration par genre favori
    for (const genre of topGenres.slice(0, 2)) {
      if (genre.id === 16 && !allowAnime) continue;
      const genrePool = scoredPool.filter((sc) =>
        sc.features.genres.some((g) => g.id === genre.id)
      );
      const genrePicked = selectMMR(
        genrePool,
        12,
        0.75,
        { perGenre: 12, perDirector: 2, perDecade: 6 },
        globalSeen
      );
      if (genrePicked.length >= 3) {
        sections.push({
          key: `genre_${genre.id}`,
          title: `Top ${genre.name} pour vous`,
          subtitle: `Votre genre de prédilection (${genre.count} œuvres vues)`,
          reason: `Affinité ${genre.name}`,
          items: genrePicked.map((sc) => scoredToMediaItem(sc, explain(sc, taste, watchedEvents))),
        });
      }
    }

    const response: RecommendationResponse = {
      generatedAt: new Date().toISOString(),
      profileStrength,
      hasEnoughData: true,
      heroItems: heroItems.slice(0, 6),
      topGenres: topGenres.slice(0, 5),
      sections,
    };

    feedCache.set(userId, { data: response, expiresAt: Date.now() + FEED_CACHE_TTL_MS });
    return response;
  }

  /**
   * Enregistre un événement de feedback implicite ou explicite et met à jour le bandit LinUCB
   */
  public static recordEvent(params: {
    userId: number;
    mediaType: 'movie' | 'tv' | 'manga';
    tmdbId: number;
    event: 'impression' | 'click' | 'watchlist' | 'watched' | 'not_interested' | 'dismiss';
    section?: string;
  }): void {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO reco_events (user_id, media_type, tmdb_id, section, event, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(params.userId, params.mediaType, params.tmdbId, params.section || null, params.event, nowIso);

    if (params.event === 'not_interested') {
      db.prepare(`
        INSERT INTO reco_exclusions (user_id, media_type, tmdb_id, reason, created_at)
        VALUES (?, ?, ?, 'not_interested', ?)
        ON CONFLICT(user_id, media_type, tmdb_id) DO UPDATE SET created_at = excluded.created_at
      `).run(params.userId, params.mediaType, params.tmdbId, nowIso);
      invalidateUserRecoCache(params.userId);
    }

    // Mettre à jour les poids personnalisés LinUCB
    const rewardMap: Record<string, number> = {
      watched: 1.0,
      watchlist: 0.6,
      click: 0.2,
      impression: 0.0,
      dismiss: -0.15,
      not_interested: -0.8,
    };
    const reward = rewardMap[params.event] ?? 0;
    if (reward !== 0) {
      const bandit = loadUserBandit(params.userId);
      // Vecteur de contexte normalisé par défaut
      bandit.update([0.5, 0.4, 0.3, 0.7, 0.5, 0.1], reward);
      saveUserBandit(params.userId, bandit);
    }
  }

  /**
   * Explique en détail pourquoi un média précis est recommandé à un utilisateur (/api/reco/why/:mediaType/:tmdbId)
   */
  public static async explainItem(userId: number, mediaType: 'movie' | 'tv', tmdbId: number) {
    const { taste, events } = await this.buildUserTasteAndHistory(userId);
    const details = await TMDBService.getDetails(mediaType, tmdbId);
    const features = tmdbItemToFeatures(details);
    const bandit = loadUserBandit(userId);
    const weights = bandit.getWeights();

    const scored = scoreCandidate(
      { features, collabVoteSum: 0.5, collabSeeds: [] },
      taste,
      weights
    );
    const reasons = explain(scored, taste, events);

    return {
      tmdbId,
      mediaType,
      title: details.title,
      score: Math.round(scored.score * 1000) / 1000,
      breakdown: scored.breakdown,
      weights,
      reasons,
    };
  }

  /**
   * Inspection complète du vecteur de goût d'un utilisateur pour l'admin (/api/reco/debug)
   */
  public static async getDebugInfo(userId: number) {
    const { taste, events, topGenres } = await this.buildUserTasteAndHistory(userId);
    const bandit = loadUserBandit(userId);

    const topDimensions = (vec: Record<string, number>, n = 15) =>
      Object.entries(vec)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([dim, val]) => ({ dimension: dim, weight: Math.round(val * 1000) / 1000 }));

    return {
      userId,
      eventsCount: events.length,
      meanRating: Math.round(taste.meanRating * 100) / 100,
      banditWeights: bandit.getWeights(),
      topGenres,
      longTermTopDimensions: topDimensions(taste.long),
      shortTermTopDimensions: topDimensions(taste.short),
      negativeTopDimensions: topDimensions(taste.neg),
    };
  }
}
