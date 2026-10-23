import 'dotenv/config';
import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { initDatabase } from './db/index.js';
import { ensureJwtSecret } from './services/settingsService.js';
import { ssoMiddleware } from './middleware/sso.js';
import { startSimklScheduler } from './services/syncScheduler.js';
import { TMDBService } from './services/tmdbService.js';
import { logger } from './utils/logger.js';

import authRoutes from './routes/auth.js';
import tmdbRoutes from './routes/tmdb.js';
import mediaRoutes from './routes/media.js';
import recommendationsRoutes from './routes/recommendations.js';
import recoRoutes from './routes/reco.js';
import seerRoutes from './routes/seer.js';
import sonarrRoutes from './routes/sonarr.js';
import simklRoutes from './routes/simkl.js';
import jellyfinRoutes from './routes/jellyfin.js';
import settingsRoutes from './routes/settings.js';
import usersRoutes from './routes/users.js';

// Initialiser SQLite et garantir un JWT_SECRET fort dès le démarrage (F-01)
initDatabase();
ensureJwtSecret();

export const app = express();
const PORT = parseInt(process.env.PORT || '30018', 10);

// Support natif des Reverse Proxies (Traefik, Nginx, Caddy, Authelia) - F-04
app.set('trust proxy', 1);
app.disable('x-powered-by');

// En-têtes de sécurité HTTP via Helmet (F-11)
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://image.tmdb.org', 'https://simkl.in', '*'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        frameSrc: ["'self'", 'https://www.youtube.com'],
        connectSrc: ["'self'", 'https://image.tmdb.org'],
      },
    },
  })
);

// Configuration CORS restreinte aux origines autorisées (F-06)
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Journalisation structurée des requêtes API
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/v1/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400 || req.method !== 'GET') {
      logger.info('HTTP', `${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Authentification automatique SSO par Reverse Proxy (si activée et proxy de confiance - F-07)
app.use(ssoMiddleware);

// Routeur API unifié monté sur /api et /api/v1 (D-02)
const apiRouter = Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/tmdb', tmdbRoutes);
apiRouter.use('/media', mediaRoutes);
apiRouter.use('/recommendations', recommendationsRoutes);
apiRouter.use('/reco', recoRoutes);
apiRouter.use('/seer', seerRoutes);
apiRouter.use('/sonarr', sonarrRoutes);
apiRouter.use('/simkl', simklRoutes);
apiRouter.use('/jellyfin', jellyfinRoutes);
apiRouter.use('/settings', settingsRoutes);
apiRouter.use('/admin', settingsRoutes); // /api/admin/diagnostics
apiRouter.use('/users', usersRoutes);

apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'Frame', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

// Toute route /api/* inconnue renvoie un 404 JSON explicite et jamais index.html (F-14)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route API inconnue.' });
});

// En production : servir le build React statique
const clientBuildPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('===============================================');
    console.log(`FRAME - Media Intelligence & Tracker`);
    console.log(`Serveur actif sur http://0.0.0.0:${PORT}`);
    console.log('===============================================');
  });

  // Démarrer le planificateur automatique Simkl (toutes les 6h) et réparer d'éventuels titres CJK
  startSimklScheduler();
  setTimeout(() => {
    TMDBService.repairCjkTitlesInDb().catch(() => {});
  }, 5000);
}

export default app;
