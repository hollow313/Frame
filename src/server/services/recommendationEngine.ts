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
  heroItems: HeroProposalItem[]; // Au moins 5 médias dédiés à la playlist de la personne
  sections: RecommendationSection[];
  topGenres: { id: number; name: string; count: number }[];
}

export class RecommendationEngine {
  /**
   * Générer des recommandations personnalisées et intelligentes pour un utilisateur
   */
  public static async getPersonalizedRecommendations(userId: number): Promise<RecommendationResponse> {
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

    // Si l'utilisateur a peu de données (< 2 éléments)
    if (watched.length < 2) {
      const trending = await TMDBService.getTrending('week');
      const popularMovies = await TMDBService.getPopularMovies();
      const popularTV = await TMDBService.getPopularTV();
      const anime = await TMDBService.discoverAnime();

      // Construire 5 hero items par défaut
      const heroItems: HeroProposalItem[] = [];
      if (trending.results[0]) heroItems.push({ ...trending.results[0], categoryTag: trending.results[0].media_type === 'movie' ? 'Film' : 'Série', recommendationReason: 'Tendance incontournable' });
      if (popularMovies.results[0]) heroItems.push({ ...popularMovies.results[0], categoryTag: 'Film', recommendationReason: 'Film le plus populaire' });
      if (popularTV.results[0]) heroItems.push({ ...popularTV.results[0], categoryTag: 'Série', recommendationReason: 'Série acclamée' });
      if (anime.results[0]) heroItems.push({ ...anime.results[0], categoryTag: 'Animé / Manga', recommendationReason: 'Animé phare du moment' });
      if (trending.results[1]) heroItems.push({ ...trending.results[1], categoryTag: trending.results[1].media_type === 'movie' ? 'Film' : 'Série', recommendationReason: 'Coup de cœur public' });

      return {
        hasEnoughData: false,
        heroItems,
        topGenres: [],
        sections: [
          {
            title: 'Tendances du moment',
            subtitle: 'Marquez vos premiers films et séries comme "Vu" pour activer l\'IA de recommandations sur-mesure.',
            reason: 'Populaire cette semaine',
            items: trending.results.filter((i) => !watchedIds.has(`${i.media_type}-${i.id}`)).slice(0, 14),
          },
          {
            title: 'Films incontournables',
            reason: 'Films les plus populaires',
            items: popularMovies.results.filter((i) => !watchedIds.has(`movie-${i.id}`)).slice(0, 14),
          },
          {
            title: 'Séries à ne pas manquer',
            reason: 'Séries acclamées',
            items: popularTV.results.filter((i) => !watchedIds.has(`tv-${i.id}`)).slice(0, 14),
          },
          {
            title: 'Animés & Mangas populaires',
            reason: 'Animation japonaise',
            items: anime.results.filter((i) => !watchedIds.has(`tv-${i.id}`)).slice(0, 14),
          },
        ],
      };
    }

    // 2. Calculer le profil de goût (Genre Affinity Map)
    const genreScores: Record<number, { name: string; score: number; count: number }> = {};
    let hasWatchedAnime = false;

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
            if (g.id === 16) hasWatchedAnime = true; // Genre Animation
            if (!genreScores[g.id]) {
              genreScores[g.id] = { name: g.name, score: 0, count: 0 };
            }
            genreScores[g.id].score += weight;
            genreScores[g.id].count += 1;
          }
        } catch (e) {
          // Ignorer
        }
      }
    }

    const topGenresList = Object.entries(genreScores)
      .map(([id, data]) => ({ id: parseInt(id, 10), name: data.name, score: data.score, count: data.count }))
      .sort((a, b) => b.score - a.score);

    const sections: RecommendationSection[] = [];
    const heroProposals: HeroProposalItem[] = [];

    // 3. Recommandations basées sur les films/séries coups de cœur de l'utilisateur
    const topFavorites = watched
      .filter((w) => (w.rating && w.rating >= 7) || !w.rating)
      .slice(0, 4);

    for (const fav of topFavorites) {
      try {
        const recs = await TMDBService.getRecommendations(fav.media_type, fav.tmdb_id);
        const filtered = recs
          .filter((item) => !watchedIds.has(`${item.media_type}-${item.id}`))
          .slice(0, 12);

        if (filtered.length >= 1) {
          // Ajouter le premier pour le carrousel Hero
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
      } catch (e) {
        // Ignorer
      }
    }

    // 4. Recommandation dédiée Manga / Animé
    try {
      const animeRecs = await TMDBService.discoverAnime();
      const filteredAnime = animeRecs.results
        .filter((a) => !watchedIds.has(`tv-${a.id}`))
        .slice(0, 12);

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

    // 5. Recommandations basées sur les genres favoris pour compléter le Hero Carousel
    const primaryGenre = topGenresList[0];
    if (primaryGenre) {
      try {
        const discoverMovies = await TMDBService.discoverByGenre('movie', primaryGenre.id);
        const filtered = discoverMovies.results
          .filter((item) => !watchedIds.has(`movie-${item.id}`))
          .slice(0, 12);

        if (filtered.length > 0) {
          const topGenreMovie = filtered[0];
          if (!heroProposals.some((h) => h.id === topGenreMovie.id)) {
            heroProposals.push({
              ...topGenreMovie,
              recommendationReason: `Votre genre favori : ${primaryGenre.name} (${primaryGenre.count} œuvres vues)`,
              categoryTag: 'Film',
            });
          }

          sections.push({
            title: `Top ${primaryGenre.name}`,
            subtitle: `Votre genre le plus apprécié (${primaryGenre.count} œuvres vues)`,
            reason: `Affinité de goût pour ${primaryGenre.name}`,
            items: filtered,
          });
        }
      } catch {}
    }

    // S'assurer qu'il y a AU MOINS 5 propositions de médias dans le hero carousel
    if (heroProposals.length < 5) {
      try {
        const trending = await TMDBService.getTrending('week');
        for (const t of trending.results) {
          if (!watchedIds.has(`${t.media_type}-${t.id}`) && !heroProposals.some((h) => h.id === t.id)) {
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
