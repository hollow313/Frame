import React, { useState, useEffect } from 'react';
import { PlayCircle, AlertCircle } from 'lucide-react';
import { MediaItem, RecommendationResponse, HeroProposalItem } from '../types';
import { api } from '../services/api';
import { HeroCarousel } from '../components/HeroCarousel';
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
  const [heroItems, setHeroItems] = useState<HeroProposalItem[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [jellyfinPlaying, setJellyfinPlaying] = useState<any[]>([]);
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

      if (recs.heroItems && recs.heroItems.length > 0) {
        setHeroItems(recs.heroItems);
      }

      // Si l'utilisateur est connecté, charger lecture Jellyfin en cours
      if (user) {
        api.getJellyfinNowPlaying()
          .then((res) => {
            if (res.active) setJellyfinPlaying(res.items);
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.error('Erreur chargement Dashboard', err);
      setError(err.message || 'Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWithTelemetry = (item: MediaItem) => {
    if (user) {
      api.recordRecoEvent({ mediaType: item.media_type, tmdbId: item.id, event: 'click' }).catch(() => {});
    }
    onSelectMedia(item);
  };

  const handleNotInterested = async (item: MediaItem) => {
    if (!user) return;
    // Retirer immédiatement de l'interface
    setRecommendations((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections
          .map((sec) => ({
            ...sec,
            items: sec.items.filter((i) => !(i.id === item.id && i.media_type === item.media_type)),
          }))
          .filter((sec) => sec.items.length > 0),
      };
    });
    setHeroItems((prev) => prev.filter((i) => !(i.id === item.id && i.media_type === item.media_type)));

    try {
      await api.markNotInterested(item.media_type, item.id);
    } catch (e) {
      console.error('Erreur masquage recommandation', e);
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

      {/* Jellyfin Live Reading Banner */}
      {jellyfinPlaying.length > 0 && (
        <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-4 animate-in slide-in-from-top">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center animate-pulse">
              <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">En cours de lecture sur votre Jellyfin</span>
              <p className="text-sm font-bold text-white">
                {jellyfinPlaying[0].seriesName ? `${jellyfinPlaying[0].seriesName} - ` : ''}{jellyfinPlaying[0].title}
              </p>
              <div className="w-48 bg-dark-800 rounded-full h-1.5 mt-1.5 overflow-hidden">
                <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${jellyfinPlaying[0].percentPlayed}%` }} />
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-indigo-300">
            {jellyfinPlaying[0].percentPlayed}%
          </span>
        </div>
      )}

      {/* Hero Carousel with at least 5 customized media proposals (Films / Mangas / Séries) */}
      {heroItems.length > 0 && (
        <HeroCarousel
          items={heroItems}
          onSelect={handleSelectWithTelemetry}
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
          onSelect={handleSelectWithTelemetry}
          onToggleWatched={onOpenRating}
          onToggleWatchlist={onToggleWatchlist}
          onNotInterested={user ? handleNotInterested : undefined}
        />
      ))}
    </div>
  );
};
