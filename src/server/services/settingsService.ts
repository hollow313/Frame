import db from '../db/index.js';
import fs from 'node:fs';
import path from 'node:path';

const configDir = process.env.CONFIG_DIR || path.resolve(process.cwd(), 'config');
const configFile = path.join(configDir, 'config.json');

// Clés supportées
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
  | 'JELLYFIN_URL'
  | 'JELLYFIN_API_KEY';

export function getSetting(key: SettingKey): string {
  // 1. Priorité aux variables d'environnement
  if (process.env[key]) {
    return process.env[key] as string;
  }

  // 2. Base de données SQLite
  try {
    const stmt = db.prepare('SELECT value FROM server_settings WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    if (row && row.value !== undefined) {
      return row.value;
    }
  } catch (err) {
    // Erreur de lecture éventuelle avant init
  }

  // 3. Fichier config.json s'il existe
  try {
    if (fs.existsSync(configFile)) {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (data[key] !== undefined) {
        return data[key];
      }
    }
  } catch (err) {
    // Ignorer si fichier invalide
  }

  // Valeurs par défaut
  if (key === 'DEFAULT_LANGUAGE') return 'fr-FR';
  if (key === 'JWT_SECRET') return 'frame-default-jwt-secret-key-change-in-prod';
  if (key === 'ALLOW_REGISTRATION') return 'false'; // Par défaut, pas d'inscription libre publique
  if (key === 'LDAP_ENABLED') return 'false';
  if (key === 'LDAP_SEARCH_FILTER') return '(&(objectClass=person)(|(uid={{username}})(mail={{username}})))';
  if (key === 'SSO_ENABLED') return 'false';
  if (key === 'SSO_HEADER') return 'Remote-User';
  // Client ID Simkl par défaut pour l'autorisation PIN intégrée
  if (key === 'SIMKL_CLIENT_ID') return 'c4cb413d31b79bf10e4530fcb749d217983ea1fa9ef310ba0a56bd3aa2674e14';
  return '';
}

export function setSetting(key: SettingKey, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO server_settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, value);
}

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

  const result: Record<string, { configured: boolean; value?: string }> = {};

  for (const k of keys) {
    const val = getSetting(k);
    const configured = Boolean(val && val.trim().length > 0 && val !== 'false');

    // Les URLs, flags booléens, identifiants publics et filtres sont lisibles en clair
    if (
      k.endsWith('_URL') ||
      k.endsWith('_ENABLED') ||
      k === 'DEFAULT_LANGUAGE' ||
      k === 'ALLOW_REGISTRATION' ||
      k === 'SEER_DEFAULT_USER_ID' ||
      k === 'SIMKL_CLIENT_ID' ||
      k === 'SSO_HEADER' ||
      k === 'LDAP_BASE_DN' ||
      k === 'LDAP_BIND_DN' ||
      k === 'LDAP_SEARCH_FILTER'
    ) {
      result[k] = { configured, value: val };
    } else {
      result[k] = {
        configured,
        value: configured ? (val.length > 8 ? `${val.substring(0, 4)}...${val.substring(val.length - 4)}` : '••••••••') : ''
      };
    }
  }

  return result;
}
