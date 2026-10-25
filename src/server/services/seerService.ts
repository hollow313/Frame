import { getSetting } from './settingsService.js';

export interface SeerMediaStatus {
  id?: number;
  tmdbId: number;
  status: number; // 1 = UNKNOWN, 2 = PENDING, 3 = PROCESSING, 4 = PARTIALLY_AVAILABLE, 5 = AVAILABLE
  statusName: 'unknown' | 'pending' | 'processing' | 'partially_available' | 'available';
  requested: boolean;
  requestId?: number;
  requestedBy?: string | null;
  requestedById?: number | null;
  requestedAt?: string | null;
  serviceId?: number;
}

export class SeerService {
  private static getUrl(): string {
    return (getSetting('SEER_URL') || '').replace(/\/$/, '');
  }

  private static getApiKey(): string {
    return getSetting('SEER_API_KEY') || '';
  }

  public static isConfigured(): boolean {
    return Boolean(this.getUrl() && this.getApiKey());
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = this.getUrl();
    const apiKey = this.getApiKey();

    if (!url || !apiKey) {
      throw new Error('Overseerr / Jellyseerr n\'est pas configuré.');
    }

    const fullUrl = `${url}/api/v1${endpoint}`;
    const res = await fetch(fullUrl, {
      ...options,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erreur Seer (${res.status}): ${errText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Tester la connexion ET la validité de la Clé API avec Overseerr/Jellyseerr/Seerr
   * Note : /api/v1/status est public sur Seerr et ne vérifie pas X-Api-Key.
   * On vérifie donc aussi /api/v1/auth/me pour valider que la clé API a bien les droits d'accès.
   */
  public static async testConnection(): Promise<{ success: boolean; version?: string; message: string }> {
    try {
      const status = await this.request<{ version: string }>('/status');
      try {
        const me = await this.request<{ id?: number; displayName?: string; username?: string; email?: string }>('/auth/me');
        const accountLabel = me?.displayName || me?.username || me?.email || 'Admin';
        return {
          success: true,
          version: status.version,
          message: `Connexion et Clé API valides (v${status.version} • Compte: ${accountLabel})`,
        };
      } catch (authErr: any) {
        return {
          success: false,
          version: status.version,
          message: `Serveur Seer joint (v${status.version}), mais la Clé API Seer est refusée (403). Recollez la Clé API principale depuis Seer (Settings > General) puis cliquez sur Enregistrer.`,
        };
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Échec de connexion' };
    }
  }

  public static async getStatus(): Promise<{ connected: boolean; version?: string; message: string }> {
    if (!this.isConfigured()) {
      return { connected: false, message: "Overseerr / Jellyseerr n'est pas configuré." };
    }
    const r = await this.testConnection();
    return { connected: r.success, version: r.version, message: r.message };
  }

  /**
   * Récupérer le statut d'un média dans Seer (disponible, en cours, etc.)
   */
  public static async getMediaStatus(mediaType: 'movie' | 'tv', tmdbId: number): Promise<SeerMediaStatus> {
    if (!this.isConfigured()) {
      return { tmdbId, status: 1, statusName: 'unknown', requested: false };
    }

    try {
      // Overseerr endpoint /movie/{id} ou /tv/{id}
      const data = await this.request<any>(`/${mediaType}/${tmdbId}`);
      const mediaInfo = data?.mediaInfo;

      if (!mediaInfo) {
        return { tmdbId, status: 1, statusName: 'unknown', requested: false };
      }

      const statusMap: Record<number, 'unknown' | 'pending' | 'processing' | 'partially_available' | 'available'> = {
        1: 'unknown',
        2: 'pending',
        3: 'processing',
        4: 'partially_available',
        5: 'available',
      };

      const firstReq = mediaInfo.requests && mediaInfo.requests.length > 0 ? mediaInfo.requests[0] : null;

      return {
        id: mediaInfo.id,
        tmdbId,
        status: mediaInfo.status || 1,
        statusName: statusMap[mediaInfo.status] || 'unknown',
        requested: Boolean(firstReq),
        requestId: firstReq?.id,
        requestedBy: firstReq?.requestedBy?.displayName || firstReq?.requestedBy?.username || null,
        requestedById: firstReq?.requestedBy?.id || null,
        requestedAt: firstReq?.createdAt || null,
        serviceId: mediaInfo.serviceId,
      };
    } catch (err) {
      return { tmdbId, status: 1, statusName: 'unknown', requested: false };
    }
  }

  /**
   * Annuler ou supprimer une demande sur Overseerr / Jellyseerr
   */
  public static async deleteRequest(requestId: number): Promise<boolean> {
    if (!this.isConfigured()) {
      throw new Error("Overseerr / Jellyseerr n'est pas configuré");
    }

    await this.request<any>(`/request/${requestId}`, {
      method: 'DELETE',
    });
    return true;
  }

  /**
   * Approuver manuellement une demande (lance le téléchargement Radarr / Sonarr)
   */
  public static async approveRequest(requestId: number): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Overseerr / Jellyseerr n'est pas configuré");
    }
    return this.request<any>(`/request/${requestId}/approve`, {
      method: 'POST',
    });
  }

  /**
   * Refuser manuellement une demande
   */
  public static async declineRequest(requestId: number): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error("Overseerr / Jellyseerr n'est pas configuré");
    }
    return this.request<any>(`/request/${requestId}/decline`, {
      method: 'POST',
    });
  }

  /**
   * Obtenir toutes les demandes actuelles (Overseerr requests)
   */
  public static async getRequests(take: number = 20, skip: number = 0, filter: string = 'all'): Promise<{
    pageInfo: { pages: number; pageSize: number; results: number; page: number };
    results: any[];
  }> {
    if (!this.isConfigured()) {
      return { pageInfo: { pages: 0, pageSize: take, results: 0, page: 1 }, results: [] };
    }

    return this.request<any>(`/request?take=${take}&skip=${skip}&filter=${filter}&sort=added`);
  }

  /**
   * Obtenir la liste des utilisateurs Overseerr/Jellyseerr
   */
  public static async getUsers(): Promise<Array<{ id: number; email?: string; username?: string; displayName?: string; userType?: number; permissions?: number }>> {
    if (!this.isConfigured()) return [];
    try {
      const data = await this.request<{ results: any[] }>('/user?take=50');
      return data.results || [];
    } catch {
      return [];
    }
  }

  /**
   * Créer une demande de film ou série dans Overseerr / Jellyseerr
   */
  public static async createRequest(params: {
    mediaType: 'movie' | 'tv';
    mediaId: number; // TMDB ID
    seasons?: number[] | 'all';
    is4k?: boolean;
    userId?: number;
  }): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Overseerr / Jellyseerr n\'est pas configuré');
    }

    const defaultUserId = getSetting('SEER_DEFAULT_USER_ID');
    const effectiveUserId = params.userId || (defaultUserId ? parseInt(defaultUserId, 10) : undefined);

    const payload: any = {
      mediaType: params.mediaType,
      mediaId: params.mediaId,
      is4k: Boolean(params.is4k),
    };

    if (effectiveUserId) {
      payload.userId = effectiveUserId;
    }

    if (params.mediaType === 'tv') {
      if (params.seasons === 'all' || !params.seasons) {
        // Sur certaines versions récentes de Seerr (v3+), seasons: 'all' peut nécessiter la liste explicite des numéros de saisons
        try {
          const tvInfo = await this.request<any>(`/tv/${params.mediaId}`);
          if (Array.isArray(tvInfo?.seasons)) {
            const seasonNums = tvInfo.seasons
              .map((s: any) => Number(s.seasonNumber ?? s.season_number))
              .filter((n: number) => !isNaN(n) && n > 0);
            payload.seasons = seasonNums.length > 0 ? seasonNums : 'all';
          } else {
            payload.seasons = 'all';
          }
        } catch {
          payload.seasons = 'all';
        }
      } else {
        payload.seasons = params.seasons;
      }
    }

    try {
      return await this.request<any>('/request', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      const msg = String(err?.message || '');
      // Si l'erreur 403 provient de l'usurpation d'un userId secondaire (ex: ID 3 sans permission REQUEST ou clé non-admin),
      // on réessaie automatiquement sans userId (avec le compte propriétaire de la clé API).
      if (msg.includes('403') && payload.userId) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.userId;
        try {
          return await this.request<any>('/request', {
            method: 'POST',
            body: JSON.stringify(fallbackPayload),
          });
        } catch (retryErr: any) {
          const retryMsg = String(retryErr?.message || '');
          if (retryMsg.includes('403')) {
            throw new Error(
              'Erreur Seer (403) : La Clé API Seer enregistrée est invalide ou n\'a pas la permission de créer des demandes. Allez dans Paramètres > Serveurs & API, recollez votre Clé API Seer (depuis Seer > Settings > General) et cliquez sur Enregistrer.'
            );
          }
          throw retryErr;
        }
      }

      if (msg.includes('403')) {
        throw new Error(
          'Erreur Seer (403) : La Clé API Seer enregistrée est invalide ou n\'a pas la permission de créer des demandes. Allez dans Paramètres > Serveurs & API, recollez votre Clé API Seer (depuis Seer > Settings > General) et cliquez sur Enregistrer.'
        );
      }
      throw err;
    }
  }
}
