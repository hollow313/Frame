import { Router, Response } from 'express';
import { RecommendationEngine } from '../services/recommendationEngine.js';
import { AuthenticatedRequest, optionalAuth } from '../middleware/auth.js';
import { TMDBService } from '../services/tmdbService.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

// Middleware optionnel d'authentification (D-05)
router.use(optionalAuth);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      const trending = await TMDBService.getTrending('week');
      const popularMovies = await TMDBService.getPopularMovies();
      const popularTV = await TMDBService.getPopularTV();

      res.json({
        generatedAt: new Date().toISOString(),
        profileStrength: 'cold',
        hasEnoughData: false,
        heroItems: trending.results.slice(0, 5).map((t) => ({
          ...t,
          reasons: ['Populaire cette semaine'],
          recommendationReason: 'Populaire cette semaine',
          categoryTag: t.media_type === 'movie' ? 'Film' : 'Série',
        })),
        topGenres: [],
        sections: [
          {
            key: 'trending',
            title: 'Tendances actuelles',
            subtitle: 'Connectez-vous pour obtenir des recommandations taillées sur-mesure.',
            reason: 'Populaire cette semaine',
            items: trending.results.slice(0, 14),
          },
          {
            key: 'popular_movies',
            title: "Films à l'affiche",
            reason: 'Populaire',
            items: popularMovies.results.slice(0, 14),
          },
          {
            key: 'popular_tv',
            title: 'Séries recommandées',
            reason: 'Populaire',
            items: popularTV.results.slice(0, 14),
          },
        ],
      });
      return;
    }

    const recommendations = await RecommendationEngine.getPersonalizedRecommendations(req.user.id);
    res.json(recommendations);
  } catch (err: any) {
    serverError(res, err, 'RecommendationsGet');
  }
});

export default router;
