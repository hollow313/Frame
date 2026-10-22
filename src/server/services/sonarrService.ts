import { getSetting } from './settingsService.js';
import { db } from '../db/index.js';
import { TMDBService } from './tmdbService.js';

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
   * Rechercher une série dans Sonarr par titre ou lookup (correspondance stricte)
   */
  public static async checkSonarrSeries(title: string, tvdbId?: number): Promise<ArrMediaStatus> {
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

      const cleanTitle = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();

      const normalizedTarget = cleanTitle(title);

      // Trouver la série correspondante strictement
      let found = results.find((r) => tvdbId && r.tvdbId === tvdbId);
      if (!found) {
        found = results.find((r) => {
          const tNorm = r.title ? cleanTitle(r.title) : '';
          const origNorm = r.originalTitle ? cleanTitle(r.originalTitle) : '';
          return (tNorm.length > 0 && tNorm === normalizedTarget) || (origNorm.length > 0 && origNorm === normalizedTarget);
        });
      }

      if (!found) {
        return { inLibrary: false, downloaded: false, monitored: false };
      }

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

  /**
   * Importer toutes les séries et animés non monitorés de Sonarr dans les médias "Déjà vu"
   */
  public static async syncUnmonitoredFromSonarr(userId: number): Promise<{
    success: boolean;
    importedShows: number;
    importedAnime: number;
    totalImported: number;
    titles: string[];
    message: string;
  }> {
    if (!this.isSonarrConfigured()) {
      throw new Error('Sonarr n\'est pas configuré dans les paramètres.');
    }

    const url = `${this.getSonarrUrl()}/api/v3/series`;
    const res = await fetch(url, { headers: { 'X-Api-Key': this.getSonarrApiKey() } });
    if (!res.ok) {
      throw new Error(`Erreur Sonarr (${res.status}): ${await res.text()}`);
    }

    const allSeries = (await res.json()) as any[];
    // Filtrer les séries non monitorées (monitored === false)
    const unmonitored = allSeries.filter((s) => s.monitored === false);

    let importedShows = 0;
    let importedAnime = 0;
    const importedTitles: string[] = [];

    const insertStmt = db.prepare(`
      INSERT INTO watched_items (
        user_id, tmdb_id, media_type, title, poster_path, release_date, watched_at, synced_simkl, episodes_watched, runtime_minutes, genres
      )
      VALUES (?, ?, 'tv', ?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(user_id, tmdb_id, media_type, season_number, episode_number) DO UPDATE SET
        episodes_watched = excluded.episodes_watched,
        runtime_minutes = excluded.runtime_minutes,
        genres = COALESCE(excluded.genres, watched_items.genres)
    `);

    for (const s of unmonitored) {
      try {
        const isAnime = s.seriesType === 'anime' || (s.genres || []).some((g: string) => g.toLowerCase().includes('anim'));
        const eps = s.statistics?.episodeFileCount || s.statistics?.totalEpisodeCount || 12;
        const runtimePerEp = s.runtime || (isAnime ? 24 : 45);
        const totalMins = eps * runtimePerEp;

        let tmdbId: number | null = null;
        let posterPath: string | null = null;
        let releaseDate: string | null = s.year ? `${s.year}-01-01` : null;

        // Tenter de trouver le TMDB ID via TVDB ID
        if (s.tvdbId) {
          try {
            const tmdbFound = await TMDBService.findByTvdbId(s.tvdbId);
            if (tmdbFound) {
              tmdbId = tmdbFound.id;
              if (tmdbFound.poster_path) {
                posterPath = tmdbFound.poster_path.startsWith('http') ? tmdbFound.poster_path : `https://image.tmdb.org/t/p/w500${tmdbFound.poster_path}`;
              }
              if (tmdbFound.first_air_date) {
                releaseDate = tmdbFound.first_air_date;
              }
            }
          } catch {}
        }

        // Si non trouvé par TVDB, chercher par titre
        if (!tmdbId && s.title) {
          try {
            const searchRes = await TMDBService.search(s.title, 1);
            const foundTv = (searchRes.results || []).find((r: any) => r.media_type === 'tv') || searchRes.results?.[0];
            if (foundTv) {
              tmdbId = foundTv.id;
              if (!posterPath && foundTv.poster_path) {
                posterPath = foundTv.poster_path.startsWith('http') ? foundTv.poster_path : `https://image.tmdb.org/t/p/w500${foundTv.poster_path}`;
              }
            }
          } catch {}
        }

        // Fallback si TMDB ID toujours introuvable
        if (!tmdbId) {
          tmdbId = s.tvdbId ? s.tvdbId : (900000 + (s.id || Math.floor(Math.random() * 100000)));
        }

        // Poster depuis Sonarr si absent
        if (!posterPath && s.images && s.images.length > 0) {
          const posterObj = s.images.find((img: any) => img.coverType === 'poster');
          if (posterObj?.remoteUrl) {
            posterPath = posterObj.remoteUrl;
          }
        }

        const genresList = (s.genres || []).map((name: string) => ({ id: 0, name }));
        if (isAnime && !genresList.some((g: any) => g.id === 16 || g.name?.toLowerCase().includes('anim'))) {
          genresList.push({ id: 16, name: 'Animation' });
        }

        insertStmt.run(
          userId,
          tmdbId,
          s.title || 'Inconnu',
          posterPath,
          releaseDate,
          new Date().toISOString(),
          eps,
          totalMins,
          JSON.stringify(genresList)
        );

        if (isAnime) importedAnime++;
        else importedShows++;
        importedTitles.push(s.title);
      } catch (e) {
        // Ignorer doublons ou erreurs ponctuelles
      }
    }

    return {
      success: true,
      importedShows,
      importedAnime,
      totalImported: importedShows + importedAnime,
      titles: importedTitles,
      message: `Synchronisation Sonarr terminée ! ${importedAnime} animés et ${importedShows} séries non monitorés importés dans Déjà Vu.`,
    };
  }
}
