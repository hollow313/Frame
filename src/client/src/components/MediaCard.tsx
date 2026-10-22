import React from 'react';
import { Star, Check, Bookmark, Plus, Film, Tv, Eye } from 'lucide-react';
import { MediaItem } from '../types';

interface MediaCardProps {
  item: MediaItem;
  onSelect: (item: MediaItem) => void;
  onToggleWatched?: (item: MediaItem) => void;
  onToggleWatchlist?: (item: MediaItem) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onSelect,
  onToggleWatched,
  onToggleWatchlist,
}) => {
  const year = item.release_date ? new Date(item.release_date).getFullYear() : null;
  const isMovie = item.media_type === 'movie';

  return (
    <div className="group relative flex flex-col rounded-xl overflow-hidden bg-dark-900 border border-white/5 hover:border-primary-500/40 hover:shadow-glow transition-all duration-300">
      {/* Poster Image Container */}
      <div 
        className="relative aspect-[2/3] w-full overflow-hidden bg-dark-850 cursor-pointer"
        onClick={() => onSelect(item)}
      >
        {item.poster_path ? (
          <img
            src={item.poster_path}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-500">
            {isMovie ? <Film className="w-12 h-12 mb-2 stroke-1" /> : <Tv className="w-12 h-12 mb-2 stroke-1" />}
            <span className="text-xs font-medium">{item.title}</span>
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-950 via-dark-950/20 to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
          {/* Media Type Badge */}
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-dark-950/80 backdrop-blur-md text-slate-300 border border-white/10">
            {isMovie ? 'Film' : 'Série'}
          </span>

          {/* Rating */}
          {item.vote_average > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-dark-950/80 backdrop-blur-md text-amber-400 border border-white/10 text-xs font-semibold">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{item.vote_average.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Status Indicators (Watched / Watchlist) */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 pointer-events-none">
          {item.isWatched && (
            <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/90 text-white backdrop-blur-md shadow">
              <Check className="w-3 h-3 stroke-[3]" />
              {item.userRating ? `${item.userRating}/10` : 'Vu'}
            </span>
          )}

          {item.inWatchlist && !item.isWatched && (
            <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-600/90 text-white backdrop-blur-md shadow">
              <Bookmark className="w-3 h-3 fill-white" />
              <span>À voir</span>
            </span>
          )}
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-dark-950/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3 pointer-events-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            {/* Quick Toggle Watched */}
            {onToggleWatched && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatched(item);
                }}
                className={`p-2 rounded-full backdrop-blur-md transition-transform hover:scale-110 ${
                  item.isWatched
                    ? 'bg-emerald-500 text-white'
                    : 'bg-dark-800/90 hover:bg-emerald-600 text-slate-200 hover:text-white border border-white/10'
                }`}
                title={item.isWatched ? 'Marqué comme vu (cliquer pour modifier)' : 'Marquer comme déjà vu'}
              >
                <Check className="w-4 h-4" />
              </button>
            )}

            {/* Quick Toggle Watchlist */}
            {onToggleWatchlist && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWatchlist(item);
                }}
                className={`p-2 rounded-full backdrop-blur-md transition-transform hover:scale-110 ${
                  item.inWatchlist
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800/90 hover:bg-primary-600 text-slate-200 hover:text-white border border-white/10'
                }`}
                title={item.inWatchlist ? 'Dans votre liste' : 'Ajouter à ma liste'}
              >
                {item.inWatchlist ? <Bookmark className="w-4 h-4 fill-white" /> : <Plus className="w-4 h-4" />}
              </button>
            )}

            {/* Open Details */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
              }}
              className="p-2 rounded-full bg-dark-800/90 hover:bg-white/20 text-slate-200 hover:text-white border border-white/10 backdrop-blur-md transition-transform hover:scale-110"
              title="Détails complets"
            >
              <Eye className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="p-3 flex flex-col flex-1 justify-between gap-1 cursor-pointer" onClick={() => onSelect(item)}>
        <h3 className="text-sm font-semibold text-slate-200 group-hover:text-primary-400 transition-colors line-clamp-1">
          {item.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>{year || 'Date inconnue'}</span>
          {item.genres && item.genres.length > 0 && (
            <span className="text-[11px] text-slate-500 truncate max-w-[100px]">
              {item.genres[0].name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
