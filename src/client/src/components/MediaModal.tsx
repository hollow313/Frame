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
  HardDrive,
  Layers,
  ChevronDown,
  Share2,
  Download
} from 'lucide-react';
import { MediaItem, TvEpisode } from '../types';
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
  const [jellyfinItem, setJellyfinItem] = useState<{ inJellyfin: boolean; itemId?: string; name?: string; serverUrl?: string } | null>(null);
  const [requestingSeer, setRequestingSeer] = useState<boolean>(false);
  const [cancellingSeer, setCancellingSeer] = useState<boolean>(false);
  const [showTrailer, setShowTrailer] = useState<boolean>(false);

  // Séries TV : gestion des saisons et épisodes
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [seasonEpisodes, setSeasonEpisodes] = useState<TvEpisode[]>([]);
  const [loadingSeason, setLoadingSeason] = useState<boolean>(false);
  const [sharingMedia, setSharingMedia] = useState<boolean>(false);

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const width = ctx.measureText(currentLine + ' ' + word).width;
      if (width < maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    lines.push(currentLine);
    return lines;
  };

  const drawPosterFallback = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) => {
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.substring(0, 20), x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
  };

  const handleShareMedia = async () => {
    if (!item) return;
    setSharingMedia(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = 1000;
      const h = 560;
      canvas.width = w;
      canvas.height = h;

      // Fond dégradé cinéma
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(0.6, '#0f172a');
      bgGrad.addColorStop(1, '#1e1438');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Halo
      const halo = ctx.createRadialGradient(200, 200, 20, 200, 200, 450);
      halo.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
      halo.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // Bordure
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.strokeRect(15, 15, w - 30, h - 30);

      // Header Brand
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.roundRect(50, 45, 36, 36, 10);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('FRAME', 98, 71);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.fillText('MEDIA INTELLIGENCE & TRACKER', 190, 70);

      // Poster loading
      const posterX = 50;
      const posterY = 110;
      const posterW = 260;
      const posterH = 390;

      const drawRemainingDetails = () => {
        const contentX = 350;
        let curY = 145;

        // Badge type
        const isAnime = item.genres?.some((g: any) => g.id === 16);
        ctx.fillStyle = isAnime ? '#f59e0b' : item.media_type === 'movie' ? '#6366f1' : '#8b5cf6';
        ctx.beginPath();
        ctx.roundRect(contentX, curY - 20, 80, 26, 8);
        ctx.fill();

        ctx.fillStyle = isAnime ? '#0f172a' : '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(isAnime ? 'ANIMÉ' : item.media_type === 'movie' ? 'FILM' : 'SÉRIE', contentX + 16, curY - 3);

        if (item.release_date) {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '13px sans-serif';
          ctx.fillText(`Sortie : ${new Date(item.release_date).getFullYear()}`, contentX + 100, curY - 3);
        }

        if (item.vote_average > 0) {
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(`★ ${item.vote_average.toFixed(1)} / 10`, contentX + 220, curY - 3);
        }

        // Titre
        curY += 45;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        const titleText = item.title.length > 32 ? item.title.substring(0, 30) + '...' : item.title;
        ctx.fillText(titleText, contentX, curY);

        if (item.tagline) {
          curY += 28;
          ctx.fillStyle = '#a5b4fc';
          ctx.font = 'italic 14px sans-serif';
          const taglineText = item.tagline.length > 50 ? item.tagline.substring(0, 47) + '...' : item.tagline;
          ctx.fillText(`« ${taglineText} »`, contentX, curY);
        }

        // Statut Vu
        if (item.isWatched) {
          curY += 35;
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.beginPath();
          ctx.roundRect(contentX, curY - 18, 300, 32, 10);
          ctx.fill();
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
          ctx.stroke();

          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(`✓ Visionné ${item.userRating ? `• Note attribuée : ${item.userRating}/10` : ''}`, contentX + 15, curY + 3);
        }

        // Synopsis court
        if (item.overview) {
          curY += 45;
          ctx.fillStyle = '#cbd5e1';
          ctx.font = '13px sans-serif';
          const maxWords = 35;
          const words = item.overview.split(' ').slice(0, maxWords).join(' ') + '...';
          const lines = wrapText(ctx, words, 580);
          lines.slice(0, 3).forEach((line: string, i: number) => {
            ctx.fillText(line, contentX, curY + i * 20);
          });
          curY += lines.slice(0, 3).length * 20;
        }

        // Genres
        curY += 35;
        const genres = (item.genres || []).slice(0, 4);
        let gx = contentX;
        genres.forEach((g) => {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.roundRect(gx, curY - 14, g.name.length * 8 + 20, 26, 8);
          ctx.fill();

          ctx.fillStyle = '#cbd5e1';
          ctx.font = '12px sans-serif';
          ctx.fillText(g.name, gx + 10, curY + 3);
          gx += g.name.length * 8 + 30;
        });

        // Télécharger
        const link = document.createElement('a');
        link.download = `frame-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      };

      if (item.poster_path) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(posterX, posterY, posterW, posterH, 16);
          ctx.clip();
          ctx.drawImage(img, posterX, posterY, posterW, posterH);
          ctx.restore();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.strokeRect(posterX, posterY, posterW, posterH);
          drawRemainingDetails();
        };
        img.onerror = () => {
          drawPosterFallback(ctx, posterX, posterY, posterW, posterH, item.title);
          drawRemainingDetails();
        };
        img.src = item.poster_path;
      } else {
        drawPosterFallback(ctx, posterX, posterY, posterW, posterH, item.title);
        drawRemainingDetails();
      }
    } catch (e) {
      console.error(e);
      alert('Erreur lors du partage');
    } finally {
      setSharingMedia(false);
    }
  };

  useEffect(() => {
    if (isOpen && id) {
      loadDetails();
    } else {
      setItem(null);
      setShowTrailer(false);
      setSeasonEpisodes([]);
    }
  }, [isOpen, id, mediaType]);

  const loadSeasonEpisodes = async (tvId: number, seasonNumber: number) => {
    setLoadingSeason(true);
    try {
      const res = await api.getTvSeason(tvId, seasonNumber);
      setSeasonEpisodes(res.episodes || []);
    } catch (e) {
      console.error('Erreur chargement épisodes saison', e);
      setSeasonEpisodes([]);
    } finally {
      setLoadingSeason(false);
    }
  };

  const loadDetails = async () => {
    setLoading(true);
    try {
      const details = await api.getMediaDetails(mediaType, id);
      setItem(details);

      // Si c'est une série, charger automatiquement la première saison valide
      if (mediaType === 'tv') {
        const firstSeason = details.seasons?.find((s) => s.season_number > 0)?.season_number || 1;
        setSelectedSeason(firstSeason);
        loadSeasonEpisodes(details.id, firstSeason);
      }

      // Charger le statut Seer en parallèle
      api.checkSeerStatus(mediaType, id)
        .then((res) => setSeerStatus(res))
        .catch(() => {});

      const releaseYear = details.release_date ? new Date(details.release_date).getFullYear() : undefined;
      const tvdbId = (details as any).external_ids?.tvdb_id;

      // Charger le statut Sonarr / Radarr
      if (mediaType === 'movie') {
        api.checkRadarrMovie(id)
          .then((res) => setArrStatus(res))
          .catch(() => {});
      } else {
        api.checkSonarrSeries(details.title, tvdbId)
          .then((res) => setArrStatus(res))
          .catch(() => {});
      }

      // Vérifier si présent dans Jellyfin (avec titre et année pour vérification stricte)
      api.checkJellyfinMedia(mediaType, id, details.title, releaseYear)
        .then((res) => setJellyfinItem(res))
        .catch(() => {});
    } catch (err) {
      console.error('Erreur chargement détails média', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSeason = (seasonNum: number) => {
    setSelectedSeason(seasonNum);
    if (item) {
      loadSeasonEpisodes(item.id, seasonNum);
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

  // Déterminer si le média est déjà disponible sur le serveur
  const isAvailableOnServer = Boolean(
    jellyfinItem?.inJellyfin ||
    (arrStatus?.inLibrary && arrStatus?.downloaded) ||
    seerStatus?.status === 4 ||
    seerStatus?.status === 5
  );

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
                      <span className="flex items-center gap-1 text-xs text-slate-300 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-primary-400" />
                        <span>{new Date(item.release_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      </span>
                    )}
                    {item.release_date && new Date(item.release_date).getTime() > Date.now() && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <span>⏳ Sortie dans {Math.ceil((new Date(item.release_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} jours</span>
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

                  {/* Statut VU avec date exacte */}
                  {item.isWatched && (
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>
                        {item.watched_at
                          ? `Vu le ${new Date(item.watched_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                          : 'Déjà vu'}
                        {item.userRating ? ` • Votre note : ${item.userRating}/10` : ''}
                      </span>
                    </div>
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

                  <button
                    onClick={handleShareMedia}
                    disabled={sharingMedia}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-dark-750 hover:bg-dark-700 text-slate-300 hover:text-white border border-white/5 transition-all"
                    title="Générer et télécharger une image récapitulative à partager"
                  >
                    <Share2 className="w-4 h-4 text-primary-400" />
                    <span>{sharingMedia ? 'Génération...' : 'Partager'}</span>
                  </button>
                </div>

                {/* Right: Server / Seer Request Button / Jellyfin Direct */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* CAS 1: Présent sur le serveur (Jellyfin, Sonarr/Radarr, ou Seer disponible) */}
                  {isAvailableOnServer ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-4 h-4" />
                        Présent sur le serveur
                      </span>

                      {/* Bouton Voir sur Jellyfin */}
                      {jellyfinItem?.inJellyfin && jellyfinItem?.itemId && (
                        <a
                          href={jellyfinItem.serverUrl ? `${jellyfinItem.serverUrl}/web/index.html#!/details?id=${jellyfinItem.itemId}` : `jellyfin://item?id=${jellyfinItem.itemId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-glow transition-all hover:scale-105"
                          title="Accéder directement au média sur Jellyfin"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Voir sur Jellyfin</span>
                        </a>
                      )}
                    </div>
                  ) : Boolean(seerStatus?.requested || seerStatus?.status === 2 || seerStatus?.status === 3 || (arrStatus?.inLibrary && arrStatus?.monitored && !arrStatus?.downloaded)) ? (
                    /* CAS 2: Déjà demandé sur Seer ou Sonarr/Radarr (en attente ou en recherche/traitement) */
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        {seerStatus?.status === 3 || (arrStatus?.inLibrary && arrStatus?.monitored && !arrStatus?.downloaded) ? (
                          <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            <Clock className="w-4 h-4" />
                            Demande approuvée (en recherche)
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
                    /* CAS 3: Pas encore demandé ou non monitoré dans Sonarr -> Bouton de demande propre */
                    <div className="flex items-center gap-2">
                      {arrStatus?.inLibrary && !arrStatus?.monitored && (
                        <span className="text-[11px] text-slate-400 px-2 py-1 rounded-lg bg-dark-800 border border-white/5">
                          Déjà dans Sonarr (non monitoré)
                        </span>
                      )}
                      <button
                        onClick={handleRequestSeer}
                        disabled={requestingSeer}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-accent-cinema to-pink-600 hover:from-accent-cinema/90 hover:to-pink-500 text-white text-xs font-semibold shadow-glow-cinema transition-transform hover:scale-105 disabled:opacity-50"
                        title="Créer une demande de média"
                      >
                        <CloudDownload className="w-4 h-4" />
                        <span>{requestingSeer ? 'Envoi...' : 'Demander sur Seer'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Server Details Badge (Sonarr / Radarr) */}
              {arrStatus?.inLibrary && (
                <div className="p-3.5 rounded-xl bg-dark-800/60 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Server className="w-4 h-4" />
                    <span className="font-semibold">Présent dans votre médiathèque ({arrStatus.title})</span>
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

              {/* SECTION ÉPISODES POUR LES SÉRIES TV */}
              {item.media_type === 'tv' && item.seasons && item.seasons.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary-400" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                        Guide des Épisodes & Saisons
                      </h3>
                    </div>

                    {/* Sélecteur de saisons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.seasons
                        .filter((s) => s.season_number > 0)
                        .map((s) => (
                          <button
                            key={s.id}
                            onClick={() => handleSelectSeason(s.season_number)}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                              selectedSeason === s.season_number
                                ? 'bg-primary-600 text-white shadow'
                                : 'bg-dark-800 text-slate-400 hover:text-white hover:bg-dark-750'
                            }`}
                          >
                            <span>Saison {s.season_number}</span>
                            <span className="ml-1 text-[10px] opacity-75">({s.episode_count})</span>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Liste des épisodes de la saison sélectionnée */}
                  {loadingSeason ? (
                    <div className="p-8 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : seasonEpisodes.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {seasonEpisodes.map((ep) => (
                        <div
                          key={ep.id}
                          className="p-3.5 rounded-xl bg-dark-850/80 border border-white/5 hover:border-white/10 flex flex-col sm:flex-row gap-3.5 transition-colors"
                        >
                          {/* Vignette de l'épisode */}
                          {ep.still_path ? (
                            <img
                              src={ep.still_path}
                              alt={ep.name}
                              className="w-full sm:w-36 aspect-video rounded-lg object-cover border border-white/10 shrink-0"
                            />
                          ) : (
                            <div className="w-full sm:w-36 aspect-video rounded-lg bg-dark-800 border border-white/5 flex items-center justify-center text-slate-500 shrink-0">
                              <Tv className="w-6 h-6" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-primary-400 font-mono">
                                  E{ep.episode_number}
                                </span>
                                <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
                                  {ep.name}
                                </h4>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                {ep.air_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-slate-500" />
                                    <span>{new Date(ep.air_date).toLocaleDateString('fr-FR')}</span>
                                  </span>
                                )}
                                {ep.runtime && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-500" />
                                    <span>{ep.runtime} min</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                              {ep.overview || 'Aucun synopsis disponible pour cet épisode.'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-slate-500 bg-dark-850/40 rounded-xl border border-white/5">
                      Aucun épisode répertorié pour cette saison.
                    </div>
                  )}
                </div>
              )}

              {/* Cast & Crew */}
              {item.cast && item.cast.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-white/5">
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
