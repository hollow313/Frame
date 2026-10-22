import React, { useState, useEffect } from 'react';
import { 
  Compass, 
  Film, 
  Tv, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Layers, 
  Flame, 
  Calendar,
  Check
} from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';
import { MediaCard } from '../components/MediaCard';

const PLATFORMS = [
  { id: 8, name: 'Netflix', color: 'from-red-600 to-rose-700', border: 'border-red-500/40' },
  { id: 119, name: 'Prime Video', color: 'from-sky-500 to-blue-600', border: 'border-blue-400/40' },
  { id: 337, name: 'Disney+', color: 'from-indigo-600 to-blue-800', border: 'border-indigo-400/40' },
  { id: 283, name: 'Crunchyroll', color: 'from-amber-500 to-orange-600', border: 'border-orange-500/40' },
  { id: 350, name: 'Apple TV+', color: 'from-slate-400 to-slate-600', border: 'border-slate-400/40' },
  { id: 381, name: 'Canal+', color: 'from-neutral-700 to-black', border: 'border-neutral-500/40' },
];

const GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Aventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comédie' },
  { id: 80, name: 'Crime' },
  { id: 18, name: 'Drame' },
  { id: 14, name: 'Fantastique' },
  { id: 27, name: 'Horreur' },
  { id: 878, name: 'Science-Fiction' },
  { id: 53, name: 'Thriller' },
];

interface DiscoverProps {
  initialType?: 'movie' | 'tv';
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export const Discover: React.FC<DiscoverProps> = ({
  initialType,
  onSelectMedia,
  onOpenRating,
  onToggleWatchlist,
}) => {
  // Discovery Modes: 'trending' | 'platforms' | 'anime' | 'genres'
  const [activeMode, setActiveMode] = useState<'trending' | 'platforms' | 'anime' | 'genres'>('trending');
  const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv'>(initialType || 'all');
  
  // Platform state
  const [selectedPlatform, setSelectedPlatform] = useState<number>(8);
  const [recentOnly, setRecentOnly] = useState<boolean>(true); // Actif par défaut pour avoir les sorties du moment

  // Anime sub-type
  const [animeType, setAnimeType] = useState<'tv' | 'movie'>('tv');

  // Genre state
  const [selectedGenre, setSelectedGenre] = useState<number>(28);

  // Pagination & Data
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (initialType) {
      setMediaType(initialType);
    }
  }, [initialType]);

  useEffect(() => {
    loadMedia();
  }, [activeMode, mediaType, selectedPlatform, recentOnly, animeType, selectedGenre, page]);

  const loadMedia = async () => {
    setLoading(true);
    try {
      if (activeMode === 'platforms') {
        const typeToQuery = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await api.discoverByProvider(
          typeToQuery,
          selectedPlatform,
          undefined,
          page,
          recentOnly
        );
        setItems(res.results);
        setTotalPages(Math.min(res.total_pages, 50));
      } else if (activeMode === 'anime') {
        const res = await api.discoverAnime(animeType, page);
        setItems(res.results);
        setTotalPages(Math.min(res.total_pages, 50));
      } else if (activeMode === 'genres') {
        const typeToQuery = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await api.discoverByGenre(typeToQuery, selectedGenre, page);
        setItems(res.results);
        setTotalPages(Math.min(res.total_pages, 50));
      } else {
        // Trending
        if (mediaType === 'movie') {
          const res = await api.getPopularMovies(page);
          setItems(res.results);
          setTotalPages(Math.min(res.total_pages, 50));
        } else if (mediaType === 'tv') {
          const res = await api.getPopularTV(page);
          setItems(res.results);
          setTotalPages(Math.min(res.total_pages, 50));
        } else {
          const res = await api.getTrending('week', page);
          setItems(res.results);
          setTotalPages(Math.min(res.total_pages, 50));
        }
      }
    } catch (err) {
      console.error('Erreur chargement explorer', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Compass className="w-7 h-7 text-primary-400" />
          <span>Explorer & Découvrir</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Explorez les tendances, les catalogues par plateforme, les mangas et les genres cinématographiques.
        </p>
      </div>

      {/* Main Mode Pills (Trending, Platforms, Anime, Genres) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-dark-900 border border-white/5 rounded-2xl">
        <button
          onClick={() => { setActiveMode('trending'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeMode === 'trending'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Tendances & Populaires</span>
        </button>

        <button
          onClick={() => { setActiveMode('platforms'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeMode === 'platforms'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Par Plateforme (SVOD)</span>
        </button>

        <button
          onClick={() => { setActiveMode('anime'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeMode === 'anime'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Mangas & Animés</span>
        </button>

        <button
          onClick={() => { setActiveMode('genres'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeMode === 'genres'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Par Genre</span>
        </button>
      </div>

      {/* Sub-Filters: Mode Specific Controls */}
      {activeMode === 'platforms' && (
        <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
          {/* Platforms Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {PLATFORMS.map((p) => {
              const active = p.id === selectedPlatform;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlatform(p.id); setPage(1); }}
                  className={`p-3 rounded-2xl font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 border ${
                    active
                      ? `bg-gradient-to-tr ${p.color} text-white ${p.border} shadow-lg scale-105`
                      : 'bg-dark-850 text-slate-400 hover:text-white border-white/5 hover:bg-dark-800'
                  }`}
                >
                  <span className="text-sm">{p.name}</span>
                </button>
              );
            })}
          </div>

          {/* Platform Settings: Media Type and Recent Releases Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Type :</span>
              <button
                onClick={() => { setMediaType('movie'); setPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  mediaType !== 'tv' ? 'bg-primary-600 text-white' : 'bg-dark-850 text-slate-400 hover:text-white'
                }`}
              >
                Films
              </button>
              <button
                onClick={() => { setMediaType('tv'); setPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                  mediaType === 'tv' ? 'bg-primary-600 text-white' : 'bg-dark-850 text-slate-400 hover:text-white'
                }`}
              >
                Séries
              </button>
            </div>

            {/* Recent Releases Toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer bg-dark-850 hover:bg-dark-800 px-3 py-1.5 rounded-xl border border-white/5 transition-colors">
              <input
                type="checkbox"
                checked={recentOnly}
                onChange={(e) => { setRecentOnly(e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded border-slate-700 bg-dark-900 text-primary-600 focus:ring-0"
              />
              <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary-400" />
                <span>Sorties récentes du moment (2025 - 2026)</span>
              </span>
            </label>
          </div>
        </div>
      )}

      {activeMode === 'anime' && (
        <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Animation Japonaise (Mangas & Animés)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Sélection d'œuvres pour ados et adultes (dessins animés pour jeunes enfants strictement exclus).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAnimeType('tv'); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                animeType === 'tv' ? 'bg-amber-500 text-dark-950 font-black shadow' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              Séries Animées
            </button>
            <button
              onClick={() => { setAnimeType('movie'); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                animeType === 'movie' ? 'bg-amber-500 text-dark-950 font-black shadow' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              Films d'Animation
            </button>
          </div>
        </div>
      )}

      {activeMode === 'genres' && (
        <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-slate-400">Type d'œuvre :</span>
            <button
              onClick={() => { setMediaType('movie'); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                mediaType !== 'tv' ? 'bg-primary-600 text-white' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              Films
            </button>
            <button
              onClick={() => { setMediaType('tv'); setPage(1); }}
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                mediaType === 'tv' ? 'bg-primary-600 text-white' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              Séries
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => {
              const active = g.id === selectedGenre;
              return (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGenre(g.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? 'bg-primary-600 text-white shadow'
                      : 'bg-dark-850 text-slate-400 hover:text-white border border-white/5 hover:bg-dark-800'
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeMode === 'trending' && (
        <div className="flex items-center gap-1.5 p-1 bg-dark-900 border border-white/5 rounded-xl w-fit">
          <button
            onClick={() => { setMediaType('all'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mediaType === 'all' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tout
          </button>
          <button
            onClick={() => { setMediaType('movie'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mediaType === 'movie' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Films
          </button>
          <button
            onClick={() => { setMediaType('tv'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mediaType === 'tv' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Séries
          </button>
        </div>
      )}

      {/* Media Grid */}
      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <MediaCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              onClick={() => onSelectMedia(item)}
              onOpenRating={() => onOpenRating(item)}
              onToggleWatchlist={() => onToggleWatchlist(item)}
            />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3 bg-dark-900/30 rounded-3xl border border-white/5">
          <Compass className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Aucun résultat trouvé pour ces critères.</p>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          <button
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Précédent</span>
          </button>

          <span className="text-xs text-slate-400 font-medium px-2">
            Page {page} sur {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
          >
            <span>Suivant</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
