import React, { useState, useEffect } from 'react';
import { Tv, Film, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';
import { MediaCard } from '../components/MediaCard';

const PLATFORMS = [
  { id: 8, name: 'Netflix', color: 'from-red-600 to-rose-700', border: 'border-red-500/40' },
  { id: 9, name: 'Prime Video', color: 'from-sky-500 to-blue-600', border: 'border-blue-400/40' },
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

interface PlatformsProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export const Platforms: React.FC<PlatformsProps> = ({
  onSelectMedia,
  onOpenRating,
  onToggleWatchlist,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<number>(8); // Netflix par défaut
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadPlatformMedia();
  }, [selectedPlatform, mediaType, selectedGenre, page]);

  const loadPlatformMedia = async () => {
    setLoading(true);
    try {
      const res = await api.discoverByProvider(
        mediaType,
        selectedPlatform,
        selectedGenre || undefined,
        page
      );
      setItems(res.results);
      setTotalPages(Math.min(res.total_pages, 50));
    } catch (err) {
      console.error('Erreur chargement plateformes', err);
    } finally {
      setLoading(false);
    }
  };

  const currentPlatformInfo = PLATFORMS.find((p) => p.id === selectedPlatform) || PLATFORMS[0];

  return (
    <div className="space-y-6 pb-16">
      {/* Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Layers className="w-7 h-7 text-primary-400" />
          <span>Sorties & Catalogues par Plateforme</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Explorez les films et séries disponibles en streaming en France selon votre abonnement.
        </p>
      </div>

      {/* Platform Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
        {PLATFORMS.map((p) => {
          const active = p.id === selectedPlatform;
          return (
            <button
              key={p.id}
              onClick={() => {
                setSelectedPlatform(p.id);
                setPage(1);
              }}
              className={`p-3 rounded-2xl font-bold text-xs transition-all flex flex-col items-center justify-center gap-1 border ${
                active
                  ? `bg-gradient-to-tr ${p.color} text-white ${p.border} shadow-lg scale-105`
                  : 'bg-dark-900 text-slate-400 hover:text-white border-white/5 hover:bg-dark-850'
              }`}
            >
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Type & Genre Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-dark-900 border border-white/5">
        {/* Type toggle */}
        <div className="flex items-center gap-1.5 p-1 bg-dark-850 border border-white/5 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => { setMediaType('movie'); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              mediaType === 'movie' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Films
          </button>
          <button
            onClick={() => { setMediaType('tv'); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              mediaType === 'tv' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            Séries
          </button>
        </div>

        {/* Genres */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => { setSelectedGenre(null); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
              selectedGenre === null
                ? 'bg-slate-200 text-dark-950 border-slate-200 font-bold'
                : 'bg-dark-850 text-slate-400 hover:text-white border-white/5'
            }`}
          >
            Tous les genres
          </button>
          {GENRES.map((g) => (
            <button
              key={g.id}
              onClick={() => { setSelectedGenre(g.id); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                selectedGenre === g.id
                  ? 'bg-primary-600 text-white border-primary-500 font-bold shadow-glow'
                  : 'bg-dark-850 text-slate-400 hover:text-white border-white/5'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Results */}
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <MediaCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              onSelect={onSelectMedia}
              onToggleWatched={onOpenRating}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center text-slate-500">
          Aucun média disponible pour ces critères sur {currentPlatformInfo.name}.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Précédent</span>
          </button>
          <span className="text-xs text-slate-400">
            Page <span className="text-white font-bold">{page}</span> sur {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-4 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40"
          >
            <span>Suivant</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
