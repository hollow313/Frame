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

export interface RecommendationResponse {
  hasEnoughData: boolean;
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

    // Récupérer également la watchlist pour annoter
    const watchlistStmt = db.prepare(`
      SELECT tmdb_id, media_type FROM watchlist WHERE user_id = ?
    `);
    const inWatchlist = new Set((watchlistStmt.all(userId) as any[]).map((w) => `${w.media_type}-${w.tmdb_id}`));

    // Si l'utilisateur n'a pas encore assez de données (< 2 éléments)
    if (watched.length < 2) {
      const trending = await TMDBService.getTrending('week');
      const popularMovies = await TMDBService.getPopularMovies();
      const popularTV = await TMDBService.getPopularTV();

      return {
        hasEnoughData: false,
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
        ],
      };
    }

    // 2. Calculer le profil de goût (Genre Affinity Map)
    const genreScores: Record<number, { name: string; score: number; count: number }> = {};

    for (const item of watched) {
      // Poids du vote : si noté 9 ou 10 -> poids 3, noté 7-8 -> 2, non noté -> 1.5, noté <= 4 -> -1
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
            if (!genreScores[g.id]) {
              genreScores[g.id] = { name: g.name, score: 0, count: 0 };
            }
            genreScores[g.id].score += weight;
            genreScores[g.id].count += 1;
          }
        } catch (e) {
          // Format brut
        }
      }
    }

    // Trier les genres par score d'affinité
    const topGenresList = Object.entries(genreScores)
      .map(([id, data]) => ({ id: parseInt(id, 10), name: data.name, score: data.score, count: data.count }))
      .sort((a, b) => b.score - a.score);

    const sections: RecommendationSection[] = [];

    // 3. Recommandations basées sur les 2-3 films/séries coups de cœur de l'utilisateur
    const topFavorites = watched
      .filter((w) => (w.rating && w.rating >= 7) || !w.rating)
      .slice(0, 3);

    for (const fav of topFavorites) {
      try {
        const recs = await TMDBService.getRecommendations(fav.media_type, fav.tmdb_id);
        const filtered = recs
          .filter((item) => !watchedIds.has(`${item.media_type}-${item.id}`))
          .slice(0, 12);

        if (filtered.length >= 3) {
          sections.push({
            title: `Parce que vous avez aimé ${fav.title}`,
            subtitle: fav.rating ? `Noté ${fav.rating}/10 par vous` : 'Dans votre historique',
            reason: `Inspiré par votre visionnage de ${fav.title}`,
            items: filtered,
          });
        }
      } catch (e) {
        // Ignorer en cas d'erreur ponctuelle
      }
    }

    // 4. Recommandations basées sur les genres de prédilection
    const primaryGenre = topGenresList[0];
    if (primaryGenre) {
      try {
        const discoverMovies = await TMDBService.discoverByGenre('movie', primaryGenre.id);
        const filtered = discoverMovies.results
          .filter((item) => !watchedIds.has(`movie-${item.id}`))
          .slice(0, 12);

        if (filtered.length > 0) {
          sections.push({
            title: `Top ${primaryGenre.name}`,
            subtitle: `Votre genre le plus apprécié (${primaryGenre.count} œuvres vues)`,
            reason: `Affinité de goût pour ${primaryGenre.name}`,
            items: filtered,
          });
        }
      } catch (e) {
        // Ignorer
      }
    }

    const secondaryGenre = topGenresList[1];
    if (secondaryGenre) {
      try {
        const discoverTV = await TMDBService.discoverByGenre('tv', secondaryGenre.id);
        const filtered = discoverTV.results
          .filter((item) => !watchedIds.has(`tv-${item.id}`))
          .slice(0, 12);

        if (filtered.length > 0) {
          sections.push({
            title: `Séries ${secondaryGenre.name} recommandées`,
            subtitle: `Basé sur vos préférences`,
            reason: `Affinité pour ${secondaryGenre.name}`,
            items: filtered,
          });
        }
      } catch (e) {
        // Ignorer
      }
    }

    // 5. Pépites méconnues : films avec note élevée (>= 7.8)
    try {
      const topRatedDiscover = await TMDBService.discoverByGenre('movie', primaryGenre ? primaryGenre.id : 28);
      const gems = topRatedDiscover.results
        .filter((i) => i.vote_average >= 7.8 && !watchedIds.has(`movie-${i.id}`))
        .slice(0, 10);

      if (gems.length >= 2) {
        sections.push({
          title: 'Pépites acclamées par la critique',
          subtitle: 'Hautement notés et sélectionnés pour vos goûts',
          reason: 'Score critique exceptionnel',
          items: gems,
        });
      }
    } catch (e) {
      // Ignorer
    }

    return {
      hasEnoughData: true,
      topGenres: topGenresList.slice(0, 5),
      sections,
    };
  }
}
