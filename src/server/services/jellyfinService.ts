import { getSetting } from './settingsService.js';
import db from '../db/index.js';

export interface JellyfinSession {
  id: string;
  userName: string;
  nowPlayingItem?: {
    name: string;
    type: string;
    seriesName?: string;
    seasonName?: string;
    playbackPositionTicks?: number;
    runTimeTicks?: number;
    percentPlayed?: number;
    tmdbId?: number;
  };
}

export class JellyfinService {
  public static getUrl(): string {
    return (getSetting('JELLYFIN_URL') || '').replace(/\/$/, '');
  }

  public static isConfigured(): boolean {
    return Boolean(this.getUrl());
  }

  public static getAuthHeader(token?: string): string {
    let header = 'MediaBrowser Client="Frame", Device="Frame Web", DeviceId="frame-media-app", Version="1.0.0"';
    if (token) {
      header += `, Token="${token}"`;
    }
    return header;
  }

  /**
   * Tester la connexion globale au serveur Jellyfin
   */
  public static async testServer(overrideUrl?: string): Promise<{ success: boolean; version?: string; message: string }> {
    const rawUrl = overrideUrl || this.getUrl();
    if (!rawUrl) return { success: false, message: 'URL Jellyfin non configurée dans les paramètres.' };
    const url = rawUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${url}/System/Info/Public`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.getAuthHeader(),
          'X-Emby-Authorization': this.getAuthHeader(),
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }

      const data = await res.json() as { Version?: string; ServerName?: string };
      return { 
        success: true, 
        version: data.Version, 
        message: `Connecté avec succès à Jellyfin (${data.ServerName || 'Serveur'}, v${data.Version || 'inconnue'}) !` 
      };
    } catch (e: any) {
      return { 
        success: false, 
        message: `Impossible de joindre Jellyfin à « ${url} » : ${e.message}. Note: si Frame tourne dans Docker, n'utilisez pas "localhost" mais l'adresse IP du serveur (ex: http://192.168.x.x:8096).` 
      };
    }
  }

  /**
   * Authentifier un utilisateur Jellyfin par identifiant et mot de passe
   */
  public static async authenticateUser(
    username: string, 
    password: string, 
    serverUrlOverride?: string
  ): Promise<{
    userId: string;
    accessToken: string;
    serverName: string;
  }> {
    const rawUrl = serverUrlOverride || this.getUrl();
    if (!rawUrl) {
      throw new Error('Veuillez renseigner l\'URL de votre serveur Jellyfin (ex: http://192.168.1.50:8096).');
    }
    const url = rawUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${url}/Users/AuthenticateByName`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': this.getAuthHeader(),
          'X-Emby-Authorization': this.getAuthHeader(),
        },
        body: JSON.stringify({
          Username: username.trim(),
          Pw: password || '',
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (res.status === 401) {
          throw new Error(`Jellyfin a rejeté ces identifiants (401 Non Autorisé). Vérifiez que l'identifiant « ${username} » et le mot de passe sont corrects.`);
        } else if (res.status === 404) {
          throw new Error(`Serveur Jellyfin introuvable à l'adresse « ${url} » (404). Vérifiez l'URL et le port (ex: http://192.168.x.x:8096).`);
        } else {
          throw new Error(`Jellyfin a renvoyé une erreur (${res.status}): ${errText || 'Connexion refusée'}`);
        }
      }

      const data = await res.json() as any;
      if (!data.User || !data.AccessToken) {
        throw new Error('Réponse inattendue de Jellyfin (jeton de session manquant).');
      }

      return {
        userId: data.User.Id,
        accessToken: data.AccessToken,
        serverName: data.ServerId || 'Jellyfin',
      };
    } catch (fetchErr: any) {
      if (fetchErr.message && (fetchErr.message.includes('Jellyfin a rejeté') || fetchErr.message.includes('introuvable'))) {
        throw fetchErr;
      }
      throw new Error(`Impossible de contacter Jellyfin sur « ${url} » : ${fetchErr.message}. Attention : dans un conteneur Docker, n'utilisez pas "localhost" mais l'adresse IP de votre serveur.`);
    }
  }

  /**
   * Lier un compte Jellyfin directement via une Clé API Jellyfin ou User Token
   */
  public static async authenticateWithApiKey(
    apiKey: string,
    usernameOrId?: string,
    serverUrlOverride?: string
  ): Promise<{
    userId: string;
    accessToken: string;
    serverName: string;
  }> {
    const rawUrl = serverUrlOverride || this.getUrl();
    if (!rawUrl) throw new Error('URL Jellyfin non configurée.');
    const url = rawUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${url}/Users`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': this.getAuthHeader(apiKey.trim()),
          'X-Emby-Token': apiKey.trim(),
        },
      });

      if (!res.ok) {
        throw new Error(`Clé API Jellyfin rejetée (${res.status}).`);
      }

      const users = await res.json() as any[];
      if (!users || users.length === 0) {
        throw new Error('Aucun utilisateur trouvé sur ce serveur Jellyfin.');
      }

      let matchedUser = users[0];
      if (usernameOrId && usernameOrId.trim()) {
        const target = usernameOrId.trim().toLowerCase();
        const found = users.find((u) => u.Name.toLowerCase() === target || u.Id.toLowerCase() === target);
        if (found) matchedUser = found;
      }

      return {
        userId: matchedUser.Id,
        accessToken: apiKey.trim(),
        serverName: matchedUser.ServerId || 'Jellyfin',
      };
    } catch (e: any) {
      throw new Error(`Erreur validation Clé API Jellyfin: ${e.message}`);
    }
  }

  /**
   * Rechercher un média dans Jellyfin par son ID TMDB ou titre (vérification stricte anti faux-positifs)
   */
  public static async findItemByTmdbId(
    accessToken: string,
    jellyfinUserId: string,
    tmdbId: number,
    title?: string,
    mediaType: 'movie' | 'tv' = 'movie',
    serverUrlOverride?: string,
    year?: number
  ): Promise<{ found: boolean; itemId?: string; name?: string; serverUrl: string }> {
    const rawUrl = serverUrlOverride || this.getUrl();
    if (!rawUrl || !accessToken) return { found: false, serverUrl: rawUrl || '' };
    const url = rawUrl.replace(/\/$/, '');

    const typeFilter = mediaType === 'movie' ? 'Movie' : 'Series';

    const cleanTitle = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();

    try {
      // 1. Recherche directe par Provider ID TMDB (minuscule tmdb.id)
      const queryUrl = `${url}/Users/${jellyfinUserId}/Items?Recursive=true&AnyProviderIdEquals=tmdb.${tmdbId}&IncludeItemTypes=${typeFilter}&Fields=ProviderIds,ProductionYear,OriginalTitle`;
      const res = await fetch(queryUrl, {
        headers: {
          'X-Emby-Authorization': this.getAuthHeader(accessToken),
          'Authorization': this.getAuthHeader(accessToken),
        },
      });

      if (res.ok) {
        const data = await res.json() as any;
        if (data.Items && data.Items.length > 0) {
          // VÉRIFICATION STRICTE : l'item doit réellement avoir ce tmdbId dans ProviderIds
          const exactMatch = data.Items.find((item: any) => {
            const pId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TmdbId;
            return pId && String(pId) === String(tmdbId);
          });
          if (exactMatch) {
            return { found: true, itemId: exactMatch.Id, name: exactMatch.Name, serverUrl: url };
          }
        }
      }

      // 2. Recherche avec Provider ID Majuscule (Tmdb.id)
      const queryUrlUpper = `${url}/Users/${jellyfinUserId}/Items?Recursive=true&AnyProviderIdEquals=Tmdb.${tmdbId}&IncludeItemTypes=${typeFilter}&Fields=ProviderIds,ProductionYear,OriginalTitle`;
      const resUpper = await fetch(queryUrlUpper, {
        headers: {
          'X-Emby-Authorization': this.getAuthHeader(accessToken),
          'Authorization': this.getAuthHeader(accessToken),
        },
      });

      if (resUpper.ok) {
        const dataUpper = await resUpper.json() as any;
        if (dataUpper.Items && dataUpper.Items.length > 0) {
          const exactMatch = dataUpper.Items.find((item: any) => {
            const pId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TmdbId;
            return pId && String(pId) === String(tmdbId);
          });
          if (exactMatch) {
            return { found: true, itemId: exactMatch.Id, name: exactMatch.Name, serverUrl: url };
          }
        }
      }

      // 3. Repli par recherche de titre stricte
      if (title && title.trim()) {
        const searchUrl = `${url}/Users/${jellyfinUserId}/Items?Recursive=true&SearchTerm=${encodeURIComponent(title.trim())}&IncludeItemTypes=${typeFilter}&Fields=ProviderIds,ProductionYear,OriginalTitle&Limit=20`;
        const searchRes = await fetch(searchUrl, {
          headers: {
            'X-Emby-Authorization': this.getAuthHeader(accessToken),
            'Authorization': this.getAuthHeader(accessToken),
          },
        });

        if (searchRes.ok) {
          const data = await searchRes.json() as any;
          if (data.Items && data.Items.length > 0) {
            const normalizedTarget = cleanTitle(title);

            for (const item of data.Items) {
              // Vérifier si le TMDB ID correspond dans les métadonnées de l'élément
              const pId = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb || item.ProviderIds?.TmdbId;
              if (pId && String(pId) === String(tmdbId)) {
                return { found: true, itemId: item.Id, name: item.Name, serverUrl: url };
              }

              // Comparaison stricte des titres normalisés
              const itemNameNorm = item.Name ? cleanTitle(item.Name) : '';
              const itemOrigNorm = item.OriginalTitle ? cleanTitle(item.OriginalTitle) : '';

              const nameMatches = (itemNameNorm.length > 0 && itemNameNorm === normalizedTarget) ||
                                  (itemOrigNorm.length > 0 && itemOrigNorm === normalizedTarget);

              if (nameMatches) {
                // Si l'année est connue et l'élément a une année de production, s'assurer que l'écart est <= 1 an
                if (year && item.ProductionYear) {
                  if (Math.abs(item.ProductionYear - year) <= 1) {
                    return { found: true, itemId: item.Id, name: item.Name, serverUrl: url };
                  }
                } else {
                  return { found: true, itemId: item.Id, name: item.Name, serverUrl: url };
                }
              }
            }
          }
        }
      }

      return { found: false, serverUrl: url };
    } catch {
      return { found: false, serverUrl: url };
    }
  }

  /**
   * Obtenir ce que l'utilisateur est actuellement en train de regarder sur Jellyfin
   */
  public static async getCurrentlyPlaying(accessToken: string, jellyfinUserId: string, serverUrlOverride?: string): Promise<any[]> {
    const rawUrl = serverUrlOverride || this.getUrl();
    if (!rawUrl || !accessToken) return [];
    const url = rawUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${url}/Sessions`, {
        headers: {
          'X-Emby-Authorization': this.getAuthHeader(accessToken),
          'Authorization': this.getAuthHeader(accessToken),
        },
      });

      if (!res.ok) return [];
      const sessions = await res.json() as any[];

      const userSessions = sessions.filter((s) => s.UserId === jellyfinUserId && s.NowPlayingItem);

      return userSessions.map((s) => {
        const item = s.NowPlayingItem;
        const ticks = s.PlayState?.PositionTicks || 0;
        const total = item.RunTimeTicks || 1;
        const percent = Math.min(100, Math.round((ticks / total) * 100));

        return {
          id: item.Id,
          title: item.Name,
          type: item.Type === 'Episode' ? 'tv' : 'movie',
          seriesName: item.SeriesName,
          seasonNumber: item.ParentIndexNumber,
          episodeNumber: item.IndexNumber,
          percentPlayed: percent,
          tmdbId: item.ProviderIds?.Tmdb ? parseInt(item.ProviderIds.Tmdb, 10) : null,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Synchroniser l'historique complet d'un utilisateur depuis Jellyfin vers Frame
   */
  public static async syncWatchedFromJellyfin(
    frameUserId: number, 
    accessToken: string, 
    jellyfinUserId: string,
    serverUrlOverride?: string
  ): Promise<{ importedCount: number }> {
    const rawUrl = serverUrlOverride || this.getUrl();
    if (!rawUrl || !accessToken) throw new Error('Jellyfin non connecté');
    const url = rawUrl.replace(/\/$/, '');

    const queryUrl = `${url}/Users/${jellyfinUserId}/Items?Recursive=true&Filters=IsPlayed&IncludeItemTypes=Movie,Series&Fields=ProviderIds,Overview,Genres,PremiereDate`;
    const res = await fetch(queryUrl, {
      headers: {
        'X-Emby-Authorization': this.getAuthHeader(accessToken),
        'Authorization': this.getAuthHeader(accessToken),
      },
    });

    if (!res.ok) {
      throw new Error(`Erreur Jellyfin (${res.status})`);
    }

    const data = await res.json() as any;
    const items = data.Items || [];

    let importedCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, backdrop_path, release_date, genres, overview, watched_at, synced_jellyfin
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        poster_path = COALESCE(watched_items.poster_path, excluded.poster_path),
        backdrop_path = COALESCE(watched_items.backdrop_path, excluded.backdrop_path),
        synced_jellyfin = 1
    `);

    for (const it of items) {
      const tmdbId = it.ProviderIds?.Tmdb ? parseInt(it.ProviderIds.Tmdb, 10) : null;
      if (tmdbId) {
        try {
          const mediaType = it.Type === 'Movie' ? 'movie' : 'tv';
          const posterUrl = it.ImageTags?.Primary ? `${url}/Items/${it.Id}/Images/Primary?fillWidth=500&quality=90` : null;
          const backdropUrl = it.BackdropImageTags && it.BackdropImageTags.length > 0 ? `${url}/Items/${it.Id}/Images/Backdrop/0?fillWidth=1280&quality=85` : null;

          insertStmt.run(
            frameUserId,
            tmdbId,
            mediaType,
            it.Name || 'Sans titre',
            posterUrl,
            backdropUrl,
            it.PremiereDate ? it.PremiereDate.split('T')[0] : null,
            it.Genres ? JSON.stringify(it.Genres.map((name: string, i: number) => ({ id: i, name }))) : null,
            it.Overview || null
          );
          importedCount++;
        } catch {
          // Doublon
        }
      }
    }

    return { importedCount };
  }
}
