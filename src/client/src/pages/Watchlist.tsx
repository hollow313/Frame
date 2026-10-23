import React, { useState, useEffect } from 'react';
import { Bookmark, Film, Tv, Check, Trash2, CloudDownload } from 'lucide-react';
import { WatchlistItem, MediaItem } from '../types';
import { api } from '../services/api';

interface WatchlistProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onNavigateTab: (tab: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({
  onSelectMedia,
  onOpenRating,
  onNavigateTab,
}) => {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'manga'>('all');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadWatchlist();
  }, [filterType]);

  const loadWatchlist = async () => {
    setLoading(true);
    try {
      const type = filterType === 'all' ? undefined : filterType;
      const data = await api.getWatchlist(type);
      setItems(data);
    } catch (err) {
      console.error('Erreur chargement watchlist', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (item: WatchlistItem) => {
    try {
      await api.removeFromWatchlist(item.media_type, item.tmdb_id);
      setItems((prev) => prev.filter((i) => !(i.tmdb_id === item.tmdb_id && i.media_type === item.media_type)));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Bookmark className="w-7 h-7 text-primary-400" />
            <span>Votre liste de visionnage</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Les films et séries que vous prévoyez de regarder prochainement.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-dark-900 border border-white/5 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterType === 'all' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Tous ({items.length})
          </button>
          <button
            onClick={() => setFilterType('movie')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterType === 'movie' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Films
          </button>
          <button
            onClick={() => setFilterType('tv')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterType === 'tv' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Séries
          </button>
          <button
            onClick={() => setFilterType('manga')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterType === 'manga' ? 'bg-pink-500 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mangas
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col rounded-xl overflow-hidden bg-dark-900 border border-white/5 hover:border-primary-500/40 hover:shadow-glow transition-all"
            >
              <div
                className="relative aspect-[2/3] w-full overflow-hidden bg-dark-850 cursor-pointer"
                onClick={() => onSelectMedia({
                  id: item.tmdb_id,
                  media_type: item.media_type,
                  title: item.title,
                  overview: item.overview || '',
                  poster_path: item.poster_path,
                  backdrop_path: item.backdrop_path,
                  release_date: item.release_date || undefined,
                  vote_average: 0,
                  vote_count: 0,
                  inWatchlist: true,
                })}
              >
                {item.poster_path ? (
                  <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    {item.media_type === 'movie' ? <Film className="w-8 h-8" /> : <Tv className="w-8 h-8" />}
                  </div>
                )}

                {/* Quick actions overlay */}
                <div className="absolute inset-0 bg-dark-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenRating({
                        id: item.tmdb_id,
                        media_type: item.media_type,
                        title: item.title,
                        overview: item.overview || '',
                        poster_path: item.poster_path,
                        backdrop_path: item.backdrop_path,
                        release_date: item.release_date || undefined,
                        vote_average: 0,
                        vote_count: 0,
                      });
                    }}
                    className="p-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white transition-transform hover:scale-110"
                    title="Marquer comme vu"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(item);
                    }}
                    className="p-2 rounded-full bg-dark-800 hover:bg-rose-500/80 text-rose-400 hover:text-white transition-transform hover:scale-110"
                    title="Retirer de la liste"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-3">
                <h3 className="text-sm font-semibold text-slate-200 truncate group-hover:text-primary-400 transition-colors">
                  {item.title}
                </h3>
                <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                  <span>{item.media_type === 'movie' ? 'Film' : 'Série'}</span>
                  {item.release_date && <span>{new Date(item.release_date).getFullYear()}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3">
          <Bookmark className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Votre liste est vide.</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Parcourez les films et séries et cliquez sur « À voir » pour les ajouter à votre liste de visionnage.
          </p>
          <button
            onClick={() => onNavigateTab('discover')}
            className="mt-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold shadow-glow"
          >
            Explorer les nouveautés
          </button>
        </div>
      )}
    </div>
  );
};
