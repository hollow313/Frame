import { getSetting } from './settingsService.js';
import db from '../db/index.js';

const SIMKL_API_BASE = 'https://api.simkl.com';

export class SimklService {
  public static getClientId(override?: string): string {
    const val = override || getSetting('SIMKL_CLIENT_ID') || '';
    return val.trim();
  }

  public static isConfigured(): boolean {
    return Boolean(this.getClientId());
  }

  /**
   * Démarrer le flux d'authentification PIN Simkl (aucun redirect URI complexe requis)
   */
  public static async getPin(clientIdOverride?: string): Promise<{
    user_code: string;
    verification_url: string;
    expires_in: number;
    client_id: string;
  }> {
    const clientId = this.getClientId(clientIdOverride);
    if (!clientId) {
      throw new Error(
        'Client ID Simkl manquant. Veuillez saisir votre Client ID Simkl (obtenu gratuitement sur https://simkl.com/settings/developer/new).'
      );
    }

    try {
      const res = await fetch(`${SIMKL_API_BASE}/oauth/pin?client_id=${encodeURIComponent(clientId)}`);
      if (!res.ok) {
        let errorDetail = res.statusText;
        try {
          const errData = (await res.json()) as any;
          if (errData.error === 'client_id_failed' || errData.message?.includes('client_id')) {
            errorDetail =
              'Client ID non reconnu par Simkl. Vérifiez que vous avez bien copié le Client ID depuis votre compte Simkl Developer et que votre app a une URL de redirection (ex: https://simkl.com).';
          } else if (errData.message || errData.error) {
            errorDetail = errData.message || errData.error;
          }
        } catch {
          const text = await res.text().catch(() => '');
          if (text) errorDetail = text;
        }
        throw new Error(`Erreur Simkl (${res.status}): ${errorDetail}`);
      }

      const data = (await res.json()) as any;
      return {
        user_code: data.user_code,
        verification_url: data.verification_url || `https://simkl.com/pin?${data.user_code}`,
        expires_in: data.expires_in || 900,
        client_id: clientId,
      };
    } catch (e: any) {
      if (e.message && (e.message.startsWith('Erreur Simkl') || e.message.includes('Client ID'))) {
        throw e;
      }
      throw new Error(`Impossible de contacter l'API Simkl : ${e.message}`);
    }
  }

  /**
   * Vérifier si l'utilisateur a validé le code PIN sur Simkl
   */
  public static async checkPin(
    userCode: string,
    clientIdOverride?: string
  ): Promise<{ authorized: boolean; access_token?: string; message?: string }> {
    const clientId = this.getClientId(clientIdOverride);
    if (!clientId) {
      return { authorized: false, message: 'Client ID Simkl non spécifié.' };
    }

    try {
      const res = await fetch(
        `${SIMKL_API_BASE}/oauth/pin/${encodeURIComponent(userCode)}?client_id=${encodeURIComponent(clientId)}`
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return {
          authorized: false,
          message: `Code en attente ou expiré (${res.status}: ${text || 'non autorisé'}).`,
        };
      }
      const data = (await res.json()) as any;
      if (data.result === 'OK' && data.access_token) {
        return { authorized: true, access_token: data.access_token };
      }
      return { authorized: false, message: data.message || 'En attente de validation sur le site Simkl...' };
    } catch (e: any) {
      return { authorized: false, message: e.message };
    }
  }

  /**
   * Tester la validité d'un token Simkl
   */
  public static async testToken(
    accessToken: string,
    clientIdOverride?: string
  ): Promise<{ success: boolean; user?: any; message: string }> {
    const clientId = this.getClientId(clientIdOverride);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken.trim()}`,
      };
      if (clientId) {
        headers['simkl-api-key'] = clientId;
      }

      const res = await fetch(`${SIMKL_API_BASE}/users/settings`, { headers });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return { success: false, message: `Erreur Simkl (${res.status}): ${errText || res.statusText}` };
      }

      const data = (await res.json()) as any;
      return {
        success: true,
        user: data.user,
        message: `Connecté à Simkl en tant que ${data.user?.name || 'utilisateur'} !`,
      };
    } catch (e: any) {
      return { success: false, message: e.message || 'Erreur lors du test Simkl' };
    }
  }

  /**
   * Récupérer les films et séries déjà vus depuis Simkl
   */
  public static async getWatchedFromSimkl(
    accessToken: string,
    type: 'movies' | 'shows' = 'movies',
    clientIdOverride?: string
  ): Promise<any[]> {
    const clientId = this.getClientId(clientIdOverride);
    if (!accessToken) return [];

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      };
      if (clientId) {
        headers['simkl-api-key'] = clientId;
      }

      const res = await fetch(`${SIMKL_API_BASE}/sync/all-items/${type}/completed`, { headers });
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return data[type] || [];
    } catch {
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
    clientIdOverride?: string;
  }): Promise<boolean> {
    const clientId = this.getClientId(params.clientIdOverride);
    if (!params.accessToken) return false;

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

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      };
      if (clientId) {
        headers['simkl-api-key'] = clientId;
      }

      const res = await fetch(`${SIMKL_API_BASE}/sync/history`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Synchroniser tous les éléments Simkl vers Frame pour un utilisateur
   */
  public static async syncSimklToFrame(
    userId: number,
    accessToken: string,
    clientIdOverride?: string
  ): Promise<{ importedMovies: number; importedShows: number }> {
    const movies = await this.getWatchedFromSimkl(accessToken, 'movies', clientIdOverride);
    const shows = await this.getWatchedFromSimkl(accessToken, 'shows', clientIdOverride);

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
        } catch {
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
        } catch {
          // Doublon ou erreur
        }
      }
    }

    return { importedMovies, importedShows };
  }
}
