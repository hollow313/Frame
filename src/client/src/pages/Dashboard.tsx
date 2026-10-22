import React, { useState, useEffect } from 'react';
import { Sparkles, Film, Tv, Clock, Star, TrendingUp, AlertCircle } from 'lucide-react';
import { MediaItem, RecommendationResponse, UserStats } from '../types';
import { api } from '../services/api';
import { HeroBanner } from '../components/HeroBanner';
import { RecommendationRail } from '../components/RecommendationRail';
import { useAuth } from '../context/AuthContext';

interface DashboardProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
  onNavigateTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onSelectMedia,
  onOpenRating,
  onToggleWatchlist,
  onNavigateTab,
}) => {
  const { user } = useAuth();
  const [heroItem, setHeroItem] = useState<MediaItem | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      // Charger les recommandations personnalisées
      const recs = await api.getRecommendations();
      setRecommendations(recs);

      // Sélectionner un item marquant pour le Hero Banner
      if (recs.sections.length > 0 && recs.sections[0].items.length > 0) {
        setHeroItem(recs.sections[0].items[0]);
      } else {
        const trending = await api.getTrending('week');
        if (trending.results.length > 0) {
          setHeroItem(trending.results[0]);
        }
      }

      // Si l'utilisateur est connecté, charger ses statistiques
      if (user) {
        api.getUserStats()
          .then((s) => setStats(s))
          .catch(() => {});
      }
    } catch (err: any) {
      console.error('Erreur chargement Dashboard', err);
      setError(err.message || 'Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Chargement de votre médiathèque Frame...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Configuration notice if TMDB key is missing */}
      {error && error.includes('TMDB') && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="text-sm font-bold">Clé TMDB requise</p>
              <p className="text-xs text-amber-300/80">Configurez votre clé d'API TheMovieDatabase dans les paramètres pour afficher les affiches, résumés et recommandations.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('settings')}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-dark-950 font-bold text-xs shrink-0 transition-transform hover:scale-105"
          >
            Configurer
          </button>
        </div>
      )}

      {/* User Quick Stats Bar */}
      {user && stats && stats.totalWatched > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary-600/20 text-primary-400 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold text-white">{stats.moviesWatched}</span>
              <p className="text-xs text-slate-400">Films vus</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold text-white">{stats.tvWatched}</span>
              <p className="text-xs text-slate-400">Séries suivies</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-accent-gold/20 text-accent-gold flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold text-white">{stats.estimatedHours} h</span>
              <p className="text-xs text-slate-400">Temps de visionnage</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Star className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-bold text-white">{stats.averageRating ? `${stats.averageRating} / 10` : '—'}</span>
              <p className="text-xs text-slate-400">Note moyenne</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Banner with Featured Media */}
      {heroItem && (
        <HeroBanner
          item={heroItem}
          onSelect={onSelectMedia}
          onOpenRating={onOpenRating}
          onToggleWatchlist={onToggleWatchlist}
        />
      )}

      {/* Personalized Recommendation Rails */}
      {recommendations && recommendations.sections.map((section, idx) => (
        <RecommendationRail
          key={idx}
          title={section.title}
          subtitle={section.subtitle}
          reason={section.reason}
          items={section.items}
          onSelect={onSelectMedia}
          onToggleWatched={onOpenRating}
          onToggleWatchlist={onToggleWatchlist}
        />
      ))}
    </div>
  );
};
