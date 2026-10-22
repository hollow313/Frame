import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Charger l'environnement
dotenv.config();

import { initDatabase } from './db/index.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import tmdbRoutes from './routes/tmdb.js';
import mediaRoutes from './routes/media.js';
import recommendationsRoutes from './routes/recommendations.js';
import seerRoutes from './routes/seer.js';
import sonarrRoutes from './routes/sonarr.js';
import simklRoutes from './routes/simkl.js';
import settingsRoutes from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialiser la base de données SQLite
initDatabase();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 30018;

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/seer', seerRoutes);
app.use('/api/sonarr', sonarrRoutes);
app.use('/api/simkl', simklRoutes);
app.use('/api/settings', settingsRoutes);

// Statut de santé
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Frame',
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// En production ou après build, servir le client React SPA
const clientDistPath = path.resolve(__dirname, '../client');
const clientRootDist = path.resolve(process.cwd(), 'dist/client');

let staticPath = '';
if (fs.existsSync(clientDistPath)) {
  staticPath = clientDistPath;
} else if (fs.existsSync(clientRootDist)) {
  staticPath = clientRootDist;
}

if (staticPath) {
  app.use(express.static(staticPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.json({
      message: 'Frame Backend API opérationnel. Lancez le client Vite ou compilez le projet avec npm run build.',
      port: PORT,
    });
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`  FRAME - Media Intelligence & Tracker`);
  console.log(`  Serveur actif sur http://0.0.0.0:${PORT}`);
  console.log(`===============================================`);
});

// Gestion de l'arrêt propre du conteneur
process.on('SIGINT', () => {
  console.log('[Frame] Arrêt en cours...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('[Frame] Signal de terminaison reçu. Fermeture...');
  server.close(() => process.exit(0));
});

export default app;
