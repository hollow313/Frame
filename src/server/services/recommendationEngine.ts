import db from '../db/index.js';
import { TMDBService, TMDBMediaItem } from './tmdbService.js';

interface WatchedRecord {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  rating: number | null;
  genres: string | null;
  watched_at: string;
}

export interface RecommendationSection {
  title: string;
  subtitle?: string;
  reason?: string;
  items: TMDBMediaItem[];
}

export interface HeroProposalItem extends TMDBMediaItem {
  recommendationReason?: string;
  categoryTag?: 'Film' | 'Série' | 'Animé / Manga';
}

export interface RecommendationResponse {
  hasEnoughData: boolean;
  heroItems: HeroProposalItem[];
  sections: RecommendationSection[];
  topGenres: { id: number; name: string; count: number }[];
}

export class RecommendationEngine {
  /**
   * Générer des recommandations personnalisées et intelligentes pour un utilisateur
   */
  public static async getPersonalizedRecommendations(userId: number): Promise<RecommendationResponse> {
    // 0. Récupérer les préférences de contenu de l'utilisateur
    const userPrefs = db.prepare('SELECT pref_include_movies, pref_include_tv, pref_include_anime FROM users WHERE id = ?').get(userId) as any;
    const allowMovies = userPrefs ? userPrefs.pref_include_movies !== 0 : true;
    const allowTv = userPrefs ? userPrefs.pref_include_tv !== 0 : true;
    const userExplicitlyWantsAnime = userPrefs ? userPrefs.pref_include_anime === 1 : false;

    // 1. Récupérer l'historique de visionnage de l'utilisateur
    const stmt = db.prepare(`
      SELECT tmdb_id, media_type, title, rating, genres, watched_at
      FROM watched_items
      WHERE user_id = ?
      ORDER BY COALESCE(rating, 7) DESC, watched_at DESC
      LIMIT 100
    `);
    const watched = stmt.all(userId) as unknown as WatchedRecord[];

    // Ensemble des IDs déjà vus pour exclure strictement tout doublon
    const watchedIds = new Set(watched.map((w) => `${w.media_type}-${w.tmdb_id}`));

    // Vérifier si l'utilisateur a déjà regardé des animés dans son historique
    let hasWatchedAnime = false;
    const genreScores: Record<number, { name: string; score: number; count: number }> = {};

    for (const item of watched) {
      let weight = 1.5;
      if (item.rating) {
        if (item.rating >= 9) weight = 3;
        else if (item.rating >= 7) weight = 2;
        else if (item.rating <= 4) weight = -0.5;
      }

      if (item.genres) {
        try {
          const parsedGenres: { id: number; name: string }[] = JSON.parse(item.genres);
          for (const g of parsedGenres) {
            if (g.id === 16) hasWatchedAnime = true; // Animation
            if (!genreScores[g.id]) {
              genreScores[g.id] = { name: g.name, score: 0, count: 0 };
            }
            genreScores[g.id].score += weight;
            genreScores[g.id].count += 1;
          }
        } catch {}
      }
    }

    // N'inclure les mangas / animés QUE si l'utilisateur l'a coché OU en a déjà regardé !
    const allowAnime = userExplicitlyWantsAnime || hasWatchedAnime;

    // Helper de filtrage selon les préférences de l'utilisateur
    const filterByUserPrefs = (item: TMDBMediaItem): boolean => {
      if (item.media_type === 'movie' && !allowMovies) return false;
      if (item.media_type === 'tv' && !allowTv) return false;
      const isAnime = item.genre_ids?.includes(16) || item.genres?.some((g) => g.id === 16);
      if (isAnime && !allowAnime) return false;
      return !watchedIds.has(`${item.media_type}-${item.id}`);
    };

    // Cas utilisateur avec historique insuffisant (< 2 éléments)
    if (watched.length < 2) {
      const trending = await TMDBService.getTrending('week');
      const popularMovies = allowMovies ? await TMDBService.getPopularMovies() : { results: [] };
      const popularTV = allowTv ? await TMDBService.getPopularTV() : { results: [] };
      const anime = allowAnime ? await TMDBService.discoverAnime() : { results: [] };

      const heroItems: HeroProposalItem[] = [];
      for (const t of trending.results) {
        if (filterByUserPrefs(t) && !heroItems.some((h) => h.id === t.id)) {
          heroItems.push({
            ...t,
            categoryTag: t.media_type === 'movie' ? 'Film' : 'Série',
            recommendationReason: 'Tendance incontournable',
          });
          if (heroItems.length >= 5) break;
        }
      }

      const defaultSections: RecommendationSection[] = [
        {
          title: 'Tendances du moment',
          subtitle: 'Marquez vos premiers films et séries comme "Vu" pour activer l\'IA de recommandations sur-mesure.',
          reason: 'Populaire cette semaine',
          items: trending.results.filter(filterByUserPrefs).slice(0, 14),
        },
      ];

      if (allowMovies && popularMovies.results.length > 0) {
        defaultSections.push({
          title: 'Films incontournables',
          reason: 'Films les plus populaires',
          items: popularMovies.results.filter(filterByUserPrefs).slice(0, 14),
        });
      }

      if (allowTv && popularTV.results.length > 0) {
        defaultSections.push({
          title: 'Séries à ne pas manquer',
          reason: 'Séries acclamées',
          items: popularTV.results.filter(filterByUserPrefs).slice(0, 14),
        });
      }

      if (allowAnime && anime.results.length > 0) {
        defaultSections.push({
          title: 'Animés & Mangas populaires',
          reason: 'Animation japonaise',
          items: anime.results.filter(filterByUserPrefs).slice(0, 14),
        });
      }

      return {
        hasEnoughData: false,
        heroItems,
        topGenres: [],
        sections: defaultSections,
      };
    }

    // Profil avec données de visionnage
    const topGenresList = Object.entries(genreScores)
      .map(([id, data]) => ({ id: parseInt(id, 10), name: data.name, score: data.score, count: data.count }))
      .sort((a, b) => b.score - a.score);

    const sections: RecommendationSection[] = [];
    const heroProposals: HeroProposalItem[] = [];

    // Recommandations basées sur les coups de cœur
    const topFavorites = watched
      .filter((w) => (w.rating && w.rating >= 7) || !w.rating)
      .slice(0, 4);

    for (const fav of topFavorites) {
      if ((fav.media_type === 'movie' && !allowMovies) || (fav.media_type === 'tv' && !allowTv)) {
        continue;
      }

      try {
        const recs = await TMDBService.getRecommendations(fav.media_type, fav.tmdb_id);
        const filtered = recs.filter(filterByUserPrefs).slice(0, 12);

        if (filtered.length >= 1) {
          const topMatch = filtered[0];
          if (!heroProposals.some((h) => h.id === topMatch.id)) {
            heroProposals.push({
              ...topMatch,
              recommendationReason: `Recommandé d'après votre coup de cœur pour « ${fav.title} »`,
              categoryTag: topMatch.media_type === 'movie' ? 'Film' : 'Série',
            });
          }
        }

        if (filtered.length >= 3) {
          sections.push({
            title: `Parce que vous avez aimé ${fav.title}`,
            subtitle: fav.rating ? `Noté ${fav.rating}/10 par vous` : 'Dans votre historique',
            reason: `Inspiré par votre visionnage de ${fav.title}`,
            items: filtered,
          });
        }
      } catch {}
    }

    // Section Animé / Manga (UNIQUEMENT si autorisé/regardé)
    if (allowAnime) {
      try {
        const animeRecs = await TMDBService.discoverAnime();
        const filteredAnime = animeRecs.results.filter(filterByUserPrefs).slice(0, 12);

        if (filteredAnime.length > 0) {
          const topAnime = filteredAnime[0];
          if (!heroProposals.some((h) => h.id === topAnime.id)) {
            heroProposals.push({
              ...topAnime,
              recommendationReason: hasWatchedAnime ? 'Animé sélectionné pour votre profil' : 'Pépite Manga / Animation japonaise',
              categoryTag: 'Animé / Manga',
            });
          }

          sections.push({
            title: 'Animés & Mangas recommandés',
            subtitle: 'Le meilleur de l\'animation japonaise adapté à vos goûts',
            reason: 'Sélection Manga & Animé',
            items: filteredAnime,
          });
        }
      } catch {}
    }

    // Sections basées sur les genres de prédilection
    for (const genre of topGenresList.slice(0, 2)) {
      if (allowMovies) {
        try {
          const disc = await TMDBService.discoverByGenre('movie', genre.id);
          const filtered = disc.results.filter(filterByUserPrefs).slice(0, 12);
          if (filtered.length > 0) {
            if (!heroProposals.some((h) => h.id === filtered[0].id)) {
              heroProposals.push({
                ...filtered[0],
                recommendationReason: `Votre genre favori : ${genre.name} (${genre.count} œuvres vues)`,
                categoryTag: 'Film',
              });
            }

            sections.push({
              title: `Top ${genre.name}`,
              subtitle: `Votre genre le plus apprécié (${genre.count} œuvres vues)`,
              reason: `Affinité de goût pour ${genre.name}`,
              items: filtered,
            });
          }
        } catch {}
      }
    }

    // Garantir AU MOINS 5 propositions personnalisées dans le Hero Carousel
    if (heroProposals.length < 5) {
      try {
        const trending = await TMDBService.getTrending('week');
        for (const t of trending.results) {
          if (filterByUserPrefs(t) && !heroProposals.some((h) => h.id === t.id)) {
            heroProposals.push({
              ...t,
              recommendationReason: 'Sélection coup de cœur pour votre profil',
              categoryTag: t.media_type === 'movie' ? 'Film' : 'Série',
            });
            if (heroProposals.length >= 5) break;
          }
        }
      } catch {}
    }

    return {
      hasEnoughData: true,
      heroItems: heroProposals.slice(0, 6),
      topGenres: topGenresList.slice(0, 5),
      sections,
    };
  }
}
