import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Déterminer le chemin de stockage de la base de données
const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'frame.db');
const db = new DatabaseSync(dbPath);

// Configuration des performances et contraintes
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA synchronous = NORMAL;');

// Initialisation du schéma
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      display_name TEXT,
      avatar_url TEXT,
      auth_provider TEXT DEFAULT 'local',
      simkl_access_token TEXT,
      simkl_user_id TEXT,
      seer_user_id INTEGER,
      jellyfin_user_id TEXT,
      jellyfin_access_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS watched_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      release_date TEXT,
      genres TEXT,
      overview TEXT,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      rating INTEGER,
      review TEXT,
      season_number INTEGER DEFAULT 0,
      episode_number INTEGER DEFAULT 0,
      synced_simkl INTEGER DEFAULT 0,
      synced_jellyfin INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, tmdb_id, media_type, season_number, episode_number)
    );

    CREATE INDEX IF NOT EXISTS idx_watched_user ON watched_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_watched_media ON watched_items(tmdb_id, media_type);

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      release_date TEXT,
      genres TEXT,
      overview TEXT,
      status TEXT DEFAULT 'plan_to_watch',
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, tmdb_id, media_type)
    );

    CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);

    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_cache (
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(tmdb_id, media_type)
    );
  `);

  // Migrations douces des colonnes si la table existait déjà
  const alterColumns = [
    'ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT "local"',
    'ALTER TABLE users ADD COLUMN jellyfin_user_id TEXT',
    'ALTER TABLE users ADD COLUMN jellyfin_access_token TEXT',
    'ALTER TABLE users ADD COLUMN jellyfin_server_url TEXT',
    'ALTER TABLE users ADD COLUMN simkl_client_id TEXT',
    'ALTER TABLE users ADD COLUMN pref_include_movies INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN pref_include_tv INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN pref_include_anime INTEGER DEFAULT 0',
    'ALTER TABLE watched_items ADD COLUMN synced_jellyfin INTEGER DEFAULT 0',
  ];

  for (const query of alterColumns) {
    try {
      db.exec(query);
    } catch {
      // Colonne déjà existante
    }
  }

  console.log(`[Database] SQLite initialisée avec succès dans ${dbPath}`);
}

export default db;
