import { getSetting } from './settingsService.js';
import db from '../db/index.js';

const SIMKL_API_BASE = 'https://api.simkl.com';

export class SimklService {
  private static getClientId(): string {
    return getSetting('SIMKL_CLIENT_ID') || '';
  }

  public static isConfigured(): boolean {
    return Boolean(this.getClientId());
  }

  /**
   * Tester la validité d'un token Simkl
   */
  public static async testToken(accessToken: string): Promise<{ success: boolean; user?: any; message: string }> {
    const clientId = this.getClientId();
    if (!clientId) {
      return { success: false, message: 'SIMKL_CLIENT_ID non configuré.' };
    }

    try {
      const res = await fetch(`${SIMKL_API_BASE}/users/settings`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'simkl-api-key': clientId,
        },
      });

      if (!res.ok) {
        return { success: false, message: `Erreur Simkl: ${res.statusText}` };
      }

      const data = await res.json() as any;
      return { success: true, user: data.user, message: `Connecté à Simkl en tant que ${data.user?.name || 'utilisateur'}` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Erreur lors du test Simkl' };
    }
  }

  /**
   * Récupérer les films et séries déjà vus depuis Simkl
   */
  public static async getWatchedFromSimkl(accessToken: string, type: 'movies' | 'shows' = 'movies'): Promise<any[]> {
    const clientId = this.getClientId();
    if (!clientId || !accessToken) return [];

    try {
      const res = await fetch(`${SIMKL_API_BASE}/sync/all-items/${type}/completed`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'simkl-api-key': clientId,
        },
      });

      if (!res.ok) return [];
      const data = await res.json() as any;
      return data[type] || [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Envoyer un item vu vers Simkl
   */
  public static async markAsWatchedOnSimkl(params: {
    accessToken: string;
    mediaType: 'movie' | 'tv';
    tmdbId?: number;
    title: string;
    year?: number;
  }): Promise<boolean> {
    const clientId = this.getClientId();
    if (!clientId || !params.accessToken) return false;

    try {
      const body: any = {};
      const key = params.mediaType === 'movie' ? 'movies' : 'shows';
      body[key] = [
        {
          title: params.title,
          ...(params.year ? { year: params.year } : {}),
          ids: {
            ...(params.tmdbId ? { tmdb: params.tmdbId.toString() } : {}),
          },
        },
      ];

      const res = await fetch(`${SIMKL_API_BASE}/sync/history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${params.accessToken}`,
          'simkl-api-key': clientId,
        },
        body: JSON.stringify(body),
      });

      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Synchroniser tous les éléments Simkl vers Frame pour un utilisateur
   */
  public static async syncSimklToFrame(userId: number, accessToken: string): Promise<{ importedMovies: number; importedShows: number }> {
    const movies = await this.getWatchedFromSimkl(accessToken, 'movies');
    const shows = await this.getWatchedFromSimkl(accessToken, 'shows');

    let importedMovies = 0;
    let importedShows = 0;

    const insertStmt = db.prepare(`
      INSERT INTO watched_items (user_id, tmdb_id, media_type, title, poster_path, release_date, watched_at, synced_simkl)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        synced_simkl = 1
    `);

    // Insérer les films
    for (const m of movies) {
      const tmdbId = m.movie?.ids?.tmdb ? parseInt(m.movie.ids.tmdb, 10) : null;
      if (tmdbId) {
        try {
          insertStmt.run(
            userId,
            tmdbId,
            'movie',
            m.movie.title || 'Inconnu',
            m.movie.poster ? `https://simkl.in/posters/${m.movie.poster}_m.webp` : null,
            m.movie.year ? `${m.movie.year}-01-01` : null,
            m.last_watched_at || new Date().toISOString()
          );
          importedMovies++;
        } catch (e) {
          // Doublon ou erreur
        }
      }
    }

    // Insérer les séries
    for (const s of shows) {
      const tmdbId = s.show?.ids?.tmdb ? parseInt(s.show.ids.tmdb, 10) : null;
      if (tmdbId) {
        try {
          insertStmt.run(
            userId,
            tmdbId,
            'tv',
            s.show.title || 'Inconnu',
            s.show.poster ? `https://simkl.in/posters/${s.show.poster}_m.webp` : null,
            s.show.year ? `${s.show.year}-01-01` : null,
            s.last_watched_at || new Date().toISOString()
          );
          importedShows++;
        } catch (e) {
          // Doublon ou erreur
        }
      }
    }

    return { importedMovies, importedShows };
  }
}
