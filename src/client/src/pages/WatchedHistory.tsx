import React, { useState, useEffect } from 'react';
import { CheckCircle2, Film, Tv, Star, Trash2, Calendar, RefreshCw } from 'lucide-react';
import { WatchedItem, MediaItem } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface WatchedHistoryProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onNavigateTab: (tab: string) => void;
}

export const WatchedHistory: React.FC<WatchedHistoryProps> = ({
  onSelectMedia,
  onOpenRating,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv'>('all');
  const [sortBy, setSortBy] = useState<'watched_at' | 'rating'>('watched_at');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadWatched();
  }, [filterType, sortBy, user]);

  const loadWatched = async () => {
    setLoading(true);
    try {
      const type = filterType === 'all' ? undefined : filterType;
      const data = await api.getWatched(type, sortBy);
      setItems(data);
    } catch (err) {
      console.error('Erreur chargement vus', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item: WatchedItem) => {
    if (!confirm(`Retirer « ${item.title} » de vos films vus ?`)) return;
    try {
      await api.unmarkWatched(item.media_type, item.tmdb_id);
      setItems((prev) => prev.filter((i) => !(i.tmdb_id === item.tmdb_id && i.media_type === item.media_type)));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            <span>Historique des œuvres vues</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Retrouvez tous les films et séries que vous avez déjà visionnés et notés.
          </p>
        </div>

        {/* Filters and Sort */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Media type filter */}
          <div className="flex items-center gap-1 p-1 bg-dark-900 border border-white/5 rounded-xl">
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
          </div>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-dark-900 border border-white/5 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-primary-500"
          >
            <option value="watched_at">Récemment vu</option>
            <option value="rating">Mieux noté</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 p-3.5 rounded-2xl bg-dark-900 border border-white/5 hover:border-emerald-500/30 transition-all group"
            >
              {/* Poster */}
              <div 
                className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden bg-dark-850 shrink-0 cursor-pointer shadow-md"
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
                  isWatched: true,
                  userRating: item.rating,
                })}
              >
                {item.poster_path ? (
                  <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                    {item.media_type === 'movie' ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 flex flex-col justify-between min-w-0">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 
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
                        isWatched: true,
                        userRating: item.rating,
                      })}
                      className="text-sm font-bold text-white group-hover:text-emerald-400 cursor-pointer transition-colors truncate"
                    >
                      {item.title}
                    </h3>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Retirer des vus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span className="uppercase text-[10px] font-bold px-1.5 py-0.5 rounded bg-dark-800 text-slate-300">
                      {item.media_type === 'movie' ? 'Film' : 'Série'}
                    </span>
                    {item.release_date && (
                      <span>{new Date(item.release_date).getFullYear()}</span>
                    )}
                  </div>

                  {item.review && (
                    <p className="text-xs text-slate-300 line-clamp-2 mt-2 italic bg-dark-850 p-2 rounded-lg border border-white/5">
                      « {item.review} »
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400 mt-2">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(item.watched_at).toLocaleDateString('fr-FR')}</span>
                  </div>

                  <button
                    onClick={() => onOpenRating({
                      id: item.tmdb_id,
                      media_type: item.media_type,
                      title: item.title,
                      overview: item.overview || '',
                      poster_path: item.poster_path,
                      backdrop_path: item.backdrop_path,
                      release_date: item.release_date || undefined,
                      vote_average: 0,
                      vote_count: 0,
                      isWatched: true,
                      userRating: item.rating,
                    })}
                    className="flex items-center gap-1 font-bold text-amber-400 hover:scale-105 transition-transform"
                    title="Modifier la note"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>{item.rating ? `${item.rating}/10` : 'Noter'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Aucune œuvre enregistrée pour le moment.</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Marquez les films que vous avez aimés pour alimenter le moteur de recommandations ou synchronisez vos vues depuis Simkl.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => onNavigateTab('discover')}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold shadow-glow"
            >
              Découvrir des médias
            </button>
            <button
              onClick={() => onNavigateTab('settings')}
              className="flex items-center gap-1.5 px-4 py-2 bg-dark-900 border border-white/10 hover:bg-white/5 text-slate-300 rounded-xl text-xs font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Lier un compte Simkl</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
