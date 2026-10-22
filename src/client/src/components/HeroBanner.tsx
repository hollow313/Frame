import React from 'react';
import { Star, Play, Check, Bookmark, Plus, Film, Tv } from 'lucide-react';
import { MediaItem } from '../types';

interface HeroBannerProps {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  item,
  onSelect,
  onOpenRating,
  onToggleWatchlist,
}) => {
  const isMovie = item.media_type === 'movie';
  const year = item.release_date ? new Date(item.release_date).getFullYear() : null;

  return (
    <div className="relative w-full h-[460px] sm:h-[520px] rounded-3xl overflow-hidden mb-10 border border-white/5 shadow-2xl group">
      {/* Background Backdrop Image */}
      {item.backdrop_path ? (
        <img
          src={item.backdrop_path}
          alt={item.title}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-1000 ease-out"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-tr from-dark-950 via-dark-900 to-primary-950" />
      )}

      {/* Multi-layered Vignette Gradients for Perfect Legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-dark-950 via-dark-950/80 to-transparent max-w-3xl" />

      {/* Floating Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-12 max-w-2xl z-10 space-y-3.5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-primary-600/30 text-primary-300 border border-primary-500/40 backdrop-blur-md">
            {isMovie ? <Film className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
            {isMovie ? 'Film à l\'affiche' : 'Série à l\'affiche'}
          </span>
          {year && (
            <span className="text-xs font-medium text-slate-400">
              {year}
            </span>
          )}
          {item.vote_average > 0 && (
            <div className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-dark-950/60 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/10">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{item.vote_average.toFixed(1)}</span>
            </div>
          )}
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight line-clamp-2">
          {item.title}
        </h1>

        <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed max-w-xl">
          {item.overview || 'Découvrez ce titre d\'exception recommandé pour votre profil sur Frame.'}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={() => onSelect(item)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-semibold shadow-glow transition-all hover:scale-105"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>Détails & Bande-annonce</span>
          </button>

          <button
            onClick={() => onOpenRating(item)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border backdrop-blur-md transition-all ${
              item.isWatched
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-dark-900/80 hover:bg-white/10 text-slate-200 border-white/10'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{item.isWatched ? 'Déjà vu' : 'Marquer vu'}</span>
          </button>

          <button
            onClick={() => onToggleWatchlist(item)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border backdrop-blur-md transition-all ${
              item.inWatchlist
                ? 'bg-primary-600 text-white border-primary-500'
                : 'bg-dark-900/80 hover:bg-white/10 text-slate-200 border-white/10'
            }`}
          >
            {item.inWatchlist ? <Bookmark className="w-4 h-4 fill-white" /> : <Plus className="w-4 h-4" />}
            <span>{item.inWatchlist ? 'Dans la liste' : 'À voir'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
