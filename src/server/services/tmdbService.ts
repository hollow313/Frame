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
   * Rechercher une œuvre par son identifiant TVDB
   */
  public static async findByTvdbId(tvdbId: number): Promise<any | null> {
    try {
      const data = await this.request<any>(`/find/${tvdbId}`, { external_source: 'tvdb_id' });
      const tvResults = data.tv_results || [];
      return tvResults.length > 0 ? tvResults[0] : null;
    } catch {
      return null;
    }
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
    page: number = 1,
    recentOnly: boolean = false
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    // En France, Amazon Prime Video utilise principalement le provider ID 119 (et 9 pour Amazon Video/US)
    let providerString = providerId.toString();
    if (providerId === 9 || providerId === 119) {
      providerString = '119|9';
    }

    const params: Record<string, string> = {
      watch_region: 'FR',
      with_watch_providers: providerString,
      with_watch_monetization_types: 'flatrate|free|ads',
      sort_by: recentOnly ? 'primary_release_date.desc' : 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': recentOnly ? '5' : '20',
    };

    // Si on recherche des sorties récentes du moment (18 derniers mois jusqu'aux prochaines semaines)
    if (recentOnly) {
      const eighteenMonthsAgo = new Date(Date.now() - 540 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      if (mediaType === 'movie') {
        params['primary_release_date.gte'] = eighteenMonthsAgo;
        params['primary_release_date.lte'] = nextMonth;
        params.sort_by = 'popularity.desc';
      } else {
        params['first_air_date.gte'] = eighteenMonthsAgo;
        params['first_air_date.lte'] = nextMonth;
        params.sort_by = 'popularity.desc';
      }
    }

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
   * Découvrir des Animés / Mangas (vrais animés japonais, filtrés pour exclure les dessins animés pour enfants)
   */
  public static async discoverAnime(
    type: 'tv' | 'movie' | 'all' = 'tv',
    page: number = 1
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const endpoint = type === 'movie' ? '/discover/movie' : '/discover/tv';
    
    // Exclusion des genres enfants (10762 = Kids pour TV, 10751 = Family)
    const withoutGenres = type === 'movie' ? '10751' : '10762,10751';

    const data = await this.request<{ results: any[]; total_pages: number }>(endpoint, {
      with_genres: '16', // Animation
      with_original_language: 'ja',
      without_genres: withoutGenres,
      sort_by: 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': '15',
    });

    const targetType = type === 'movie' ? 'movie' : 'tv';
    return {
      results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: targetType })),
      total_pages: data.total_pages,
    };
  }

  private static applyDateConstraints(
    params: Record<string, string>,
    targetType: 'movie' | 'tv',
    dateFilter?: string,
    year?: number,
    recentOnly?: boolean
  ) {
    const now = new Date();
    const dateFieldGte = targetType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
    const dateFieldLte = targetType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
    const yearField = targetType === 'movie' ? 'primary_release_year' : 'first_air_date_year';
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    if (dateFilter === '7d') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const future7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      params[dateFieldGte] = formatDate(past7);
      params[dateFieldLte] = formatDate(future7);
      params['vote_count.gte'] = '1';
    } else if (dateFilter === '30d') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      params[dateFieldGte] = formatDate(past30);
      params[dateFieldLte] = formatDate(now);
      params['vote_count.gte'] = '1';
    } else if (dateFilter === '6m') {
      const past180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      params[dateFieldGte] = formatDate(past180);
      params[dateFieldLte] = formatDate(now);
      params['vote_count.gte'] = '5';
    } else if (dateFilter === 'this_year') {
      const currentYear = now.getFullYear();
      params[yearField] = currentYear.toString();
    } else if (year) {
      params[yearField] = year.toString();
    } else if (dateFilter?.startsWith('year_')) {
      const y = parseInt(dateFilter.replace('year_', ''), 10);
      if (!isNaN(y)) params[yearField] = y.toString();
    } else if (recentOnly) {
      const eighteenMonthsAgo = new Date(now.getTime() - 540 * 24 * 60 * 60 * 1000);
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      params[dateFieldGte] = formatDate(eighteenMonthsAgo);
      params[dateFieldLte] = formatDate(nextMonth);
    }
  }

  /**
   * Découverte Unifiée avancée (Films, Séries, Mangas & Animés, avec filtres par plateforme, genre et récence)
   */
  public static async discoverUnified(options: {
    type?: 'all' | 'movie' | 'tv' | 'anime';
    animeType?: 'tv' | 'movie';
    providerId?: number;
    genreId?: number;
    recentOnly?: boolean;
    dateFilter?: string;
    year?: number;
    sortBy?: 'popularity.desc' | 'release_date.desc' | 'vote_average.desc';
    page?: number;
  }): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const page = options.page || 1;
    const type = options.type || 'all';
    const recentOnly = options.recentOnly ?? false;

    // CAS 1: Animés / Mangas (Animation Japonaise adulte/ado)
    if (type === 'anime') {
      const targetType = options.animeType || 'tv';
      const endpoint = targetType === 'movie' ? '/discover/movie' : '/discover/tv';
      const withoutGenres = targetType === 'movie' ? '10751' : '10762,10751';

      const params: Record<string, string> = {
        with_original_language: 'ja',
        with_genres: options.genreId ? `16,${options.genreId}` : '16',
        without_genres: withoutGenres,
        page: page.toString(),
        'vote_count.gte': '10',
      };

      if (options.sortBy) {
        if (options.sortBy === 'release_date.desc') {
          params.sort_by = targetType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
        } else {
          params.sort_by = options.sortBy;
        }
      } else {
        params.sort_by = 'popularity.desc';
      }

      if (options.providerId) {
        let providerString = options.providerId.toString();
        if (options.providerId === 9 || options.providerId === 119) providerString = '119|9';
        params.watch_region = 'FR';
        params.with_watch_providers = providerString;
        params.with_watch_monetization_types = 'flatrate|free|ads';
      }

      this.applyDateConstraints(params, targetType, options.dateFilter, options.year, recentOnly);

      const data = await this.request<{ results: any[]; total_pages: number }>(endpoint, params);
      return {
        results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: targetType })),
        total_pages: data.total_pages,
      };
    }

    // CAS 2: Un type spécifique (Film ou Série)
    if (type === 'movie' || type === 'tv') {
      const endpoint = `/discover/${type}`;
      const params: Record<string, string> = {
        page: page.toString(),
        'vote_count.gte': (recentOnly || (options.dateFilter && options.dateFilter !== 'all')) ? '5' : '15',
      };

      if (options.sortBy) {
        if (options.sortBy === 'release_date.desc') {
          params.sort_by = type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
        } else {
          params.sort_by = options.sortBy;
        }
      } else {
        params.sort_by = recentOnly ? (type === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc') : 'popularity.desc';
      }

      if (options.genreId) {
        params.with_genres = options.genreId.toString();
      }

      if (options.providerId) {
        let providerString = options.providerId.toString();
        if (options.providerId === 9 || options.providerId === 119) providerString = '119|9';
        params.watch_region = 'FR';
        params.with_watch_providers = providerString;
        params.with_watch_monetization_types = 'flatrate|free|ads';
      }

      this.applyDateConstraints(params, type, options.dateFilter, options.year, recentOnly);

      const data = await this.request<{ results: any[]; total_pages: number }>(endpoint, params);
      return {
        results: data.results.map((item) => this.normalizeMedia({ ...item, media_type: type })),
        total_pages: data.total_pages,
      };
    }

    // CAS 3: Tout (Films et Séries entrelacés)
    const hasDateConstraint = Boolean(options.dateFilter && options.dateFilter !== 'all') || Boolean(options.year) || Boolean(recentOnly);
    if (!options.providerId && !options.genreId && !hasDateConstraint && (!options.sortBy || options.sortBy === 'popularity.desc')) {
      const trending = await this.getTrending('week', page);
      return {
        results: trending.results,
        total_pages: trending.total_pages,
      };
    }

    // Requête mixte Film + TV
    const [moviesData, tvData] = await Promise.all([
      this.discoverUnified({ ...options, type: 'movie' }).catch(() => ({ results: [], total_pages: 1 })),
      this.discoverUnified({ ...options, type: 'tv' }).catch(() => ({ results: [], total_pages: 1 })),
    ]);

    const combined: TMDBMediaItem[] = [];
    const maxLen = Math.max(moviesData.results.length, tvData.results.length);
    for (let i = 0; i < maxLen; i++) {
      if (moviesData.results[i]) combined.push(moviesData.results[i]);
      if (tvData.results[i]) combined.push(tvData.results[i]);
    }

    return {
      results: combined,
      total_pages: Math.max(moviesData.total_pages, tvData.total_pages),
    };
  }

  /**
   * Obtenir le détail des épisodes d'une saison de série TV
   */
  public static async getTvSeason(tvId: number, seasonNumber: number): Promise<any> {
    const lang = this.getLanguage();
    const data = await this.request<any>(`/tv/${tvId}/season/${seasonNumber}`, { language: lang });

    const episodes = (data.episodes || []).map((ep: any) => ({
      id: ep.id,
      episode_number: ep.episode_number,
      season_number: ep.season_number,
      name: ep.name || `Épisode ${ep.episode_number}`,
      overview: ep.overview || '',
      air_date: ep.air_date,
      runtime: ep.runtime,
      vote_average: ep.vote_average ? Math.round(ep.vote_average * 10) / 10 : null,
      still_path: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
    }));

    return {
      id: data.id,
      season_number: data.season_number,
      name: data.name,
      overview: data.overview || '',
      air_date: data.air_date,
      poster_path: data.poster_path ? `https://image.tmdb.org/t/p/w300${data.poster_path}` : null,
      episodes,
    };
  }

  /**
   * Obtenir les prochaines sorties (style calendrier Sonarr/Radarr)
   */
  public static async getUpcomingReleases(
    type: 'all' | 'movie' | 'tv' | 'anime' = 'all',
    page: number = 1
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const results: TMDBMediaItem[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // 1. FILMS À VENIR
    if (type === 'all' || type === 'movie') {
      try {
        const moviesData = await this.request<{ results: any[] }>('/movie/upcoming', {
          region: 'FR',
          page: page.toString(),
        });
        const normalizedMovies = (moviesData.results || []).map((m) =>
          this.normalizeMedia({ ...m, media_type: 'movie' })
        );
        results.push(...normalizedMovies);
      } catch {}
    }

    // 2. SÉRIES TV ACTUELLEMENT EN DIFFUSION OU À VENIR
    if (type === 'all' || type === 'tv') {
      try {
        // Séries diffusant des épisodes en ce moment (on the air)
        const tvData = await this.request<{ results: any[] }>('/tv/on_the_air', {
          page: page.toString(),
        });
        const normalizedTv = (tvData.results || []).map((t) => {
          const item = this.normalizeMedia({ ...t, media_type: 'tv' });
          // Si la série a débuté avant aujourd'hui, elle diffuse des épisodes cette semaine
          if (!item.release_date || item.release_date < todayStr) {
            item.release_date = todayStr;
          }
          return item;
        });
        results.push(...normalizedTv);
      } catch {}

      try {
        // Nouvelles séries démarrant prochainement
        const newTvData = await this.request<{ results: any[] }>('/discover/tv', {
          'first_air_date.gte': todayStr,
          sort_by: 'popularity.desc',
          page: page.toString(),
        });
        const normalizedNewTv = (newTvData.results || []).map((t) =>
          this.normalizeMedia({ ...t, media_type: 'tv' })
        );
        results.push(...normalizedNewTv);
      } catch {}
    }

    // 3. MANGAS & ANIMÉS (En cours de diffusion ou à venir)
    if (type === 'all' || type === 'anime') {
      try {
        const animeTv = await this.request<{ results: any[] }>('/discover/tv', {
          with_genres: '16',
          with_original_language: 'ja',
          without_genres: '10762,10751',
          'air_date.gte': sevenDaysAgo,
          sort_by: 'popularity.desc',
          page: page.toString(),
          'vote_count.gte': '10',
        });
        const normalizedAnimeTv = (animeTv.results || []).map((t) => {
          const item = this.normalizeMedia({ ...t, media_type: 'tv' });
          if (!item.release_date || item.release_date < todayStr) {
            item.release_date = todayStr;
          }
          return item;
        });
        results.push(...normalizedAnimeTv);
      } catch {}

      try {
        const animeMovies = await this.request<{ results: any[] }>('/discover/movie', {
          with_genres: '16',
          with_original_language: 'ja',
          without_genres: '10751',
          'primary_release_date.gte': sevenDaysAgo,
          sort_by: 'popularity.desc',
          page: page.toString(),
          'vote_count.gte': '5',
        });
        const normalizedAnimeMovies = (animeMovies.results || []).map((m) =>
          this.normalizeMedia({ ...m, media_type: 'movie' })
        );
        results.push(...normalizedAnimeMovies);
      } catch {}
    }

    // Dédoublonner par media_type + id
    const seen = new Set<string>();
    const uniqueResults = results.filter((item) => {
      const key = `${item.media_type}-${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filtrer pour ne garder que les sorties >= à il y a 7 jours
    const upcomingFiltered = uniqueResults.filter((item) => {
      const d = item.release_date;
      return Boolean(d && d >= sevenDaysAgo);
    });

    // Trier chronologiquement (de la sortie la plus proche à la plus lointaine)
    upcomingFiltered.sort((a, b) => {
      const da = a.release_date || '9999';
      const db = b.release_date || '9999';
      return da.localeCompare(db);
    });

    return {
      results: upcomingFiltered,
      total_pages: 5,
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

      if (item.next_episode_to_air) {
        base.next_episode_to_air = {
          id: item.next_episode_to_air.id,
          name: item.next_episode_to_air.name,
          air_date: item.next_episode_to_air.air_date,
          episode_number: item.next_episode_to_air.episode_number,
          season_number: item.next_episode_to_air.season_number,
          overview: item.next_episode_to_air.overview,
        };
      }
      if (item.last_episode_to_air) {
        base.last_episode_to_air = {
          id: item.last_episode_to_air.id,
          name: item.last_episode_to_air.name,
          air_date: item.last_episode_to_air.air_date,
          episode_number: item.last_episode_to_air.episode_number,
          season_number: item.last_episode_to_air.season_number,
        };
      }

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
