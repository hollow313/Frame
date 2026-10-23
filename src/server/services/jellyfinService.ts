import { getSetting } from './settingsService.js';
import { assertSafeTarget } from './urlGuard.js';
import db from '../db/index.js';
import { logger } from '../utils/logger.js';

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
    return getSetting('JELLYFIN_URL').replace(/\/$/, '').trim();
  }

  public static isConfigured(): boolean {
    return Boolean(this.getServerUrl());
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
   * Vérifier si un média (par son TMDB ID) est présent dans la médiathèque Jellyfin de l'utilisateur
   */
  public static async findItemByTmdbId(
    frameUserId: number,
    mediaType: 'movie' | 'tv',
    tmdbId: number,
    expectedTitle?: string,
    expectedYear?: number
  ): Promise<{ inJellyfin: boolean; itemId?: string; name?: string; serverUrl?: string }> {
    const userRow = db
      .prepare('SELECT jellyfin_user_id, jellyfin_token, jellyfin_server_url FROM users WHERE id = ?')
      .get(frameUserId) as any;

    const url = (userRow?.jellyfin_server_url || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url || !userRow || !userRow.jellyfin_user_id || !userRow.jellyfin_token) {
      return { inJellyfin: false };
    }

    try {
      await assertSafeTarget(url);
      const includeType = mediaType === 'movie' ? 'Movie' : 'Series';
      const targetTmdbStr = String(tmdbId);

      // Stratégie 1 : Recherche par ProviderIds=Tmdb.xxxx
      const res = await fetch(
        `${url}/Users/${userRow.jellyfin_user_id}/Items?Recursive=true&IncludeItemTypes=${includeType}&Fields=ProviderIds,ProductionYear,OriginalTitle&AnyProviderIdEquals=tmdb.${tmdbId}`,
        {
          headers: {
            ...this.getAuthHeaders(userRow.jellyfin_token),
            'X-MediaBrowser-Token': userRow.jellyfin_token,
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

      // Stratégie 2 : Recherche textuelle stricte par SearchTerm si un titre est fourni
      if (expectedTitle) {
        const searchRes = await fetch(
          `${url}/Users/${userRow.jellyfin_user_id}/Items?Recursive=true&IncludeItemTypes=${includeType}&Fields=ProviderIds,ProductionYear,OriginalTitle&SearchTerm=${encodeURIComponent(expectedTitle)}&Limit=20`,
          {
            headers: {
              ...this.getAuthHeaders(userRow.jellyfin_token),
              'X-MediaBrowser-Token': userRow.jellyfin_token,
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
   */
  public static async syncWatchedFromJellyfin(frameUserId: number): Promise<{ importedMovies: number; importedShows: number }> {
    const userRow = db
      .prepare('SELECT jellyfin_user_id, jellyfin_token, jellyfin_server_url FROM users WHERE id = ?')
      .get(frameUserId) as any;

    const url = (userRow?.jellyfin_server_url || this.getServerUrl()).replace(/\/$/, '').trim();
    if (!url || !userRow || !userRow.jellyfin_user_id || !userRow.jellyfin_token) {
      throw new Error('Votre compte Jellyfin n\'est pas encore lié.');
    }

    await assertSafeTarget(url);

    let importedMovies = 0;
    let importedShows = 0;

    const headers = {
      ...this.getAuthHeaders(userRow.jellyfin_token),
      'X-MediaBrowser-Token': userRow.jellyfin_token,
    };

    const insertStmt = db.prepare(`
      INSERT INTO watched_items (user_id, tmdb_id, media_type, title, watched_at, season_number, episode_number)
      VALUES (?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        title = excluded.title,
        watched_at = COALESCE(watched_items.watched_at, excluded.watched_at)
    `);

    const nowIso = new Date().toISOString();

    // 1. Récupérer les films vus avec leurs ProviderIds (Tmdb)
    const moviesRes = await fetch(
      `${url}/Users/${userRow.jellyfin_user_id}/Items?IncludeItemTypes=Movie&Recursive=true&Filters=IsPlayed&Fields=ProviderIds`,
      { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) }
    );

    if (moviesRes.ok) {
      const moviesData = await moviesRes.json();
      for (const item of moviesData.Items || []) {
        const tmdbId = item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null;
        if (tmdbId) {
          insertStmt.run(frameUserId, tmdbId, 'movie', item.Name || 'Film', nowIso);
          importedMovies++;
        }
      }
    }

    // 2. Récupérer les séries vues
    const showsRes = await fetch(
      `${url}/Users/${userRow.jellyfin_user_id}/Items?IncludeItemTypes=Series&Recursive=true&Filters=IsPlayed&Fields=ProviderIds`,
      { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) }
    );

    if (showsRes.ok) {
      const showsData = await showsRes.json();
      for (const item of showsData.Items || []) {
        const tmdbId = item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null;
        if (tmdbId) {
          insertStmt.run(frameUserId, tmdbId, 'tv', item.Name || 'Série', nowIso);
          importedShows++;
        }
      }
    }

    return { importedMovies, importedShows };
  }
}
