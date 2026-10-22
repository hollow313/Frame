import crypto from 'node:crypto';
import { getSetting } from './settingsService.js';
import db from '../db/index.js';

const SIMKL_API_BASE = 'https://api.simkl.com';

export class SimklService {
  public static getClientId(override?: string): string {
    const val = override || getSetting('SIMKL_CLIENT_ID') || '';
    return val.trim();
  }

  public static getClientSecret(override?: string): string {
    const val = override || getSetting('SIMKL_CLIENT_SECRET') || '';
    return val.trim();
  }

  public static isConfigured(): boolean {
    return Boolean(this.getClientId());
  }

  /**
   * Initialiser le flux OAuth 2.0 PKCE (S256)
   */
  public static initOAuth2(params: {
    clientId?: string;
    clientSecret?: string;
    redirectUri: string;
  }): {
    authUrl: string;
    state: string;
    codeVerifier: string;
  } {
    const clientId = this.getClientId(params.clientId);
    if (!clientId) {
      throw new Error(
        'Client ID Simkl manquant. Veuillez saisir votre Client ID Simkl (obtenu sur https://simkl.com/settings/developer/new).'
      );
    }

    // Générer PKCE code_verifier (43-128 caractères base64url)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    // Calculer SHA-256 code_challenge
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    // État CSRF aléatoire
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = new URL('https://simkl.com/oauth2/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', params.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);

    return {
      authUrl: authUrl.toString(),
      state,
      codeVerifier,
    };
  }

  /**
   * Échanger le code d'autorisation OAuth 2.0 contre un jeton d'accès (access token)
   */
  public static async exchangeOAuth2Code(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId?: string;
    clientSecret?: string;
  }): Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type: string;
  }> {
    const clientId = this.getClientId(params.clientId);
    const clientSecret = this.getClientSecret(params.clientSecret);

    if (!clientId) {
      throw new Error('Client ID Simkl manquant pour l\'échange du code.');
    }

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    });

    if (clientSecret) {
      bodyParams.append('client_secret', clientSecret);
    }

    const res = await fetch(`${SIMKL_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Frame/1.0',
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      let errText = res.statusText;
      try {
        const errJson = (await res.json()) as any;
        errText = errJson.error_description || errJson.message || errJson.error || errText;
      } catch {
        const raw = await res.text().catch(() => '');
        if (raw) errText = raw;
      }
      throw new Error(`Échec échange OAuth Simkl (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as any;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type || 'Bearer',
    };
  }

  /**
   * Démarrer le flux PIN (tente Auth V2 Device Flow, avec fallback Auth V1)
   */
  public static async getPin(
    clientIdOverride?: string,
    clientSecretOverride?: string
  ): Promise<{
    user_code: string;
    verification_url: string;
    expires_in: number;
    client_id: string;
    device_code?: string;
    isV2?: boolean;
  }> {
    const clientId = this.getClientId(clientIdOverride);
    if (!clientId) {
      throw new Error(
        'Client ID Simkl manquant. Veuillez saisir votre Client ID Simkl (obtenu sur https://simkl.com/settings/developer/new).'
      );
    }

    // 1. Essayer le Device Flow V2 de Simkl (POST /oauth2/device)
    try {
      const v2Res = await fetch(`${SIMKL_API_BASE}/oauth2/device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Frame/1.0',
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: 'media:read media:write',
        }),
      });

      if (v2Res.ok) {
        const v2Data = (await v2Res.json()) as any;
        return {
          user_code: v2Data.user_code,
          verification_url: v2Data.verification_uri_complete || `https://simkl.com/pin?user_code=${v2Data.user_code}`,
          expires_in: v2Data.expires_in || 900,
          client_id: clientId,
          device_code: v2Data.device_code,
          isV2: true,
        };
      }
    } catch {
      // Continuer vers le fallback V1
    }

    // 2. Fallback: flux PIN legacy V1 (GET /oauth/pin)
    try {
      const res = await fetch(`${SIMKL_API_BASE}/oauth/pin?client_id=${encodeURIComponent(clientId)}`);
      if (!res.ok) {
        let errorDetail = res.statusText;
        try {
          const errData = (await res.json()) as any;
          if (errData.error === 'client_id_failed' || errData.message?.includes('client_id')) {
            errorDetail =
              'Client ID non reconnu par Simkl. Vérifiez que vous avez bien copié le Client ID depuis votre compte Simkl Developer.';
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
        isV2: false,
      };
    } catch (e: any) {
      if (e.message && (e.message.startsWith('Erreur Simkl') || e.message.includes('Client ID'))) {
        throw e;
      }
      throw new Error(`Impossible de contacter l'API Simkl : ${e.message}`);
    }
  }

  /**
   * Vérifier si l'utilisateur a validé le code PIN sur Simkl (compatible V2 et V1)
   */
  public static async checkPin(
    userCode: string,
    clientIdOverride?: string,
    deviceCode?: string,
    clientSecretOverride?: string
  ): Promise<{ authorized: boolean; access_token?: string; refresh_token?: string; message?: string }> {
    const clientId = this.getClientId(clientIdOverride);
    const clientSecret = this.getClientSecret(clientSecretOverride);
    if (!clientId) {
      return { authorized: false, message: 'Client ID Simkl non spécifié.' };
    }

    // 1. Si on a un device_code V2, sonder POST /oauth2/token
    if (deviceCode) {
      try {
        const bodyParams = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          client_id: clientId,
          device_code: deviceCode,
        });
        if (clientSecret) {
          bodyParams.append('client_secret', clientSecret);
        }

        const res = await fetch(`${SIMKL_API_BASE}/oauth2/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Frame/1.0',
          },
          body: bodyParams.toString(),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.access_token) {
            return {
              authorized: true,
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            };
          }
        }

        const errData = (await res.json().catch(() => ({}))) as any;
        const errType = errData.error || '';
        if (errType === 'authorization_pending') {
          return { authorized: false, message: 'En attente de validation sur le site Simkl...' };
        }
        if (errType === 'slow_down') {
          return { authorized: false, message: 'Vérification en cours, veuillez patienter quelques secondes...' };
        }
        if (errType === 'expired_token') {
          return { authorized: false, message: 'Code expiré. Veuillez relancer la génération du code PIN.' };
        }
      } catch (err: any) {
        // Fallback V1
      }
    }

    // 2. Fallback V1: GET /oauth/pin/{userCode}
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
    const token = accessToken.trim();
    if (!token) {
      return { success: false, message: 'Jeton d\'accès vide.' };
    }

    // Détection d'erreur fréquente : l'utilisateur a collé son Client Secret (simkl_cs_...) au lieu d'un Access Token
    if (token.startsWith('simkl_cs_')) {
      return {
        success: false,
        message:
          "La valeur saisie commence par 'simkl_cs_' : il s'agit d'un Client Secret et non d'un Jeton d'accès (Access Token). Utilisez le bouton 'Se connecter avec Simkl (OAuth 2.0)' ci-dessus pour vous connecter facilement !",
      };
    }

    const clientId = this.getClientId(clientIdOverride);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Frame/1.0',
      };
      if (clientId) {
        headers['simkl-api-key'] = clientId;
      }

      const res = await fetch(`${SIMKL_API_BASE}/users/settings`, { headers });
      if (!res.ok) {
        let errDetail = res.statusText;
        try {
          const errData = (await res.json()) as any;
          if (errData.error === 'user_token_failed') {
            errDetail = 'Jeton d\'accès invalide ou expiré.';
          } else if (errData.message || errData.error) {
            errDetail = errData.message || errData.error;
          }
        } catch {}
        return { success: false, message: `Erreur Simkl (${res.status}): ${errDetail}` };
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
        Authorization: `Bearer ${accessToken.trim()}`,
        'User-Agent': 'Frame/1.0',
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
        'User-Agent': 'Frame/1.0',
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
