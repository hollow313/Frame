import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Film, Tv, Star, Loader2 } from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: MediaItem) => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query);
        setResults(res.results);
      } catch (err) {
        console.error('Erreur recherche', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard shortcut Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-dark-950/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-dark-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10 bg-dark-850">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un film, une série..."
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {loading && <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-slate-500 bg-dark-950 border border-white/10 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 space-y-1">
          {results.length > 0 ? (
            results.map((item) => (
              <div
                key={`${item.media_type}-${item.id}`}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-dark-800 cursor-pointer transition-colors group"
              >
                {/* Poster */}
                {item.poster_path ? (
                  <img
                    src={item.poster_path}
                    alt={item.title}
                    className="w-10 h-14 object-cover rounded-md shrink-0"
                  />
                ) : (
                  <div className="w-10 h-14 rounded-md bg-dark-750 flex items-center justify-center text-slate-600 shrink-0">
                    {item.media_type === 'movie' ? <Film className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200 group-hover:text-primary-400 transition-colors truncate">
                      {item.title}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-dark-750 text-slate-400">
                      {item.media_type === 'movie' ? 'Film' : 'Série'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {item.release_date ? new Date(item.release_date).getFullYear() : 'Date inconnue'}
                    {item.overview ? ` • ${item.overview}` : ''}
                  </p>
                </div>

                {/* Rating */}
                {item.vote_average > 0 && (
                  <div className="flex items-center gap-1 text-xs font-semibold text-amber-400 shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>{item.vote_average.toFixed(1)}</span>
                  </div>
                )}
              </div>
            ))
          ) : query.trim() && !loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Aucun résultat trouvé pour « {query} »
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-500">
              Tapez le nom d'un film ou d'une série pour lancer la recherche...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
