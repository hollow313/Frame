import db from '../db/index.js';
import { getSetting } from './settingsService.js';
import { logger } from '../utils/logger.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Cache de 12 heures pour éviter de saturer l'API TMDB
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// Détection des caractères CJK (Chinois, Japonais Hiragana/Katakana/Kanji, Coréen Hangul) - U-05
export const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

export function hasCjkCharacters(text?: string | null): boolean {
  if (!text) return false;
  return CJK_REGEX.test(text);
}

export interface StreamingProvider {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface TMDBMediaItem {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  media_type: 'movie' | 'tv';
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  keywords?: { id: number; name: string }[];
  runtime?: number | null;
  status?: string;
  tagline?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: {
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
    air_date?: string;
    poster_path?: string | null;
  }[];
  trailer_key?: string | null;
  cast?: { id: number; name: string; character: string; profile_path: string | null }[];
  director?: string | null;
  director_image?: string | null;
  directors?: { id: number; name: string }[];
  production_countries?: string[];
  collection_id?: number | null;
  streaming_providers?: StreamingProvider[];
  buy_providers?: StreamingProvider[];
  next_episode_to_air?: {
    id: number;
    name: string;
    air_date: string;
    episode_number: number;
    season_number: number;
    overview?: string;
  };
  last_episode_to_air?: {
    id: number;
    name: string;
    air_date: string;
    episode_number: number;
    season_number: number;
  };
  series_status?: string;
  seasons_count?: number;
  external_ids?: {
    imdb_id?: string | null;
    tvdb_id?: number | null;
  };
}

export class TMDBService {
  public static isConfigured(): boolean {
    return Boolean(getSetting('TMDB_API_KEY'));
  }

  public static async getMediaDetails(mediaType: 'movie' | 'tv', id: number): Promise<TMDBMediaItem> {
    return this.getDetails(mediaType, id);
  }

  private static getApiKey(): string {
    const key = getSetting('TMDB_API_KEY');
    if (!key) {
      throw new Error("Clé API TMDB non configurée. Veuillez l'ajouter dans les Paramètres.");
    }
    return key;
  }

  private static getLanguage(): string {
    return getSetting('DEFAULT_LANGUAGE') || 'fr-FR';
  }

  public static formatImageUrl(path: string | null | undefined, size: 'w500' | 'w780' | 'original' = 'w500'): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${TMDB_IMAGE_BASE}/${size}${path}`;
  }

  private static getFromCache<T>(key: string): T | null {
    try {
      const row = db
        .prepare('SELECT data, expires_at FROM tmdb_cache WHERE cache_key = ?')
        .get(key) as { data: string; expires_at: number } | undefined;

      if (!row) return null;
      if (Date.now() > row.expires_at) {
        db.prepare('DELETE FROM tmdb_cache WHERE cache_key = ?').run(key);
        return null;
      }
      return JSON.parse(row.data) as T;
    } catch {
      return null;
    }
  }

  private static setCache(key: string, data: unknown, ttl = CACHE_TTL_MS): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO tmdb_cache (cache_key, data, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at
      `);
      stmt.run(key, JSON.stringify(data), Date.now() + ttl);
    } catch {
      // Ignorer erreurs de cache
    }
  }

  private static async fetchTMDB<T>(endpoint: string, params: Record<string, string | number> = {}, useCache = true): Promise<T> {
    const apiKey = this.getApiKey();
    const language = this.getLanguage();

    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.set('api_key', apiKey);
    if (!params.language) {
      url.searchParams.set('language', language);
    }

    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    const cacheKey = `${endpoint}?${url.searchParams.toString()}`;
    if (useCache) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) return cached;
    }

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Erreur TMDB (${response.status}): ${response.statusText}`);
    }

    const data = (await response.json()) as T;

    if (useCache) {
      this.setCache(cacheKey, data);
    }

    return data;
  }

  /**
   * Extrait un titre lisible (sans caractères CJK) à partir des traductions ou titres alternatifs TMDB (U-05)
   */
  public static pickNonCjkTitle(raw: any): string {
    const primary = raw.title || raw.name || '';
    if (primary && !hasCjkCharacters(primary)) {
      return primary;
    }

    // 1. Chercher dans translations (fr -> en -> toute langue latine)
    const transList: any[] = raw.translations?.translations || [];
    for (const lang of ['fr', 'en', 'es', 'de', 'it', 'pt']) {
      const found = transList.find(
        (t: any) =>
          t.iso_639_1 === lang &&
          (t.data?.title || t.data?.name) &&
          !hasCjkCharacters(t.data?.title || t.data?.name)
      );
      if (found) {
        return (found.data.title || found.data.name).trim();
      }
    }

    // 2. Chercher dans alternative_titles
    const altList: any[] = raw.alternative_titles?.titles || raw.alternative_titles?.results || [];
    for (const country of ['FR', 'US', 'GB', 'CA', 'BE']) {
      const found = altList.find(
        (a: any) => a.iso_3166_1 === country && a.title && !hasCjkCharacters(a.title)
      );
      if (found) {
        return found.title.trim();
      }
    }
    const anyLatinAlt = altList.find((a: any) => a.title && !hasCjkCharacters(a.title));
    if (anyLatinAlt) {
      return anyLatinAlt.title.trim();
    }

    // 3. Tester original_title / original_name s'il est en alphabet latin
    const orig = raw.original_title || raw.original_name || '';
    if (orig && !hasCjkCharacters(orig)) {
      return orig;
    }

    return primary || orig || 'Sans titre';
  }

  /**
   * Normalise un objet film ou série de TMDB en format unifié avec titre en français
   */
  public static normalizeMedia(raw: any, forceType?: 'movie' | 'tv'): TMDBMediaItem {
    const mediaType = forceType || raw.media_type || (raw.first_air_date !== undefined ? 'tv' : 'movie');
    let trailerKey: string | null = null;

    if (raw.videos?.results && Array.isArray(raw.videos.results)) {
      const videos = raw.videos.results;
      const frTrailer = videos.find(
        (v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.iso_639_1 === 'fr'
      );
      const anyTrailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
      const anyYoutube = videos.find((v: any) => v.site === 'YouTube');
      trailerKey = (frTrailer || anyTrailer || anyYoutube)?.key || null;
    }

    let director: string | null = null;
    let directorImage: string | null = null;
    const directors: { id: number; name: string }[] = [];

    if (raw.credits?.crew && Array.isArray(raw.credits.crew)) {
      for (const c of raw.credits.crew) {
        if (c.job === 'Director') {
          if (!director) {
            director = c.name || null;
            directorImage = this.formatImageUrl(c.profile_path, 'w500');
          }
          if (c.id && c.name && !directors.some((d) => d.id === c.id)) {
            directors.push({ id: c.id, name: c.name });
          }
        }
      }
    }
    if (mediaType === 'tv' && Array.isArray(raw.created_by)) {
      for (const creator of raw.created_by) {
        if (!director && creator?.name) {
          director = creator.name;
          directorImage = this.formatImageUrl(creator.profile_path, 'w500');
        }
        if (creator?.id && creator?.name && !directors.some((d) => d.id === creator.id)) {
          directors.push({ id: creator.id, name: creator.name });
        }
      }
    }

    const cast = Array.isArray(raw.credits?.cast)
      ? raw.credits.cast.slice(0, 12).map((c: any) => ({
          id: c.id,
          name: c.name,
          character: c.character,
          profile_path: this.formatImageUrl(c.profile_path, 'w500'),
        }))
      : undefined;

    // Extraction des mots-clés thématiques pour le moteur de recommandation v2
    const rawKeywords = raw.keywords?.keywords || raw.keywords?.results || [];
    const keywords: { id: number; name: string }[] = Array.isArray(rawKeywords)
      ? rawKeywords.slice(0, 25).map((k: any) => ({ id: k.id, name: k.name }))
      : [];

    // Extraction des pays de production
    const productionCountries: string[] = Array.isArray(raw.production_countries)
      ? raw.production_countries.map((c: any) => c.iso_3166_1).filter(Boolean)
      : Array.isArray(raw.origin_country)
      ? raw.origin_country
      : [];

    // Extraction des plateformes de streaming (France prioritaire, sinon US/Global)
    let streamingProviders: StreamingProvider[] = [];
    let buyProviders: StreamingProvider[] = [];

    if (raw['watch/providers']?.results) {
      const results = raw['watch/providers'].results;
      const regionData = results.FR || results.BE || results.CH || results.CA || results.US;
      if (regionData) {
        const flatrate = regionData.flatrate || regionData.free || regionData.ads || [];
        streamingProviders = flatrate.map((p: any) => ({
          id: p.provider_id,
          name: p.provider_name,
          logo_path: this.formatImageUrl(p.logo_path, 'w500'),
        }));

        const rentBuy = [...(regionData.rent || []), ...(regionData.buy || [])];
        const seen = new Set<number>();
        for (const p of rentBuy) {
          if (!seen.has(p.provider_id)) {
            seen.add(p.provider_id);
            buyProviders.push({
              id: p.provider_id,
              name: p.provider_name,
              logo_path: this.formatImageUrl(p.logo_path, 'w500'),
            });
          }
        }
      }
    }

    const readableTitle = this.pickNonCjkTitle(raw);

    // Extraire le synopsis en français ou anglais si le synopsis principal est vide
    let overview = raw.overview || '';
    if (!overview && Array.isArray(raw.translations?.translations)) {
      const frTrans = raw.translations.translations.find((t: any) => t.iso_639_1 === 'fr' && t.data?.overview);
      const enTrans = raw.translations.translations.find((t: any) => t.iso_639_1 === 'en' && t.data?.overview);
      overview = frTrans?.data?.overview || enTrans?.data?.overview || '';
    }

    const normalized: TMDBMediaItem = {
      id: raw.id,
      title: readableTitle,
      original_title: raw.original_title || raw.original_name,
      original_language: raw.original_language,
      overview,
      poster_path: this.formatImageUrl(raw.poster_path, 'w500'),
      backdrop_path: this.formatImageUrl(raw.backdrop_path, 'original'),
      release_date: raw.release_date || raw.first_air_date || '',
      vote_average: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : 0,
      vote_count: raw.vote_count || 0,
      popularity: raw.popularity || 0,
      media_type: mediaType,
      genre_ids: raw.genre_ids || (raw.genres ? raw.genres.map((g: any) => g.id) : []),
      genres: raw.genres,
      keywords: keywords.length > 0 ? keywords : undefined,
      runtime: raw.runtime || (Array.isArray(raw.episode_run_time) && raw.episode_run_time[0]) || null,
      status: raw.status,
      tagline: raw.tagline,
      number_of_seasons: raw.number_of_seasons,
      number_of_episodes: raw.number_of_episodes,
      seasons: Array.isArray(raw.seasons)
        ? raw.seasons.map((s: any) => ({
            id: s.id,
            name: s.name,
            season_number: s.season_number,
            episode_count: s.episode_count,
            air_date: s.air_date,
            poster_path: this.formatImageUrl(s.poster_path, 'w500'),
          }))
        : undefined,
      trailer_key: trailerKey,
      cast,
      director,
      director_image: directorImage,
      directors: directors.length > 0 ? directors : undefined,
      production_countries: productionCountries.length > 0 ? productionCountries : undefined,
      collection_id: raw.belongs_to_collection?.id || null,
      streaming_providers: streamingProviders,
      buy_providers: buyProviders,
      next_episode_to_air: raw.next_episode_to_air || undefined,
      last_episode_to_air: raw.last_episode_to_air || undefined,
      series_status: raw.status,
      seasons_count: raw.number_of_seasons,
      external_ids: raw.external_ids
        ? {
            imdb_id: raw.external_ids.imdb_id || null,
            tvdb_id: raw.external_ids.tvdb_id || null,
          }
        : undefined,
    };

    // Persister les features dans media_features si l'objet est suffisamment riche
    this.upsertMediaFeatures(normalized);

    return normalized;
  }

  /**
   * Sauvegarde les caractéristiques d'un média dans la table media_features (RECOMMANDATIONS-FRAME)
   */
  public static upsertMediaFeatures(item: TMDBMediaItem): void {
    try {
      if (!item || !item.id || !item.title) return;
      const genreIds = item.genre_ids || (item.genres ? item.genres.map((g) => g.id) : []);
      const isAnime =
        genreIds.includes(16) &&
        (item.original_language === 'ja' || (item.production_countries && item.production_countries.includes('JP')))
          ? 1
          : genreIds.includes(16)
          ? 1
          : 0;
      const releaseYear = item.release_date ? parseInt(item.release_date.slice(0, 4), 10) || null : null;

      // Ne mettre à jour keywords/directors/cast que si présents ou lors d'une insertion initiale
      const existing = db
        .prepare('SELECT keywords_json, directors_json, cast_json, runtime FROM media_features WHERE media_type = ? AND tmdb_id = ?')
        .get(item.media_type, item.id) as any;

      const genresJson = JSON.stringify(
        item.genres || genreIds.map((id) => ({ id, name: this.getGenreName(id) }))
      );
      const keywordsJson = item.keywords
        ? JSON.stringify(item.keywords)
        : existing?.keywords_json || '[]';
      const directorsJson = item.directors
        ? JSON.stringify(item.directors)
        : existing?.directors_json || '[]';
      const castJson = item.cast
        ? JSON.stringify(item.cast.slice(0, 5).map((c) => ({ id: c.id, name: c.name })))
        : existing?.cast_json || '[]';
      const countriesJson = JSON.stringify(item.production_countries || []);

      db.prepare(`
        INSERT INTO media_features (
          media_type, tmdb_id, title, original_title, original_lang,
          release_year, runtime, vote_average, vote_count, popularity,
          genres_json, keywords_json, directors_json, cast_json, countries_json,
          collection_id, poster_path, backdrop_path, overview, is_anime, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(media_type, tmdb_id) DO UPDATE SET
          title = excluded.title,
          original_title = COALESCE(excluded.original_title, media_features.original_title),
          original_lang = COALESCE(excluded.original_lang, media_features.original_lang),
          release_year = COALESCE(excluded.release_year, media_features.release_year),
          runtime = COALESCE(excluded.runtime, media_features.runtime),
          vote_average = CASE WHEN excluded.vote_average > 0 THEN excluded.vote_average ELSE media_features.vote_average END,
          vote_count = CASE WHEN excluded.vote_count > 0 THEN excluded.vote_count ELSE media_features.vote_count END,
          popularity = CASE WHEN excluded.popularity > 0 THEN excluded.popularity ELSE media_features.popularity END,
          genres_json = CASE WHEN excluded.genres_json != '[]' THEN excluded.genres_json ELSE media_features.genres_json END,
          keywords_json = CASE WHEN excluded.keywords_json != '[]' THEN excluded.keywords_json ELSE media_features.keywords_json END,
          directors_json = CASE WHEN excluded.directors_json != '[]' THEN excluded.directors_json ELSE media_features.directors_json END,
          cast_json = CASE WHEN excluded.cast_json != '[]' THEN excluded.cast_json ELSE media_features.cast_json END,
          countries_json = CASE WHEN excluded.countries_json != '[]' THEN excluded.countries_json ELSE media_features.countries_json END,
          collection_id = COALESCE(excluded.collection_id, media_features.collection_id),
          poster_path = COALESCE(excluded.poster_path, media_features.poster_path),
          backdrop_path = COALESCE(excluded.backdrop_path, media_features.backdrop_path),
          overview = CASE WHEN excluded.overview != '' THEN excluded.overview ELSE media_features.overview END,
          is_anime = excluded.is_anime,
          updated_at = excluded.updated_at
      `).run(
        item.media_type,
        item.id,
        item.title,
        item.original_title || null,
        item.original_language || null,
        releaseYear,
        item.runtime || existing?.runtime || null,
        item.vote_average || 0,
        item.vote_count || 0,
        item.popularity || 0,
        genresJson,
        keywordsJson,
        directorsJson,
        castJson,
        countriesJson,
        item.collection_id || null,
        item.poster_path || null,
        item.backdrop_path || null,
        item.overview || '',
        isAnime,
        new Date().toISOString()
      );
    } catch {
      // Ignorer erreurs d'indexation silencieuses
    }
  }

  public static getGenreName(id: number): string {
    const names: Record<number, string> = {
      28: 'Action',
      12: 'Aventure',
      16: 'Animation',
      35: 'Comédie',
      80: 'Crime',
      99: 'Documentaire',
      18: 'Drame',
      10751: 'Familial',
      14: 'Fantastique',
      36: 'Histoire',
      27: 'Horreur',
      10402: 'Musique',
      9648: 'Mystère',
      10749: 'Romance',
      878: 'Science-Fiction',
      10770: 'Téléfilm',
      53: 'Thriller',
      10752: 'Guerre',
      37: 'Western',
      10759: 'Action & Aventure',
      10762: 'Jeunesse',
      10765: 'Science-Fiction & Fantastique',
      10768: 'Guerre & Politique',
    };
    return names[id] || `Genre #${id}`;
  }

  /**
   * Résout un titre CJK en titre français/anglais/romaji lisible (U-05)
   */
  public static async resolveReadableTitle(
    mediaType: 'movie' | 'tv',
    tmdbId: number,
    fallbackTitle: string
  ): Promise<string> {
    if (!hasCjkCharacters(fallbackTitle)) {
      return fallbackTitle;
    }
    try {
      const details = await this.getDetails(mediaType, tmdbId);
      if (details.title && !hasCjkCharacters(details.title)) {
        return details.title;
      }
      // Si toujours CJK, tenter un appel direct en en-US
      const enRaw = await this.fetchTMDB<any>(`/${mediaType}/${tmdbId}`, { language: 'en-US' });
      const enTitle = enRaw.title || enRaw.name || '';
      if (enTitle && !hasCjkCharacters(enTitle)) {
        return enTitle;
      }
    } catch {
      // Ignorer
    }
    return fallbackTitle;
  }

  /**
   * Répare en arrière-plan les titres CJK déjà stockés dans watched_items et watchlist (U-05)
   */
  public static async repairCjkTitlesInDb(): Promise<number> {
    if (!getSetting('TMDB_API_KEY')) return 0;
    let repaired = 0;
    try {
      const watchedRows = db
        .prepare('SELECT DISTINCT tmdb_id, media_type, title FROM watched_items')
        .all() as Array<{ tmdb_id: number; media_type: string; title: string }>;

      for (const row of watchedRows) {
        if (hasCjkCharacters(row.title)) {
          const tmdbType = row.media_type === 'movie' ? 'movie' : 'tv';
          const clean = await this.resolveReadableTitle(tmdbType, row.tmdb_id, row.title);
          if (clean && clean !== row.title && !hasCjkCharacters(clean)) {
            db.prepare('UPDATE watched_items SET title = ? WHERE tmdb_id = ? AND media_type = ?').run(
              clean,
              row.tmdb_id,
              row.media_type
            );
            repaired++;
          }
        }
      }

      const watchlistRows = db
        .prepare('SELECT DISTINCT tmdb_id, media_type, title FROM watchlist')
        .all() as Array<{ tmdb_id: number; media_type: string; title: string }>;

      for (const row of watchlistRows) {
        if (hasCjkCharacters(row.title)) {
          const tmdbType = row.media_type === 'movie' ? 'movie' : 'tv';
          const clean = await this.resolveReadableTitle(tmdbType, row.tmdb_id, row.title);
          if (clean && clean !== row.title && !hasCjkCharacters(clean)) {
            db.prepare('UPDATE watchlist SET title = ? WHERE tmdb_id = ? AND media_type = ?').run(
              clean,
              row.tmdb_id,
              row.media_type
            );
            repaired++;
          }
        }
      }
      if (repaired > 0) {
        logger.info('TMDB', `${repaired} titres CJK traduits en français/anglais dans la base locale.`);
      }
    } catch (e) {
      logger.warn('TMDB', 'Erreur lors de la réparation des titres CJK', { error: String(e) });
    }
    return repaired;
  }

  /**
   * Obtenir les détails complets d'une saison de série TV (avec liste des épisodes, synopsis, date, durée)
   */
  public static async getTvSeasonDetails(tvId: number, seasonNumber: number): Promise<any> {
    const raw = await this.fetchTMDB<any>(`/tv/${tvId}/season/${seasonNumber}`);
    return {
      id: raw.id,
      season_number: raw.season_number,
      name: raw.name,
      overview: raw.overview || '',
      air_date: raw.air_date,
      poster_path: this.formatImageUrl(raw.poster_path, 'w500'),
      episodes: Array.isArray(raw.episodes)
        ? raw.episodes.map((ep: any) => ({
            id: ep.id,
            episode_number: ep.episode_number,
            season_number: ep.season_number,
            name: ep.name,
            overview: ep.overview || '',
            air_date: ep.air_date,
            runtime: ep.runtime || null,
            vote_average: ep.vote_average ? Math.round(ep.vote_average * 10) / 10 : 0,
            still_path: this.formatImageUrl(ep.still_path, 'w500'),
          }))
        : [],
    };
  }

  /**
   * Tendances de la semaine ou du jour
   */
  public static async getTrending(timeWindow: 'day' | 'week' = 'week', page = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.fetchTMDB<any>(`/trending/all/${timeWindow}`, { page });
    const results = (data.results || [])
      .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item: any) => this.normalizeMedia(item));

    return {
      results,
      page: data.page || 1,
      total_pages: data.total_pages || 1,
    };
  }

  /**
   * Films populaires
   */
  public static async getPopularMovies(page = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.fetchTMDB<any>('/movie/popular', { page });
    return {
      results: (data.results || []).map((item: any) => this.normalizeMedia(item, 'movie')),
      page: data.page || 1,
      total_pages: data.total_pages || 1,
    };
  }

  /**
   * Séries populaires
   */
  public static async getPopularTV(page = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.fetchTMDB<any>('/tv/popular', { page });
    return {
      results: (data.results || []).map((item: any) => this.normalizeMedia(item, 'tv')),
      page: data.page || 1,
      total_pages: data.total_pages || 1,
    };
  }

  /**
   * Recherche multi (films & séries)
   */
  public static async searchMulti(query: string, page = 1): Promise<{ results: TMDBMediaItem[]; page: number; total_pages: number }> {
    const data = await this.fetchTMDB<any>('/search/multi', { query, page, include_adult: 'false' });
    const results = (data.results || [])
      .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item: any) => this.normalizeMedia(item));

    return {
      results,
      page: data.page || 1,
      total_pages: data.total_pages || 1,
    };
  }

  /**
   * Détails complets d'un film ou d'une série (avec vidéos, casting, plateformes, mots-clés et traductions)
   */
  public static async getDetails(mediaType: 'movie' | 'tv', id: number): Promise<TMDBMediaItem> {
    const raw = await this.fetchTMDB<any>(`/${mediaType}/${id}`, {
      append_to_response: 'videos,credits,watch/providers,external_ids,keywords,translations,alternative_titles',
    });
    return this.normalizeMedia(raw, mediaType);
  }

  /**
   * Recommandations et titres similaires depuis TMDB pour un média donné
   */
  public static async getRecommendations(mediaType: 'movie' | 'tv', id: number): Promise<TMDBMediaItem[]> {
    const data = await this.fetchTMDB<any>(`/${mediaType}/${id}/recommendations`);
    let items: any[] = data.results || [];

    if (items.length < 5) {
      const similar = await this.fetchTMDB<any>(`/${mediaType}/${id}/similar`);
      items = [...items, ...(similar.results || [])];
    }

    const seen = new Set<number>();
    const unique: TMDBMediaItem[] = [];
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(this.normalizeMedia(item, mediaType));
      }
    }

    return unique.slice(0, 20);
  }

  /**
   * Découverte par genre
   */
  public static async discoverByGenre(
    mediaType: 'movie' | 'tv',
    genreId: number,
    page = 1
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const data = await this.fetchTMDB<any>(`/discover/${mediaType}`, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
      page,
    });

    return {
      results: (data.results || []).map((item: any) => this.normalizeMedia(item, mediaType)),
      total_pages: data.total_pages || 1,
    };
  }

  /**
   * Découverte par plateforme de streaming (Netflix=8, Prime=119, Disney+=337, Crunchyroll=283, Canal+=381, AppleTV+=350, Max=1899)
   */
  public static async discoverByProvider(
    mediaType: 'movie' | 'tv',
    providerId: number,
    genreId?: number,
    page = 1,
    recentOnly = false
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const providerIdsStr = providerId === 119 ? '119|9|2100' : String(providerId);

    const params: Record<string, string | number> = {
      with_watch_providers: providerIdsStr,
      watch_region: 'FR',
      sort_by: 'popularity.desc',
      page,
    };

    if (genreId) {
      params.with_genres = genreId;
    }

    if (recentOnly) {
      const today = new Date();
      const fourMonthsAgo = new Date(today.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      if (mediaType === 'movie') {
        params['primary_release_date.gte'] = fourMonthsAgo;
        params['primary_release_date.lte'] = nextMonth;
      } else {
        params['first_air_date.gte'] = fourMonthsAgo;
        params['first_air_date.lte'] = nextMonth;
      }
    }

    let data = await this.fetchTMDB<any>(`/discover/${mediaType}`, params);

    if ((!data.results || data.results.length === 0) && recentOnly) {
      delete params['primary_release_date.gte'];
      delete params['primary_release_date.lte'];
      delete params['first_air_date.gte'];
      delete params['first_air_date.lte'];
      data = await this.fetchTMDB<any>(`/discover/${mediaType}`, params);
    }

    if (!data.results || data.results.length === 0) {
      params.watch_region = 'US';
      data = await this.fetchTMDB<any>(`/discover/${mediaType}`, params);
    }

    return {
      results: (data.results || []).map((item: any) => this.normalizeMedia(item, mediaType)),
      total_pages: data.total_pages || 1,
    };
  }

  /**
   * Découverte unifiée (Films, Séries, Mangas/Animés) avec filtres combinables :
   * Plateforme, Genre, Période de sortie (Déjà sortis vs À venir), Tri
   */
  public static async unifiedDiscover(options: {
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
    const {
      type = 'all',
      animeType = 'tv',
      providerId,
      genreId,
      recentOnly = false,
      dateFilter = recentOnly ? '30d' : 'all',
      year,
      sortBy = 'popularity.desc',
      page = 1,
    } = options;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const isUpcomingFilter = dateFilter === 'upcoming';

    let startDate: string | undefined;
    let endDate: string | undefined;

    if (isUpcomingFilter) {
      startDate = tomorrowStr;
      endDate = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (dateFilter === '7d') {
      startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = todayStr;
    } else if (dateFilter === '30d' || dateFilter === 'this_month') {
      startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = todayStr;
    } else if (dateFilter === '6m' || dateFilter === 'last_3_months') {
      startDate = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      endDate = todayStr;
    } else if (dateFilter === 'this_year') {
      startDate = `${today.getFullYear()}-01-01`;
      endDate = todayStr;
    } else if (dateFilter.startsWith('year_') || ((dateFilter === 'year' || dateFilter === 'custom_year') && year)) {
      const targetYear = year || parseInt(dateFilter.replace('year_', ''), 10);
      if (targetYear && !isNaN(targetYear)) {
        startDate = `${targetYear}-01-01`;
        endDate = targetYear >= today.getFullYear() ? todayStr : `${targetYear}-12-31`;
      } else {
        endDate = todayStr;
      }
    } else {
      // Par défaut ("all" = toutes les œuvres déjà sorties à ce jour, exclut les dates futures 2027-2043)
      endDate = todayStr;
    }

    const buildParams = (mediaType: 'movie' | 'tv', isAnimeMode: boolean): Record<string, string | number> => {
      let tmdbSort: string = sortBy;
      if (sortBy === 'release_date.desc') {
        tmdbSort = mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
      }

      const params: Record<string, string | number> = {
        sort_by: tmdbSort,
        page,
      };

      if (sortBy === 'vote_average.desc') {
        params['vote_count.gte'] = 100;
      } else if (sortBy === 'release_date.desc' && !isUpcomingFilter) {
        // Évite les fiches vides/amateur sans affiche ni vote lors du tri par date récente
        params['vote_count.gte'] = 1;
      }

      if (providerId) {
        params.with_watch_providers = providerId === 119 ? '119|9|2100' : String(providerId);
        params.watch_region = 'FR';
      }

      if (isAnimeMode) {
        params.with_genres = genreId ? `16,${genreId}` : 16;
        params.with_origin_country = 'JP';
        params.with_original_language = 'ja';
        params.without_genres = '10762';
      } else if (genreId) {
        params.with_genres = genreId;
      }

      if (mediaType === 'movie') {
        if (startDate) params['primary_release_date.gte'] = startDate;
        if (endDate) params['primary_release_date.lte'] = endDate;
      } else {
        if (startDate) params['first_air_date.gte'] = startDate;
        if (endDate) params['first_air_date.lte'] = endDate;
      }

      return params;
    };

    const fetchWithFallback = async (mediaType: 'movie' | 'tv', isAnimeMode: boolean) => {
      const params = buildParams(mediaType, isAnimeMode);
      let data = await this.fetchTMDB<any>(`/discover/${mediaType}`, params);

      // Si une période courte (ex: 7j/30j sur une plateforme précise) ne renvoie rien, élargir startDate mais TOUJOURS conserver endDate <= todayStr
      if ((!data.results || data.results.length === 0) && startDate && !isUpcomingFilter) {
        delete params['primary_release_date.gte'];
        delete params['first_air_date.gte'];
        data = await this.fetchTMDB<any>(`/discover/${mediaType}`, params);
      }

      if ((!data.results || data.results.length === 0) && providerId) {
        params.watch_region = 'US';
        data = await this.fetchTMDB<any>(`/discover/${mediaType}`, params);
      }

      const normalizedList = (data.results || [])
        .map((item: any) => this.normalizeMedia(item, mediaType))
        .filter((item: TMDBMediaItem) => {
          if (!item.release_date) return !isUpcomingFilter;
          if (isUpcomingFilter) {
            return item.release_date >= tomorrowStr;
          }
          // Ne jamais retourner une œuvre dont la date de sortie est dans le futur lorsqu'on ne filtre pas sur "À venir"
          return item.release_date <= todayStr;
        });

      return {
        results: normalizedList,
        total_pages: data.total_pages || 1,
      };
    };

    if (type === 'anime') {
      return fetchWithFallback(animeType, true);
    }

    if (type === 'movie') {
      return fetchWithFallback('movie', false);
    }

    if (type === 'tv') {
      return fetchWithFallback('tv', false);
    }

    const [moviesData, tvData] = await Promise.all([
      fetchWithFallback('movie', false),
      fetchWithFallback('tv', false),
    ]);

    const combined = [...moviesData.results, ...tvData.results].sort((a, b) => {
      if (sortBy === 'vote_average.desc') return (b.vote_average || 0) - (a.vote_average || 0);
      if (sortBy === 'release_date.desc') return (b.release_date || '').localeCompare(a.release_date || '');
      return (b.popularity || 0) - (a.popularity || 0);
    });

    return {
      results: combined,
      total_pages: Math.max(moviesData.total_pages, tvData.total_pages),
    };
  }

  /**
   * Vérifie la vraie date de diffusion d'une série/animé dans la plage [startStr, endStr]
   * via son next_episode_to_air ou last_episode_to_air afin d'exclure les séries terminées (ex: Bleach)
   */
  private static async verifyTvEpisodeInPeriod(
    rawShow: any,
    startStr: string,
    endStr: string
  ): Promise<TMDBMediaItem | null> {
    const norm = this.normalizeMedia(rawShow, 'tv');
    if (norm.release_date && norm.release_date >= startStr && norm.release_date <= endStr) {
      return norm;
    }

    try {
      const details = await this.fetchTMDB<any>(`/tv/${rawShow.id}`);
      const nextEp = details?.next_episode_to_air;
      const lastEp = details?.last_episode_to_air;

      if (nextEp?.air_date && nextEp.air_date >= startStr && nextEp.air_date <= endStr) {
        norm.release_date = nextEp.air_date;
        norm.next_episode_to_air = {
          air_date: nextEp.air_date,
          episode_number: nextEp.episode_number,
          season_number: nextEp.season_number,
          name: nextEp.name,
        };
        return norm;
      }

      if (lastEp?.air_date && lastEp.air_date >= startStr && lastEp.air_date <= endStr) {
        norm.release_date = lastEp.air_date;
        norm.next_episode_to_air = {
          air_date: lastEp.air_date,
          episode_number: lastEp.episode_number,
          season_number: lastEp.season_number,
          name: lastEp.name,
        };
        return norm;
      }

      if (details?.first_air_date && details.first_air_date >= startStr && details.first_air_date <= endStr) {
        norm.release_date = details.first_air_date;
        return norm;
      }
    } catch {
      // Ignorer en cas d'erreur TMDB sur un show individuel
    }

    return null;
  }

  /**
   * Calendrier des prochaines sorties (Films, Séries TV et Animés/Mangas japonais)
   * Dédupliqué, vérifié épisode par épisode, trié chronologiquement (B-09) et avec résolution des titres CJK (U-05)
   */
  public static async getUpcomingReleases(
    type: 'all' | 'movie' | 'tv' | 'anime' = 'all',
    page = 1,
    customStartDate?: string,
    customEndDate?: string
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const today = new Date();
    const startStr = customStartDate || today.toISOString().split('T')[0];
    const futureDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    const endStr = customEndDate || futureDate.toISOString().split('T')[0];

    const promises: Promise<{ items: TMDBMediaItem[]; pages: number }>[] = [];

    if (type === 'all' || type === 'movie') {
      promises.push(
        this.fetchTMDB<any>('/discover/movie', {
          'primary_release_date.gte': startStr,
          'primary_release_date.lte': endStr,
          sort_by: 'popularity.desc',
          page,
        }).then((d) => ({
          items: (d.results || [])
            .map((m: any) => this.normalizeMedia(m, 'movie'))
            .filter((m: TMDBMediaItem) => m.release_date >= startStr && m.release_date <= endStr),
          pages: d.total_pages || 1,
        }))
      );
    }

    if (type === 'all' || type === 'tv') {
      promises.push(
        this.fetchTMDB<any>('/discover/tv', {
          'first_air_date.gte': startStr,
          'first_air_date.lte': endStr,
          without_genres: '16,10762,10763,10767',
          sort_by: 'popularity.desc',
          page,
        }).then((d) => ({
          items: (d.results || [])
            .map((t: any) => this.normalizeMedia(t, 'tv'))
            .filter((t: TMDBMediaItem) => t.release_date >= startStr && t.release_date <= endStr),
          pages: d.total_pages || 1,
        })),
        this.fetchTMDB<any>('/discover/tv', {
          'air_date.gte': startStr,
          'air_date.lte': endStr,
          without_genres: '16,10762,10763,10767',
          with_status: '0|1|2',
          'vote_count.gte': 10,
          sort_by: 'popularity.desc',
          page,
        }).then(async (d) => {
          const rawList = (d.results || []).slice(0, 20);
          const verified = await Promise.all(
            rawList.map((t: any) => this.verifyTvEpisodeInPeriod(t, startStr, endStr))
          );
          return {
            items: verified.filter((it): it is TMDBMediaItem => it !== null),
            pages: d.total_pages || 1,
          };
        })
      );
    }

    if (type === 'all' || type === 'anime') {
      promises.push(
        this.fetchTMDB<any>('/discover/tv', {
          with_genres: 16,
          with_origin_country: 'JP',
          with_original_language: 'ja',
          without_genres: '10762',
          'first_air_date.gte': startStr,
          'first_air_date.lte': endStr,
          sort_by: 'popularity.desc',
          page,
        }).then((d) => ({
          items: (d.results || [])
            .map((t: any) => this.normalizeMedia(t, 'tv'))
            .filter((t: TMDBMediaItem) => t.release_date >= startStr && t.release_date <= endStr),
          pages: d.total_pages || 1,
        })),
        this.fetchTMDB<any>('/discover/tv', {
          with_genres: 16,
          with_origin_country: 'JP',
          with_original_language: 'ja',
          without_genres: '10762',
          with_status: '0|1|2',
          'air_date.gte': startStr,
          'air_date.lte': endStr,
          sort_by: 'popularity.desc',
          page,
        }).then(async (d) => {
          const rawList = (d.results || []).slice(0, 20);
          const verified = await Promise.all(
            rawList.map((t: any) => this.verifyTvEpisodeInPeriod(t, startStr, endStr))
          );
          return {
            items: verified.filter((it): it is TMDBMediaItem => it !== null),
            pages: d.total_pages || 1,
          };
        }),
        this.fetchTMDB<any>('/discover/movie', {
          with_genres: 16,
          with_origin_country: 'JP',
          with_original_language: 'ja',
          without_genres: '10762',
          'primary_release_date.gte': startStr,
          'primary_release_date.lte': endStr,
          sort_by: 'popularity.desc',
          page,
        }).then((d) => ({
          items: (d.results || [])
            .map((m: any) => this.normalizeMedia(m, 'movie'))
            .filter((m: TMDBMediaItem) => m.release_date >= startStr && m.release_date <= endStr),
          pages: d.total_pages || 1,
        }))
      );
    }

    const resolved = await Promise.all(promises);

    // Déduplication par media_type:id (B-09)
    const seen = new Set<string>();
    const combined: TMDBMediaItem[] = [];
    let maxPages = 1;

    for (const r of resolved) {
      if (r.pages > maxPages) maxPages = r.pages;
      for (const item of r.items) {
        const key = `${item.media_type}:${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }
    }

    // Résoudre tout titre contenant des caractères CJK (chinois/japonais/coréen) (U-05)
    const cjkItems = combined.filter((it) => hasCjkCharacters(it.title));
    if (cjkItems.length > 0) {
      await Promise.all(
        cjkItems.slice(0, 15).map(async (it) => {
          it.title = await this.resolveReadableTitle(it.media_type, it.id, it.title);
        })
      );
    }

    // Tri chronologique ascendant par date de sortie (B-09)
    combined.sort((a, b) => {
      const dateA = a.release_date || '9999-12-31';
      const dateB = b.release_date || '9999-12-31';
      const cmp = dateA.localeCompare(dateB);
      if (cmp !== 0) return cmp;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    return {
      results: combined,
      total_pages: maxPages,
    };
  }

  /**
   * Découverte d'animés / adaptations de mangas japonais (exclut les dessins animés pour enfants - code 10762)
   */
  public static async discoverAnime(
    page = 1,
    mediaType: 'tv' | 'movie' = 'tv'
  ): Promise<{ results: TMDBMediaItem[]; total_pages: number }> {
    const data = await this.fetchTMDB<any>(`/discover/${mediaType}`, {
      with_genres: 16,
      with_origin_country: 'JP',
      with_original_language: 'ja',
      without_genres: '10762',
      sort_by: 'popularity.desc',
      page,
    });

    return {
      results: (data.results || []).map((item: any) => this.normalizeMedia(item, mediaType)),
      total_pages: data.total_pages || 1,
    };
  }
}
