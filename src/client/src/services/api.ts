import {
  MediaItem,
  MediaType,
  TvSeason,
  WatchedItem,
  WatchlistItem,
  RecommendationResponse,
  UserStats,
  User,
  SeerRequest,
  SeerMediaStatus,
  ArrStatus,
} from '../types';

const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('frame_token');
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('frame_token', token);
  } else {
    localStorage.removeItem('frame_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || `Erreur serveur (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return data as T;
}

export const api = {
  // ==================== AUTH ====================
  getAuthStatus: () =>
    request<{
      initialized: boolean;
      allowRegistration: boolean;
      ldapEnabled: boolean;
      ssoEnabled: boolean;
      ssoUser?: { username: string } | null;
    }>('/auth/status'),
  loginSso: () =>
    request<{ user: User; token: string }>('/auth/sso', {
      method: 'POST',
    }),
  login: (credentials: { username: string; password: string }) =>
    request<{ user: User; token: string; simklConnected?: boolean; jellyfinConnected?: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  register: (payload: { username: string; password: string; displayName?: string }) =>
    request<{ user: User; token: string; message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  adminCreateUser: (payload: { username: string; password: string; displayName?: string; role: 'admin' | 'user' }) =>
    request<{ success: boolean; message: string; user: User }>('/auth/admin/create-user', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updatePreferences: (payload: { prefIncludeMovies?: boolean; prefIncludeTv?: boolean; prefIncludeAnime?: boolean }) =>
    request<{ success: boolean; message: string }>('/auth/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getMe: () => request<User>('/auth/me'),
  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  // ==================== TMDB ====================
  getTrending: (timeWindow: 'day' | 'week' = 'week', page: number = 1) =>
    request<{ results: MediaItem[]; page: number; total_pages: number }>(`/tmdb/trending?timeWindow=${timeWindow}&page=${page}`),
  getPopularMovies: (page: number = 1) =>
    request<{ results: MediaItem[]; page: number; total_pages: number }>(`/tmdb/popular/movies?page=${page}`),
  getPopularTV: (page: number = 1) =>
    request<{ results: MediaItem[]; page: number; total_pages: number }>(`/tmdb/popular/tv?page=${page}`),
  search: (query: string, page: number = 1) =>
    request<{ results: MediaItem[]; page: number; total_pages: number }>(`/tmdb/search?q=${encodeURIComponent(query)}&page=${page}`),
  getMediaDetails: (mediaType: MediaType, id: number) =>
    request<MediaItem>(`/tmdb/${mediaType === 'manga' ? 'tv' : mediaType}/${id}`),
  getTvSeason: (tvId: number, seasonNumber: number) =>
    request<TvSeason>(`/tmdb/tv/${tvId}/season/${seasonNumber}`),
  getUpcomingMedia: (
    type: 'all' | 'movie' | 'tv' | 'anime' = 'all',
    page: number = 1,
    startDate?: string,
    endDate?: string
  ) => {
    const params = new URLSearchParams({ type, page: page.toString() });
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    return request<{ results: MediaItem[]; total_pages: number }>(`/tmdb/upcoming?${params.toString()}`);
  },
  discoverByGenre: (type: 'movie' | 'tv', genreId: number, page: number = 1) =>
    request<{ results: MediaItem[]; total_pages: number }>(`/tmdb/discover?type=${type}&genreId=${genreId}&page=${page}`),
  discoverByProvider: (type: 'movie' | 'tv', providerId: number, genreId?: number, page: number = 1, recentOnly: boolean = false) =>
    request<{ results: MediaItem[]; total_pages: number }>(
      `/tmdb/providers/discover?type=${type}&providerId=${providerId}${genreId ? `&genreId=${genreId}` : ''}&page=${page}&recentOnly=${recentOnly}`
    ),
  discoverAnime: (type: 'tv' | 'movie' | 'all' = 'tv', page: number = 1) =>
    request<{ results: MediaItem[]; total_pages: number }>(`/tmdb/anime?type=${type}&page=${page}`),
  unifiedDiscover: (params: {
    type?: 'all' | 'movie' | 'tv' | 'anime';
    animeType?: 'tv' | 'movie';
    providerId?: number;
    genreId?: number;
    recentOnly?: boolean;
    dateFilter?: string;
    year?: number;
    sortBy?: 'popularity.desc' | 'release_date.desc' | 'vote_average.desc';
    page?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.type) q.set('type', params.type);
    if (params.animeType) q.set('animeType', params.animeType);
    if (params.providerId) q.set('providerId', params.providerId.toString());
    if (params.genreId) q.set('genreId', params.genreId.toString());
    if (params.recentOnly !== undefined) q.set('recentOnly', params.recentOnly ? 'true' : 'false');
    if (params.dateFilter) q.set('dateFilter', params.dateFilter);
    if (params.year) q.set('year', params.year.toString());
    if (params.sortBy) q.set('sortBy', params.sortBy);
    if (params.page) q.set('page', params.page.toString());
    return request<{ results: MediaItem[]; total_pages: number }>(`/tmdb/unified-discover?${q.toString()}`);
  },

  // ==================== WATCH TRACKING ====================
  markAsWatched: (payload: {
    tmdbId: number;
    mediaType: MediaType;
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    releaseDate?: string | null;
    genres?: any[];
    overview?: string | null;
    rating?: number | null;
    review?: string | null;
    watchedAt?: string | null;
  }) =>
    request<{ success: boolean; message: string }>('/media/watched', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unmarkWatched: (mediaType: MediaType, tmdbId: number) =>
    request<{ success: boolean; message: string }>(`/media/watched/${mediaType}/${tmdbId}`, {
      method: 'DELETE',
    }),
  getWatched: (type?: 'movie' | 'tv' | 'anime' | 'manga', sort?: string) =>
    request<WatchedItem[]>(`/media/watched?${type ? `type=${type}&` : ''}${sort ? `sort=${sort}` : ''}`),

  // Suivi épisode par épisode (U-01)
  getWatchedEpisodes: (tmdbId: number) =>
    request<{
      tmdbId: number;
      episodes: Array<{ seasonNumber: number; episodeNumber: number; watchedAt: string; rating: number | null; runtime: number }>;
    }>(`/media/watched/episodes/${tmdbId}`),
  markEpisodeWatched: (payload: {
    tmdbId: number;
    seasonNumber: number;
    episodeNumber: number;
    title?: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    releaseDate?: string | null;
    genres?: any[];
    runtime?: number | null;
  }) =>
    request<{ success: boolean; message: string; watchedAt: string }>('/media/watched/episode', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unmarkEpisodeWatched: (tmdbId: number, seasonNumber: number, episodeNumber: number) =>
    request<{ success: boolean; message: string }>(`/media/watched/episode/${tmdbId}/${seasonNumber}/${episodeNumber}`, {
      method: 'DELETE',
    }),
  markSeasonWatched: (payload: {
    tmdbId: number;
    seasonNumber: number;
    episodeCount?: number;
    episodes?: Array<{ episodeNumber: number; runtime?: number | null }>;
    title?: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    releaseDate?: string | null;
    genres?: any[];
    runtime?: number | null;
  }) =>
    request<{ success: boolean; markedCount: number; message: string }>('/media/watched/season', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unmarkSeasonWatched: (tmdbId: number, seasonNumber: number) =>
    request<{ success: boolean; message: string }>(`/media/watched/season/${tmdbId}/${seasonNumber}`, {
      method: 'DELETE',
    }),

  // ==================== WATCHLIST ====================
  addToWatchlist: (payload: {
    tmdbId: number;
    mediaType: MediaType;
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    releaseDate?: string | null;
    genres?: any[];
    overview?: string | null;
    status?: string;
  }) =>
    request<{ success: boolean; message: string }>('/media/watchlist', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  removeFromWatchlist: (mediaType: MediaType, tmdbId: number) =>
    request<{ success: boolean; message: string }>(`/media/watchlist/${mediaType}/${tmdbId}`, {
      method: 'DELETE',
    }),
  getWatchlist: (type?: 'movie' | 'tv' | 'anime' | 'manga') =>
    request<WatchlistItem[]>(`/media/watchlist${type ? `?type=${type}` : ''}`),

  // ==================== STATS & RECOMMENDATIONS ====================
  getUserStats: () => request<UserStats>('/media/stats'),
  getRecommendations: () => request<RecommendationResponse>('/recommendations'),
  recordRecoEvent: (payload: {
    mediaType: MediaType;
    tmdbId: number;
    event: 'impression' | 'click' | 'watchlist' | 'watched' | 'not_interested' | 'dismiss';
    section?: string;
  }) =>
    request<{ success: boolean }>('/reco/event', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  markNotInterested: (mediaType: MediaType, tmdbId: number) =>
    request<{ success: boolean; message: string }>('/reco/not-interested', {
      method: 'POST',
      body: JSON.stringify({ mediaType, tmdbId }),
    }),
  unmarkNotInterested: (mediaType: MediaType, tmdbId: number) =>
    request<{ success: boolean; message: string }>(`/reco/not-interested/${mediaType}/${tmdbId}`, {
      method: 'DELETE',
    }),

  // ==================== SEER (OVERSEERR) ====================
  getSeerStatus: () => request<{ configured: boolean; connected: boolean; message: string; version?: string }>('/seer/status'),
  getSeerUsers: () => request<Array<{ id: number; username?: string; displayName?: string; email?: string }>>('/seer/users'),
  checkSeerStatus: (mediaType: 'movie' | 'tv', tmdbId: number) =>
    request<SeerMediaStatus>(`/seer/check/${mediaType}/${tmdbId}`),
  getSeerRequests: (take: number = 30, skip: number = 0, filter: string = 'all') =>
    request<{ pageInfo: any; results: SeerRequest[] }>(`/seer/requests?take=${take}&skip=${skip}&filter=${filter}`),
  requestOnSeer: (payload: { mediaType: 'movie' | 'tv'; mediaId: number; seasons?: number[] | 'all'; is4k?: boolean }) =>
    request<{ success: boolean; message: string }>('/seer/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteSeerRequest: (requestId: number) =>
    request<{ success: boolean; message: string }>(`/seer/request/${requestId}`, {
      method: 'DELETE',
    }),
  approveSeerRequest: (requestId: number) =>
    request<{ success: boolean; message: string; result?: any }>(`/seer/request/${requestId}/approve`, {
      method: 'POST',
    }),
  declineSeerRequest: (requestId: number) =>
    request<{ success: boolean; message: string; result?: any }>(`/seer/request/${requestId}/decline`, {
      method: 'POST',
    }),

  // ==================== SONARR & RADARR ====================
  getArrStatus: () => request<{ sonarr: any; radarr: any }>('/sonarr/status'),
  checkSonarrSeries: (title: string, tvdbId?: number) =>
    request<ArrStatus>(`/sonarr/check/series?title=${encodeURIComponent(title)}${tvdbId ? `&tvdbId=${tvdbId}` : ''}`),
  checkRadarrMovie: (tmdbId: number) => request<ArrStatus>(`/sonarr/check/movie/${tmdbId}`),
  syncSonarrUnmonitored: () =>
    request<{ success: boolean; importedShows: number; importedAnime: number; totalImported: number; titles: string[]; message: string }>(
      '/sonarr/sync-unmonitored',
      { method: 'POST' }
    ),

  // ==================== SIMKL ====================
  getSimklStatus: () =>
    request<{
      connected: boolean;
      autoSync: boolean;
      lastSyncAt: string | null;
      lastSyncStatus: string | null;
      lastSyncError: string | null;
      nextSyncAt: string | null;
    }>('/simkl/status'),
  updateSimklSettings: (autoSync: boolean) =>
    request<{ success: boolean; autoSync: boolean; message: string }>('/simkl/settings', {
      method: 'PUT',
      body: JSON.stringify({ autoSync }),
    }),
  initSimklOAuth: (payload: { clientId?: string; clientSecret?: string; redirectUri: string }) =>
    request<{ authUrl: string; state: string; codeVerifier: string; clientId?: string; redirectUri: string }>('/simkl/oauth/init', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  callbackSimklOAuth: (payload: { code: string; codeVerifier?: string; redirectUri?: string; clientId?: string; clientSecret?: string }) =>
    request<{ success: boolean; message: string; user?: any }>('/simkl/oauth/callback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getSimklPin: (clientId?: string, clientSecret?: string) =>
    request<{ user_code: string; verification_url: string; expires_in: number; client_id?: string; device_code?: string; isV2?: boolean }>(
      `/simkl/pin?${clientId ? `clientId=${encodeURIComponent(clientId)}&` : ''}${clientSecret ? `clientSecret=${encodeURIComponent(clientSecret)}` : ''}`
    ),
  checkSimklPin: (userCode: string, clientId?: string, deviceCode?: string, clientSecret?: string) =>
    request<{ authorized: boolean; message?: string }>('/simkl/pin/check', {
      method: 'POST',
      body: JSON.stringify({ userCode, clientId, deviceCode, clientSecret }),
    }),
  linkSimkl: (payload: { accessToken: string; clientId?: string }) =>
    request<{ success: boolean; message: string }>('/simkl/link', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unlinkSimkl: () => request<{ success: boolean; message: string }>('/simkl/unlink', { method: 'POST' }),
  syncSimkl: () => request<{ success: boolean; message: string; stats: any }>('/simkl/sync', { method: 'POST' }),

  // ==================== JELLYFIN ====================
  getJellyfinServerInfo: () =>
    request<{ serverUrl: string; isConfigured: boolean }>('/jellyfin/server-info'),
  testJellyfinServer: (url: string) =>
    request<{ success: boolean; version?: string; message: string }>('/jellyfin/test-server', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
  linkJellyfin: (payload: { username?: string; password?: string; apiKey?: string; serverUrl?: string }) =>
    request<{ success: boolean; message: string; userId: string }>('/jellyfin/link', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  unlinkJellyfin: () => request<{ success: boolean; message: string }>('/jellyfin/unlink', { method: 'POST' }),
  syncJellyfin: () => request<{ success: boolean; message: string; result: any }>('/jellyfin/sync', { method: 'POST' }),
  getJellyfinNowPlaying: () => request<{ active: boolean; items: any[] }>('/jellyfin/now-playing'),
  checkJellyfinMedia: (mediaType: 'movie' | 'tv', tmdbId: number, title?: string, year?: number) => {
    const params = new URLSearchParams();
    if (title) params.append('title', title);
    if (year) params.append('year', year.toString());
    const qs = params.toString();
    return request<{ inJellyfin: boolean; itemId?: string; name?: string; serverUrl?: string }>(
      `/jellyfin/check/${mediaType}/${tmdbId}${qs ? `?${qs}` : ''}`
    );
  },

  // ==================== SETTINGS (ADMIN) ====================
  getSettings: () => request<Record<string, { configured: boolean; value?: string }>>('/settings'),
  updateSettings: (updates: Record<string, string>) =>
    request<{ success: boolean; message: string }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  testService: (service: 'tmdb' | 'seer' | 'sonarr' | 'radarr' | 'ldap' | 'jellyfin') =>
    request<{ success: boolean; message: string }>('/settings/test', {
      method: 'POST',
      body: JSON.stringify({ service }),
    }),

  // ==================== USERS (ADMIN) ====================
  getUsers: () => request<any[]>('/users'),
  updateUserRole: (id: number, role: 'admin' | 'user') =>
    request<{ success: boolean; message: string }>(`/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  deleteUser: (id: number) =>
    request<{ success: boolean; message: string }>(`/users/${id}`, {
      method: 'DELETE',
    }),
};
