import crypto from 'crypto';
import db from '../db/index.js';
import { getSetting, setSetting } from './settingsService.js';
import { TMDBService, hasCjkCharacters } from './tmdbService.js';
import { normalizeIsoDate } from '../utils/validate.js';
import { logger } from '../utils/logger.js';

const SIMKL_API_BASE = 'https://api.simkl.com';

export class SimklService {
  public static getClientId(customClientId?: string): string {
    return (customClientId || getSetting('SIMKL_CLIENT_ID')).trim();
  }

  public static getClientSecret(customSecret?: string): string {
    return (customSecret || getSetting('SIMKL_CLIENT_SECRET')).trim();
  }

  public static isConfigured(): boolean {
    return Boolean(this.getClientId());
  }

  /**
   * Générer une paire PKCE (code_verifier & code_challenge S256) pour OAuth 2.0 V2 Simkl
   */
  public static generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  /**
   * Construire l'URL d'autorisation OAuth 2.0 Simkl (avec PKCE S256)
   */
  public static buildAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): string {
    const url = new URL('https://simkl.com/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', params.clientId.trim());
    url.searchParams.set('redirect_uri', params.redirectUri.trim());
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /**
   * Échanger le code d'autorisation OAuth contre un access_token (supporte V2 /oauth2/token avec PKCE + Client Secret, et fallback V1 /oauth/token)
   */
  public static async exchangeCodeForToken(params: {
    code: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<{ accessToken: string; refreshToken?: string }> {
    const cleanClientId = params.clientId.trim();
    const cleanSecret = params.clientSecret ? params.clientSecret.trim() : this.getClientSecret();

    const bodyPayload: Record<string, string> = {
      code: params.code.trim(),
      client_id: cleanClientId,
      redirect_uri: params.redirectUri.trim(),
      grant_type: 'authorization_code',
    };

    if (cleanSecret) {
      bodyPayload.client_secret = cleanSecret;
    }
    if (params.codeVerifier) {
      bodyPayload.code_verifier = params.codeVerifier.trim();
    }

    const requestHeaders = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'simkl-api-key': cleanClientId,
    };

    // 1. Endpoint OAuth 2.0 V2 (/oauth2/token)
    let res = await fetch(`${SIMKL_API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(10000),
    });

    let data = await res.json().catch(() => ({}));

    // 2. Fallback sur l'ancien endpoint (/oauth/token) si l'application Simkl est en V1
    if (!res.ok || !data.access_token) {
      const v1Res = await fetch(`${SIMKL_API_BASE}/oauth/token`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(bodyPayload),
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);

      if (v1Res) {
        const v1Data = await v1Res.json().catch(() => ({}));
        if (v1Res.ok && v1Data.access_token) {
          res = v1Res;
          data = v1Data;
        }
      }
    }

    if (!res.ok || !data.access_token) {
      throw new Error(
        data.error_description ||
          data.message ||
          data.error ||
          `Échec de l'échange OAuth Simkl (${res.status}). Vérifiez que le Client Secret et le Redirect URI correspondent à ceux configurés dans votre application Simkl.`
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  /**
   * Rafraîchir automatiquement le jeton OAuth2 Simkl via refresh_token (B-04)
   */
  public static async refreshAccessToken(userId: number): Promise<string | null> {
    const userRow = db
      .prepare('SELECT simkl_refresh_token, simkl_client_id, simkl_client_secret FROM users WHERE id = ?')
      .get(userId) as
      | { simkl_refresh_token?: string; simkl_client_id?: string; simkl_client_secret?: string }
      | undefined;

    const refreshToken = userRow?.simkl_refresh_token;
    if (!refreshToken) return null;

    const clientId = this.getClientId(userRow?.simkl_client_id);
    const clientSecret = this.getClientSecret(userRow?.simkl_client_secret);
    if (!clientId) return null;

    try {
      const payload: Record<string, string> = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      };
      if (clientSecret) {
        payload.client_secret = clientSecret;
      }

      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'simkl-api-key': clientId,
      };

      let res = await fetch(`${SIMKL_API_BASE}/oauth2/token`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      let data = await res.json().catch(() => ({}));

      if (!res.ok || !data.access_token) {
        const v1Res = await fetch(`${SIMKL_API_BASE}/oauth/token`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        }).catch(() => null);
        if (v1Res) {
          const v1Data = await v1Res.json().catch(() => ({}));
          if (v1Res.ok && v1Data.access_token) {
            res = v1Res;
            data = v1Data;
          }
        }
      }

      if (!res.ok || !data.access_token) {
        logger.warn('Simkl', 'Échec du rafraîchissement du token OAuth Simkl', {
          userId,
          status: res.status,
        });
        return null;
      }

      db.prepare(
        'UPDATE users SET simkl_token = ?, simkl_refresh_token = COALESCE(?, simkl_refresh_token) WHERE id = ?'
      ).run(data.access_token, data.refresh_token || null, userId);

      logger.info('Simkl', 'Token OAuth Simkl rafraîchi avec succès', { userId });
      return data.access_token as string;
    } catch (e) {
      logger.warn('Simkl', 'Erreur réseau lors du refresh token Simkl', { userId, error: String(e) });
      return null;
    }
  }

  /**
   * Démarrer un flux d'authentification par code PIN / Device Code Simkl (compatible OAuth 2.0 /oauth2/device et V1 /oauth/pin)
   */
  public static async getDevicePin(
    customClientId?: string,
    customClientSecret?: string,
    userId?: number
  ): Promise<{
    user_code: string;
    verification_url: string;
    expires_in: number;
    interval: number;
    client_id: string;
    device_code?: string;
    isV2?: boolean;
  }> {
    let userRow: { simkl_client_id?: string; simkl_client_secret?: string } | undefined;
    if (userId) {
      userRow = db
        .prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?')
        .get(userId) as any;
    }

    const clientId = this.getClientId(customClientId || userRow?.simkl_client_id);
    const clientSecret = this.getClientSecret(customClientSecret || userRow?.simkl_client_secret);

    if (!clientId) {
      throw new Error('Veuillez saisir votre Client ID Simkl avant de générer le code PIN.');
    }

    if (customClientId) {
      setSetting('SIMKL_CLIENT_ID', clientId);
    }
    if (clientSecret) {
      setSetting('SIMKL_CLIENT_SECRET', clientSecret);
    }
    if (userId) {
      db.prepare(
        'UPDATE users SET simkl_client_id = ?, simkl_client_secret = COALESCE(?, simkl_client_secret) WHERE id = ?'
      ).run(clientId, clientSecret || null, userId);
    }

    // 1. Essayer l'endpoint OAuth 2.0 Device Flow officiel (/oauth2/device)
    try {
      const v2Res = await fetch(`${SIMKL_API_BASE}/oauth2/device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'simkl-api-key': clientId,
        },
        body: JSON.stringify({ client_id: clientId }),
        signal: AbortSignal.timeout(8000),
      });

      if (v2Res.ok) {
        const v2Data = await v2Res.json();
        if (v2Data.user_code) {
          return {
            user_code: v2Data.user_code,
            device_code: v2Data.device_code,
            verification_url:
              v2Data.verification_uri_complete ||
              v2Data.verification_uri ||
              v2Data.verification_url ||
              `https://simkl.com/pin?user_code=${encodeURIComponent(v2Data.user_code)}`,
            expires_in: v2Data.expires_in || 900,
            interval: v2Data.interval || 5,
            client_id: clientId,
            isV2: true,
          };
        }
      }
    } catch {
      // Fallback sur l'endpoint V1
    }

    // 2. Fallback V1 (/oauth/pin)
    const res = await fetch(`${SIMKL_API_BASE}/oauth/pin?client_id=${encodeURIComponent(clientId)}`, {
      headers: {
        'Content-Type': 'application/json',
        'simkl-api-key': clientId,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(
        `Simkl a refusé le Client ID (${res.status}). Vérifiez que vous avez bien copié le Client ID (et non le Secret) depuis simkl.com/settings/developer.`
      );
    }

    const data = await res.json();
    return {
      user_code: data.user_code,
      verification_url: data.verification_url || 'https://simkl.com/pin',
      expires_in: data.expires_in || 900,
      interval: data.interval || 5,
      client_id: clientId,
      isV2: false,
    };
  }

  /**
   * Vérifier si l'utilisateur a validé le code PIN sur Simkl (supporte OAuth 2.0 /oauth2/token et V1 /oauth/pin)
   */
  public static async checkDevicePin(
    userCode: string,
    customClientId?: string,
    deviceCode?: string,
    customClientSecret?: string,
    userId?: number
  ): Promise<{ result: 'OK' | 'KO'; access_token?: string; refresh_token?: string; message?: string }> {
    let userRow: { simkl_client_id?: string; simkl_client_secret?: string } | undefined;
    if (userId) {
      userRow = db
        .prepare('SELECT simkl_client_id, simkl_client_secret FROM users WHERE id = ?')
        .get(userId) as any;
    }

    const clientId = this.getClientId(customClientId || userRow?.simkl_client_id);
    const clientSecret = this.getClientSecret(customClientSecret || userRow?.simkl_client_secret);
    if (!clientId) {
      throw new Error('SIMKL_CLIENT_ID non configuré.');
    }

    if (deviceCode) {
      try {
        const payload: Record<string, string> = {
          client_id: clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        };
        if (clientSecret) {
          payload.client_secret = clientSecret;
        }

        const v2Res = await fetch(`${SIMKL_API_BASE}/oauth2/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'simkl-api-key': clientId,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        });

        const v2Data = await v2Res.json().catch(() => ({}));
        if (v2Res.ok && v2Data.access_token) {
          return {
            result: 'OK',
            access_token: v2Data.access_token,
            refresh_token: v2Data.refresh_token,
          };
        }

        if (v2Data.error === 'authorization_pending' || v2Data.error === 'slow_down') {
          return {
            result: 'KO',
            message:
              'En attente de validation sur Simkl : cliquez sur « 1. Valider sur Simkl », connectez-vous et cliquez sur Approve.',
          };
        }

        if (v2Data.error === 'invalid_client') {
          return {
            result: 'KO',
            message:
              'Client Secret Simkl requis ou invalide : renseignez votre Client Secret (simkl_cs_...) dans le champ « Client Secret Simkl » ci-dessus, puis réessayez.',
          };
        }

        if (v2Data.error === 'expired_token') {
          return {
            result: 'KO',
            message: 'Ce code PIN a expiré. Cliquez à nouveau sur « Générer un code PIN Simkl ».',
          };
        }

        // Ne jamais appeler /oauth/pin lorsqu'un deviceCode OAuth 2.0 est utilisé
        return {
          result: 'KO',
          message:
            v2Data.error_description ||
            v2Data.message ||
            'En attente de validation du code sur https://simkl.com/pin',
        };
      } catch {
        return {
          result: 'KO',
          message: 'Erreur réseau lors de la vérification sur Simkl. Réessayez dans quelques secondes.',
        };
      }
    }

    const res = await fetch(
      `${SIMKL_API_BASE}/oauth/pin/${encodeURIComponent(userCode.trim())}?client_id=${encodeURIComponent(clientId)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'simkl-api-key': clientId,
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (data.result === 'OK' && data.access_token) {
      return { result: 'OK', access_token: data.access_token };
    }

    return {
      result: 'KO',
      message: data.message || 'En attente de validation du code sur https://simkl.com/pin',
    };
  }

  /**
   * Tester un jeton d'accès Simkl et récupérer les infos du compte utilisateur Simkl
   */
  public static async validateAccessToken(accessToken: string, customClientId?: string): Promise<{ valid: boolean; accountId?: string; name?: string; error?: string }> {
    const cleanToken = accessToken.trim();

    if (cleanToken.startsWith('simkl_cs_')) {
      return {
        valid: false,
        error: "Vous avez collé votre 'Client Secret' (simkl_cs_...) au lieu d'un Access Token ! Utilisez le bouton « Se connecter avec Simkl (OAuth 2.0) » ci-dessus.",
      };
    }

    const clientId = this.getClientId(customClientId);
    if (!clientId) {
      return { valid: false, error: 'Veuillez renseigner votre Client ID Simkl.' };
    }

    try {
      const res = await fetch(`${SIMKL_API_BASE}/users/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanToken}`,
          'simkl-api-key': clientId,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return {
          valid: false,
          error: `Jeton refusé par Simkl (${res.status}). Vérifiez que le jeton correspond bien à votre Client ID.`,
        };
      }

      const data = await res.json();
      return {
        valid: true,
        accountId: data.account?.id ? String(data.account.id) : undefined,
        name: data.user?.name || 'Utilisateur Simkl',
      };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Impossible de joindre Simkl.' };
    }
  }

  /**
   * Synchroniser tous les médias vus et la liste à voir depuis Simkl vers SQLite pour un utilisateur donné
   * Inclut :
   * - U-02 : Séparation stricte des Mangas (`media_type = 'manga'`) et des Séries TV (`media_type = 'tv'`)
   * - U-03 : Dates normalisées en ISO-8601 UTC + préservation de `watched_at` au conflit
   * - U-04 & B-04 : Support du `refresh_token` en cas de 401/403 et mise à jour du statut de synchronisation
   * - U-05 : Traduction des titres CJK si la clé TMDB est configurée
   */
  public static async syncWatchedItems(userId: number): Promise<{
    importedMovies: number;
    importedShows: number;
    importedAnime: number;
    importedManga: number;
    importedWatchlist: number;
  }> {
    const userRow = db
      .prepare('SELECT simkl_token, simkl_client_id, simkl_user_id FROM users WHERE id = ?')
      .get(userId) as { simkl_token?: string; simkl_client_id?: string; simkl_user_id?: string } | undefined;

    let token = userRow?.simkl_token || getSetting('SIMKL_ACCESS_TOKEN');
    const clientId = this.getClientId(userRow?.simkl_client_id);

    if (!clientId || !token) {
      throw new Error("Compte Simkl non lié ou Client ID manquant. Rendez-vous dans vos Paramètres.");
    }

    const performFetchAllItems = async (bearerToken: string) =>
      fetch(`${SIMKL_API_BASE}/sync/all-items/?extended=full&episode_watched_at=yes`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
          'simkl-api-key': clientId,
        },
        signal: AbortSignal.timeout(25000),
      });

    let res = await performFetchAllItems(token);

    // Si le jeton a expiré (401/403), tenter un refresh_token automatique (B-04)
    if (res.status === 401 || res.status === 403) {
      const refreshed = await this.refreshAccessToken(userId);
      if (refreshed) {
        token = refreshed;
        res = await performFetchAllItems(token);
      }
    }

    if (!res.ok) {
      const errMsg = `Erreur de synchronisation Simkl (${res.status})`;
      db.prepare(
        'UPDATE users SET simkl_last_sync_at = ?, simkl_last_sync_status = ?, simkl_last_sync_error = ? WHERE id = ?'
      ).run(new Date().toISOString(), 'error', errMsg, userId);
      throw new Error(errMsg);
    }

    const data = await res.json();

    // Récupérer les vraies statistiques de temps de visionnage depuis l'API Simkl (/users/{id}/stats)
    try {
      let accountId = userRow?.simkl_user_id;
      if (!accountId) {
        const settingsRes = await fetch(`${SIMKL_API_BASE}/users/settings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'simkl-api-key': clientId,
          },
          signal: AbortSignal.timeout(8000),
        });
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.account?.id) {
            accountId = String(settingsData.account.id);
            db.prepare('UPDATE users SET simkl_user_id = ? WHERE id = ?').run(accountId, userId);
          }
        }
      }

      if (accountId) {
        const statsRes = await fetch(`${SIMKL_API_BASE}/users/${accountId}/stats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'simkl-api-key': clientId,
          },
          signal: AbortSignal.timeout(8000),
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          db.prepare('UPDATE users SET simkl_stats_json = ? WHERE id = ?').run(
            JSON.stringify(statsData),
            userId
          );
        }
      }
    } catch (e) {
      logger.warn('Simkl', 'Impossible de récupérer /users/stats', { userId, error: String(e) });
    }

    let importedMovies = 0;
    let importedShows = 0;
    let importedAnime = 0;
    let importedManga = 0;
    let importedWatchlist = 0;

    const insertWatchedStmt = db.prepare(`
      INSERT INTO watched_items (user_id, tmdb_id, media_type, title, release_date, rating, watched_at, genres, runtime, season_number, episode_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        rating = COALESCE(excluded.rating, watched_items.rating),
        watched_at = COALESCE(watched_items.watched_at, excluded.watched_at),
        genres = COALESCE(watched_items.genres, excluded.genres),
        runtime = CASE WHEN watched_items.runtime > 0 THEN watched_items.runtime ELSE excluded.runtime END
    `);

    const insertWatchlistStmt = db.prepare(`
      INSERT INTO watchlist (user_id, tmdb_id, media_type, title, release_date, status, genres, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type) DO UPDATE SET
        status = excluded.status,
        genres = COALESCE(watchlist.genres, excluded.genres)
    `);

    const extractWatchedEpisodeDates = (seasonsArr: any[]): string[] => {
      const dates: string[] = [];
      if (!Array.isArray(seasonsArr)) return dates;
      for (const s of seasonsArr) {
        if (Array.isArray(s.episodes)) {
          for (const ep of s.episodes) {
            if (ep.watched_at) {
              dates.push(normalizeIsoDate(ep.watched_at));
            }
          }
        }
      }
      return dates;
    };

    // 1. Traiter les films Simkl
    if (Array.isArray(data.movies)) {
      for (const m of data.movies) {
        const tmdbId = m.movie?.ids?.tmdb ? parseInt(m.movie.ids.tmdb, 10) : null;
        if (!tmdbId) continue;

        const title = m.movie?.title || 'Film sans titre';
        const year = m.movie?.year ? `${m.movie.year}-01-01` : null;
        const status = m.status || 'completed';
        const runtime = m.movie?.runtime ? Number(m.movie.runtime) : 115;

        if (status === 'completed') {
          const watchedAt = normalizeIsoDate(m.last_watched_at || m.last_watched);
          insertWatchedStmt.run(
            userId,
            tmdbId,
            'movie',
            title,
            year,
            m.user_rating || null,
            watchedAt,
            null,
            runtime,
            0,
            0
          );
          importedMovies++;
        } else if (status === 'plantowatch' || status === 'watching' || status === 'hold') {
          const mappedStatus = status === 'plantowatch' ? 'plan_to_watch' : status;
          insertWatchlistStmt.run(userId, tmdbId, 'movie', title, year, mappedStatus, null, new Date().toISOString());
          importedWatchlist++;
        }
      }
    }

    // 2. Traiter les séries TV Simkl (JAMAIS marquées comme animé/manga - U-02)
    if (Array.isArray(data.shows)) {
      for (const s of data.shows) {
        const tmdbId = s.show?.ids?.tmdb ? parseInt(s.show.ids.tmdb, 10) : null;
        if (!tmdbId) continue;

        const title = s.show?.title || 'Série sans titre';
        const year = s.show?.year ? `${s.show.year}-01-01` : null;
        const status = s.status || 'completed';
        const epRuntime = s.show?.runtime ? Number(s.show.runtime) : 45;
        const watchedEpsCount = Number(s.watched_episodes_count) || Number(s.total_episodes_count) || 10;

        if (status === 'completed' || status === 'watching' || watchedEpsCount > 0) {
          const watchedAt = normalizeIsoDate(s.last_watched_at || s.last_watched);
          const epDates = extractWatchedEpisodeDates(s.seasons);

          if (epDates.length > 0 && Array.isArray(s.seasons)) {
            for (const seasonObj of s.seasons) {
              const sNum = Number(seasonObj.number) || 1;
              if (Array.isArray(seasonObj.episodes)) {
                for (const epObj of seasonObj.episodes) {
                  const eNum = Number(epObj.number) || 1;
                  const epDate = normalizeIsoDate(epObj.watched_at || watchedAt);
                  insertWatchedStmt.run(
                    userId,
                    tmdbId,
                    'tv',
                    title,
                    year,
                    s.user_rating || null,
                    epDate,
                    null,
                    epRuntime,
                    sNum,
                    eNum
                  );
                }
              }
            }
          }

          const totalShowRuntime = epDates.length > 0 ? 0 : Math.max(1, watchedEpsCount) * epRuntime;
          insertWatchedStmt.run(
            userId,
            tmdbId,
            'tv',
            title,
            year,
            s.user_rating || null,
            watchedAt,
            null,
            totalShowRuntime,
            0,
            0
          );
          importedShows++;
        }

        if (status === 'plantowatch' || status === 'watching' || status === 'hold') {
          const mappedStatus = status === 'plantowatch' ? 'plan_to_watch' : status;
          insertWatchlistStmt.run(userId, tmdbId, 'tv', title, year, mappedStatus, null, new Date().toISOString());
          importedWatchlist++;
        }
      }
    }

    // 3. Traiter les Animés et Mangas Simkl (distinction stricte manga vs anime - U-02)
    const animeGenreJson = JSON.stringify([{ id: 16, name: 'Animation' }]);
    const mangaGenreJson = JSON.stringify([{ id: 16, name: 'Manga / Animation' }]);

    const animeAndMangaList = [
      ...(Array.isArray(data.anime) ? data.anime : []),
      ...(Array.isArray(data.manga)
        ? data.manga.map((mg: any) => ({ ...mg, _forceManga: true }))
        : []),
    ];

    for (const a of animeAndMangaList) {
      const mediaObj = a.anime || a.manga || a.show || {};
      const rawTmdb = mediaObj.ids?.tmdb ? parseInt(mediaObj.ids.tmdb, 10) : null;
      const malId = mediaObj.ids?.mal ? parseInt(mediaObj.ids.mal, 10) : null;
      const simklId = mediaObj.ids?.simkl ? parseInt(mediaObj.ids.simkl, 10) : null;

      const subType = String(a.anime_type || mediaObj.type || a.type || '').toLowerCase();
      const isMangaItem =
        Boolean(a._forceManga) ||
        subType === 'manga' ||
        subType === 'novel' ||
        subType === 'manhwa' ||
        subType === 'manhua' ||
        subType === 'oneshot' ||
        subType === 'doujin';

      const tmdbId = rawTmdb || (isMangaItem ? malId || simklId : null);
      if (!tmdbId) continue;

      const title = mediaObj.title || (isMangaItem ? 'Manga sans titre' : 'Animé sans titre');
      const year = mediaObj.year ? `${mediaObj.year}-01-01` : null;
      const isMovie = !isMangaItem && subType === 'movie';
      const mediaType: 'movie' | 'tv' | 'manga' = isMangaItem ? 'manga' : isMovie ? 'movie' : 'tv';
      const status = a.status || 'completed';
      const genreJson = isMangaItem ? mangaGenreJson : animeGenreJson;

      // Si un manga était précédemment enregistré par erreur sous media_type='tv', le convertir en 'manga' (U-02)
      if (isMangaItem && rawTmdb) {
        db.prepare('DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(
          userId,
          rawTmdb,
          'tv'
        );
        db.prepare('DELETE FROM watchlist WHERE user_id = ? AND tmdb_id = ? AND media_type = ?').run(
          userId,
          rawTmdb,
          'tv'
        );
      }

      const epRuntime = mediaObj.runtime ? Number(mediaObj.runtime) : isMovie ? 105 : 24;
      const watchedEpsCount = Number(a.watched_episodes_count) || Number(a.total_episodes_count) || (isMovie ? 1 : 12);

      if (status === 'completed' || status === 'watching' || watchedEpsCount > 0) {
        const watchedAt = normalizeIsoDate(a.last_watched_at || a.last_watched);
        const epDates = extractWatchedEpisodeDates(a.seasons);

        if (!isMovie && !isMangaItem && epDates.length > 0 && Array.isArray(a.seasons)) {
          for (const seasonObj of a.seasons) {
            const sNum = Number(seasonObj.number) || 1;
            if (Array.isArray(seasonObj.episodes)) {
              for (const epObj of seasonObj.episodes) {
                const eNum = Number(epObj.number) || 1;
                const epDate = normalizeIsoDate(epObj.watched_at || watchedAt);
                insertWatchedStmt.run(
                  userId,
                  tmdbId,
                  mediaType,
                  title,
                  year,
                  a.user_rating || null,
                  epDate,
                  genreJson,
                  epRuntime,
                  sNum,
                  eNum
                );
              }
            }
          }
        }

        const totalAnimeRuntime =
          !isMovie && !isMangaItem && epDates.length > 0
            ? 0
            : isMovie
            ? epRuntime
            : Math.max(1, watchedEpsCount) * epRuntime;

        insertWatchedStmt.run(
          userId,
          tmdbId,
          mediaType,
          title,
          year,
          a.user_rating || null,
          watchedAt,
          genreJson,
          totalAnimeRuntime,
          0,
          0
        );

        if (isMangaItem) {
          importedManga++;
        } else {
          importedAnime++;
        }
      }

      if (status === 'plantowatch' || status === 'watching' || status === 'hold') {
        const mappedStatus = status === 'plantowatch' ? 'plan_to_watch' : status;
        insertWatchlistStmt.run(
          userId,
          tmdbId,
          mediaType,
          title,
          year,
          mappedStatus,
          genreJson,
          new Date().toISOString()
        );
        importedWatchlist++;
      }
    }

    // Enregistrer le succès de la synchronisation (U-04)
    db.prepare(
      'UPDATE users SET simkl_last_sync_at = ?, simkl_last_sync_status = ?, simkl_last_sync_error = NULL WHERE id = ?'
    ).run(new Date().toISOString(), 'ok', userId);

    // Enrichir en arrière-plan les titres CJK éventuels (U-05)
    TMDBService.repairCjkTitlesInDb().catch(() => {});

    return { importedMovies, importedShows, importedAnime, importedManga, importedWatchlist };
  }
}
