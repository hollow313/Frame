import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { MediaItem } from '../types';
import { MediaCard } from './MediaCard';

interface RecommendationRailProps {
  title: string;
  subtitle?: string;
  reason?: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  onToggleWatched: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export const RecommendationRail: React.FC<RecommendationRailProps> = ({
  title,
  subtitle,
  reason,
  items,
  onSelect,
  onToggleWatched,
  onToggleWatchlist,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -500 : 500;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-3 py-3">
      {/* Rail Header */}
      <div className="flex items-end justify-between px-1">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {title}
            </h2>
            {reason && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-600/20 text-primary-300 border border-primary-500/30">
                <Sparkles className="w-3 h-3" />
                {reason}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        {/* Scroll Nav Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-white border border-white/5 transition-colors"
            title="Précédent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-white border border-white/5 transition-colors"
            title="Suivant"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-3 pt-1 px-1"
      >
        {items.map((item) => (
          <div key={`${item.media_type}-${item.id}`} className="w-40 sm:w-48 shrink-0">
            <MediaCard
              item={item}
              onSelect={onSelect}
              onToggleWatched={onToggleWatched}
              onToggleWatchlist={onToggleWatchlist}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
