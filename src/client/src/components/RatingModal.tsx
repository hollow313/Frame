import React, { useState } from 'react';
import { Star, X, Check, Calendar, MessageSquare } from 'lucide-react';
import { MediaItem } from '../types';

interface RatingModalProps {
  item: MediaItem;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number | null, review: string | null, date: string) => void;
  onDelete?: () => void;
}

export const RatingModal: React.FC<RatingModalProps> = ({
  item,
  isOpen,
  onClose,
  onSubmit,
  onDelete,
}) => {
  const [rating, setRating] = useState<number | null>(item.userRating || null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [review, setReview] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-dark-900 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-primary-400">
              Suivi de visionnage
            </span>
            <h3 className="text-lg font-bold text-white line-clamp-1 mt-0.5">
              {item.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 10-Star Rating Picker */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>Votre note sur 10</span>
            <span className="font-bold text-amber-400 text-sm">
              {hoverRating || rating ? `${hoverRating || rating} / 10` : 'Non noté'}
            </span>
          </label>
          <div className="flex items-center justify-between bg-dark-850 p-3 rounded-xl border border-white/5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
              const active = (hoverRating || rating || 0) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  onClick={() => setRating(star === rating ? null : star)}
                  className="p-1 transition-transform hover:scale-125 focus:outline-none"
                  title={`${star}/10`}
                >
                  <Star
                    className={`w-5 h-5 transition-colors ${
                      active ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Date Watched */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Date de visionnage</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
          />
        </div>

        {/* Short Review */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
            <span>Critique ou note personnelle (optionnel)</span>
          </label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Ce que vous avez pensé de cette œuvre..."
            rows={3}
            className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500 resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {item.isWatched && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
            >
              Retirer des vus
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={() => onSubmit(rating, review.trim() || null, date)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg transition-transform hover:scale-105"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Enregistrer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
