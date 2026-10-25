export type MediaType = 'movie' | 'tv' | 'manga';

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
  seasons?: { id: number; name: string; season_number: number; episode_count: number; air_date?: string; poster_path?: string | null }[];
  trailer_key?: string | null;
  cast?: { id: number; name: string; character: string; profile_path: string | null }[];
  director?: string | null;
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
  isWatched?: boolean;
  watched_at?: string | null;
  userRating?: number | null;
  inWatchlist?: boolean;
  watchlistStatus?: string | null;
  score?: number;
  reasons?: string[];
  recommendationReason?: string;
}

export interface TvEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date?: string;
  runtime?: number | null;
  vote_average?: number | null;
  still_path?: string | null;
}

export interface TvSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  air_date?: string;
  poster_path?: string | null;
  episodes: TvEpisode[];
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
  isAnime?: boolean;
  isManga?: boolean;
  watch_count?: number;
  watchedEpisodesCount?: number;
  nextEpisode?: { seasonNumber: number; episodeNumber: number } | null;
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
  isAnime?: boolean;
  isManga?: boolean;
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
}

export interface RecommendationSection {
  key?: string;
  title: string;
  subtitle?: string;
  reason?: string;
  items: MediaItem[];
}

export interface RecommendationResponse {
  generatedAt?: string;
  profileStrength?: 'cold' | 'warming' | 'mature';
  hasEnoughData: boolean;
  heroItems: HeroProposalItem[];
  topGenres: { id: number; name: string; count: number }[];
  sections: RecommendationSection[];
}

export interface SimklPillarStats {
  days: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
  percentage: number;
  completedCount: number;
  totalEpisodes: number;
  watchingCount?: number;
  watchingEpisodes?: number;
  planToWatchCount?: number;
  planToWatchEpisodes?: number;
  onHoldCount?: number;
  droppedCount?: number;
  sparkline: number[];
}

export interface DayActivity {
  date: string; // YYYY-MM-DD
  count: number;
  minutes: number;
  tvMinutes: number;
  animeMinutes: number;
  movieMinutes: number;
  level: number; // 0 à 4
}

export interface TopDirector {
  name: string;
  count: number;
  hours: number;
  posterPath?: string | null;
  sampleTitle?: string;
}

export interface MediaRecapItem {
  id?: number;
  title: string;
  posterPath?: string | null;
  plays?: number;
  minutes: number;
}

export interface PeriodRecap {
  periodKey: string;
  label: string;
  totalHours: number;
  totalMinutes: number;
  tvHours: number;
  tvMinutes: number;
  tvShowsCount: number;
  animeHours: number;
  animeMinutes: number;
  animeCount: number;
  movieHours: number;
  movieMinutes: number;
  movieCount: number;
  activeDays: number;
  avgMinutesPerDay: number;
  mostActiveDay?: {
    date: string;
    label: string;
    hours: number;
    minutes: number;
  };
  longestBingeMinutes: number;
  topAnime: MediaRecapItem[];
  topMovies: MediaRecapItem[];
  topShows: MediaRecapItem[];
}

export interface RewatchedMediaItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  rewatchCount: number;
  additionalWatches: number;
  totalRewatchMinutes: number;
  isAnime?: boolean;
}

export interface UserStats {
  // Global Time & Breakdown
  totalWatched: number;
  moviesWatched: number;
  tvWatched: number;
  animeWatched: number;
  totalMinutes: number;
  totalDays: number;
  remainingHours: number;
  remainingMinutes: number;
  totalHours: number;
  moviesHours: number;
  tvHours: number;
  animeHours: number;

  // KPIs style Simkl
  titlesTracked: number;
  completedTitles: number;
  completionRate: number;
  totalEpisodes: number;
  finishedEpisodes: number;
  inProgressEpisodes: number;
  peakYear: number;
  peakYearHours: number;
  topWeekday: string;
  topWeekdayAvgFormatted: string;
  currentStreak: number;
  longestStreak: number;
  last30DaysHours: number;
  last30DaysActiveDays: number;
  watchDaysThisYear: number;
  daysPassedThisYear: number;
  backlogDays: number;
  backlogTitlesCount: number;
  weekStreakDays: boolean[];

  // 3 Piliers (TV, Anime, Films)
  tvStats: SimklPillarStats;
  animeStats: SimklPillarStats;
  movieStats: SimklPillarStats;

  // Heatmap 365 Jours
  heatmap: DayActivity[];

  // Genres & Réalisateurs & Revues
  topGenres: { name: string; count: number; minutes: number; percentage: number; color?: string }[];
  topDirectors: TopDirector[];
  totalRewatchesCount?: number;
  topRewatched?: RewatchedMediaItem[];

  // Récapitulatifs Mensuel & Hebdomadaire
  lastMonthRecap: PeriodRecap;
  thisMonthRecap: PeriodRecap;
  lastWeekRecap: PeriodRecap;
  thisWeekRecap: PeriodRecap;

  // Compatibilité & Watchlist
  currentYear?: number;
  thisYearWatchedCount?: number;
  thisYearTotalHours?: number;
  thisYearMoviesHours?: number;
  thisYearTvHours?: number;
  thisYearAnimeHours?: number;
  watchlistCount: number;
  averageRating: number | null;
  ratingCount?: number;
  ratingDistribution?: Record<number, number>;
  timeline?: { key: string; label: string; count: number; movies: number; tv: number; anime: number }[];
  estimatedHours?: number;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  displayName: string;
  avatarUrl?: string;
  authProvider?: 'local' | 'ldap' | 'sso';
  simklConnected?: boolean;
  simklClientId?: string;
  simklClientSecret?: string;
  simklLastSyncAt?: string | null;
  simklLastSyncStatus?: string | null;
  simklLastSyncError?: string | null;
  simklAutoSync?: boolean;
  jellyfinConnected?: boolean;
  jellyfinServerUrl?: string;
  seerUserId?: number | null;
  prefIncludeMovies?: boolean;
  prefIncludeTv?: boolean;
  prefIncludeAnime?: boolean;
  createdAt?: string;
}

export interface SeerRequest {
  id: number;
  status: number;
  type: MediaType;
  title?: string;
  originalTitle?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  overview?: string | null;
  releaseDate?: string | null;
  voteAverage?: number;
  genres?: Genre[];
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

export interface SeerMediaStatus {
  id?: number;
  tmdbId: number;
  status: number;
  statusName: 'unknown' | 'pending' | 'processing' | 'partially_available' | 'available';
  requested: boolean;
  requestId?: number;
  requestedBy?: string | null;
  requestedById?: number | null;
  requestedAt?: string | null;
  serviceId?: number;
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
