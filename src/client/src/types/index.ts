export type MediaType = 'movie' | 'tv';

export interface Genre {
  id: number;
  name: string;
}

export interface StreamingProvider {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface MediaItem {
  id: number;
  tmdb_id?: number;
  media_type: MediaType;
  title: string;
  original_title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  vote_average: number;
  vote_count: number;
  popularity?: number;
  genre_ids?: number[];
  genres?: Genre[];
  tagline?: string;
  runtime?: number | null;
  status?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  trailer_key?: string | null;
  cast?: { id: number; name: string; character: string; profile_path: string | null }[];
  director?: string | null;
  streaming_providers?: StreamingProvider[];
  buy_providers?: StreamingProvider[];
  isWatched?: boolean;
  userRating?: number | null;
  inWatchlist?: boolean;
  watchlistStatus?: string | null;
}

export interface HeroProposalItem extends MediaItem {
  recommendationReason?: string;
  categoryTag?: 'Film' | 'Série' | 'Animé / Manga';
}

export interface WatchedItem {
  id: number;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  genres: Genre[];
  overview: string | null;
  watched_at: string;
  rating: number | null;
  review: string | null;
}

export interface WatchlistItem {
  id: number;
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  genres: Genre[];
  overview: string | null;
  status: string;
  added_at: string;
}

export interface RecommendationSection {
  title: string;
  subtitle?: string;
  reason?: string;
  items: MediaItem[];
}

export interface RecommendationResponse {
  hasEnoughData: boolean;
  heroItems: HeroProposalItem[];
  topGenres: { id: number; name: string; count: number }[];
  sections: RecommendationSection[];
}

export interface UserStats {
  moviesWatched: number;
  tvWatched: number;
  totalWatched: number;
  watchlistCount: number;
  averageRating: number | null;
  estimatedHours: number;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  displayName: string;
  avatarUrl?: string;
  authProvider?: 'local' | 'ldap' | 'sso';
  simklConnected?: boolean;
  jellyfinConnected?: boolean;
  createdAt?: string;
}

export interface SeerRequest {
  id: number;
  status: number;
  type: MediaType;
  media: {
    id: number;
    tmdbId: number;
    status: number;
    mediaType: MediaType;
  };
  requestedBy: {
    id: number;
    displayName: string;
    avatar?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ArrStatus {
  inLibrary: boolean;
  downloaded: boolean;
  monitored: boolean;
  title?: string;
  path?: string;
  sizeOnDisk?: number;
  totalEpisodes?: number;
  downloadedEpisodes?: number;
}
