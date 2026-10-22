import { getSetting } from './settingsService.js';
import db from '../db/index.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMediaItem {
  id: number;
  title: string;
  original_title?: string;
  name?: string;
  original_name?: string;
  media_type: 'movie' | 'tv';
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
}

export class TMDBService {
  private static getApiKey(): string {
    const key = getSetting('TMDB_API_KEY');
    if (!key) {
      throw new Error('Clé API TMDB manquante. Veuillez la renseigner dans les Paramètres.');
    }
    return key;
  }

  private static getLanguage(): string {
    return getSetting('DEFAULT_LANGUAGE') || 'fr-FR';
  }

  private static async request<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const apiKey = this.getApiKey();
    const lang = this.getLanguage();

    const queryParams = new URLSearchParams({
      api_key: apiKey,
      language: lang,
      ...params,
    });

    const url = `${TMDB_BASE_URL}${endpoint}?${queryParams.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erreur TMDB (${res.status}): ${errText}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Obtenir les tendances (films et séries)
   */
  public static async getTrending(timeWindow: 'day' | 'week' = 'week', page: number = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.request<{ results: any[]; page: number; total_pages: number }>(`/trending/all/${timeWindow}`, {
      page: page.toString(),
    });

    const results = data.results
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item) => this.normalizeMedia(item));

    return { results, page: data.page, total_pages: data.total_pages };
  }

  /**
   * Obtenir les films populaires
   */
  public static async getPopularMovies(page: number = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.request<{ results: any[]; page: number; total_pages: number }>('/movie/popular', {
      page: page.toString(),
    });

    return {
      results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: 'movie' })),
      page: data.page,
      total_pages: data.total_pages,
    };
  }

  /**
   * Obtenir les séries populaires
   */
  public static async getPopularTV(page: number = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.request<{ results: any[]; page: number; total_pages: number }>('/tv/popular', {
      page: page.toString(),
    });

    return {
      results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: 'tv' })),
      page: data.page,
      total_pages: data.total_pages,
    };
  }

  /**
   * Recherche multi (films & séries)
   */
  public static async search(query: string, page: number = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    if (!query || query.trim().length === 0) {
      return { results: [], page: 1, total_pages: 0 };
    }

    const data = await this.request<{ results: any[]; page: number; total_pages: number }>('/search/multi', {
      query: query.trim(),
      page: page.toString(),
      include_adult: 'false',
    });

    const results = data.results
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item) => this.normalizeMedia(item));

    return { results, page: data.page, total_pages: data.total_pages };
  }

  /**
   * Obtenir les détails complets d'un média (film ou série) avec vidéos, casting et recommandations
   */
  public static async getDetails(mediaType: 'movie' | 'tv', id: number): Promise<any> {
    // Vérifier le cache SQLite
    try {
      const stmt = db.prepare('SELECT data, updated_at FROM media_cache WHERE tmdb_id = ? AND media_type = ?');
      const cached = stmt.get(id, mediaType) as { data: string; updated_at: string } | undefined;
      if (cached) {
        const cachedDate = new Date(cached.updated_at).getTime();
        // Cache valide 24 heures
        if (Date.now() - cachedDate < 24 * 60 * 60 * 1000) {
          return JSON.parse(cached.data);
        }
      }
    } catch (e) {
      // Ignorer erreur cache
    }

    const endpoint = `/${mediaType}/${id}`;
    const data = await this.request<any>(endpoint, {
      append_to_response: 'credits,videos,recommendations,similar,keywords,release_dates,watch/providers',
    });

    // Si le synopsis en français est vide, tenter de récupérer l'anglais
    if (!data.overview || data.overview.trim() === '') {
      try {
        const enData = await this.request<any>(endpoint, { language: 'en-US' });
        if (enData.overview) {
          data.overview = enData.overview;
        }
      } catch (e) {
        // Fallback muet
      }
    }

    const normalized = this.normalizeMedia({ ...data, media_type: mediaType }, true);

    // Mettre en cache
    try {
      const insertStmt = db.prepare(`
        INSERT INTO media_cache (tmdb_id, media_type, data, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(tmdb_id, media_type) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
      `);
      insertStmt.run(id, mediaType, JSON.stringify(normalized));
    } catch (e) {
      // Ignorer
    }

    return normalized;
  }

  /**
   * Obtenir les recommandations TMDB directes pour un item donné
   */
  public static async getRecommendations(mediaType: 'movie' | 'tv', id: number): Promise<TMDBMediaItem[]> {
    try {
      const data = await this.request<{ results: any[] }>(`/${mediaType}/${id}/recommendations`);
      return (data.results || []).map((item) => this.normalizeMedia({ ...item, media_type: mediaType }));
    } catch (err) {
      return [];
    }
  }

  /**
   * Découvrir des médias par genre
   */
  public static async discoverByGenre(mediaType: 'movie' | 'tv', genreId: number, page: number = 1): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const data = await this.request<{ results: any[]; total_pages: number }>(`/discover/${mediaType}`, {
      with_genres: genreId.toString(),
      sort_by: 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': '50',
    });

    return {
      results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: mediaType })),
      total_pages: data.total_pages,
    };
  }

  /**
   * Découvrir des médias par plateforme de streaming (Netflix, Prime, Disney+, Crunchyroll...)
   */
  public static async discoverByProvider(
    mediaType: 'movie' | 'tv',
    providerId: number,
    genreId?: number,
    page: number = 1
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const params: Record<string, string> = {
      watch_region: 'FR',
      with_watch_providers: providerId.toString(),
      sort_by: 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': '30',
    };

    if (genreId) {
      params.with_genres = genreId.toString();
    }

    const data = await this.request<{ results: any[]; total_pages: number }>(`/discover/${mediaType}`, params);

    return {
      results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: mediaType })),
      total_pages: data.total_pages,
    };
  }

  /**
   * Découvrir des Animés / Mangas
   */
  public static async discoverAnime(page: number = 1): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const data = await this.request<{ results: any[]; total_pages: number }>('/discover/tv', {
      with_genres: '16', // Animation
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': '20',
    });

    return {
      results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: 'tv' })),
      total_pages: data.total_pages,
    };
  }

  /**
   * Normaliser les champs films/séries en un objet uniforme
   */
  private static normalizeMedia(item: any, isDetailed: boolean = false): TMDBMediaItem & Record<string, any> {
    const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
    const title = item.title || item.name || item.original_title || item.original_name || 'Sans titre';
    const releaseDate = item.release_date || item.first_air_date || '';

    // Trouver la bande-annonce YouTube en français en priorité, sinon VO
    let trailerKey: string | null = null;
    if (item.videos && item.videos.results) {
      const frTrailer = item.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer' && (v.iso_639_1 === 'fr' || v.name.toLowerCase().includes('vf') || v.name.toLowerCase().includes('vost')));
      const anyTrailer = item.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
      const anyVideo = item.videos.results.find((v: any) => v.site === 'YouTube');
      trailerKey = frTrailer?.key || anyTrailer?.key || anyVideo?.key || null;
    }

    const base: any = {
      id: item.id,
      media_type: mediaType,
      title,
      original_title: item.original_title || item.original_name || title,
      overview: item.overview || '',
      poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
      backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
      release_date: releaseDate,
      vote_average: Math.round((item.vote_average || 0) * 10) / 10,
      vote_count: item.vote_count || 0,
      popularity: item.popularity || 0,
      genre_ids: item.genre_ids || (item.genres ? item.genres.map((g: any) => g.id) : []),
      genres: item.genres || [],
    };

    if (isDetailed) {
      base.tagline = item.tagline || '';
      base.runtime = item.runtime || (item.episode_run_time ? item.episode_run_time[0] : null);
      base.status = item.status;
      base.number_of_seasons = item.number_of_seasons;
      base.number_of_episodes = item.number_of_episodes;
      base.seasons = item.seasons || [];
      base.trailer_key = trailerKey;

      // Plateformes de streaming disponibles en France (Netflix, Prime, Disney+, Crunchyroll, etc.)
      const providersFR = item['watch/providers']?.results?.FR;
      base.streaming_providers = providersFR?.flatrate?.map((p: any) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo_path: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
      })) || [];
      base.buy_providers = providersFR?.buy?.map((p: any) => ({
        id: p.provider_id,
        name: p.provider_name,
        logo_path: p.logo_path ? `https://image.tmdb.org/t/p/w92${p.logo_path}` : null,
      })) || [];

      base.cast = (item.credits?.cast || []).slice(0, 12).map((actor: any) => ({
        id: actor.id,
        name: actor.name,
        character: actor.character,
        profile_path: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null,
      }));
      base.director = (item.credits?.crew || []).find((c: any) => c.job === 'Director')?.name || null;
    }

    return base;
  }
}
