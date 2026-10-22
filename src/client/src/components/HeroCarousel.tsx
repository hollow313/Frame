import React, { useState, useEffect } from 'react';
import { Star, Play, Check, Bookmark, Plus, Film, Tv, Sparkles, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { HeroProposalItem } from '../types';

interface HeroCarouselProps {
  items: HeroProposalItem[];
  onSelect: (item: HeroProposalItem) => void;
  onOpenRating: (item: HeroProposalItem) => void;
  onToggleWatchlist: (item: HeroProposalItem) => void;
}

export const HeroCarousel: React.FC<HeroCarouselProps> = ({
  items,
  onSelect,
  onOpenRating,
  onToggleWatchlist,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (items.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [items.length, isPaused]);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];
  const year = currentItem.release_date ? new Date(currentItem.release_date).getFullYear() : null;

  const getCategoryBadge = (tag?: string) => {
    switch (tag) {
      case 'Animé / Manga':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-accent-purple/25 text-purple-300 border border-purple-500/40 backdrop-blur-md">
            <Flame className="w-3.5 h-3.5 text-pink-400" />
            Animé / Manga
          </span>
        );
      case 'Série':
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 backdrop-blur-md">
            <Tv className="w-3.5 h-3.5" />
            Série TV
          </span>
        );
      case 'Film':
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-primary-600/30 text-primary-300 border border-primary-500/40 backdrop-blur-md">
            <Film className="w-3.5 h-3.5" />
            Film
          </span>
        );
    }
  };

  return (
    <div 
      className="relative w-full h-[480px] sm:h-[540px] rounded-3xl overflow-hidden mb-10 border border-white/5 shadow-2xl group"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background Backdrop Image */}
      {currentItem.backdrop_path ? (
        <img
          key={currentItem.id}
          src={currentItem.backdrop_path}
          alt={currentItem.title}
          className="w-full h-full object-cover object-center animate-in fade-in zoom-in-105 duration-700"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-tr from-dark-950 via-dark-900 to-primary-950" />
      )}

      {/* Multi-layered Vignette Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-dark-950 via-dark-950/80 to-transparent max-w-3xl" />

      {/* Top Slider Navigation Arrows */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
        <button
          onClick={() => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)}
          className="p-2 rounded-xl bg-dark-950/60 hover:bg-dark-900 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-all"
          title="Précédent"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrentIndex((prev) => (prev + 1) % items.length)}
          className="p-2 rounded-xl bg-dark-950/60 hover:bg-dark-900 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-all"
          title="Suivant"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Floating Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-12 max-w-2xl z-10 space-y-3.5">
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2.5">
          {getCategoryBadge(currentItem.categoryTag)}

          {currentItem.recommendationReason && (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              {currentItem.recommendationReason}
            </span>
          )}

          {year && (
            <span className="text-xs font-medium text-slate-400">
              {year}
            </span>
          )}

          {currentItem.vote_average > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-dark-950/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{currentItem.vote_average.toFixed(1)}</span>
            </div>
          )}
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight line-clamp-2">
          {currentItem.title}
        </h1>

        <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed max-w-xl">
          {currentItem.overview || 'Découvrez cette œuvre spécialement sélectionnée selon vos goûts sur Frame.'}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => onSelect(currentItem)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold shadow-glow transition-all hover:scale-105"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Détails & Bande-annonce</span>
          </button>

          <button
            onClick={() => onOpenRating(currentItem)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border backdrop-blur-md transition-all ${
              currentItem.isWatched
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-dark-900/80 hover:bg-white/10 text-slate-200 border-white/10'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{currentItem.isWatched ? 'Déjà vu' : 'Marquer vu'}</span>
          </button>

          <button
            onClick={() => onToggleWatchlist(currentItem)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border backdrop-blur-md transition-all ${
              currentItem.inWatchlist
                ? 'bg-primary-600 text-white border-primary-500'
                : 'bg-dark-900/80 hover:bg-white/10 text-slate-200 border-white/10'
            }`}
          >
            {currentItem.inWatchlist ? <Bookmark className="w-4 h-4 fill-white" /> : <Plus className="w-4 h-4" />}
            <span>{currentItem.inWatchlist ? 'Dans la liste' : 'À voir'}</span>
          </button>
        </div>

        {/* Bottom Carousel Indicator Dots & Slide Jump */}
        <div className="flex items-center gap-2 pt-4">
          {items.map((it, idx) => (
            <button
              key={it.id}
              onClick={() => setCurrentIndex(idx)}
              className={`h-2 rounded-full transition-all ${
                currentIndex === idx
                  ? 'w-8 bg-primary-500 shadow-glow'
                  : 'w-2.5 bg-white/20 hover:bg-white/40'
              }`}
              title={it.title}
            />
          ))}
          <span className="text-[11px] text-slate-400 ml-2">
            Proposition {currentIndex + 1} sur {items.length}
          </span>
        </div>
      </div>
    </div>
  );
};
