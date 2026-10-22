import { getSetting } from './settingsService.js';

export interface SeerMediaStatus {
  id?: number;
  tmdbId: number;
  status: number; // 1 = UNKNOWN, 2 = PENDING, 3 = PROCESSING, 4 = PARTIALLY_AVAILABLE, 5 = AVAILABLE
  statusName: 'unknown' | 'pending' | 'processing' | 'partially_available' | 'available';
  requested: boolean;
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
   * Tester la connexion avec Overseerr/Jellyseerr
   */
  public static async testConnection(): Promise<{ success: boolean; version?: string; message: string }> {
    try {
      const status = await this.request<{ version: string }>('/status');
      return { success: true, version: status.version, message: `Connexion réussie (v${status.version})` };
    } catch (err: any) {
      return { success: false, message: err.message || 'Échec de connexion' };
    }
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

      return {
        id: mediaInfo.id,
        tmdbId,
        status: mediaInfo.status || 1,
        statusName: statusMap[mediaInfo.status] || 'unknown',
        requested: Boolean(mediaInfo.requests && mediaInfo.requests.length > 0),
        serviceId: mediaInfo.serviceId,
      };
    } catch (err) {
      return { tmdbId, status: 1, statusName: 'unknown', requested: false };
    }
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

    const payload: any = {
      mediaType: params.mediaType,
      mediaId: params.mediaId,
      is4k: Boolean(params.is4k),
    };

    if (params.userId) {
      payload.userId = params.userId;
    }

    if (params.mediaType === 'tv') {
      if (params.seasons === 'all' || !params.seasons) {
        payload.seasons = 'all';
      } else {
        payload.seasons = params.seasons;
      }
    }

    return this.request<any>('/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}
