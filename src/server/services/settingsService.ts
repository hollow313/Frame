import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import db from '../db/index.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export type SettingKey =
  | 'TMDB_API_KEY'
  | 'SEER_URL'
  | 'SEER_API_KEY'
  | 'SEER_DEFAULT_USER_ID'
  | 'SONARR_URL'
  | 'SONARR_API_KEY'
  | 'RADARR_URL'
  | 'RADARR_API_KEY'
  | 'SIMKL_CLIENT_ID'
  | 'SIMKL_CLIENT_SECRET'
  | 'SIMKL_ACCESS_TOKEN'
  | 'JELLYFIN_URL'
  | 'DEFAULT_LANGUAGE'
  | 'JWT_SECRET'
  | 'ALLOW_REGISTRATION'
  | 'LDAP_ENABLED'
  | 'LDAP_URL'
  | 'LDAP_BASE_DN'
  | 'LDAP_BIND_DN'
  | 'LDAP_BIND_PASSWORD'
  | 'LDAP_SEARCH_FILTER'
  | 'SSO_ENABLED'
  | 'SSO_HEADER'
  | 'SSO_TRUSTED_PROXIES'
  | 'SSO_URL'
  | 'SSO_LOGOUT_URL'
  | 'SSO_DISABLE_LOCAL_LOGIN'
  | 'INTERNAL_HOSTS_ALLOWLIST';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const CONFIG_DIR = process.env.CONFIG_DIR || path.resolve(process.cwd(), 'config');
const DATA_SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');

export const SECRET_KEYS = new Set<SettingKey>([
  'TMDB_API_KEY',
  'SEER_API_KEY',
  'SONARR_API_KEY',
  'RADARR_API_KEY',
  'SIMKL_CLIENT_SECRET',
  'SIMKL_ACCESS_TOKEN',
  'JWT_SECRET',
  'LDAP_BIND_PASSWORD',
]);

const INSECURE_JWT_DEFAULTS = new Set([
  'frame-default-jwt-secret-key-change-in-prod',
  'votre_cle_secrete_jwt_a_remplacer_ici',
  'changez_cette_cle_secrete_en_production',
]);

/**
 * Détecte si une clé secrète stockée est en réalité un masque tronqué issu d'une ancienne version
 * (ex: "abcd...wxyz" ou "••••••••") afin de ne pas la considérer comme une clé valide.
 */
function isCorruptedSecretMask(key: string, val: string): boolean {
  if (!SECRET_KEYS.has(key as SettingKey)) return false;
  if (!val) return true;
  if (val.includes('••') || val.includes('...')) return true;
  return false;
}

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  DEFAULT_LANGUAGE: 'fr-FR',
  ALLOW_REGISTRATION: 'false',
  LDAP_ENABLED: 'false',
  LDAP_SEARCH_FILTER: '(&(objectClass=person)(|(uid={{username}})(cn={{username}})(mail={{username}})))',
  SSO_ENABLED: 'false',
  SSO_HEADER: 'Remote-User',
};

// In-memory cache to avoid synchronous SQLite + disk reads on every request (B-05)
let settingsCache: Map<string, string> | null = null;

function ensureCacheLoaded(): Map<string, string> {
  if (settingsCache) return settingsCache;
  settingsCache = new Map<string, string>();

  // 1. Load from config/settings.json and data/settings.json fallback first
  for (const file of [CONFIG_FILE, DATA_SETTINGS_FILE]) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string' && v.trim() !== '') {
              const dec = decryptSecret(v.trim());
              if (!isCorruptedSecretMask(k, dec)) {
                settingsCache.set(k, dec);
              }
            }
          }
        }
      }
    } catch (e) {
      logger.warn('Settings', `Impossible de lire ${file}`, { error: String(e) });
    }
  }

  // 2. Load from SQLite server_settings (overrides file)
  const dbKeys = new Set<string>();
  try {
    const rows = db.prepare('SELECT key, value FROM server_settings').all() as Array<{ key: string; value: string }>;
    for (const row of rows) {
      if (row.value && row.value.trim() !== '') {
        const dec = decryptSecret(row.value.trim());
        if (isCorruptedSecretMask(row.key, dec)) {
          // Nettoyer la valeur masquée corrompue de SQLite
          db.prepare('DELETE FROM server_settings WHERE key = ?').run(row.key);
          continue;
        }
        dbKeys.add(row.key);
        settingsCache.set(row.key, dec);
      }
    }

    // Si des clés étaient présentes dans settings.json mais absentes de SQLite, les ré-insérer dans SQLite
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO server_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    for (const [k, v] of settingsCache.entries()) {
      if (!dbKeys.has(k) && v) {
        const toStore = SECRET_KEYS.has(k as SettingKey) ? encryptSecret(v) : v;
        insertStmt.run(k, toStore);
      }
    }
  } catch (e) {
    logger.warn('Settings', 'Impossible de charger server_settings depuis SQLite', { error: String(e) });
  }

  return settingsCache;
}

export function invalidateSettingsCache(): void {
  settingsCache = null;
}

/**
 * Retrieve a configuration setting with priority:
 * 1. In-memory cache (backed by SQLite `server_settings` -> `config/settings.json`)
 * 2. Environment variables (`process.env`)
 * 3. Default values
 */
export function getSetting(key: SettingKey): string {
  const cache = ensureCacheLoaded();
  const cachedVal = cache.get(key);
  if (cachedVal !== undefined && cachedVal !== '') {
    if (key === 'JWT_SECRET' && INSECURE_JWT_DEFAULTS.has(cachedVal)) {
      // Ignore legacy insecure default
    } else {
      return cachedVal;
    }
  }

  const envVal = process.env[key];
  if (envVal && envVal.trim() !== '') {
    const trimmed = envVal.trim();
    if (key === 'JWT_SECRET' && INSECURE_JWT_DEFAULTS.has(trimmed)) {
      // Ignore legacy insecure default in .env
    } else {
      return trimmed;
    }
  }

  return DEFAULTS[key] || '';
}

/**
 * Ensure a cryptographically strong JWT_SECRET exists and is persisted (F-01)
 */
export function ensureJwtSecret(): string {
  const existing = getSetting('JWT_SECRET');
  if (existing && existing.length >= 32 && !INSECURE_JWT_DEFAULTS.has(existing)) {
    return existing;
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  setSetting('JWT_SECRET', generated);
  logger.info('Security', 'JWT_SECRET aléatoire généré et persisté dans server_settings.');
  return generated;
}

/**
 * Persist a setting in SQLite + JSON backup and update the in-memory cache
 */
export function setSetting(key: SettingKey, value: string): void {
  const cleaned = SECRET_KEYS.has(key) ? value.replace(/•+/g, '').trim() : value.trim();
  if (SECRET_KEYS.has(key) && isCorruptedSecretMask(key, cleaned)) {
    return;
  }
  const trimmed = cleaned;
  const toStore = SECRET_KEYS.has(key) ? encryptSecret(trimmed) : trimmed;

  const stmt = db.prepare(`
    INSERT INTO server_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, toStore);

  // Update in-memory cache immediately
  const cache = ensureCacheLoaded();
  if (trimmed === '') {
    cache.delete(key);
  } else {
    cache.set(key, trimmed);
  }

  // Persist to both /app/data/settings.json and /app/config/settings.json
  for (const [dir, file] of [
    [DATA_DIR, DATA_SETTINGS_FILE],
    [CONFIG_DIR, CONFIG_FILE],
  ] as const) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      let currentConfig: Record<string, string> = {};
      if (fs.existsSync(file)) {
        currentConfig = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
      currentConfig[key] = toStore;
      fs.writeFileSync(file, JSON.stringify(currentConfig, null, 2), { encoding: 'utf-8', mode: 0o600 });
    } catch (e) {
      logger.warn('Settings', `Impossible de sauvegarder dans ${file}`, { error: String(e) });
    }
  }
}

/**
 * Return all settings for the admin UI, masking secret keys without leaking prefix/suffix characters (F-09)
 */
export function getAllSettingsMasked(): Record<string, { configured: boolean; value?: string }> {
  const keys: SettingKey[] = [
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
    'SSO_URL',
    'SSO_LOGOUT_URL',
    'SSO_DISABLE_LOCAL_LOGIN',
    'INTERNAL_HOSTS_ALLOWLIST',
  ];

  const result: Record<string, { configured: boolean; value?: string }> = {};

  for (const key of keys) {
    const val = getSetting(key);
    const configured = Boolean(val && val.length > 0);

    if (SECRET_KEYS.has(key)) {
      result[key] = { configured };
    } else {
      result[key] = {
        configured,
        value: val,
      };
    }
  }

  return result;
}
