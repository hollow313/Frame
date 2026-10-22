import { Router, Response } from 'express';
import { getAllSettingsMasked, setSetting, SettingKey } from '../services/settingsService.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { SeerService } from '../services/seerService.js';
import { ArrService } from '../services/sonarrService.js';
import { TMDBService } from '../services/tmdbService.js';
import { LDAPService } from '../services/ldapService.js';
import { JellyfinService } from '../services/jellyfinService.js';

const router = Router();
router.use(authenticateToken);

// Récupérer la configuration
router.get('/', (_req, res) => {
  try {
    const settings = getAllSettingsMasked();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Enregistrer les paramètres (admin uniquement)
router.put('/', requireAdmin, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const updates: Record<string, string> = req.body;

    const allowedKeys: SettingKey[] = [
      'TMDB_API_KEY',
      'SEER_URL',
      'SEER_API_KEY',
      'SONARR_URL',
      'SONARR_API_KEY',
      'RADARR_URL',
      'RADARR_API_KEY',
      'SIMKL_CLIENT_ID',
      'SIMKL_CLIENT_SECRET',
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
      'JELLYFIN_URL',
      'JELLYFIN_API_KEY',
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key as SettingKey)) {
        if (value !== undefined && !value.includes('••••')) {
          setSetting(key as SettingKey, String(value).trim());
        }
      }
    }

    res.json({ success: true, message: 'Paramètres enregistrés avec succès !' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Tester une intégration
router.post('/test', requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { service } = req.body;

    if (service === 'tmdb') {
      try {
        const test = await TMDBService.getTrending('day', 1);
        res.json({ success: true, message: `TMDB connecté avec succès (${test.results.length} tendances chargées)` });
      } catch (e: any) {
        res.json({ success: false, message: e.message || 'Erreur TMDB' });
      }
      return;
    }

    if (service === 'seer') {
      const test = await SeerService.testConnection();
      res.json(test);
      return;
    }

    if (service === 'sonarr') {
      const test = await ArrService.testSonarr();
      res.json(test);
      return;
    }

    if (service === 'radarr') {
      const test = await ArrService.testRadarr();
      res.json(test);
      return;
    }

    if (service === 'ldap') {
      const test = await LDAPService.testConnection();
      res.json(test);
      return;
    }

    if (service === 'jellyfin') {
      const test = await JellyfinService.testServer();
      res.json(test);
      return;
    }

    res.status(400).json({ error: 'Service inconnu' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
