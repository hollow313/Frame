import React, { useState, useEffect } from 'react';
import { 
  CloudDownload, 
  CheckCircle2, 
  Clock, 
  HardDrive, 
  AlertCircle, 
  RefreshCw, 
  Film, 
  Tv, 
  Trash2, 
  Eye, 
  Calendar,
  Star
} from 'lucide-react';
import { SeerRequest, MediaItem } from '../types';
import { api } from '../services/api';

interface SeerRequestsProps {
  onSelectMedia: (item: MediaItem) => void;
  onNavigateTab: (tab: string) => void;
}

export const SeerRequests: React.FC<SeerRequestsProps> = ({ onSelectMedia, onNavigateTab }) => {
  const [requests, setRequests] = useState<SeerRequest[]>([]);
  const [seerStatus, setSeerStatus] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'processing' | 'available' | 'pending'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const status = await api.getSeerStatus();
      setSeerStatus(status);

      if (status.connected) {
        const data = await api.getSeerRequests(50, 0, filter);
        setRequests(data.results || []);
      }
    } catch (err) {
      console.error('Erreur chargement demandes Seer', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async (e: React.MouseEvent, requestId: number, title?: string) => {
    e.stopPropagation();
    if (!confirm(`Voulez-vous vraiment annuler la demande pour « ${title || 'ce média'} » ?`)) return;

    setCancellingId(requestId);
    try {
      await api.deleteSeerRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'annulation de la demande');
    } finally {
      setCancellingId(null);
    }
  };

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 5: // Available
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Disponible
          </span>
        );
      case 3: // Processing
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <HardDrive className="w-3.5 h-3.5 animate-pulse" />
            Téléchargement en cours
          </span>
        );
      case 2: // Pending
      default:
        return (
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
            <Clock className="w-3.5 h-3.5" />
            En attente d'approbation
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CloudDownload className="w-7 h-7 text-accent-cinema" />
            <span>Demandes Overseerr / Jellyseerr</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Suivez l'état en temps réel des téléchargements et demandes de médias sur votre serveur.
          </p>
        </div>

        <button
          onClick={loadRequests}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-dark-900 border border-white/5 text-xs text-slate-300 hover:text-white self-start sm:self-auto hover:bg-dark-850 transition-colors shadow"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1 bg-dark-900 border border-white/5 rounded-2xl w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'all'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Toutes ({requests.length})
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'pending'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          En attente
        </button>
        <button
          onClick={() => setFilter('processing')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'processing'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          En cours de téléchargement
        </button>
        <button
          onClick={() => setFilter('available')}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === 'available'
              ? 'bg-primary-600 text-white shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Disponibles
        </button>
      </div>

      {/* Warning if Seer not configured */}
      {seerStatus && !seerStatus.connected && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-400">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <div>
              <p className="text-sm font-bold">Connexion Overseerr / Jellyseerr non active</p>
              <p className="text-xs text-amber-300/80">{seerStatus.message || 'Configurez l\'URL et la clé API dans les Paramètres.'}</p>
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

      {/* Request Table / Cards */}
      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent-cinema border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map((req) => {
            const tmdbId = req.media?.tmdbId || req.id;
            const displayTitle = req.title || `Média TMDB #${tmdbId}`;
            const isMovie = (req.type || req.media?.mediaType) === 'movie';
            const year = req.releaseDate ? new Date(req.releaseDate).getFullYear() : null;
            const statusNumber = req.media?.status || req.status;

            return (
              <div
                key={req.id}
                onClick={() => {
                  onSelectMedia({
                    id: tmdbId,
                    media_type: isMovie ? 'movie' : 'tv',
                    title: displayTitle,
                    original_title: req.originalTitle,
                    overview: req.overview || '',
                    poster_path: req.posterPath || null,
                    backdrop_path: req.backdropPath || null,
                    release_date: req.releaseDate || undefined,
                    vote_average: req.voteAverage || 0,
                    vote_count: 0,
                  });
                }}
                className="group p-4 rounded-2xl bg-dark-900 border border-white/5 hover:border-white/15 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-dark-850/80 shadow-md"
              >
                {/* Poster & Info */}
                <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                  {req.posterPath ? (
                    <img
                      src={req.posterPath}
                      alt={displayTitle}
                      className="w-14 h-20 rounded-xl object-cover border border-white/10 shrink-0 shadow group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-14 h-20 rounded-xl bg-dark-800 border border-white/5 flex items-center justify-center text-slate-500 shrink-0">
                      {isMovie ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-md bg-dark-800 text-primary-400 border border-primary-500/20">
                        {isMovie ? 'Film' : 'Série'}
                      </span>
                      {year && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {year}
                        </span>
                      )}
                      {req.voteAverage !== undefined && req.voteAverage > 0 && (
                        <span className="text-xs text-amber-400 font-bold flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400" />
                          {Math.round(req.voteAverage * 10) / 10}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-white truncate group-hover:text-primary-300 transition-colors">
                      {displayTitle}
                    </h3>

                    <p className="text-xs text-slate-400 truncate mt-1">
                      Demandé par <strong className="text-slate-200">{req.requestedBy?.displayName || 'Utilisateur'}</strong> le {new Date(req.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>

                {/* Status Badge & Actions */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center w-full sm:w-auto shrink-0 gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                  <div>{getStatusBadge(statusNumber)}</div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-300 text-xs font-medium border border-white/5 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Fiche</span>
                    </button>

                    {/* Bouton pour annuler si la demande n'est pas encore complétée/disponible */}
                    {statusNumber !== 5 && (
                      <button
                        type="button"
                        onClick={(e) => handleCancelRequest(e, req.id, displayTitle)}
                        disabled={cancellingId === req.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                        title="Annuler cette demande"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{cancellingId === req.id ? 'Annulation...' : 'Annuler'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3 bg-dark-900/40 rounded-3xl border border-white/5">
          <CloudDownload className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Aucune demande trouvée.</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Lorsque vous cliquez sur « Demander sur Seer » sur une fiche de film ou de série, son état apparaîtra ici avec son affiche et son titre exacts.
          </p>
        </div>
      )}
    </div>
  );
};
