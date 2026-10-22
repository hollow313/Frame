import { Router, Response } from 'express';
import { RecommendationEngine } from '../services/recommendationEngine.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import { getSetting } from '../services/settingsService.js';
import { TMDBService } from '../services/tmdbService.js';

const router = Router();

// Middleware optionnel d'authentification
router.use((req: AuthenticatedRequest, _res: Response, next) => {
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
      // Ignorer
    }
  }
  next();
});

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      // Pour les visiteurs non connectés, retourner les tendances générales
      const trending = await TMDBService.getTrending('week');
      const popularMovies = await TMDBService.getPopularMovies();
      const popularTV = await TMDBService.getPopularTV();

      res.json({
        hasEnoughData: false,
        topGenres: [],
        sections: [
          {
            title: 'Tendances actuelles',
            subtitle: 'Connectez-vous pour obtenir des recommandations taillées sur-mesure.',
            reason: 'Populaire cette semaine',
            items: trending.results.slice(0, 14),
          },
          {
            title: 'Films à l\'affiche',
            reason: 'Populaire',
            items: popularMovies.results.slice(0, 14),
          },
          {
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
