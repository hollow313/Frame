import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Film, 
  Tv, 
  Bookmark, 
  Clock, 
  Star, 
  ChevronRight, 
  RefreshCw,
  Sparkles,
  Layers
} from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface CalendarProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export const Calendar: React.FC<CalendarProps> = ({
  onSelectMedia,
  onOpenRating,
  onToggleWatchlist,
}) => {
  const { user } = useAuth();
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'watchlist'>('all');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [watchlistItems, setWatchlistItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadCalendarData();
  }, [filterType]);

  const loadCalendarData = async () => {
    setLoading(true);
    try {
      if (filterType === 'watchlist') {
        if (user) {
          const wl = await api.getWatchlist();
          // Filtrer les items avec une date de sortie
          const upcomingWl = wl
            .filter((item) => item.release_date)
            .map((item) => ({
              id: item.tmdb_id,
              media_type: item.media_type,
              title: item.title,
              overview: item.overview || '',
              poster_path: item.poster_path,
              backdrop_path: item.backdrop_path,
              release_date: item.release_date || undefined,
              vote_average: 0,
              vote_count: 0,
              genres: item.genres,
              inWatchlist: true,
            }))
            .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
          setItems(upcomingWl);
        } else {
          setItems([]);
        }
      } else {
        const typeParam = filterType === 'watchlist' ? 'all' : filterType;
        const res = await api.getUpcomingMedia(typeParam, 1);
        setItems(res.results || []);
      }
    } catch (err) {
      console.error('Erreur chargement calendrier', err);
    } finally {
      setLoading(false);
    }
  };

  // Grouper les œuvres par période
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const in7DaysStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const in14DaysStr = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const endOfMonthStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const thisWeek: MediaItem[] = [];
  const nextWeek: MediaItem[] = [];
  const thisMonth: MediaItem[] = [];
  const later: MediaItem[] = [];

  for (const it of items) {
    const d = it.release_date || '';
    if (!d) {
      later.push(it);
    } else if (d <= in7DaysStr) {
      thisWeek.push(it);
    } else if (d <= in14DaysStr) {
      nextWeek.push(it);
    } else if (d <= endOfMonthStr) {
      thisMonth.push(it);
    } else {
      later.push(it);
    }
  }

  const sections = [
    { title: '⚡ Cette semaine (7 prochains jours)', items: thisWeek, color: 'text-amber-400' },
    { title: '📅 La semaine prochaine', items: nextWeek, color: 'text-sky-400' },
    { title: '🗓️ Ce mois-ci', items: thisMonth, color: 'text-indigo-400' },
    { title: '⏳ Prochainement (Mois suivants)', items: later, color: 'text-slate-300' },
  ].filter((s) => s.items.length > 0);

  const getCountdownText = (releaseDate?: string) => {
    if (!releaseDate) return null;
    const target = new Date(releaseDate).getTime();
    const diffDays = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Aujourd\'hui !';
    if (diffDays === 1) return 'Demain';
    return `Dans ${diffDays} jours`;
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CalendarIcon className="w-7 h-7 text-primary-400" />
            <span>Calendrier des Sorties</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Visualisez les prochaines sorties cinéma, séries TV et nouveautés à venir (style calendrier Sonarr / Radarr).
          </p>
        </div>

        <button
          onClick={loadCalendarData}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs text-slate-300 hover:text-white self-start sm:self-auto hover:bg-dark-850 transition-colors shadow"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-dark-900 border border-white/5 rounded-2xl w-fit">
        <button
          onClick={() => setFilterType('all')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterType === 'all'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Toutes les sorties</span>
        </button>
        <button
          onClick={() => setFilterType('movie')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterType === 'movie'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
          <span>Films</span>
        </button>
        <button
          onClick={() => setFilterType('tv')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterType === 'tv'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          <span>Séries</span>
        </button>
        <button
          onClick={() => setFilterType('watchlist')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterType === 'watchlist'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>Ma Watchlist</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sections.length > 0 ? (
        <div className="space-y-8">
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="space-y-3">
              <h2 className={`text-base font-extrabold uppercase tracking-wider flex items-center gap-2 ${section.color}`}>
                <span>{section.title}</span>
                <span className="text-xs text-slate-500 font-semibold lowercase">
                  ({section.items.length} sortie{section.items.length > 1 ? 's' : ''})
                </span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {section.items.map((item) => {
                  const releaseDate = item.release_date ? new Date(item.release_date) : null;
                  const countdown = getCountdownText(item.release_date);
                  const isMovie = item.media_type === 'movie';

                  return (
                    <div
                      key={`${item.media_type}-${item.id}`}
                      onClick={() => onSelectMedia(item)}
                      className="group p-3.5 rounded-2xl bg-dark-900 border border-white/5 hover:border-primary-500/30 transition-all flex items-center gap-3.5 cursor-pointer hover:bg-dark-850/90 shadow-md"
                    >
                      {/* Date Badge (Calendar block style) */}
                      <div className="w-14 h-16 rounded-xl bg-dark-850 border border-white/5 flex flex-col items-center justify-center shrink-0 group-hover:border-primary-500/40 transition-colors">
                        <span className="text-[10px] font-bold text-primary-400 uppercase tracking-widest">
                          {releaseDate ? releaseDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : 'DATE'}
                        </span>
                        <span className="text-xl font-black text-white leading-none">
                          {releaseDate ? releaseDate.getDate() : '?'}
                        </span>
                      </div>

                      {/* Poster */}
                      {item.poster_path ? (
                        <img
                          src={item.poster_path}
                          alt={item.title}
                          className="w-12 h-16 rounded-lg object-cover border border-white/10 shrink-0 group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-12 h-16 rounded-lg bg-dark-800 border border-white/5 flex items-center justify-center text-slate-500 shrink-0">
                          {isMovie ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                        </div>
                      )}

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-dark-800 text-slate-400">
                            {isMovie ? 'Film' : 'Série'}
                          </span>
                          {countdown && (
                            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                              {countdown}
                            </span>
                          )}
                        </div>

                        <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary-300 transition-colors">
                          {item.title}
                        </h3>

                        {item.genres && item.genres.length > 0 && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.genres.slice(0, 2).map((g) => g.name).join(' • ')}
                          </p>
                        )}
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3 bg-dark-900/30 rounded-3xl border border-white/5">
          <CalendarIcon className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Aucune sortie répertoriée pour cette sélection.</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterType === 'watchlist'
              ? 'Ajoutez des films et séries avec des dates de sortie futures à votre watchlist pour les voir ici.'
              : 'Les prochaines sorties apparaîtront automatiquement.'}
          </p>
        </div>
      )}
    </div>
  );
};
