import { getSetting } from './settingsService.js';
import { assertSafeTarget } from './urlGuard.js';
import { TMDBService } from './tmdbService.js';
import db from '../db/index.js';
import { logger } from '../utils/logger.js';

interface CachedJellyfinItem {
  id: string;
  name: string;
  originalTitle?: string;
  type: 'movie' | 'tv';
  tmdbId?: string;
  year?: number;
}

interface JellyfinLibraryCache {
  expiresAt: number;
  serverUrl: string;
  byTmdbKey: Map<string, CachedJellyfinItem>;
  allItems: CachedJellyfinItem[];
}

const libraryCacheMap = new Map<string, JellyfinLibraryCache>();
const LIBRARY_CACHE_TTL_MS = 5 * 60 * 1000;

export interface JellyfinPlayingItem {
  id: string;
  title: string;
  seriesName?: string;
  type: 'Movie' | 'Episode';
  seasonNumber?: number;
  episodeNumber?: number;
  positionTicks?: number;
  runTimeTicks?: number;
  percentPlayed?: number;
  isPaused?: boolean;
}

export class JellyfinService {
  public static getServerUrl(): string {
    const globalUrl = getSetting('JELLYFIN_URL').replace(/\/$/, '').trim();
    if (globalUrl) return globalUrl;
    try {
      const row = db
        .prepare("SELECT jellyfin_server_url FROM users WHERE jellyfin_server_url IS NOT NULL AND jellyfin_server_url != '' LIMIT 1")
        .get() as { jellyfin_server_url?: string } | undefined;
      return (row?.jellyfin_server_url || '').replace(/\/$/, '').trim();
    } catch {
      return '';
    }
  }

  public static isConfigured(): boolean {
    return Boolean(this.getServerUrl());
  }

  public static clearCache(): void {
    libraryCacheMap.clear();
  }

  private static resolveCredentials(frameUserId: number): {
    userId: string;
    token: string;
    serverUrl: string;
  } | null {
    const userRow = db
      .prepare('SELECT jellyfin_user_id, jellyfin_token, jellyfin_server_url FROM users WHERE id = ?')
      .get(frameUserId) as any;

    if (userRow?.jellyfin_user_id && userRow?.jellyfin_token) {
      const url = (userRow.jellyfin_server_url || this.getServerUrl()).replace(/\/$/, '').trim();
      if (url) {
        return {
          userId: userRow.jellyfin_user_id,
          token: userRow.jellyfin_token,
          serverUrl: url,
        };
      }
    }

    // Fallback : utiliser n'importe quel compte lié sur le serveur (ex: admin) pour vérifier la disponibilité dans la médiathèque
    const fallbackRow = db
      .prepare(
        "SELECT jellyfin_user_id, jellyfin_token, jellyfin_server_url FROM users WHERE jellyfin_user_id IS NOT NULL AND jellyfin_token IS NOT NULL LIMIT 1"
      )
      .get() as any;

    if (fallbackRow?.jellyfin_user_id && fallbackRow?.jellyfin_token) {
      const url = (fallbackRow.jellyfin_server_url || this.getServerUrl()).replace(/\/$/, '').trim();
      if (url) {
        return {
          userId: fallbackRow.jellyfin_user_id,
          token: fallbackRow.jellyfin_token,
          serverUrl: url,
        };
      }
    }

    return null;
  }

  private static async getLibraryIndex(creds: {
    userId: string;
    token: string;
    serverUrl: string;
  }): Promise<JellyfinLibraryCache | null> {
    const cacheKey = `${creds.serverUrl}|${creds.userId}`;
    const existing = libraryCacheMap.get(cacheKey);
    if (existing && existing.expiresAt > Date.now()) {
      return existing;
    }

    try {
      await assertSafeTarget(creds.serverUrl);
      const res = await fetch(
        `${creds.serverUrl}/Users/${creds.userId}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds,ProductionYear,OriginalTitle`,
        {
          headers: {
            ...this.getAuthHeaders(creds.token),
            'X-MediaBrowser-Token': creds.token,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(12000),
        }
      );

      if (!res.ok) return null;

      const data = await res.json();
      const rawItems = Array.isArray(data.Items) ? data.Items : [];
      const byTmdbKey = new Map<string, CachedJellyfinItem>();
      const allItems: CachedJellyfinItem[] = [];

      for (const it of rawItems) {
        const type: 'movie' | 'tv' = it.Type === 'Movie' ? 'movie' : 'tv';
        const pids = it.ProviderIds || {};
        const rawTmdb = pids.Tmdb || pids.tmdb || pids.TMDB;
        const tmdbId = rawTmdb ? String(rawTmdb).trim() : undefined;

        const cached: CachedJellyfinItem = {
          id: it.Id,
          name: it.Name || '',
          originalTitle: it.OriginalTitle || undefined,
          type,
          tmdbId,
          year: it.ProductionYear ? Number(it.ProductionYear) : undefined,
        };

        allItems.push(cached);
        if (tmdbId) {
          byTmdbKey.set(`${type}:${tmdbId}`, cached);
        }
      }

      const entry: JellyfinLibraryCache = {
        expiresAt: Date.now() + LIBRARY_CACHE_TTL_MS,
        serverUrl: creds.serverUrl,
        byTmdbKey,
        allItems,
      };
      libraryCacheMap.set(cacheKey, entry);
      return entry;
    } catch {
      return null;
    }
  }

  private static getAuthHeaders(token?: string): Record<string, string> {
    const authHeader = `MediaBrowser Client="Frame", Device="FrameServer", DeviceId="frame-server-v1", Version="1.0.0"${
      token ? `, Token="${token}"` : ''
    }`;
    return {
      'X-Emby-Authorization': authHeader,
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Tester la connexion à une URL de serveur Jellyfin (protégé contre SSRF - F-02)
   */
  public static async testServer(customUrl?: string): Promise<{ success: boolean; version?: string; serverName?: string; message: string }> {
    const url = (customUrl || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url) {
      return { success: false, message: 'URL du serveur Jellyfin non configurée.' };
    }

    try {
      await assertSafeTarget(url);
      const res = await fetch(`${url}/System/Info/Public`, {
        headers: { Accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return {
          success: false,
          message: `Le serveur a répondu avec le code HTTP ${res.status}. Vérifiez l'URL (ex: http://192.168.1.x:8096).`,
        };
      }
      const data = await res.json();
      return {
        success: true,
        version: data.Version,
        serverName: data.ServerName,
        message: `Connecté à Jellyfin "${data.ServerName || 'Serveur'}" (v${data.Version})`,
      };
    } catch (err: any) {
      logger.warn('Jellyfin', 'Échec testServer', { url, error: err?.message });
      if (err?.message?.includes('Hôte interne refusé') || err?.message?.includes('URL invalide') || err?.message?.includes('Protocole non autorisé')) {
        return { success: false, message: err.message };
      }
      return {
        success: false,
        message: `Impossible de joindre Jellyfin à l'adresse "${url}". Vérifiez que le conteneur Frame a accès à cette IP/port.`,
      };
    }
  }

  /**
   * Authentifier un utilisateur sur le serveur Jellyfin via nom d'utilisateur et mot de passe
   */
  public static async authenticateUser(
    username: string,
    password?: string,
    customServerUrl?: string
  ): Promise<{ userId: string; accessToken: string; serverName?: string; serverUrl: string }> {
    const url = (customServerUrl || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url) {
      throw new Error("Veuillez saisir l'URL de votre serveur Jellyfin (ex: http://192.168.1.50:8096).");
    }

    await assertSafeTarget(url);

    let res: Response;
    try {
      res = await fetch(`${url}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          Username: username.trim(),
          Pw: password || '',
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    } catch (netErr: any) {
      logger.warn('Jellyfin', 'Erreur réseau authenticateUser', { url, error: netErr?.message });
      throw new Error(
        `Impossible de joindre le serveur Jellyfin (${url}). Si Frame est dans Docker, utilisez l'IP locale du serveur (ex: http://192.168.x.x:8096) et non localhost.`
      );
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          `Identifiants refusés par Jellyfin (401). Astuce : Si vous utilisez LDAP ou SSO sur Jellyfin, utilisez l'onglet « Clé API » juste à côté.`
        );
      }
      throw new Error(`Erreur Jellyfin (${res.status}) lors de l'authentification.`);
    }

    const data = await res.json();
    return {
      userId: data.User.Id,
      accessToken: data.AccessToken,
      serverUrl: url,
    };
  }

  /**
   * Authentifier un utilisateur sur Jellyfin via une Clé API (idéal si LDAP/SSO actif ou mot de passe refusé)
   */
  public static async authenticateWithApiKey(
    apiKey: string,
    username?: string,
    customServerUrl?: string
  ): Promise<{ userId: string; accessToken: string; username: string; serverUrl: string }> {
    const url = (customServerUrl || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url) {
      throw new Error("Veuillez saisir l'URL de votre serveur Jellyfin.");
    }

    await assertSafeTarget(url);

    const cleanKey = apiKey.trim();
    let res: Response;
    try {
      res = await fetch(`${url}/Users`, {
        headers: {
          ...this.getAuthHeaders(cleanKey),
          'X-MediaBrowser-Token': cleanKey,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      });
    } catch (netErr: any) {
      logger.warn('Jellyfin', 'Erreur réseau authenticateWithApiKey', { url, error: netErr?.message });
      throw new Error(`Impossible de joindre le serveur Jellyfin (${url}).`);
    }

    if (!res.ok) {
      throw new Error(`Clé API Jellyfin invalide ou refusée (code HTTP ${res.status}).`);
    }

    const users = await res.json();
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error('Aucun utilisateur trouvé sur ce serveur Jellyfin.');
    }

    let matchedUser = users[0];
    if (username && username.trim()) {
      const target = username.trim().toLowerCase();
      const found = users.find((u: any) => u.Name && u.Name.toLowerCase() === target);
      if (!found) {
        const availableNames = users.map((u: any) => u.Name).join(', ');
        throw new Error(`Utilisateur "${username}" introuvable sur Jellyfin. Utilisateurs existants : ${availableNames}`);
      }
      matchedUser = found;
    }

    return {
      userId: matchedUser.Id,
      accessToken: cleanKey,
      username: matchedUser.Name,
      serverUrl: url,
    };
  }

  /**
   * Vérifier si un média (par son TMDB ID) est présent dans la médiathèque Jellyfin (compatible Jellyfin 10.8, 10.9+ et 12.x)
   */
  public static async findItemByTmdbId(
    frameUserId: number,
    mediaType: 'movie' | 'tv',
    tmdbId: number,
    expectedTitle?: string,
    expectedYear?: number
  ): Promise<{ inJellyfin: boolean; itemId?: string; name?: string; serverUrl?: string }> {
    const creds = this.resolveCredentials(frameUserId);
    if (!creds) {
      return { inJellyfin: false };
    }

    const { userId, token, serverUrl: url } = creds;

    try {
      await assertSafeTarget(url);
      const targetTmdbStr = String(tmdbId);

      // Stratégie 1 : Index complet en mémoire de la médiathèque Jellyfin (ultra-rapide et fiable sur Jellyfin v10.9+ / v12.x)
      const index = await this.getLibraryIndex(creds);
      if (index) {
        const directMatch = index.byTmdbKey.get(`${mediaType}:${targetTmdbStr}`);
        if (directMatch) {
          return {
            inJellyfin: true,
            itemId: directMatch.id,
            name: directMatch.name,
            serverUrl: url,
          };
        }

        if (expectedTitle) {
          const cleanExpected = expectedTitle.trim().toLowerCase();
          const titleMatch = index.allItems.find((it) => {
            if (it.type !== mediaType) return false;
            if (it.tmdbId && it.tmdbId !== targetTmdbStr) return false;
            const nameMatches =
              it.name.trim().toLowerCase() === cleanExpected ||
              it.originalTitle?.trim().toLowerCase() === cleanExpected;
            const yearMatches =
              !expectedYear || !it.year || Math.abs(it.year - expectedYear) <= 1;
            return nameMatches && yearMatches;
          });

          if (titleMatch) {
            return {
              inJellyfin: true,
              itemId: titleMatch.id,
              name: titleMatch.name,
              serverUrl: url,
            };
          }
        }
      }

      // Stratégie 2 : Recherche directe par AnyProviderIdEquals + SearchTerm en fallback
      const includeType = mediaType === 'movie' ? 'Movie' : 'Series';
      const res = await fetch(
        `${url}/Users/${userId}/Items?Recursive=true&IncludeItemTypes=${includeType}&Fields=ProviderIds,ProductionYear,OriginalTitle&AnyProviderIdEquals=tmdb.${tmdbId}`,
        {
          headers: {
            ...this.getAuthHeaders(token),
            'X-MediaBrowser-Token': token,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const items = data.Items || [];

        const exactMatch = items.find((it: any) => {
          const pids = it.ProviderIds || {};
          const itemTmdb = pids.Tmdb || pids.tmdb || pids.TMDB;
          return itemTmdb && String(itemTmdb) === targetTmdbStr;
        });

        if (exactMatch) {
          return {
            inJellyfin: true,
            itemId: exactMatch.Id,
            name: exactMatch.Name,
            serverUrl: url,
          };
        }
      }

      if (expectedTitle) {
        const searchRes = await fetch(
          `${url}/Users/${userId}/Items?Recursive=true&IncludeItemTypes=${includeType}&Fields=ProviderIds,ProductionYear,OriginalTitle&SearchTerm=${encodeURIComponent(expectedTitle)}&Limit=20`,
          {
            headers: {
              ...this.getAuthHeaders(token),
              'X-MediaBrowser-Token': token,
            },
            redirect: 'manual',
            signal: AbortSignal.timeout(8000),
          }
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const candidates = searchData.Items || [];
          const cleanExpected = expectedTitle.trim().toLowerCase();

          for (const it of candidates) {
            const pids = it.ProviderIds || {};
            const itemTmdb = pids.Tmdb || pids.tmdb || pids.TMDB;

            if (itemTmdb && String(itemTmdb) === targetTmdbStr) {
              return { inJellyfin: true, itemId: it.Id, name: it.Name, serverUrl: url };
            }

            if (itemTmdb && String(itemTmdb) !== targetTmdbStr) {
              continue;
            }

            const nameMatch =
              it.Name?.trim().toLowerCase() === cleanExpected ||
              it.OriginalTitle?.trim().toLowerCase() === cleanExpected;

            const yearMatch =
              !expectedYear ||
              !it.ProductionYear ||
              Math.abs(Number(it.ProductionYear) - expectedYear) <= 1;

            if (nameMatch && yearMatch) {
              return { inJellyfin: true, itemId: it.Id, name: it.Name, serverUrl: url };
            }
          }
        }
      }

      return { inJellyfin: false };
    } catch {
      return { inJellyfin: false };
    }
  }

  /**
   * Obtenir le média en cours de lecture pour un utilisateur Frame lié à Jellyfin
   */
  public static async getCurrentlyPlaying(frameUserId: number): Promise<JellyfinPlayingItem[]> {
    const userRow = db
      .prepare('SELECT jellyfin_user_id, jellyfin_token, jellyfin_server_url FROM users WHERE id = ?')
      .get(frameUserId) as any;

    const url = (userRow?.jellyfin_server_url || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url || !userRow || !userRow.jellyfin_user_id || !userRow.jellyfin_token) {
      return [];
    }

    try {
      await assertSafeTarget(url);
      const res = await fetch(`${url}/Sessions`, {
        headers: {
          ...this.getAuthHeaders(userRow.jellyfin_token),
          'X-MediaBrowser-Token': userRow.jellyfin_token,
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return [];

      const sessions = await res.json();
      const userSessions = sessions.filter(
        (s: any) => s.UserId === userRow.jellyfin_user_id && s.NowPlayingItem
      );

      return userSessions.map((s: any) => {
        const item = s.NowPlayingItem;
        const playState = s.PlayState || {};
        const positionTicks = playState.PositionTicks || 0;
        const runTimeTicks = item.RunTimeTicks || 1;
        const percentPlayed = Math.min(100, Math.round((positionTicks / runTimeTicks) * 100));

        return {
          id: item.Id,
          title: item.Name,
          seriesName: item.SeriesName,
          type: item.Type,
          seasonNumber: item.ParentIndexNumber,
          episodeNumber: item.IndexNumber,
          positionTicks,
          runTimeTicks,
          percentPlayed,
          isPaused: Boolean(playState.IsPaused),
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Synchroniser les films et séries marqués comme "Lus" (Played) dans Jellyfin vers Frame
   * avec enrichissement des affiches, durées et dates via Jellyfin + TMDB
   */
  public static async syncWatchedFromJellyfin(frameUserId: number): Promise<{ importedMovies: number; importedShows: number }> {
    const userRow = db
      .prepare('SELECT jellyfin_user_id, jellyfin_token, jellyfin_server_url FROM users WHERE id = ?')
      .get(frameUserId) as any;

    const url = (userRow?.jellyfin_server_url || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url || !userRow || !userRow.jellyfin_user_id || !userRow.jellyfin_token) {
      throw new Error("Votre compte Jellyfin n'est pas encore lié.");
    }

    await assertSafeTarget(url);
    this.clearCache();

    let importedMovies = 0;
    let importedShows = 0;

    const headers = {
      ...this.getAuthHeaders(userRow.jellyfin_token),
      'X-MediaBrowser-Token': userRow.jellyfin_token,
    };

    const insertStmt = db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path,
        release_date, runtime, overview, watched_at, season_number, episode_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        title = COALESCE(watched_items.title, excluded.title),
        poster_path = COALESCE(watched_items.poster_path, excluded.poster_path),
        backdrop_path = COALESCE(watched_items.backdrop_path, excluded.backdrop_path),
        release_date = COALESCE(watched_items.release_date, excluded.release_date),
        runtime = CASE WHEN watched_items.runtime > 0 THEN watched_items.runtime ELSE excluded.runtime END,
        overview = COALESCE(watched_items.overview, excluded.overview),
        watched_at = COALESCE(watched_items.watched_at, excluded.watched_at)
    `);

    const nowIso = new Date().toISOString();
    const toEnrich: Array<{ tmdbId: number; mediaType: 'movie' | 'tv' }> = [];

    // 1. Récupérer les films vus avec leurs ProviderIds (Tmdb)
    const moviesRes = await fetch(
      `${url}/Users/${userRow.jellyfin_user_id}/Items?IncludeItemTypes=Movie&Recursive=true&Filters=IsPlayed&Fields=ProviderIds,ProductionYear,PremiereDate,RunTimeTicks,Overview`,
      { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) }
    );

    if (moviesRes.ok) {
      const moviesData = await moviesRes.json();
      for (const item of moviesData.Items || []) {
        const pids = item.ProviderIds || {};
        const rawTmdb = pids.Tmdb || pids.tmdb || pids.TMDB;
        const tmdbId = rawTmdb ? parseInt(String(rawTmdb), 10) : null;
        if (tmdbId) {
          const releaseDate = item.PremiereDate
            ? String(item.PremiereDate).slice(0, 10)
            : item.ProductionYear
            ? `${item.ProductionYear}-01-01`
            : null;
          const runtime = item.RunTimeTicks
            ? Math.max(1, Math.round(Number(item.RunTimeTicks) / 600000000))
            : 115;
          const watchedAt = item.UserData?.LastPlayedDate
            ? new Date(item.UserData.LastPlayedDate).toISOString()
            : nowIso;

          insertStmt.run(
            frameUserId,
            tmdbId,
            'movie',
            item.Name || 'Film',
            null,
            null,
            releaseDate,
            runtime,
            item.Overview || null,
            watchedAt
          );
          toEnrich.push({ tmdbId, mediaType: 'movie' });
          importedMovies++;
        }
      }
    }

    // 2. Récupérer les séries vues
    const showsRes = await fetch(
      `${url}/Users/${userRow.jellyfin_user_id}/Items?IncludeItemTypes=Series&Recursive=true&Filters=IsPlayed&Fields=ProviderIds,ProductionYear,PremiereDate,RunTimeTicks,Overview`,
      { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) }
    );

    if (showsRes.ok) {
      const showsData = await showsRes.json();
      for (const item of showsData.Items || []) {
        const pids = item.ProviderIds || {};
        const rawTmdb = pids.Tmdb || pids.tmdb || pids.TMDB;
        const tmdbId = rawTmdb ? parseInt(String(rawTmdb), 10) : null;
        if (tmdbId) {
          const releaseDate = item.PremiereDate
            ? String(item.PremiereDate).slice(0, 10)
            : item.ProductionYear
            ? `${item.ProductionYear}-01-01`
            : null;
          const watchedAt = item.UserData?.LastPlayedDate
            ? new Date(item.UserData.LastPlayedDate).toISOString()
            : nowIso;

          insertStmt.run(
            frameUserId,
            tmdbId,
            'tv',
            item.Name || 'Série',
            null,
            null,
            releaseDate,
            450,
            item.Overview || null,
            watchedAt
          );
          toEnrich.push({ tmdbId, mediaType: 'tv' });
          importedShows++;
        }
      }
    }

    // 3. Enrichir les affiches (poster_path, backdrop_path, genres) depuis TMDB si configuré
    if (TMDBService.isConfigured() && toEnrich.length > 0) {
      const updateMetaStmt = db.prepare(`
        UPDATE watched_items
        SET poster_path = COALESCE(poster_path, ?),
            backdrop_path = COALESCE(backdrop_path, ?),
            release_date = COALESCE(release_date, ?),
            genres = COALESCE(genres, ?),
            overview = COALESCE(overview, ?)
        WHERE user_id = ? AND tmdb_id = ? AND media_type = ?
      `);

      const missingPosterRows = db
        .prepare(
          'SELECT tmdb_id, media_type FROM watched_items WHERE user_id = ? AND poster_path IS NULL AND season_number = 0 LIMIT 40'
        )
        .all(frameUserId) as Array<{ tmdb_id: number; media_type: 'movie' | 'tv' }>;

      for (const row of missingPosterRows) {
        try {
          const details = await TMDBService.getMediaDetails(
            row.media_type === 'movie' ? 'movie' : 'tv',
            row.tmdb_id
          );
          if (details) {
            updateMetaStmt.run(
              details.poster_path || null,
              details.backdrop_path || null,
              details.release_date || null,
              details.genres ? JSON.stringify(details.genres) : null,
              details.overview || null,
              frameUserId,
              row.tmdb_id,
              row.media_type
            );
          }
        } catch {
          // Ignorer les erreurs individuelles TMDB
        }
      }
    }

    return { importedMovies, importedShows };
  }
}
