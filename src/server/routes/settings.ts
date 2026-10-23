import { Router, Response } from 'express';
import { getAllSettingsMasked, setSetting, SettingKey, getSetting, SECRET_KEYS } from '../services/settingsService.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { SeerService } from '../services/seerService.js';
import { SonarrService } from '../services/sonarrService.js';
import { TMDBService } from '../services/tmdbService.js';
import { LdapService } from '../services/ldapService.js';
import { JellyfinService } from '../services/jellyfinService.js';
import { serverError } from '../utils/httpError.js';
import db from '../db/index.js';

const router = Router();

/**
 * Obtenir la configuration actuelle (masquée pour les clés secrètes) - Réservé aux administrateurs (F-09)
 */
router.get('/', authenticateToken, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = getAllSettingsMasked();
    res.json(settings);
  } catch (err: any) {
    serverError(res, err, 'SettingsGet');
  }
});

/**
 * Diagnostic système complet (réservé aux administrateurs - B-06)
 */
router.get('/diagnostics', authenticateToken, requireAdmin, (_req: AuthenticatedRequest, res: Response) => {
  try {
    const usersCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
    const watchedCount = (db.prepare('SELECT COUNT(*) as c FROM watched_items').get() as any)?.c || 0;
    const watchlistCount = (db.prepare('SELECT COUNT(*) as c FROM watchlist').get() as any)?.c || 0;
    const cacheCount = (db.prepare('SELECT COUNT(*) as c FROM tmdb_cache').get() as any)?.c || 0;
    const featuresCount = (db.prepare('SELECT COUNT(*) as c FROM media_features').get() as any)?.c || 0;

    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      database: {
        usersCount,
        watchedCount,
        watchlistCount,
        cacheCount,
        featuresCount,
      },
      integrations: {
        tmdbConfigured: Boolean(getSetting('TMDB_API_KEY')),
        seerConfigured: SeerService.isConfigured(),
        sonarrConfigured: SonarrService.isSonarrConfigured(),
        radarrConfigured: SonarrService.isRadarrConfigured(),
        jellyfinConfigured: JellyfinService.isConfigured(),
        ldapEnabled: LdapService.isEnabled(),
        ssoEnabled: getSetting('SSO_ENABLED') === 'true',
      },
    });
  } catch (err: any) {
    serverError(res, err, 'SettingsDiagnostics');
  }
});

/**
 * Mettre à jour les paramètres du serveur (réservé aux administrateurs)
 */
router.put('/', authenticateToken, requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = req.body as Record<string, string>;
    const validKeys: SettingKey[] = [
      'TMDB_API_KEY',
      'SEER_URL',
      'SEER_API_KEY',
      'SEER_DEFAULT_USER_ID',
      'SONARR_URL',
      'SONARR_API_KEY',
      'RADARR_URL',
      'RADARR_API_KEY',
      'SIMKL_CLIENT_ID',
      'SIMKL_CLIENT_SECRET',
      'SIMKL_ACCESS_TOKEN',
      'JELLYFIN_URL',
      'DEFAULT_LANGUAGE',
      'ALLOW_REGISTRATION',
      'LDAP_ENABLED',
      'LDAP_URL',
      'LDAP_BASE_DN',
      'LDAP_BIND_DN',
      'LDAP_BIND_PASSWORD',
      'LDAP_SEARCH_FILTER',
      'SSO_ENABLED',
      'SSO_HEADER',
      'SSO_TRUSTED_PROXIES',
      'INTERNAL_HOSTS_ALLOWLIST',
    ];

    for (const key of validKeys) {
      if (updates[key] !== undefined && typeof updates[key] === 'string') {
        const val = updates[key].trim();
        // Ignorer si c'est une valeur masquée inchangée (contenant ••••)
        if (val.includes('••••')) continue;
        // Ignorer si c'est une chaîne vide envoyée pour une clé secrète déjà configurée (évite d'écraser TMDB_API_KEY, SEER_API_KEY, etc.)
        if (SECRET_KEYS.has(key) && val === '') continue;
        setSetting(key, val);
      }
    }

    res.json({
      success: true,
      message: 'Paramètres mis à jour et sauvegardés avec succès.',
      settings: getAllSettingsMasked(),
    });
  } catch (err: any) {
    serverError(res, err, 'SettingsPut');
  }
});

/**
 * Tester la connexion aux services externes (TMDB, Seer, Sonarr, Radarr, LDAP, Jellyfin)
 */
router.post('/test', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { service } = req.body;

    if (service === 'tmdb') {
      await TMDBService.getTrending('day', 1);
      res.json({ success: true, message: 'Connexion TMDB opérationnelle (fr-FR) !' });
      return;
    }

    if (service === 'seer') {
      const status = await SeerService.getStatus();
      res.json({
        success: status.connected,
        message: status.message,
      });
      return;
    }

    if (service === 'sonarr') {
      const status = await SonarrService.getSonarrStatus();
      res.json({
        success: status.connected,
        message: status.connected ? `Sonarr connecté (v${status.version})` : status.error,
      });
      return;
    }

    if (service === 'radarr') {
      const status = await SonarrService.getRadarrStatus();
      res.json({
        success: status.connected,
        message: status.connected ? `Radarr connecté (v${status.version})` : status.error,
      });
      return;
    }

    if (service === 'ldap') {
      const status = await LdapService.testConnection();
      res.json(status);
      return;
    }

    if (service === 'jellyfin') {
      const status = await JellyfinService.testServer();
      res.json(status);
      return;
    }

    res.status(400).json({ error: 'Service inconnu.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Erreur lors du test du service.' });
  }
});

export default router;
