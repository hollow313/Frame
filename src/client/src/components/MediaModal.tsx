import React, { useState, useEffect } from 'react';
import { 
  X, 
  Star, 
  Check, 
  Bookmark, 
  CloudDownload, 
  Play, 
  Server, 
  Film, 
  Tv, 
  Clock, 
  Calendar,
  CheckCircle2,
  HardDrive
} from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';

interface MediaModalProps {
  mediaType: 'movie' | 'tv';
  id: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenRating: (item: MediaItem) => void;
  onToggleWatchlist: (item: MediaItem) => void;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  mediaType,
  id,
  isOpen,
  onClose,
  onOpenRating,
  onToggleWatchlist,
}) => {
  const [item, setItem] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [seerStatus, setSeerStatus] = useState<any>(null);
  const [arrStatus, setArrStatus] = useState<any>(null);
  const [jellyfinItem, setJellyfinItem] = useState<{ inJellyfin: boolean; itemId?: string; name?: string } | null>(null);
  const [requestingSeer, setRequestingSeer] = useState<boolean>(false);
  const [cancellingSeer, setCancellingSeer] = useState<boolean>(false);
  const [showTrailer, setShowTrailer] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && id) {
      loadDetails();
    } else {
      setItem(null);
      setShowTrailer(false);
    }
  }, [isOpen, id, mediaType]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const details = await api.getMediaDetails(mediaType, id);
      setItem(details);

      // Charger le statut Seer en parallèle
      api.checkSeerStatus(mediaType, id)
        .then((res) => setSeerStatus(res))
        .catch(() => {});

      // Charger le statut Sonarr / Radarr
      if (mediaType === 'movie') {
        api.checkRadarrMovie(id)
          .then((res) => setArrStatus(res))
          .catch(() => {});
      } else {
        api.checkSonarrSeries(details.title)
          .then((res) => setArrStatus(res))
          .catch(() => {});
      }

      // Vérifier si présent dans Jellyfin
      api.checkJellyfinMedia(mediaType, id, details.title)
        .then((res) => setJellyfinItem(res))
        .catch(() => {});
    } catch (err) {
      console.error('Erreur chargement détails média', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSeer = async () => {
    if (!item) return;
    setRequestingSeer(true);
    try {
      await api.requestOnSeer({
        mediaType,
        mediaId: item.id,
        is4k: false,
        seasons: 'all',
      });
      // Rafraîchir le statut Seer
      const updated = await api.checkSeerStatus(mediaType, item.id);
      setSeerStatus(updated);
      alert('Demande envoyée avec succès à Seer !');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la demande Seer');
    } finally {
      setRequestingSeer(false);
    }
  };

  const handleCancelSeerRequest = async () => {
    if (!seerStatus?.requestId) return;
    if (!confirm('Voulez-vous vraiment annuler cette demande Seer ?')) return;
    setCancellingSeer(true);
    try {
      await api.deleteSeerRequest(seerStatus.requestId);
      const updated = await api.checkSeerStatus(mediaType, id);
      setSeerStatus(updated);
      alert('Demande annulée avec succès.');
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l\'annulation de la demande');
    } finally {
      setCancellingSeer(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-dark-950/85 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative w-full max-w-4xl bg-dark-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-dark-950/70 hover:bg-dark-950 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {loading ? (
          <div className="h-96 flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : item ? (
          <div>
            {/* Backdrop / Trailer Section */}
            <div className="relative aspect-video w-full max-h-[380px] bg-dark-950 overflow-hidden">
              {showTrailer && item.trailer_key ? (
                <iframe
                  src={`https://www.youtube.com/embed/${item.trailer_key}?autoplay=1`}
                  title="Bande-annonce"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <>
                  {item.backdrop_path ? (
                    <img
                      src={item.backdrop_path}
                      alt={item.title}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-dark-950 to-dark-850 flex items-center justify-center">
                      <Film className="w-20 h-20 text-slate-700" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-dark-900 via-dark-900/40 to-transparent" />

                  {/* Play trailer button */}
                  {item.trailer_key && (
                    <button
                      onClick={() => setShowTrailer(true)}
                      className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-primary-600/90 hover:bg-primary-500 text-white flex items-center justify-center shadow-glow transition-transform hover:scale-110 backdrop-blur-sm"
                      title="Lire la bande-annonce"
                    >
                      <Play className="w-7 h-7 fill-white translate-x-0.5" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Content Body */}
            <div className="p-6 sm:p-8 -mt-16 relative z-10 space-y-6">
              {/* Header Title & Tags */}
              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {/* Poster Thumbnail */}
                {item.poster_path && (
                  <img
                    src={item.poster_path}
                    alt={item.title}
                    className="w-28 sm:w-36 rounded-xl shadow-2xl border border-white/10 shrink-0 hidden sm:block"
                  />
                )}

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary-600/20 text-primary-400 border border-primary-500/30">
                      {item.media_type === 'movie' ? 'Film' : 'Série TV'}
                    </span>
                    {item.release_date && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(item.release_date).getFullYear()}
                      </span>
                    )}
                    {item.release_date && new Date(item.release_date).getTime() > Date.now() && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <span>⏳ Sortie le {new Date(item.release_date).toLocaleDateString('fr-FR')} (dans {Math.ceil((new Date(item.release_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} jours)</span>
                      </span>
                    )}
                    {item.runtime && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {item.runtime} min
                      </span>
                    )}
                    {item.number_of_seasons && (
                      <span className="text-xs text-slate-400">
                        {item.number_of_seasons} saison{item.number_of_seasons > 1 ? 's' : ''} ({item.number_of_episodes} épisodes)
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {item.title}
                  </h1>

                  {item.original_title && item.original_title !== item.title && (
                    <p className="text-xs text-slate-400 italic">
                      Titre original : {item.original_title}
                    </p>
                  )}

                  {item.tagline && (
                    <p className="text-sm font-medium text-primary-300 italic">
                      « {item.tagline} »
                    </p>
                  )}

                  {/* Genres Pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {item.genres?.map((g) => (
                      <span
                        key={g.id}
                        className="text-xs px-2.5 py-0.5 rounded-md bg-dark-800 text-slate-300 border border-white/5"
                      >
                        {g.name}
                      </span>
                    ))}
                  </div>

                  {/* Streaming Platforms (JustWatch FR) */}
                  {item.streaming_providers && item.streaming_providers.length > 0 && (
                    <div className="pt-2">
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">
                        Disponible en streaming (France) :
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.streaming_providers.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-dark-850 border border-white/10 text-xs font-medium text-slate-200 shadow-sm"
                          >
                            {p.logo_path && (
                              <img src={p.logo_path} alt={p.name} className="w-4 h-4 rounded object-cover" />
                            )}
                            <span>{p.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status & Quick Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-dark-850 border border-white/5">
                {/* Left: User Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onOpenRating(item)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      item.isWatched
                        ? 'bg-emerald-500 text-white shadow-lg'
                        : 'bg-dark-750 hover:bg-emerald-600 text-slate-200 hover:text-white'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>{item.isWatched ? `Vu (${item.userRating ? `${item.userRating}/10` : 'Noter'})` : 'Marquer comme vu'}</span>
                  </button>

                  <button
                    onClick={() => onToggleWatchlist(item)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      item.inWatchlist
                        ? 'bg-primary-600 text-white shadow-lg'
                        : 'bg-dark-750 hover:bg-primary-600 text-slate-200 hover:text-white'
                    }`}
                  >
                    <Bookmark className="w-4 h-4" />
                    <span>{item.inWatchlist ? 'Dans votre liste' : 'À regarder'}</span>
                  </button>
                </div>

                {/* Right: Server / Seer Request Button / Jellyfin Direct App */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* CAS 1: Présent sur le serveur (Sonarr/Radarr/Jellyfin/Seer Disponible) */}
                  {Boolean((arrStatus?.inLibrary && arrStatus?.downloaded) || seerStatus?.status === 5 || jellyfinItem?.inJellyfin) ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-4 h-4" />
                        Présent sur le serveur
                      </span>

                      {/* Bouton pour ouvrir l'application Jellyfin sur PC directement (protocole jellyfin://) */}
                      {jellyfinItem?.inJellyfin && jellyfinItem?.itemId && (
                        <a
                          href={`jellyfin://item?id=${jellyfinItem.itemId}`}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all hover:scale-105"
                          title="Lancer dans l'application Jellyfin pour PC (jellyfin://)"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Voir sur Jellyfin</span>
                        </a>
                      )}
                    </div>
                  ) : Boolean(seerStatus?.requested || seerStatus?.status === 2 || seerStatus?.status === 3) ? (
                    /* CAS 2: Déjà demandé sur Seer (en attente ou en cours de téléchargement) */
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        {seerStatus?.status === 3 ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <HardDrive className="w-4 h-4 animate-pulse" />
                            Téléchargement en cours
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-primary-500/20 text-primary-400 border border-primary-500/30">
                            <Clock className="w-4 h-4" />
                            En attente d'approbation
                          </span>
                        )}
                        {seerStatus?.requestedBy && (
                          <span className="text-xs text-slate-400">
                            (Demandé par <strong className="text-slate-200">{seerStatus.requestedBy}</strong>)
                          </span>
                        )}
                      </div>

                      {seerStatus?.requestId && (
                        <button
                          onClick={handleCancelSeerRequest}
                          disabled={cancellingSeer}
                          className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                          {cancellingSeer ? 'Annulation...' : 'Annuler la demande'}
                        </button>
                      )}
                    </div>
                  ) : (
                    /* CAS 3: Pas encore sur le serveur ni demandé -> Bouton de demande propre (sans 4K) */
                    <button
                      onClick={handleRequestSeer}
                      disabled={requestingSeer}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-accent-cinema to-pink-600 hover:from-accent-cinema/90 hover:to-pink-500 text-white text-xs font-semibold shadow-glow-cinema transition-transform hover:scale-105 disabled:opacity-50"
                    >
                      <CloudDownload className="w-4 h-4" />
                      <span>{requestingSeer ? 'Envoi...' : 'Demander sur Seer'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Server Details Badge (Sonarr / Radarr) */}
              {arrStatus?.inLibrary && (
                <div className="p-3.5 rounded-xl bg-dark-800/60 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Server className="w-4 h-4" />
                    <span className="font-semibold">Présent dans votre médiathèque locale ({arrStatus.title})</span>
                  </div>
                  <div className="text-slate-400">
                    {arrStatus.downloaded ? 'Téléchargement complet' : 'En surveillance'}
                    {arrStatus.downloadedEpisodes !== undefined && (
                      <span className="ml-2 font-mono">({arrStatus.downloadedEpisodes}/{arrStatus.totalEpisodes} épisodes)</span>
                    )}
                  </div>
                </div>
              )}

              {/* Overview / Synopsis in French */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  Synopsis
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {item.overview || 'Aucun synopsis en français disponible pour cette œuvre.'}
                </p>
              </div>

              {/* Cast & Crew */}
              {item.cast && item.cast.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                    Distribution & Acteurs
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {item.cast.slice(0, 6).map((actor) => (
                      <div key={actor.id} className="flex flex-col items-center text-center p-2 rounded-xl bg-dark-850 border border-white/5">
                        {actor.profile_path ? (
                          <img
                            src={actor.profile_path}
                            alt={actor.name}
                            className="w-14 h-14 rounded-full object-cover mb-2 border border-white/10"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-dark-750 flex items-center justify-center text-slate-500 mb-2 font-bold text-xs">
                            {actor.name.substring(0, 2)}
                          </div>
                        )}
                        <span className="text-xs font-semibold text-slate-200 line-clamp-1">{actor.name}</span>
                        <span className="text-[10px] text-slate-400 line-clamp-1">{actor.character}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400">
            Média introuvable.
          </div>
        )}
      </div>
    </div>
  );
};
