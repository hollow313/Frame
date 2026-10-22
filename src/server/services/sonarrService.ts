import { getSetting } from './settingsService.js';

export interface ArrMediaStatus {
  inLibrary: boolean;
  downloaded: boolean;
  monitored: boolean;
  title?: string;
  id?: number;
  path?: string;
  sizeOnDisk?: number;
  totalEpisodes?: number;
  downloadedEpisodes?: number;
}

export class ArrService {
  // Sonarr Helpers
  private static getSonarrUrl(): string {
    return (getSetting('SONARR_URL') || '').replace(/\/$/, '');
  }

  private static getSonarrApiKey(): string {
    return getSetting('SONARR_API_KEY') || '';
  }

  // Radarr Helpers
  private static getRadarrUrl(): string {
    return (getSetting('RADARR_URL') || '').replace(/\/$/, '');
  }

  private static getRadarrApiKey(): string {
    return getSetting('RADARR_API_KEY') || '';
  }

  public static isSonarrConfigured(): boolean {
    return Boolean(this.getSonarrUrl() && this.getSonarrApiKey());
  }

  public static isRadarrConfigured(): boolean {
    return Boolean(this.getRadarrUrl() && this.getRadarrApiKey());
  }

  /**
   * Tester la connexion Sonarr
   */
  public static async testSonarr(): Promise<{ success: boolean; version?: string; message: string }> {
    if (!this.isSonarrConfigured()) return { success: false, message: 'Sonarr non configuré' };
    try {
      const url = `${this.getSonarrUrl()}/api/v3/system/status`;
      const res = await fetch(url, { headers: { 'X-Api-Key': this.getSonarrApiKey() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { version: string };
      return { success: true, version: data.version, message: `Sonarr connecté (v${data.version})` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Erreur Sonarr' };
    }
  }

  /**
   * Tester la connexion Radarr
   */
  public static async testRadarr(): Promise<{ success: boolean; version?: string; message: string }> {
    if (!this.isRadarrConfigured()) return { success: false, message: 'Radarr non configuré' };
    try {
      const url = `${this.getRadarrUrl()}/api/v3/system/status`;
      const res = await fetch(url, { headers: { 'X-Api-Key': this.getRadarrApiKey() } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { version: string };
      return { success: true, version: data.version, message: `Radarr connecté (v${data.version})` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Erreur Radarr' };
    }
  }

  /**
   * Rechercher une série dans Sonarr par titre ou lookup
   */
  public static async checkSonarrSeries(title: string): Promise<ArrMediaStatus> {
    if (!this.isSonarrConfigured() || !title) {
      return { inLibrary: false, downloaded: false, monitored: false };
    }

    try {
      const query = encodeURIComponent(title);
      const url = `${this.getSonarrUrl()}/api/v3/series/lookup?term=${query}`;
      const res = await fetch(url, { headers: { 'X-Api-Key': this.getSonarrApiKey() } });
      if (!res.ok) return { inLibrary: false, downloaded: false, monitored: false };

      const results = await res.json() as any[];
      if (!results || results.length === 0) {
        return { inLibrary: false, downloaded: false, monitored: false };
      }

      // Trouver la série correspondante
      const found = results[0];
      const inLibrary = Boolean(found.id && found.id > 0);
      const downloaded = Boolean(found.statistics && found.statistics.percentOfEpisodes === 100);

      return {
        inLibrary,
        downloaded,
        monitored: Boolean(found.monitored),
        title: found.title,
        id: found.id,
        path: found.path,
        sizeOnDisk: found.statistics?.sizeOnDisk,
        totalEpisodes: found.statistics?.totalEpisodeCount || 0,
        downloadedEpisodes: found.statistics?.episodeFileCount || 0,
      };
    } catch (err) {
      return { inLibrary: false, downloaded: false, monitored: false };
    }
  }

  /**
   * Rechercher un film dans Radarr par tmdbId
   */
  public static async checkRadarrMovie(tmdbId: number): Promise<ArrMediaStatus> {
    if (!this.isRadarrConfigured() || !tmdbId) {
      return { inLibrary: false, downloaded: false, monitored: false };
    }

    try {
      const url = `${this.getRadarrUrl()}/api/v3/movie?tmdbId=${tmdbId}`;
      const res = await fetch(url, { headers: { 'X-Api-Key': this.getRadarrApiKey() } });
      if (!res.ok) return { inLibrary: false, downloaded: false, monitored: false };

      const results = await res.json() as any[];
      if (!results || results.length === 0) {
        return { inLibrary: false, downloaded: false, monitored: false };
      }

      const movie = results[0];
      return {
        inLibrary: true,
        downloaded: Boolean(movie.hasFile),
        monitored: Boolean(movie.monitored),
        title: movie.title,
        id: movie.id,
        path: movie.path,
        sizeOnDisk: movie.sizeOnDisk,
      };
    } catch (err) {
      return { inLibrary: false, downloaded: false, monitored: false };
    }
  }
}
