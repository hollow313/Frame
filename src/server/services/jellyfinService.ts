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
  private static getUrl(): string {
    return (getSetting('JELLYFIN_URL') || '').replace(/\/$/, '');
  }

  public static isConfigured(): boolean {
    return Boolean(this.getUrl());
  }

  private static getAuthHeader(token?: string): string {
    let header = 'MediaBrowser Client="Frame", Device="Frame Web", DeviceId="frame-media-app", Version="1.0.0"';
    if (token) {
      header += `, Token="${token}"`;
    }
    return header;
  }

  /**
   * Tester la connexion globale au serveur Jellyfin
   */
  public static async testServer(): Promise<{ success: boolean; version?: string; message: string }> {
    const url = this.getUrl();
    if (!url) return { success: false, message: 'URL Jellyfin non configurée' };

    try {
      const res = await fetch(`${url}/System/Info/Public`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { Version: string; ServerName: string };
      return { success: true, version: data.Version, message: `Connecté à ${data.ServerName} (v${data.Version})` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Erreur connexion Jellyfin' };
    }
  }

  /**
   * Authentifier un utilisateur spécifique sur Jellyfin pour lier son profil personnel
   */
  public static async authenticateUser(username: string, password: string): Promise<{
    userId: string;
    accessToken: string;
    serverName: string;
  }> {
    const url = this.getUrl();
    if (!url) throw new Error('Serveur Jellyfin non configuré sur Frame.');

    const res = await fetch(`${url}/Users/AuthenticateByName`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Emby-Authorization': this.getAuthHeader(),
      },
      body: JSON.stringify({
        Username: username,
        Pw: password,
      }),
    });

    if (!res.ok) {
      throw new Error('Identifiants Jellyfin incorrects.');
    }

    const data = await res.json() as any;
    return {
      userId: data.User.Id,
      accessToken: data.AccessToken,
      serverName: data.ServerId || 'Jellyfin',
    };
  }

  /**
   * Obtenir ce que l'utilisateur est actuellement en train de regarder sur Jellyfin
   */
  public static async getCurrentlyPlaying(accessToken: string, jellyfinUserId: string): Promise<any[]> {
    const url = this.getUrl();
    if (!url || !accessToken) return [];

    try {
      const res = await fetch(`${url}/Sessions`, {
        headers: {
          'X-Emby-Authorization': this.getAuthHeader(accessToken),
        },
      });

      if (!res.ok) return [];
      const sessions = await res.json() as any[];

      // Filtrer les sessions de cet utilisateur avec un média en cours de lecture
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
  public static async syncWatchedFromJellyfin(frameUserId: number, accessToken: string, jellyfinUserId: string): Promise<{ importedCount: number }> {
    const url = this.getUrl();
    if (!url || !accessToken) throw new Error('Jellyfin non connecté');

    const queryUrl = `${url}/Users/${jellyfinUserId}/Items?Recursive=true&Filters=IsPlayed&IncludeItemTypes=Movie,Series&Fields=ProviderIds,Overview,Genres,PremiereDate`;
    const res = await fetch(queryUrl, {
      headers: {
        'X-Emby-Authorization': this.getAuthHeader(accessToken),
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
        user_id, tmdb_id, media_type, title, release_date, genres, overview, watched_at, synced_jellyfin
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        synced_jellyfin = 1
    `);

    for (const it of items) {
      const tmdbId = it.ProviderIds?.Tmdb ? parseInt(it.ProviderIds.Tmdb, 10) : null;
      if (tmdbId) {
        try {
          const mediaType = it.Type === 'Movie' ? 'movie' : 'tv';
          insertStmt.run(
            frameUserId,
            tmdbId,
            mediaType,
            it.Name || 'Sans titre',
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
