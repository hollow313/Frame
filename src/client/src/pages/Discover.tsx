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
  Filter,
  Check,
  Star,
  SlidersHorizontal,
  X
} from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';
import { MediaCard } from '../components/MediaCard';

const PLATFORMS = [
  { id: 0, name: 'Toutes les plateformes', color: 'from-slate-700 to-slate-900', border: 'border-white/10' },
  { id: 8, name: 'Netflix', color: 'from-red-600 to-rose-700', border: 'border-red-500/40' },
  { id: 119, name: 'Prime Video', color: 'from-sky-500 to-blue-600', border: 'border-blue-400/40' },
  { id: 337, name: 'Disney+', color: 'from-indigo-600 to-blue-800', border: 'border-indigo-400/40' },
  { id: 283, name: 'Crunchyroll', color: 'from-amber-500 to-orange-600', border: 'border-orange-500/40' },
  { id: 350, name: 'Apple TV+', color: 'from-slate-400 to-slate-600', border: 'border-slate-400/40' },
  { id: 381, name: 'Canal+', color: 'from-neutral-700 to-black', border: 'border-neutral-500/40' },
];

const GENRES = [
  { id: 0, name: 'Tous les genres' },
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
  // Main Category: 'all' | 'movie' | 'tv' | 'anime'
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'movie' | 'tv' | 'anime'>(
    initialType || 'all'
  );

  // Filters
  const [selectedPlatform, setSelectedPlatform] = useState<number>(0);
  const [selectedGenre, setSelectedGenre] = useState<number>(0);
  const [dateFilter, setDateFilter] = useState<string>('30d'); // Par défaut les 30 derniers jours
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'popularity.desc' | 'release_date.desc' | 'vote_average.desc'>('popularity.desc');
  const [animeSubtype, setAnimeSubtype] = useState<'tv' | 'movie'>('tv');

  // UI state for filter drawer on mobile
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Data & Pagination
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (initialType) {
      setSelectedCategory(initialType);
    }
  }, [initialType]);

  useEffect(() => {
    loadMedia();
  }, [selectedCategory, selectedPlatform, selectedGenre, dateFilter, selectedYear, sortBy, animeSubtype, page]);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await api.unifiedDiscover({
        type: selectedCategory,
        animeType: animeSubtype,
        providerId: selectedPlatform > 0 ? selectedPlatform : undefined,
        genreId: selectedGenre > 0 ? selectedGenre : undefined,
        dateFilter,
        year: selectedYear,
        sortBy,
        page,
      });

      setItems(res.results);
      setTotalPages(Math.min(res.total_pages, 50));
    } catch (err) {
      console.error('Erreur chargement découverte unifiée', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedPlatform(0);
    setSelectedGenre(0);
    setDateFilter('all');
    setSelectedYear(undefined);
    setSortBy('popularity.desc');
    setPage(1);
  };

  const hasActiveFilters = selectedPlatform > 0 || selectedGenre > 0 || dateFilter !== 'all' || sortBy !== 'popularity.desc';

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Compass className="w-7 h-7 text-primary-400" />
            <span>Découvrir</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Explorez les nouveautés films, séries et mangas, filtrez par plateforme de streaming et trouvez votre prochain coup de cœur.
          </p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="sm:hidden flex items-center gap-2 px-3.5 py-2 rounded-xl bg-dark-900 border border-white/10 text-xs font-semibold text-slate-200"
        >
          <SlidersHorizontal className="w-4 h-4 text-primary-400" />
          <span>Filtres {hasActiveFilters ? '(Actifs)' : ''}</span>
        </button>
      </div>

      {/* Main Categories Selector (Tout, Films, Séries, Mangas & Animés) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-dark-900 border border-white/5 rounded-2xl">
        <button
          onClick={() => { setSelectedCategory('all'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedCategory === 'all'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Tout voir</span>
        </button>

        <button
          onClick={() => { setSelectedCategory('movie'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedCategory === 'movie'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Films</span>
        </button>

        <button
          onClick={() => { setSelectedCategory('tv'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedCategory === 'tv'
              ? 'bg-primary-600 text-white shadow-glow scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Séries</span>
        </button>

        <button
          onClick={() => { setSelectedCategory('anime'); setPage(1); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedCategory === 'anime'
              ? 'bg-amber-500 text-dark-950 shadow-glow font-black scale-102'
              : 'text-slate-400 hover:text-white hover:bg-dark-850'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Mangas & Animés</span>
        </button>
      </div>

      {/* Manga Specific Sub-bar */}
      {selectedCategory === 'anime' && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-dark-900 to-dark-900 border border-amber-500/20 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-white">Animation Japonaise (Mangas & Animés)</p>
              <p className="text-[11px] text-slate-400">
                Œuvres sélectionnées pour ados et adultes (dessins animés pour jeunes enfants strictement exclus).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAnimeSubtype('tv'); setPage(1); }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                animeSubtype === 'tv'
                  ? 'bg-amber-500 text-dark-950 font-black shadow'
                  : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              Séries Animées
            </button>
            <button
              onClick={() => { setAnimeSubtype('movie'); setPage(1); }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                animeSubtype === 'movie'
                  ? 'bg-amber-500 text-dark-950 font-black shadow'
                  : 'bg-dark-850 text-slate-400 hover:text-white'
              }`}
            >
              Films d'Animation
            </button>
          </div>
        </div>
      )}

      {/* Unified Filter Controls Panel */}
      <div className={`p-4 sm:p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4 ${showFilters ? 'block' : 'hidden sm:block'}`}>
        {/* Row 1: Platform SVOD Pills */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 text-primary-400" />
              <span>Plateforme de streaming (France)</span>
            </span>
            {selectedPlatform > 0 && (
              <button
                onClick={() => { setSelectedPlatform(0); setPage(1); }}
                className="text-[11px] text-primary-400 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Réinitialiser plateforme</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const active = p.id === selectedPlatform;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPlatform(p.id); setPage(1); }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    active
                      ? `bg-gradient-to-r ${p.color} text-white ${p.border} shadow-md scale-102`
                      : 'bg-dark-850 text-slate-400 hover:text-white border-white/5 hover:bg-dark-800'
                  }`}
                >
                  {active && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Genre Pills */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5 text-primary-400" />
              <span>Genre</span>
            </span>
            {selectedGenre > 0 && (
              <button
                onClick={() => { setSelectedGenre(0); setPage(1); }}
                className="text-[11px] text-primary-400 hover:underline flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                <span>Tous genres</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {GENRES.map((g) => {
              const active = g.id === selectedGenre;
              return (
                <button
                  key={g.id}
                  onClick={() => { setSelectedGenre(g.id); setPage(1); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-primary-600 text-white shadow font-semibold'
                      : 'bg-dark-850 text-slate-400 hover:text-white border border-white/5 hover:bg-dark-800'
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Sort Options & Date Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs">
          {/* Left: Date / Period Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary-400" />
              <span>Sorties :</span>
            </span>

            <select
              value={dateFilter}
              onChange={(e) => {
                const val = e.target.value;
                setDateFilter(val);
                if (val.startsWith('year_')) {
                  setSelectedYear(parseInt(val.replace('year_', ''), 10));
                } else if (val !== 'custom_year') {
                  setSelectedYear(undefined);
                }
                setPage(1);
              }}
              className="bg-dark-850 border border-white/10 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary-500 font-medium cursor-pointer"
            >
              <option value="all">Toutes les dates (Déjà sortis)</option>
              <option value="upcoming">À venir (Prochaines sorties)</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="6m">6 derniers mois</option>
              <option value="this_year">Cette année (Déjà sortis)</option>
              <optgroup label="Années spécifiques">
                <option value="year_2025">2025</option>
                <option value="year_2024">2024</option>
                <option value="year_2023">2023</option>
                <option value="year_2022">2022</option>
                <option value="year_2021">2021</option>
                <option value="year_2020">2020</option>
                <option value="year_2019">2019</option>
                <option value="year_2015">2015</option>
                <option value="year_2010">2010</option>
                <option value="year_2000">2000</option>
                <option value="custom_year">Autre année...</option>
              </optgroup>
            </select>

            {dateFilter === 'custom_year' && (
              <input
                type="number"
                min="1920"
                max="2099"
                placeholder="Ex: 1999"
                value={selectedYear || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSelectedYear(isNaN(val) ? undefined : val);
                  setPage(1);
                }}
                className="w-20 bg-dark-850 border border-white/10 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-primary-500"
              />
            )}
          </div>

          {/* Right: Tri & Reset */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Trier par :</span>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as any); setPage(1); }}
              className="bg-dark-850 border border-white/10 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary-500"
            >
              <option value="popularity.desc">Plus populaires</option>
              <option value="release_date.desc">Sortie la plus récente</option>
              <option value="vote_average.desc">Mieux notés</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-2.5 py-1.5 rounded-xl bg-dark-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/5 transition-colors ml-2"
                title="Réinitialiser tous les filtres"
              >
                Effacer filtres
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Media Items Grid */}
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
              onSelect={onSelectMedia}
              onClick={onSelectMedia}
              onOpenRating={onOpenRating}
              onToggleWatchlist={onToggleWatchlist}
            />
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3 bg-dark-900/30 rounded-3xl border border-white/5">
          <Compass className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Aucun résultat trouvé pour ces critères.</p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold shadow-glow transition-all"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          <button
            onClick={() => { setPage((p) => Math.max(p - 1, 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
            onClick={() => { setPage((p) => Math.min(p + 1, totalPages)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
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
