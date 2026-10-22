import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Film, 
  Tv, 
  Star, 
  Trash2, 
  Calendar, 
  RefreshCw, 
  Clock, 
  BarChart3, 
  Layers, 
  Sparkles, 
  Share2, 
  Flame, 
  Bookmark, 
  Download,
  Check,
  TrendingUp
} from 'lucide-react';
import { WatchedItem, MediaItem, UserStats } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface WatchedHistoryProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onNavigateTab: (tab: string) => void;
}

export const WatchedHistory: React.FC<WatchedHistoryProps> = ({
  onSelectMedia,
  onOpenRating,
  onNavigateTab,
}) => {
  const { user } = useAuth();

  // Active view: 'list' (Historique des cartes) | 'stats' (Statistiques & Bilan)
  const [activeView, setActiveView] = useState<'list' | 'stats'>('list');

  // List states
  const [items, setItems] = useState<WatchedItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');
  const [sortBy, setSortBy] = useState<'watched_at' | 'rating'>('watched_at');
  const [loadingList, setLoadingList] = useState<boolean>(true);

  // Stats states
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [generatingShare, setGeneratingShare] = useState<boolean>(false);

  useEffect(() => {
    loadWatched();
    loadStats();
  }, [filterType, sortBy, user]);

  const loadWatched = async () => {
    setLoadingList(true);
    try {
      const type = filterType === 'all' ? undefined : filterType;
      const data = await api.getWatched(type, sortBy);
      setItems(data);
    } catch (err) {
      console.error('Erreur chargement vus', err);
    } finally {
      setLoadingList(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.getUserStats();
      setStats(data);
    } catch (err) {
      console.error('Erreur chargement statistiques', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleDelete = async (item: WatchedItem) => {
    if (!confirm(`Retirer « ${item.title} » de vos médias vus ?`)) return;
    try {
      await api.unmarkWatched(item.media_type, item.tmdb_id);
      setItems((prev) => prev.filter((i) => !(i.tmdb_id === item.tmdb_id && i.media_type === item.media_type)));
      loadStats();
    } catch (e) {
      console.error(e);
    }
  };

  const getPosterUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  // ==========================================
  // FONCTION DE PARTAGE : GÉNÉRATION D'IMAGE PNG (CANVAS)
  // ==========================================
  const handleShareStats = () => {
    if (!stats) return;
    setGeneratingShare(true);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 1200;
      const height = 675;
      canvas.width = width;
      canvas.height = height;

      // 1. Fond dégradé cinéma ultra-moderne
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(0.5, '#0e1726');
      bgGrad.addColorStop(1, '#1e1035');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Halo lumineux décoratif (Primary / Indigo)
      const glow = ctx.createRadialGradient(250, 150, 20, 250, 150, 450);
      glow.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
      glow.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const glowRight = ctx.createRadialGradient(950, 500, 20, 950, 500, 400);
      glowRight.addColorStop(0, 'rgba(236, 72, 153, 0.2)');
      glowRight.addColorStop(1, 'rgba(236, 72, 153, 0)');
      ctx.fillStyle = glowRight;
      ctx.fillRect(0, 0, width, height);

      // Bordure subtile
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      // 3. Logo & Titre FRAME
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.roundRect(60, 60, 44, 44, 12);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('FRAME', 118, 92);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 15px sans-serif';
      ctx.fillText('BILAN MULTIMÉDIA & TEMPS DE VISIONNAGE', 230, 91);

      const username = user?.displayName || user?.username || 'Cinéphile';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Profil : ${username}`, width - 60, 91);
      ctx.textAlign = 'left';

      // 4. Ligne séparatrice
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(60, 125);
      ctx.lineTo(width - 60, 125);
      ctx.stroke();

      // 5. Bloc KPIs Principaux (3 Cartes)
      const cardY = 155;
      const cardHeight = 160;
      const cardWidth = 335;
      const spacing = 35;

      // Carte 1: Temps Total
      drawCard(ctx, 60, cardY, cardWidth, cardHeight, 'TEMPS TOTAL PASSÉ', `${stats.totalHours} heures`, [
        `🎬 Films : ${stats.moviesHours}h`,
        `📺 Séries : ${stats.tvHours}h`,
        `✨ Mangas : ${stats.animeHours}h`,
      ], '#6366f1');

      // Carte 2: Cette Année (2026)
      drawCard(ctx, 60 + cardWidth + spacing, cardY, cardWidth, cardHeight, `CETTE ANNÉE (${stats.currentYear || 2026})`, `${stats.thisYearTotalHours || 0} heures`, [
        `🎬 Films : ${stats.thisYearMoviesHours || 0}h`,
        `📺 Séries : ${stats.thisYearTvHours || 0}h`,
        `✨ Mangas : ${stats.thisYearAnimeHours || 0}h`,
      ], '#10b981');

      // Carte 3: Œuvres Vues & Note
      drawCard(ctx, 60 + (cardWidth + spacing) * 2, cardY, cardWidth, cardHeight, 'ŒUVRES VISIONNÉES', `${stats.totalWatched} titres`, [
        `🎬 ${stats.moviesWatched} films • 📺 ${stats.tvWatched} séries`,
        `✨ ${stats.animeWatched} animés japonais`,
        stats.averageRating ? `★ Note moyenne : ${stats.averageRating}/10` : 'Enrichi par Simkl & Jellyfin',
      ], '#f59e0b');

      // 6. Section inférieure : Top Genres & Timeline
      const bottomY = 350;
      const bottomHeight = 230;

      // Cadre Genres
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.roundRect(60, bottomY, 520, bottomHeight, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('🎯 Genres Préférés', 85, bottomY + 38);

      const genresToDisplay = (stats.topGenres || []).slice(0, 4);
      if (genresToDisplay.length > 0) {
        genresToDisplay.forEach((g, idx) => {
          const rowY = bottomY + 75 + idx * 36;
          ctx.fillStyle = '#e2e8f0';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(g.name, 85, rowY);

          // Barre de progression
          const barX = 220;
          const maxBarW = 270;
          const barW = Math.max(15, Math.min(maxBarW, (g.percentage / 100) * maxBarW));

          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.roundRect(barX, rowY - 12, maxBarW, 14, 7);
          ctx.fill();

          ctx.fillStyle = idx === 0 ? '#6366f1' : idx === 1 ? '#8b5cf6' : idx === 2 ? '#ec4899' : '#10b981';
          ctx.beginPath();
          ctx.roundRect(barX, rowY - 12, barW, 14, 7);
          ctx.fill();

          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 12px sans-serif';
          ctx.fillText(`${g.percentage}% (${g.count})`, barX + maxBarW + 10, rowY);
        });
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.fillText('Synchronisez votre historique pour voir vos genres favoris.', 85, bottomY + 80);
      }

      // Cadre Quand ai-je regardé ? (Chronologie)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.roundRect(615, bottomY, 525, bottomHeight, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('📅 Quand ai-je regardé ?', 640, bottomY + 38);

      const timelineItems = (stats.timeline || []).slice(0, 4);
      if (timelineItems.length > 0) {
        timelineItems.forEach((t, idx) => {
          const rowY = bottomY + 75 + idx * 36;
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(t.label, 640, rowY);

          ctx.fillStyle = '#38bdf8';
          ctx.font = '600 13px sans-serif';
          ctx.fillText(`${t.count} visionnage${t.count > 1 ? 's' : ''}`, 830, rowY);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '12px sans-serif';
          ctx.fillText(`(${t.movies} films, ${t.tv} séries, ${t.anime} mangas)`, 960, rowY);
        });
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.fillText('Aucun historique temporel disponible.', 640, bottomY + 80);
      }

      // 7. Footer
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.fillText('FRAME • Media Intelligence & Tracker • https://github.com/hollow313/Frame', 60, height - 30);

      // Télécharger le canvas en PNG
      const link = document.createElement('a');
      link.download = `frame-stats-${user?.username || 'visionnage'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('Erreur génération image stats', e);
      alert('Impossible de générer l\'image pour le moment.');
    } finally {
      setGeneratingShare(false);
    }
  };

  const drawCard = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    kpi: string,
    details: string[],
    accentColor: string
  ) => {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // Pastille de couleur
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(x + 20, y + 20, 8, 8, 4);
    ctx.fill();

    // Titre
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(title, x + 35, y + 28);

    // KPI
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(kpi, x + 20, y + 68);

    // Détails
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 13px sans-serif';
    details.forEach((d, idx) => {
      ctx.fillText(d, x + 20, y + 96 + idx * 20);
    });
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            <span>Déjà Vu & Statistiques</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Retrouvez toutes les œuvres visionnées, vos notes personnelles et votre bilan complet d'heures passées.
          </p>
        </div>

        {/* View Switcher: Liste vs Statistiques */}
        <div className="flex items-center gap-2 p-1 bg-dark-900 border border-white/5 rounded-2xl">
          <button
            onClick={() => setActiveView('list')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeView === 'list'
                ? 'bg-primary-600 text-white shadow-glow'
                : 'text-slate-400 hover:text-white hover:bg-dark-850'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Historique ({items.length})</span>
          </button>

          <button
            onClick={() => setActiveView('stats')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeView === 'stats'
                ? 'bg-emerald-600 text-white shadow-glow'
                : 'text-slate-400 hover:text-white hover:bg-dark-850'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Statistiques & Bilan</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VUE 1 : STATISTIQUES & BILAN DÉTAILLÉ                                     */}
      {/* ========================================================================= */}
      {activeView === 'stats' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Action Bar: Bouton Partager */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-dark-900 via-dark-850 to-primary-950/30 border border-white/5">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-400" />
                <span>Votre Récapitulatif Visionnage</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Statistiques calculées à partir de vos œuvres marquées comme vues et synchronisées via Simkl & Jellyfin.
              </p>
            </div>

            <button
              onClick={handleShareStats}
              disabled={generatingShare || !stats}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-xs font-bold shadow-glow transition-all hover:scale-105 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{generatingShare ? 'Génération...' : 'Partager mes statistiques (Image PNG)'}</span>
            </button>
          </div>

          {loadingStats ? (
            <div className="h-72 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : stats ? (
            <>
              {/* 4 Grandes Cartes KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1 : Temps Total */}
                <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Temps Total de Visionnage</span>
                    <Clock className="w-4 h-4 text-primary-400" />
                  </div>
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {stats.totalHours} <span className="text-lg font-medium text-slate-400">heures</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>🎬 Films ({stats.moviesWatched}) :</span>
                      <strong className="text-slate-200">{stats.moviesHours}h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>📺 Séries ({stats.tvWatched}) :</span>
                      <strong className="text-slate-200">{stats.tvHours}h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>✨ Mangas & Animés ({stats.animeWatched}) :</span>
                      <strong className="text-amber-300">{stats.animeHours}h</strong>
                    </div>
                  </div>
                </div>

                {/* KPI 2 : Cette Année (2026) */}
                <div className="p-5 rounded-2xl bg-dark-900 border border-emerald-500/20 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-emerald-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Cette Année ({stats.currentYear || 2026})</span>
                    <Flame className="w-4 h-4" />
                  </div>
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {stats.thisYearTotalHours || 0} <span className="text-lg font-medium text-slate-400">heures</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>🎬 Films cette année :</span>
                      <strong className="text-slate-200">{stats.thisYearMoviesHours || 0}h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>📺 Séries cette année :</span>
                      <strong className="text-slate-200">{stats.thisYearTvHours || 0}h</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>✨ Mangas cette année :</span>
                      <strong className="text-amber-300">{stats.thisYearAnimeHours || 0}h</strong>
                    </div>
                  </div>
                </div>

                {/* KPI 3 : Œuvres Vues Totales */}
                <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Œuvres Visionnées</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-3xl font-extrabold text-white tracking-tight">
                    {stats.totalWatched} <span className="text-lg font-medium text-slate-400">titres</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>🎬 Longs-métrages :</span>
                      <strong className="text-slate-200">{stats.moviesWatched}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>📺 Séries TV :</span>
                      <strong className="text-slate-200">{stats.tvWatched}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>✨ Mangas & Animés :</span>
                      <strong className="text-amber-300">{stats.animeWatched}</strong>
                    </div>
                  </div>
                </div>

                {/* KPI 4 : Notes & Appréciation */}
                <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 relative overflow-hidden group">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Note Moyenne</span>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </div>
                  <div className="text-3xl font-extrabold text-white tracking-tight flex items-baseline gap-1">
                    {stats.averageRating ? stats.averageRating : '—'}{' '}
                    <span className="text-lg font-medium text-slate-400">/ 10</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/5 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>⭐ Avis enregistrés :</span>
                      <strong className="text-slate-200">{stats.ratingCount || 0}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>📑 Dans votre watchlist :</span>
                      <strong className="text-primary-300">{stats.watchlistCount} à voir</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ligne 2 : Répartition par Genre & Chronologie "Quand ai-je regardé ?" */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Bloc Genres */}
                <div className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary-400" />
                    <span>Répartition par Genre</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Pourcentages de visionnage par genre cinématographique :
                  </p>

                  <div className="space-y-3 pt-2">
                    {stats.topGenres && stats.topGenres.length > 0 ? (
                      stats.topGenres.slice(0, 8).map((g, idx) => (
                        <div key={g.name} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-slate-200 font-semibold">{g.name}</span>
                            <span className="text-slate-400">{g.percentage}% ({g.count} visionnage{g.count > 1 ? 's' : ''})</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-dark-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                idx === 0 ? 'bg-primary-500' : idx === 1 ? 'bg-indigo-500' : idx === 2 ? 'bg-emerald-500' : idx === 3 ? 'bg-amber-500' : 'bg-slate-600'
                              }`}
                              style={{ width: `${Math.max(5, g.percentage)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic py-4">Aucune donnée de genre pour le moment.</p>
                    )}
                  </div>
                </div>

                {/* Bloc Quand ai-je regardé ? (Timeline Mensuelle) */}
                <div className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-400" />
                    <span>Quand ai-je regardé ? (Chronologie)</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Historique de vos visionnages mois par mois :
                  </p>

                  <div className="space-y-2.5 pt-2 max-h-[350px] overflow-y-auto pr-1">
                    {stats.timeline && stats.timeline.length > 0 ? (
                      stats.timeline.map((t) => (
                        <div key={t.key} className="flex items-center justify-between p-3 rounded-xl bg-dark-850 border border-white/5 text-xs">
                          <div>
                            <p className="font-bold text-slate-200">{t.label}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {t.movies} films • {t.tv} séries • {t.anime} mangas
                            </p>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                            {t.count} visionnage{t.count > 1 ? 's' : ''}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic py-4">Aucun historique temporel disponible.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VUE 2 : HISTORIQUE DÉTAILLÉ (AFFICHES & NOTATIONS)                         */}
      {/* ========================================================================= */}
      {activeView === 'list' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Filters and Sort */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-2xl bg-dark-900 border border-white/5">
            {/* Media type filter buttons */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterType === 'all' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tous ({items.length})
              </button>
              <button
                onClick={() => setFilterType('movie')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterType === 'movie' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Films
              </button>
              <button
                onClick={() => setFilterType('tv')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterType === 'tv' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Séries
              </button>
              <button
                onClick={() => setFilterType('anime')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterType === 'anime' ? 'bg-amber-500 text-dark-950 font-bold shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mangas & Animés
              </button>
            </div>

            {/* Sort selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Trier par :</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-dark-850 border border-white/10 text-slate-200 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-primary-500"
              >
                <option value="watched_at">Récemment vu</option>
                <option value="rating">Mieux noté</option>
              </select>
            </div>
          </div>

          {/* List Grid */}
          {loadingList ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => {
                const posterUrl = getPosterUrl(item.poster_path);
                const isAnime = item.isAnime || item.genres?.some((g: any) => g.id === 16);

                return (
                  <div
                    key={item.id}
                    className="flex gap-4 p-3.5 rounded-2xl bg-dark-900 border border-white/5 hover:border-emerald-500/30 transition-all group"
                  >
                    {/* Poster */}
                    <div 
                      className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden bg-dark-850 shrink-0 cursor-pointer shadow-md relative"
                      onClick={() => onSelectMedia({
                        id: item.tmdb_id,
                        media_type: item.media_type,
                        title: item.title,
                        overview: item.overview || '',
                        poster_path: posterUrl,
                        backdrop_path: item.backdrop_path,
                        release_date: item.release_date || undefined,
                        vote_average: 0,
                        vote_count: 0,
                        isWatched: true,
                        userRating: item.rating,
                      })}
                    >
                      {posterUrl ? (
                        <img
                          src={posterUrl}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-2 text-center">
                          {item.media_type === 'movie' ? <Film className="w-6 h-6 mb-1" /> : <Tv className="w-6 h-6 mb-1" />}
                          <span className="text-[10px] line-clamp-2">{item.title}</span>
                        </div>
                      )}

                      {/* Badge Manga/Animé */}
                      {isAnime && (
                        <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/90 text-dark-950 shadow">
                          Animé
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 
                            onClick={() => onSelectMedia({
                              id: item.tmdb_id,
                              media_type: item.media_type,
                              title: item.title,
                              overview: item.overview || '',
                              poster_path: posterUrl,
                              backdrop_path: item.backdrop_path,
                              release_date: item.release_date || undefined,
                              vote_average: 0,
                              vote_count: 0,
                              isWatched: true,
                              userRating: item.rating,
                            })}
                            className="text-sm font-bold text-white group-hover:text-emerald-400 cursor-pointer transition-colors truncate"
                          >
                            {item.title}
                          </h3>
                          <button
                            onClick={() => handleDelete(item)}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Retirer des vus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className={`uppercase text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isAnime ? 'bg-amber-500/20 text-amber-300' : 'bg-dark-800 text-slate-300'
                          }`}>
                            {isAnime ? 'Animé' : item.media_type === 'movie' ? 'Film' : 'Série'}
                          </span>
                          {item.release_date && (
                            <span>{new Date(item.release_date).getFullYear()}</span>
                          )}
                        </div>

                        {item.review && (
                          <p className="text-xs text-slate-300 line-clamp-2 mt-2 italic bg-dark-850 p-2 rounded-lg border border-white/5">
                            « {item.review} »
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400 mt-2">
                        <div className="flex items-center gap-1 text-[11px] text-slate-500">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(item.watched_at).toLocaleDateString('fr-FR')}</span>
                        </div>

                        <button
                          onClick={() => onOpenRating({
                            id: item.tmdb_id,
                            media_type: item.media_type,
                            title: item.title,
                            overview: item.overview || '',
                            poster_path: posterUrl,
                            backdrop_path: item.backdrop_path,
                            release_date: item.release_date || undefined,
                            vote_average: 0,
                            vote_count: 0,
                            isWatched: true,
                            userRating: item.rating,
                          })}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold transition-colors text-[11px]"
                        >
                          <Star className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                          <span>{item.rating ? `${item.rating}/10` : 'Noter'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center space-y-3 bg-dark-900/30 rounded-3xl border border-white/5">
              <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-base font-semibold text-slate-300">Aucune œuvre enregistrée dans cette catégorie.</p>
              <button
                onClick={() => onNavigateTab('discover')}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold shadow-glow transition-all"
              >
                Explorer des œuvres
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
