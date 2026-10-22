import React, { useState, useEffect } from 'react';
import { 
  Calendar as CalendarIcon, 
  Film, 
  Tv, 
  Bookmark, 
  Clock, 
  Star, 
  ChevronRight, 
  ChevronLeft,
  RefreshCw,
  Sparkles,
  Layers,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CalendarDays
} from 'lucide-react';
import { MediaItem, WatchlistItem } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface CalendarProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

// Utilitaires de dates en fuseau local (évite les décalages UTC)
const formatLocalDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (d: Date, days: number): Date => {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
};

// Obtenir le numéro de semaine ISO (1..53)
const getISOWeekNumber = (d: Date): number => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

interface CalendarWeek {
  weekNumber: number;
  monday: Date;
  sunday: Date;
  startStr: string;
  endStr: string;
  label: string;
  isCurrentWeek: boolean;
  items: MediaItem[];
}

export const Calendar: React.FC<CalendarProps> = ({
  onSelectMedia,
  onOpenRating,
  onToggleWatchlist,
}) => {
  const { user } = useAuth();
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'anime' | 'watchlist'>('all');
  
  // Plage de dates (par défaut 1 mois : aujourd'hui -> aujourd'hui + 30 jours)
  const today = new Date();
  const todayStr = formatLocalDate(today);
  const [preset, setPreset] = useState<'2w' | '1m' | '2m' | '3m' | 'custom'>('1m');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(formatLocalDate(addDays(today, 30)));

  const [items, setItems] = useState<MediaItem[]>([]);
  const [noScheduleWatchlist, setNoScheduleWatchlist] = useState<WatchlistItem[]>([]);
  const [pastWatchlist, setPastWatchlist] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sections repliables pour les listes secondaires
  const [showPastSection, setShowPastSection] = useState<boolean>(false);
  const [showNoScheduleSection, setShowNoScheduleSection] = useState<boolean>(false);

  useEffect(() => {
    loadCalendarData();
  }, [filterType, startDate, endDate]);

  const applyPreset = (newPreset: '2w' | '1m' | '2m' | '3m') => {
    setPreset(newPreset);
    const now = new Date();
    const sStr = formatLocalDate(now);
    let days = 30;
    if (newPreset === '2w') days = 14;
    else if (newPreset === '1m') days = 30;
    else if (newPreset === '2m') days = 60;
    else if (newPreset === '3m') days = 90;

    const eStr = formatLocalDate(addDays(now, days));
    setStartDate(sStr);
    setEndDate(eStr);
  };

  const handlePreviousPeriod = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const durationDays = Math.max(7, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
    setStartDate(formatLocalDate(addDays(s, -durationDays)));
    setEndDate(formatLocalDate(addDays(e, -durationDays)));
    setPreset('custom');
  };

  const handleNextPeriod = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const durationDays = Math.max(7, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
    setStartDate(formatLocalDate(addDays(s, durationDays)));
    setEndDate(formatLocalDate(addDays(e, durationDays)));
    setPreset('custom');
  };

  const handleTodayReset = () => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const durationDays = Math.max(7, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
    const now = new Date();
    setStartDate(formatLocalDate(now));
    setEndDate(formatLocalDate(addDays(now, durationDays)));
  };

  const loadCalendarData = async () => {
    setLoading(true);
    try {
      if (filterType === 'watchlist') {
        if (user) {
          const wl = await api.getWatchlist();
          const inRange: MediaItem[] = [];
          const past: MediaItem[] = [];
          const noSchedule: WatchlistItem[] = [];

          wl.forEach((item) => {
            if (item.media_type === 'tv') {
              const ep = item.next_episode_to_air;
              if (ep && ep.air_date) {
                // La série a un épisode à venir programmé
                const mediaItem: MediaItem = {
                  id: item.tmdb_id,
                  media_type: 'tv',
                  title: item.title,
                  overview: item.overview || '',
                  poster_path: item.poster_path,
                  backdrop_path: item.backdrop_path,
                  release_date: ep.air_date,
                  vote_average: 0,
                  vote_count: 0,
                  genres: item.genres,
                  inWatchlist: true,
                  next_episode_to_air: ep,
                  status: item.series_status,
                  number_of_seasons: item.seasons_count,
                };

                if (ep.air_date >= startDate && ep.air_date <= endDate) {
                  inRange.push(mediaItem);
                } else if (ep.air_date < startDate) {
                  past.push(mediaItem);
                }
              } else {
                // Série sans prochain épisode programmé (ex : Scrubs, série terminée ou entre saisons)
                noSchedule.push(item);
              }
            } else {
              // Film
              const rDate = item.release_date;
              const mediaItem: MediaItem = {
                id: item.tmdb_id,
                media_type: 'movie',
                title: item.title,
                overview: item.overview || '',
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                release_date: rDate || undefined,
                vote_average: 0,
                vote_count: 0,
                genres: item.genres,
                inWatchlist: true,
              };

              if (rDate) {
                if (rDate >= startDate && rDate <= endDate) {
                  inRange.push(mediaItem);
                } else if (rDate < startDate) {
                  past.push(mediaItem);
                }
              } else {
                noSchedule.push(item);
              }
            }
          });

          inRange.sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
          past.sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''));

          setItems(inRange);
          setPastWatchlist(past);
          setNoScheduleWatchlist(noSchedule);
        } else {
          setItems([]);
          setPastWatchlist([]);
          setNoScheduleWatchlist([]);
        }
      } else {
        const res = await api.getUpcomingMedia(filterType, 1, startDate, endDate);
        setItems(res.results || []);
        setPastWatchlist([]);
        setNoScheduleWatchlist([]);
      }
    } catch (err) {
      console.error('Erreur chargement calendrier', err);
    } finally {
      setLoading(false);
    }
  };

  // Découper la période en semaines du lundi au dimanche
  const computeCalendarWeeks = (): CalendarWeek[] => {
    if (!startDate || !endDate) return [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Trouver le lundi de la semaine de départ
    const startDay = start.getDay();
    const diffToMonday = startDay === 0 ? -6 : 1 - startDay;
    const currentMonday = new Date(start);
    currentMonday.setDate(start.getDate() + diffToMonday);
    currentMonday.setHours(0, 0, 0, 0);

    const weeks: CalendarWeek[] = [];
    const nowTime = new Date().setHours(0, 0, 0, 0);

    while (currentMonday <= end) {
      const sunday = new Date(currentMonday);
      sunday.setDate(currentMonday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const mStr = formatLocalDate(currentMonday);
      const sStr = formatLocalDate(sunday);
      const wNum = getISOWeekNumber(currentMonday);

      const isCurrentWeek = nowTime >= currentMonday.getTime() && nowTime <= sunday.getTime();

      const weekLabel = `Semaine ${wNum} • ${currentMonday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${sunday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;

      // Filtrer les items de cette semaine
      const weekItems = items.filter((it) => {
        const d = it.release_date;
        return Boolean(d && d >= mStr && d <= sStr);
      });

      weeks.push({
        weekNumber: wNum,
        monday: new Date(currentMonday),
        sunday: new Date(sunday),
        startStr: mStr,
        endStr: sStr,
        label: weekLabel,
        isCurrentWeek,
        items: weekItems,
      });

      currentMonday.setDate(currentMonday.getDate() + 7);
    }

    return weeks;
  };

  const calendarWeeks = computeCalendarWeeks();
  const weeksWithReleases = calendarWeeks.filter((w) => w.items.length > 0);

  const getCountdownText = (releaseDate?: string) => {
    if (!releaseDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(releaseDate);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Disponible';
    if (diffDays === 0) return "Aujourd'hui !";
    if (diffDays === 1) return 'Demain';
    return `Dans ${diffDays} jours`;
  };

  const dayOfWeekNames = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];

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
          disabled={loading}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs text-slate-300 hover:text-white self-start sm:self-auto hover:bg-dark-850 transition-colors shadow disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary-400' : ''}`} />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Catégories de Filtre */}
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
          onClick={() => setFilterType('anime')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
            filterType === 'anime'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Mangas & Animés</span>
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

      {/* Barre de Filtre par Période (Multi-semaines avec presets et sélecteur de dates) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Presets rapides */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
              <CalendarRange className="w-3.5 h-3.5 text-primary-400" />
              <span>Période :</span>
            </span>

            <button
              onClick={() => applyPreset('2w')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                preset === '2w' ? 'bg-primary-600 text-white shadow' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              2 semaines
            </button>
            <button
              onClick={() => applyPreset('1m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                preset === '1m' ? 'bg-primary-600 text-white shadow' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              1 mois (Défaut)
            </button>
            <button
              onClick={() => applyPreset('2m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                preset === '2m' ? 'bg-primary-600 text-white shadow' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              2 mois
            </button>
            <button
              onClick={() => applyPreset('3m')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                preset === '3m' ? 'bg-primary-600 text-white shadow' : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              3 mois
            </button>
          </div>

          {/* Navigation temporelle (Précédent / Aujourd'hui / Suivant) */}
          <div className="flex items-center gap-1.5 bg-dark-850 p-1 rounded-xl border border-white/5">
            <button
              onClick={handlePreviousPeriod}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-800 transition-colors"
              title="Période précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleTodayReset}
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 hover:text-white hover:bg-dark-800 transition-colors"
            >
              Aujourd'hui
            </button>
            <button
              onClick={handleNextPeriod}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-dark-800 transition-colors"
              title="Période suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sélecteurs de dates De ... À ... */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-white/5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Du :</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPreset('custom');
                }}
                className="bg-dark-850 border border-white/10 rounded-xl px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-semibold">Au :</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPreset('custom');
                }}
                className="bg-dark-850 border border-white/10 rounded-xl px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <div className="text-slate-400 font-medium text-[11px]">
            <span>
              {calendarWeeks.length} semaine{calendarWeeks.length > 1 ? 's' : ''} couverte{calendarWeeks.length > 1 ? 's' : ''} •{' '}
              <strong className="text-slate-200">{items.length} sortie{items.length > 1 ? 's' : ''}</strong> dans cette période
            </span>
          </div>
        </div>
      </div>

      {/* Contenu principal : Grille multi-semaines */}
      {loading ? (
        <div className="h-80 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : weeksWithReleases.length > 0 ? (
        <div className="space-y-8">
          {weeksWithReleases.map((week) => (
            <div key={week.startStr} className="space-y-3.5">
              {/* En-tête de la semaine */}
              <div className="flex items-center justify-between pb-1 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary-400" />
                    <span>{week.label}</span>
                  </h2>

                  {week.isCurrentWeek && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider text-emerald-400 animate-pulse">
                      Semaine en cours
                    </span>
                  )}
                </div>

                <span className="text-xs font-semibold text-slate-400 bg-dark-850 px-2.5 py-0.5 rounded-lg border border-white/5">
                  {week.items.length} sortie{week.items.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Grille des œuvres pour cette semaine */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {week.items.map((item) => {
                  const releaseDate = item.release_date ? new Date(item.release_date) : null;
                  const countdown = getCountdownText(item.release_date);
                  const isMovie = item.media_type === 'movie';
                  const isAnime = item.genre_ids?.includes(16) || item.genres?.some((g) => g.id === 16);
                  const dayOfWeek = releaseDate ? dayOfWeekNames[releaseDate.getDay()] : '';

                  return (
                    <div
                      key={`${item.media_type}-${item.id}`}
                      onClick={() => onSelectMedia(item)}
                      className="group p-3.5 rounded-2xl bg-dark-900 border border-white/5 hover:border-primary-500/30 transition-all flex items-center gap-3.5 cursor-pointer hover:bg-dark-850/90 shadow-md"
                    >
                      {/* Bloc Calendrier (Jour de la semaine, Numéro, Mois) */}
                      <div className="w-14 h-16 rounded-xl bg-dark-850 border border-white/5 flex flex-col items-center justify-center shrink-0 group-hover:border-primary-500/40 transition-colors">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                          {dayOfWeek}
                        </span>
                        <span className="text-xl font-black text-white leading-none my-0.5">
                          {releaseDate ? releaseDate.getDate() : '?'}
                        </span>
                        <span className="text-[10px] font-bold text-primary-400 uppercase tracking-widest">
                          {releaseDate ? releaseDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') : ''}
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

                      {/* Info & Badges */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span
                            className={`text-[9px] uppercase font-extrabold px-1.5 py-0.2 rounded ${
                              isAnime ? 'bg-amber-500/20 text-amber-300' : 'bg-dark-800 text-slate-400'
                            }`}
                          >
                            {isAnime ? 'Animé' : isMovie ? 'Film' : 'Série'}
                          </span>

                          {/* Badge Prochain Épisode (Ex: S01E03) */}
                          {item.next_episode_to_air && (
                            <span className="text-[10px] font-black text-sky-300 bg-sky-500/15 px-1.5 py-0.2 rounded border border-sky-500/30">
                              S{String(item.next_episode_to_air.season_number).padStart(2, '0')}E{String(item.next_episode_to_air.episode_number).padStart(2, '0')}
                            </span>
                          )}

                          {countdown && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                                countdown.includes("Aujourd'hui")
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : countdown.includes('Demain')
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                  : 'bg-primary-500/10 text-primary-300 border-primary-500/20'
                              }`}
                            >
                              {countdown}
                            </span>
                          )}
                        </div>

                        <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary-300 transition-colors">
                          {item.title}
                        </h3>

                        {/* Titre de l'épisode ou Genres */}
                        {item.next_episode_to_air?.name ? (
                          <p className="text-[11px] text-sky-300/80 truncate mt-0.5 font-medium">
                            « {item.next_episode_to_air.name} »
                          </p>
                        ) : item.genres && item.genres.length > 0 ? (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {item.genres.slice(0, 2).map((g) => g.name).join(' • ')}
                          </p>
                        ) : null}
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
        <div className="py-20 text-center space-y-3 bg-dark-900/30 rounded-3xl border border-white/5">
          <CalendarIcon className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">
            Aucune sortie programmée entre le {new Date(startDate).toLocaleDateString('fr-FR')} et le {new Date(endDate).toLocaleDateString('fr-FR')}.
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Vous pouvez élargir la période (2 mois, 3 mois) ou sélectionner d'autres dates ci-dessus.
          </p>
          <div className="pt-2">
            <button
              onClick={() => applyPreset('2m')}
              className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold transition-all shadow-glow"
            >
              Élargir à 2 mois
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION SPÉCIALE WATCHLIST : SÉRIES TERMINÉES OU SANS PROCHAIN ÉPISODE   */}
      {/* (Ex : Scrubs, Friends, etc. ne polluent plus le calendrier avec leur date de 2001) */}
      {/* ========================================================================= */}
      {filterType === 'watchlist' && noScheduleWatchlist.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-dark-900/70 border border-white/5 space-y-4">
          <div
            onClick={() => setShowNoScheduleSection(!showNoScheduleSection)}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-200 group-hover:text-amber-400 transition-colors">
                Séries sans diffusion programmée (terminées ou en pause)
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                ({noScheduleWatchlist.length} titre{noScheduleWatchlist.length > 1 ? 's' : ''})
              </span>
            </div>
            <button className="p-1 rounded-lg bg-dark-850 text-slate-400 hover:text-white transition-colors">
              {showNoScheduleSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Ces séries sont dans votre liste « À Voir », mais n'ont pas d'épisode futur prévu dans le calendrier (ex : séries terminées ou en attente d'une nouvelle saison).
          </p>

          {showNoScheduleSection && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {noScheduleWatchlist.map((item) => {
                const isEnded = item.series_status === 'Ended' || item.series_status === 'Canceled';

                return (
                  <div
                    key={`nosched-${item.id}`}
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
                      genres: item.genres,
                      inWatchlist: true,
                    })}
                    className="p-3 rounded-xl bg-dark-850 border border-white/5 hover:border-amber-500/30 transition-all flex items-center gap-3 cursor-pointer group"
                  >
                    {item.poster_path ? (
                      <img src={item.poster_path} alt={item.title} className="w-10 h-14 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-14 rounded-lg bg-dark-800 flex items-center justify-center text-slate-600 shrink-0">
                        <Tv className="w-4 h-4" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${
                          isEnded ? 'bg-slate-700/60 text-slate-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {isEnded 
                            ? (item.seasons_count ? `Terminée (${item.seasons_count} saisons)` : 'Série terminée')
                            : 'En pause / Attente'}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-400 transition-colors">
                        {item.title}
                      </h4>
                      {item.genres && item.genres.length > 0 && (
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {item.genres.slice(0, 2).map((g) => g.name).join(' • ')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION SPÉCIALE WATCHLIST : SORTIES PASSÉES (DÉJÀ DISPONIBLES)          */}
      {/* ========================================================================= */}
      {filterType === 'watchlist' && pastWatchlist.length > 0 && (
        <div className="p-4 sm:p-5 rounded-2xl bg-dark-900/70 border border-white/5 space-y-3">
          <div
            onClick={() => setShowPastSection(!showPastSection)}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 transition-colors">
                Déjà sorties avant cette période (passées)
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                ({pastWatchlist.length} sortie{pastWatchlist.length > 1 ? 's' : ''})
              </span>
            </div>
            <button className="p-1 rounded-lg bg-dark-850 text-slate-400 hover:text-white transition-colors">
              {showPastSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showPastSection && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
              {pastWatchlist.map((item) => (
                <div
                  key={`past-${item.id}`}
                  onClick={() => onSelectMedia(item)}
                  className="p-3 rounded-xl bg-dark-850 border border-white/5 hover:border-emerald-500/30 transition-all flex items-center gap-3 cursor-pointer group"
                >
                  {item.poster_path ? (
                    <img src={item.poster_path} alt={item.title} className="w-10 h-14 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-14 rounded-lg bg-dark-800 flex items-center justify-center text-slate-600 shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300">
                        Disponible
                      </span>
                      {item.release_date && (
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.release_date).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-emerald-400 transition-colors">
                      {item.title}
                    </h4>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
