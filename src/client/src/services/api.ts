import { MediaItem, WatchedItem, WatchlistItem, RecommendationResponse, UserStats, User, SeerRequest, ArrStatus } from '../types';

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
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    // Session expirée
    if (window.location.pathname !== '/login') {
      // Éviter boucle infinie
    }
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }

  return data as T;
}

export const api = {
  // ==================== AUTH ====================
  getAuthStatus: () => request<{ initialized: boolean }>('/auth/status'),
  login: (credentials: { username: string; password: string }) =>
    request<{ user: User; token: string; simklConnected?: boolean }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  register: (payload: { username: string; password: string; displayName?: string }) =>
    request<{ user: User; token: string; message: string }>('/auth/register', {
      method: 'POST',
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
  getMediaDetails: (mediaType: 'movie' | 'tv', id: number) =>
    request<MediaItem>(`/tmdb/${mediaType}/${id}`),
  discoverByGenre: (type: 'movie' | 'tv', genreId: number, page: number = 1) =>
    request<{ results: MediaItem[]; total_pages: number }>(`/tmdb/discover?type=${type}&genreId=${genreId}&page=${page}`),

  // ==================== WATCH TRACKING ====================
  markAsWatched: (payload: {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    releaseDate?: string | null;
    genres?: any[];
    overview?: string | null;
    rating?: number | null;
    review?: string | null;
  }) => request<{ success: boolean; message: string }>('/media/watched', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  unmarkWatched: (mediaType: 'movie' | 'tv', tmdbId: number) =>
    request<{ success: boolean; message: string }>(`/media/watched/${mediaType}/${tmdbId}`, {
      method: 'DELETE',
    }),
  getWatched: (type?: 'movie' | 'tv', sort?: string) =>
    request<WatchedItem[]>(`/media/watched?${type ? `type=${type}&` : ''}${sort ? `sort=${sort}` : ''}`),

  // ==================== WATCHLIST ====================
  addToWatchlist: (payload: {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath?: string | null;
    backdropPath?: string | null;
    releaseDate?: string | null;
    genres?: any[];
    overview?: string | null;
    status?: string;
  }) => request<{ success: boolean; message: string }>('/media/watchlist', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  removeFromWatchlist: (mediaType: 'movie' | 'tv', tmdbId: number) =>
    request<{ success: boolean; message: string }>(`/media/watchlist/${mediaType}/${tmdbId}`, {
      method: 'DELETE',
    }),
  getWatchlist: (type?: 'movie' | 'tv') =>
    request<WatchlistItem[]>(`/media/watchlist${type ? `?type=${type}` : ''}`),

  // ==================== STATS & RECOMMENDATIONS ====================
  getUserStats: () => request<UserStats>('/media/stats'),
  getRecommendations: () => request<RecommendationResponse>('/recommendations'),

  // ==================== SEER (OVERSEERR) ====================
  getSeerStatus: () => request<{ configured: boolean; connected: boolean; message: string; version?: string }>('/seer/status'),
  checkSeerStatus: (mediaType: 'movie' | 'tv', tmdbId: number) =>
    request<{ tmdbId: number; status: number; statusName: string; requested: boolean }>(`/seer/check/${mediaType}/${tmdbId}`),
  getSeerRequests: (take: number = 20, skip: number = 0, filter: string = 'all') =>
    request<{ pageInfo: any; results: SeerRequest[] }>(`/seer/requests?take=${take}&skip=${skip}&filter=${filter}`),
  requestOnSeer: (payload: { mediaType: 'movie' | 'tv'; mediaId: number; seasons?: number[] | 'all'; is4k?: boolean }) =>
    request<{ success: boolean; message: string }>('/seer/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ==================== SONARR & RADARR ====================
  getArrStatus: () => request<{ sonarr: any; radarr: any }>('/sonarr/status'),
  checkSonarrSeries: (title: string) => request<ArrStatus>(`/sonarr/check/series?title=${encodeURIComponent(title)}`),
  checkRadarrMovie: (tmdbId: number) => request<ArrStatus>(`/sonarr/check/movie/${tmdbId}`),

  // ==================== SIMKL ====================
  linkSimkl: (accessToken: string) =>
    request<{ success: boolean; message: string }>('/simkl/link', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    }),
  unlinkSimkl: () => request<{ success: boolean; message: string }>('/simkl/unlink', { method: 'POST' }),
  syncSimkl: () => request<{ success: boolean; message: string; stats: any }>('/simkl/sync', { method: 'POST' }),

  // ==================== SETTINGS (ADMIN) ====================
  getSettings: () => request<Record<string, { configured: boolean; value?: string }>>('/settings'),
  updateSettings: (updates: Record<string, string>) =>
    request<{ success: boolean; message: string }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  testService: (service: 'tmdb' | 'seer' | 'sonarr' | 'radarr') =>
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
