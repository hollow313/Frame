import React, { useState, useEffect } from 'react';
import { CloudDownload, CheckCircle2, Clock, HardDrive, AlertCircle, RefreshCw } from 'lucide-react';
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

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const status = await api.getSeerStatus();
      setSeerStatus(status);

      if (status.connected) {
        const data = await api.getSeerRequests(30, 0, filter);
        setRequests(data.results || []);
      }
    } catch (err) {
      console.error('Erreur chargement demandes Seer', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: number) => {
    switch (status) {
      case 5: // Available
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Disponible
          </span>
        );
      case 3: // Processing
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <HardDrive className="w-3.5 h-3.5 animate-pulse" />
            Téléchargement en cours
          </span>
        );
      case 2: // Pending
      default:
        return (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-primary-500/20 text-primary-400 border border-primary-500/30">
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-dark-900 border border-white/5 text-xs text-slate-300 hover:text-white self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualiser</span>
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
          {requests.map((req) => (
            <div
              key={req.id}
              className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex items-center justify-between gap-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-dark-850 flex items-center justify-center text-primary-400 border border-white/5 shrink-0">
                  <CloudDownload className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate">
                      TMDB #{req.media?.tmdbId || req.id}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-dark-800 text-slate-400">
                      {req.type === 'movie' ? 'Film' : 'Série'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    Demandé par <span className="text-slate-300 font-medium">{req.requestedBy?.displayName || 'Utilisateur'}</span> le {new Date(req.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                {getStatusBadge(req.media?.status || req.status)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center space-y-3">
          <CloudDownload className="w-12 h-12 text-slate-600 mx-auto" />
          <p className="text-base font-semibold text-slate-300">Aucune demande en cours.</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Lorsque vous cliquez sur « Demander sur Seer » sur une fiche de film ou de série, son état apparaîtra ici.
          </p>
        </div>
      )}
    </div>
  );
};
