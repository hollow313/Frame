import React, { useState, useEffect } from 'react';
import { Compass, Film, Tv, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';
import { MediaCard } from '../components/MediaCard';

const GENRES = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Aventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comédie' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentaire' },
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
  const [mediaType, setMediaType] = useState<'all' | 'movie' | 'tv'>(initialType || 'all');
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
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
  }, [mediaType, selectedGenre, page]);

  const loadMedia = async () => {
    setLoading(true);
    try {
      if (selectedGenre) {
        const typeToQuery = mediaType === 'tv' ? 'tv' : 'movie';
        const res = await api.discoverByGenre(typeToQuery, selectedGenre, page);
        setItems(res.results);
        setTotalPages(Math.min(res.total_pages, 50));
      } else if (mediaType === 'movie') {
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
    } catch (err) {
      console.error('Erreur chargement explorer', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Page Title & Type Toggles */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Compass className="w-7 h-7 text-primary-400" />
            <span>Explorer la médiathèque</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Découvrez des milliers de films et séries en français avec métadonnées complètes.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-dark-900 border border-white/5 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => { setMediaType('all'); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mediaType === 'all' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => { setMediaType('movie'); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mediaType === 'movie' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Films
          </button>
          <button
            onClick={() => { setMediaType('tv'); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mediaType === 'tv' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            Séries
          </button>
        </div>
      </div>

      {/* Genres Horizontal Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        <button
          onClick={() => { setSelectedGenre(null); setPage(1); }}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
            selectedGenre === null
              ? 'bg-slate-200 text-dark-950 border-slate-200 font-bold'
              : 'bg-dark-900 text-slate-400 hover:text-white border-white/5'
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
                : 'bg-dark-900 text-slate-400 hover:text-white border-white/5'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Grid of Media */}
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
          Aucun résultat disponible pour cette sélection.
        </div>
      )}

      {/* Pagination Controls */}
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
