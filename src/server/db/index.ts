import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'frame.db');
const db = new DatabaseSync(dbPath);

// Durcissement des permissions du fichier SQLite (F-10)
try {
  if (fs.existsSync(dbPath)) {
    fs.chmodSync(dbPath, 0o600);
  }
} catch {
  // Ignoré sur les systèmes de fichiers ne supportant pas chmod (ex: Windows)
}

// Activer le mode WAL et les clés étrangères
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    -- Table de suivi des migrations de schéma (D-06)
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    -- Table des paramètres globaux du serveur
    CREATE TABLE IF NOT EXISTS server_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Table des utilisateurs
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', -- 'admin' | 'user'
      display_name TEXT,
      avatar_url TEXT,
      auth_provider TEXT DEFAULT 'local', -- 'local' | 'ldap' | 'sso'
      simkl_token TEXT,
      simkl_refresh_token TEXT,
      simkl_user_id TEXT,
      simkl_client_id TEXT,
      simkl_client_secret TEXT,
      simkl_stats_json TEXT,
      simkl_last_sync_at TEXT,
      simkl_last_sync_status TEXT,
      simkl_last_sync_error TEXT,
      simkl_auto_sync INTEGER DEFAULT 1,
      jellyfin_user_id TEXT,
      jellyfin_token TEXT,
      jellyfin_server_url TEXT,
      seer_user_id INTEGER,
      pref_include_movies INTEGER DEFAULT 1,
      pref_include_tv INTEGER DEFAULT 1,
      pref_include_anime INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Table des films, séries & mangas déjà vus (avec support épisode par épisode)
    CREATE TABLE IF NOT EXISTS watched_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL, -- 'movie' | 'tv' | 'manga'
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      release_date TEXT,
      genres TEXT, -- JSON array
      overview TEXT,
      watched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      rating REAL, -- Note sur 10
      review TEXT,
      season_number INTEGER DEFAULT 0,
      episode_number INTEGER DEFAULT 0,
      runtime INTEGER DEFAULT 0,
      director TEXT,
      director_image TEXT,
      UNIQUE(user_id, tmdb_id, media_type, season_number, episode_number),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Table de la Watchlist ("À regarder plus tard" / "En cours")
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tmdb_id INTEGER NOT NULL,
      media_type TEXT NOT NULL, -- 'movie' | 'tv' | 'manga'
      title TEXT NOT NULL,
      poster_path TEXT,
      backdrop_path TEXT,
      release_date TEXT,
      genres TEXT, -- JSON array
      overview TEXT,
      status TEXT DEFAULT 'plan_to_watch', -- 'plan_to_watch' | 'watching' | 'on_hold' | 'dropped'
      added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      UNIQUE(user_id, tmdb_id, media_type),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Cache local des réponses TMDB
    CREATE TABLE IF NOT EXISTS tmdb_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    -- =======================================================================
    -- MOTEUR DE RECOMMANDATION V2 (RECOMMANDATIONS-FRAME)
    -- =======================================================================

    -- 1. Catalogue local de features par média
    CREATE TABLE IF NOT EXISTS media_features (
      media_type TEXT NOT NULL,
      tmdb_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      original_title TEXT,
      original_lang TEXT,
      release_year INTEGER,
      runtime INTEGER,
      vote_average REAL,
      vote_count INTEGER,
      popularity REAL,
      genres_json TEXT,
      keywords_json TEXT,
      directors_json TEXT,
      cast_json TEXT,
      countries_json TEXT,
      collection_id INTEGER,
      poster_path TEXT,
      backdrop_path TEXT,
      overview TEXT,
      is_anime INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (media_type, tmdb_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mf_pop ON media_features(media_type, popularity DESC);
    CREATE INDEX IF NOT EXISTS idx_mf_anime ON media_features(is_anime, vote_average DESC);

    -- 2. Profil de goût pré-calculé par utilisateur (long-terme + court-terme)
    CREATE TABLE IF NOT EXISTS user_taste (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      vec_long_json TEXT NOT NULL,
      vec_short_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- 3. Feedback implicite & explicite sur les recommandations
    CREATE TABLE IF NOT EXISTS reco_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL,
      tmdb_id INTEGER NOT NULL,
      section TEXT,
      event TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_re_user ON reco_events(user_id, created_at DESC);

    -- 4. Exclusions définitives ("Pas intéressé")
    CREATE TABLE IF NOT EXISTS reco_exclusions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL,
      tmdb_id INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, media_type, tmdb_id)
    );

    -- 5. Poids personnalisés du bandit contextuel LinUCB
    CREATE TABLE IF NOT EXISTS user_reco_weights (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      a_json TEXT NOT NULL,
      b_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrations automatiques pour bases existantes
  const userAlterCols = [
    'ALTER TABLE users ADD COLUMN display_name TEXT',
    'ALTER TABLE users ADD COLUMN avatar_url TEXT',
    "ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'",
    'ALTER TABLE users ADD COLUMN simkl_token TEXT',
    'ALTER TABLE users ADD COLUMN simkl_refresh_token TEXT',
    'ALTER TABLE users ADD COLUMN simkl_user_id TEXT',
    'ALTER TABLE users ADD COLUMN simkl_client_id TEXT',
    'ALTER TABLE users ADD COLUMN simkl_client_secret TEXT',
    'ALTER TABLE users ADD COLUMN simkl_stats_json TEXT',
    'ALTER TABLE users ADD COLUMN simkl_last_sync_at TEXT',
    'ALTER TABLE users ADD COLUMN simkl_last_sync_status TEXT',
    'ALTER TABLE users ADD COLUMN simkl_last_sync_error TEXT',
    'ALTER TABLE users ADD COLUMN simkl_auto_sync INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN jellyfin_user_id TEXT',
    'ALTER TABLE users ADD COLUMN jellyfin_token TEXT',
    'ALTER TABLE users ADD COLUMN jellyfin_server_url TEXT',
    'ALTER TABLE users ADD COLUMN seer_user_id INTEGER',
    'ALTER TABLE users ADD COLUMN pref_include_movies INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN pref_include_tv INTEGER DEFAULT 1',
    'ALTER TABLE users ADD COLUMN pref_include_anime INTEGER DEFAULT 0',
    'ALTER TABLE users ADD COLUMN sso_alias TEXT',
  ];

  for (const sql of userAlterCols) {
    try {
      db.exec(sql);
    } catch {
      // La colonne existe déjà
    }
  }

  // Migrer les anciennes colonnes simkl_access_token / jellyfin_access_token vers simkl_token / jellyfin_token si présentes
  try {
    const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const colNames = new Set(userCols.map((c) => c.name));
    if (colNames.has('simkl_access_token')) {
      db.exec(
        'UPDATE users SET simkl_token = COALESCE(simkl_token, simkl_access_token) WHERE simkl_token IS NULL AND simkl_access_token IS NOT NULL'
      );
    }
    if (colNames.has('jellyfin_access_token')) {
      db.exec(
        'UPDATE users SET jellyfin_token = COALESCE(jellyfin_token, jellyfin_access_token) WHERE jellyfin_token IS NULL AND jellyfin_access_token IS NOT NULL'
      );
    }
  } catch {
    // Ignorer
  }

  const watchedAlterCols = [
    'ALTER TABLE watched_items ADD COLUMN poster_path TEXT',
    'ALTER TABLE watched_items ADD COLUMN backdrop_path TEXT',
    'ALTER TABLE watched_items ADD COLUMN release_date TEXT',
    'ALTER TABLE watched_items ADD COLUMN genres TEXT',
    'ALTER TABLE watched_items ADD COLUMN overview TEXT',
    'ALTER TABLE watched_items ADD COLUMN rating REAL',
    'ALTER TABLE watched_items ADD COLUMN review TEXT',
    'ALTER TABLE watched_items ADD COLUMN runtime INTEGER DEFAULT 0',
    'ALTER TABLE watched_items ADD COLUMN director TEXT',
    'ALTER TABLE watched_items ADD COLUMN director_image TEXT',
    'ALTER TABLE watched_items ADD COLUMN season_number INTEGER DEFAULT 0',
    'ALTER TABLE watched_items ADD COLUMN episode_number INTEGER DEFAULT 0',
  ];

  for (const sql of watchedAlterCols) {
    try {
      db.exec(sql);
    } catch {
      // La colonne existe déjà
    }
  }

  try {
    const watchedCols = db.prepare('PRAGMA table_info(watched_items)').all() as Array<{ name: string }>;
    const wColNames = new Set(watchedCols.map((c) => c.name));
    if (wColNames.has('runtime_minutes')) {
      db.exec(
        'UPDATE watched_items SET runtime = COALESCE(NULLIF(runtime, 0), runtime_minutes) WHERE (runtime IS NULL OR runtime = 0) AND runtime_minutes > 0'
      );
    }
  } catch {
    // Ignorer
  }

  // Migration de contrainte UNIQUE sur watched_items pour supporter le suivi par épisode
  try {
    const tableSql = db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='watched_items'")
      .get() as { sql?: string } | undefined;

    if (tableSql?.sql && !tableSql.sql.includes('season_number, episode_number')) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS watched_items_v2 (
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
          watched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
          rating REAL,
          review TEXT,
          season_number INTEGER DEFAULT 0,
          episode_number INTEGER DEFAULT 0,
          runtime INTEGER DEFAULT 0,
          director TEXT,
          director_image TEXT,
          UNIQUE(user_id, tmdb_id, media_type, season_number, episode_number),
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT OR IGNORE INTO watched_items_v2 (
          id, user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
          release_date, genres, overview, watched_at, rating, review,
          season_number, episode_number, runtime, director, director_image
        )
        SELECT
          id, user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
          release_date, genres, overview, watched_at, rating, review,
          COALESCE(season_number, 0), COALESCE(episode_number, 0),
          COALESCE(runtime, 0), director, director_image
        FROM watched_items;
        DROP TABLE watched_items;
        ALTER TABLE watched_items_v2 RENAME TO watched_items;
      `);
    }
  } catch (e) {
    console.warn('[Database] Info migration watched_items:', e);
  }

  // Normalisation ISO-8601 UTC des dates existantes pour le tri exact (U-03)
  try {
    db.exec(`
      UPDATE watched_items
      SET watched_at = replace(watched_at, ' ', 'T') || 'Z'
      WHERE watched_at LIKE '____-__-__ __:__:__';

      UPDATE watchlist
      SET added_at = replace(added_at, ' ', 'T') || 'Z'
      WHERE added_at LIKE '____-__-__ __:__:__';
    `);
  } catch (e) {
    console.warn('[Database] Info normalisation dates:', e);
  }

  // Index composites pour tri et requêtes rapides (U-01, U-03)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_watched_user_date ON watched_items(user_id, watched_at DESC);
    CREATE INDEX IF NOT EXISTS idx_watched_user_series ON watched_items(user_id, media_type, tmdb_id);
    CREATE INDEX IF NOT EXISTS idx_watchlist_user_date ON watchlist(user_id, added_at DESC);
  `);

  // Enregistrer la migration courante
  try {
    db.prepare(`
      INSERT OR IGNORE INTO schema_migrations (version, name, applied_at)
      VALUES (2, 'security_roadmap_reco_v2', ?)
    `).run(new Date().toISOString());
  } catch {
    // Ignorer
  }

  console.log(`[Database] SQLite initialisée avec succès dans ${dbPath}`);
}

export { db };
export default db;
