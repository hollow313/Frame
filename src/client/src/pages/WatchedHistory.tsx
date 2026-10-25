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
  TrendingUp,
  Trophy,
  ArrowUpRight,
  Play,
  Eye,
  Clapperboard,
  Hourglass,
  Award,
  ChevronRight,
  RotateCcw,
  Repeat
} from 'lucide-react';
import { WatchedItem, MediaItem, UserStats, DayActivity } from '../types';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface WatchedHistoryProps {
  onSelectMedia: (item: MediaItem) => void;
  onOpenRating: (item: MediaItem) => void;
  onNavigateTab: (tab: string) => void;
}

// Composant Sparkline SVG ultra-léger et élégant
const Sparkline: React.FC<{ data?: number[]; color: string; height?: number }> = ({ data = [], color, height = 30 }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 160;
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((val, i) => {
    const x = i * step;
    const y = height - ((val - min) / range) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  return (
    <div className="flex items-center">
      <svg width={width} height={height} className="overflow-visible">
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

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
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv' | 'anime' | 'manga'>('all');
  const [sortBy, setSortBy] = useState<'watched_at' | 'rating'>('watched_at');
  const [loadingList, setLoadingList] = useState<boolean>(true);

  // Stats states
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [generatingShare, setGeneratingShare] = useState<boolean>(false);
  const [syncingSonarr, setSyncingSonarr] = useState<boolean>(false);

  // Stats View Controls (Heatmap filter, Genres toggle, Recaps tabs)
  const [heatmapFilter, setHeatmapFilter] = useState<'all' | 'tv' | 'anime' | 'movie'>('all');
  const [genreSortBy, setGenreSortBy] = useState<'items' | 'time'>('items');
  const [monthTab, setMonthTab] = useState<'last' | 'this'>('last');
  const [weekTab, setWeekTab] = useState<'last' | 'this'>('last');
  const [hoveredDay, setHoveredDay] = useState<DayActivity | null>(null);

  const handleSyncSonarr = async () => {
    setSyncingSonarr(true);
    try {
      const res = await api.syncSonarrUnmonitored();
      alert(res.message || `${res.totalImported} séries et mangas importés depuis Sonarr !`);
      await loadWatched();
      await loadStats();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la synchronisation Sonarr');
    } finally {
      setSyncingSonarr(false);
    }
  };

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

  const handleRewatch = async (item: WatchedItem) => {
    try {
      await api.rewatchMedia({ tmdbId: item.tmdb_id, mediaType: item.media_type });
      setItems((prev) =>
        prev.map((i) =>
          i.tmdb_id === item.tmdb_id && i.media_type === item.media_type
            ? { ...i, watch_count: (i.watch_count || 1) + 1, watched_at: new Date().toISOString() }
            : i
        )
      );
      loadStats();
    } catch (e) {
      console.error('Erreur rewatch', e);
    }
  };

  const getPosterUrl = (path?: string | null) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/w500${path}`;
  };

  // ==========================================
  // FONCTION DE PARTAGE : GÉNÉRATION D'INFOGRAPHIE COMPLÈTE HD (CANVAS)
  // ==========================================
  const handleShareStats = () => {
    if (!stats) return;
    setGeneratingShare(true);

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 1200;
      const height = 1620;
      canvas.width = width;
      canvas.height = height;

      // 1. Fond dégradé cinéma ultra-moderne
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#060a12');
      bgGrad.addColorStop(0.3, '#0b1324');
      bgGrad.addColorStop(0.7, '#13112b');
      bgGrad.addColorStop(1, '#1f0f35');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Halos lumineux décoratifs d'ambiance
      const glowTop = ctx.createRadialGradient(250, 150, 20, 250, 150, 450);
      glowTop.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
      glowTop.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = glowTop;
      ctx.fillRect(0, 0, width, height);

      const glowMid = ctx.createRadialGradient(950, 700, 20, 950, 700, 450);
      glowMid.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
      glowMid.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glowMid;
      ctx.fillRect(0, 0, width, height);

      const glowBottom = ctx.createRadialGradient(300, 1300, 20, 300, 1300, 450);
      glowBottom.addColorStop(0, 'rgba(236, 72, 153, 0.16)');
      glowBottom.addColorStop(1, 'rgba(236, 72, 153, 0)');
      ctx.fillStyle = glowBottom;
      ctx.fillRect(0, 0, width, height);

      // Bordure extérieure subtile
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, width - 32, height - 32);

      // 2. Header : Logo, Titre & Profil
      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.roundRect(50, 45, 42, 42, 12);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('FRAME', 106, 76);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 14px sans-serif';
      ctx.fillText('BILAN MULTIMÉDIA COMPLET & STATISTIQUES', 220, 75);

      const username = user?.displayName || user?.username || 'Cinéphile';
      const todayStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Profil : ${username}   •   ${todayStr}`, width - 50, 75);
      ctx.textAlign = 'left';

      // Ligne séparatrice
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(50, 110);
      ctx.lineTo(width - 50, 110);
      ctx.stroke();

      // 3. Section 1 : Grand Bilan du Temps & 3 Piliers (Y: 130 - 370)
      const topY = 130;
      const topH = 230;

      // Grand bloc gauche : Temps total cumulé
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.roundRect(50, topY, 440, topH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.roundRect(75, topY + 22, 10, 10, 5);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('TEMPS TOTAL DE VISIONNAGE CUMULÉ', 95, topY + 31);

      // Chiffres géants
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      const totalTimeText = `${stats.totalDays}j : ${stats.remainingHours}h : ${stats.remainingMinutes}m`;
      ctx.fillText(totalTimeText, 75, topY + 85);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 13px sans-serif';
      ctx.fillText(`≈ ${stats.totalHours?.toLocaleString()} heures réelles (${stats.totalMinutes?.toLocaleString()} min)`, 75, topY + 120);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.fillText(`🎬 ${stats.totalWatched} titres au total • Note moyenne : ${stats.averageRating ? `${stats.averageRating}/10` : '—'}`, 75, topY + 155);
      ctx.fillText(`🏆 Complétion : ${stats.completedTitles || 0} titres terminés (${stats.completionRate || 0}%)`, 75, topY + 185);

      // 3 Cartes Piliers (Droite)
      const pillarW = 200;
      const pillarGap = 20;
      const pStartX = 510;

      const drawPillarCard = (
        x: number,
        title: string,
        icon: string,
        timeStr: string,
        pct: number,
        lines: string[],
        accent: string
      ) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x, topY, pillarW, topH, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();

        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(x + 18, topY + 20, 8, 8, 4);
        ctx.fill();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${icon} ${title}`, x + 34, topY + 28);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(timeStr, x + 18, topY + 68);

        ctx.fillStyle = accent;
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`${pct}% du total`, x + 18, topY + 92);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 12px sans-serif';
        lines.forEach((l, idx) => {
          ctx.fillText(l, x + 18, topY + 128 + idx * 24);
        });
      };

      drawPillarCard(
        pStartX,
        'SÉRIES TV',
        '📺',
        `${stats.tvStats?.days || 0}j ${stats.tvStats?.hours || 0}h`,
        stats.tvStats?.percentage || 0,
        [
          `• ${stats.tvStats?.completedCount || 0} séries finies`,
          `• ${stats.tvStats?.watchingCount || 0} en cours`,
          `• ${stats.tvStats?.totalEpisodes || 0} épisodes vus`,
        ],
        '#3b82f6'
      );

      drawPillarCard(
        pStartX + pillarW + pillarGap,
        'ANIMÉS',
        '✨',
        `${stats.animeStats?.days || 0}j ${stats.animeStats?.hours || 0}h`,
        stats.animeStats?.percentage || 0,
        [
          `• ${stats.animeStats?.completedCount || 0} animés finis`,
          `• ${stats.animeStats?.watchingCount || 0} en cours`,
          `• ${stats.animeStats?.totalEpisodes || 0} épisodes vus`,
        ],
        '#eab308'
      );

      drawPillarCard(
        pStartX + (pillarW + pillarGap) * 2,
        'FILMS',
        '🎬',
        `${stats.movieStats?.days || 0}j ${stats.movieStats?.hours || 0}h`,
        stats.movieStats?.percentage || 0,
        [
          `• ${stats.moviesWatched || 0} films vus`,
          `• ${stats.movieStats?.planToWatchCount || 0} à voir`,
          `• ${stats.moviesHours || 0}h cumulées`,
        ],
        '#ec4899'
      );

      // 4. Section 2 : Les 6 Métriques Clés Clôturées (Y: 380 - 525)
      const kpiRowY1 = 380;
      const kpiRowY2 = 455;
      const kpiCardW = 346;
      const kpiCardH = 62;
      const kpiGapX = 30;

      const drawMiniKpi = (x: number, y: number, label: string, val: string, sub: string, col: string) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.beginPath();
        ctx.roundRect(x, y, kpiCardW, kpiCardH, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 10.5px sans-serif';
        ctx.fillText(label.toUpperCase(), x + 16, y + 22);

        ctx.fillStyle = col;
        ctx.font = 'bold 18px sans-serif';
        ctx.fillText(val, x + 16, y + 48);

        ctx.fillStyle = '#64748b';
        ctx.font = '500 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(sub, x + kpiCardW - 14, y + 47);
        ctx.textAlign = 'left';
      };

      // Ligne 1
      drawMiniKpi(50, kpiRowY1, 'Titres Suivis', String(stats.titlesTracked), `${stats.completedTitles} terminés • ${stats.completionRate}%`, '#ffffff');
      drawMiniKpi(50 + kpiCardW + kpiGapX, kpiRowY1, 'Épisodes Vus', stats.totalEpisodes ? stats.totalEpisodes.toLocaleString() : '0', `${stats.finishedEpisodes || 0} finis${stats.totalRewatchesCount ? ` • +${stats.totalRewatchesCount} revues` : ''}`, '#ffffff');
      drawMiniKpi(50 + (kpiCardW + kpiGapX) * 2, kpiRowY1, 'Note Moyenne', stats.averageRating ? `${stats.averageRating} / 10` : '—', `sur ${stats.ratingCount || 0} notes`, '#f59e0b');

      // Ligne 2
      drawMiniKpi(50, kpiRowY2, 'Série Record (Streak)', `${stats.longestStreak || 0} Jours`, `Actuelle : ${stats.currentStreak || 0} j`, '#10b981');
      drawMiniKpi(50 + kpiCardW + kpiGapX, kpiRowY2, 'Jour Favori', stats.topWeekday || '—', stats.topWeekdayAvgFormatted || '—', '#e2e8f0');
      drawMiniKpi(50 + (kpiCardW + kpiGapX) * 2, kpiRowY2, '30 Derniers Jours', `${stats.last30DaysHours || 0} h`, `sur ${stats.last30DaysActiveDays || 0} jours actifs`, '#38bdf8');

      // 5. Section 3 : Top 5 des Œuvres les Plus Revues (Rewatches) (Y: 535 - 745)
      const rewatchY = 535;
      const rewatchH = 210;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(50, rewatchY, width - 100, rewatchH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('🔄 Vos Œuvres les Plus Revues (Top Relectures & Rewatches)', 75, rewatchY + 34);

      if (stats.totalRewatchesCount && stats.totalRewatchesCount > 0) {
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`+${stats.totalRewatchesCount} relectures au total`, width - 75, rewatchY + 34);
        ctx.textAlign = 'left';
      }

      const topRew = stats.topRewatched || [];
      if (topRew.length > 0) {
        const itemW = 200;
        const itemGap = 20;
        topRew.slice(0, 5).forEach((item, idx) => {
          const ix = 75 + idx * (itemW + itemGap);
          const iy = rewatchY + 55;
          const ih = 135;

          ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
          ctx.beginPath();
          ctx.roundRect(ix, iy, itemW, ih, 12);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.stroke();

          // Rang
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(`№ 0${idx + 1}`, ix + 12, iy + 24);

          // Badge Type
          const tName = item.isAnime ? 'ANIMÉ' : item.mediaType === 'movie' ? 'FILM' : 'SÉRIE';
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(tName, ix + itemW - 12, iy + 24);
          ctx.textAlign = 'left';

          // Titre
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px sans-serif';
          const tTrunc = item.title.length > 18 ? item.title.slice(0, 16) + '...' : item.title;
          ctx.fillText(tTrunc, ix + 12, iy + 52);

          // Badge Vu X fois
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.beginPath();
          ctx.roundRect(ix + 12, iy + 68, 90, 22, 6);
          ctx.fill();
          ctx.fillStyle = '#34d399';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(`Vu ${item.rewatchCount}x`, ix + 20, iy + 83);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '500 11px sans-serif';
          ctx.fillText(`+${item.additionalWatches} revues`, ix + 110, iy + 83);

          if (item.totalRewatchMinutes > 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '500 11px sans-serif';
            ctx.fillText(`≈ ${Math.max(1, Math.round(item.totalRewatchMinutes / 60))}h en relecture`, ix + 12, iy + 115);
          }
        });
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('Vos œuvres et épisodes revus plusieurs fois apparaîtront ici automatiquement.', 75, rewatchY + 110);
      }

      // 6. Section 4 : Top Réalisateurs & Top Genres (Y: 765 - 1055)
      const sec4Y = 765;
      const sec4H = 280;
      const colW = 535;

      // Cadre Réalisateurs (Gauche)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(50, sec4Y, colW, sec4H, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('🎬 Réalisateurs les Plus Vus', 75, sec4Y + 36);

      const topDirs = (stats.topDirectors || []).slice(0, 4);
      if (topDirs.length > 0) {
        topDirs.forEach((dir, idx) => {
          const dy = sec4Y + 75 + idx * 48;
          ctx.fillStyle = '#f59e0b';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText(`№ 0${idx + 1}`, 75, dy);

          ctx.fillStyle = '#f1f5f9';
          ctx.font = 'bold 14px sans-serif';
          ctx.fillText(dir.name, 125, dy);

          ctx.fillStyle = '#94a3b8';
          ctx.font = '500 12px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(`${dir.count} films • ${dir.hours} h`, 50 + colW - 25, dy);
          ctx.textAlign = 'left';

          if (dir.sampleTitle) {
            ctx.fillStyle = '#64748b';
            ctx.font = 'italic 11px sans-serif';
            const sTitle = dir.sampleTitle.length > 32 ? dir.sampleTitle.slice(0, 30) + '...' : dir.sampleTitle;
            ctx.fillText(`Ex : ${sTitle}`, 125, dy + 18);
          }
        });
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('Les cinéastes apparaîtront au fil de vos visionnages de films.', 75, sec4Y + 120);
      }

      // Cadre Genres (Droite)
      const gx = 615;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(gx, sec4Y, colW, sec4H, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('🎯 Genres Préférés', gx + 25, sec4Y + 36);

      const topG = (stats.topGenres || []).slice(0, 5);
      if (topG.length > 0) {
        topG.forEach((g, idx) => {
          const gy = sec4Y + 70 + idx * 40;
          ctx.fillStyle = '#e2e8f0';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText(g.name, gx + 25, gy);

          // Barre de progression
          const barX = gx + 170;
          const maxBarW = 220;
          const barW = Math.max(12, Math.min(maxBarW, (g.percentage / 100) * maxBarW));

          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.beginPath();
          ctx.roundRect(barX, gy - 12, maxBarW, 14, 7);
          ctx.fill();

          ctx.fillStyle = idx === 0 ? '#6366f1' : idx === 1 ? '#8b5cf6' : idx === 2 ? '#ec4899' : idx === 3 ? '#10b981' : '#f59e0b';
          ctx.beginPath();
          ctx.roundRect(barX, gy - 12, barW, 14, 7);
          ctx.fill();

          ctx.fillStyle = '#94a3b8';
          ctx.font = '600 12px sans-serif';
          ctx.fillText(`${g.percentage}% (${g.count})`, barX + maxBarW + 12, gy);
        });
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('Historique des genres en attente de synchronisation.', gx + 25, sec4Y + 120);
      }

      // 7. Section 5 : Bilan de l'Année 2026 & Chronologie Récente (Y: 1065 - 1325)
      const sec5Y = 1065;
      const sec5H = 250;

      // Bilan Année en cours (Gauche)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(50, sec5Y, colW, sec5H, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`📅 Bilan de Cette Année (${stats.currentYear || 2026})`, 75, sec5Y + 36);

      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`${stats.thisYearTotalHours || 0} Heures de Visionnage`, 75, sec5Y + 80);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 13px sans-serif';
      ctx.fillText(`🎬 Films : ${stats.thisYearMoviesHours || 0}h (${stats.moviesWatched} vus)`, 75, sec5Y + 115);
      ctx.fillText(`📺 Séries TV : ${stats.thisYearTvHours || 0}h`, 75, sec5Y + 142);
      ctx.fillText(`✨ Animés & Mangas : ${stats.thisYearAnimeHours || 0}h`, 75, sec5Y + 169);
      ctx.fillText(`📆 Jours avec visionnage : ${stats.watchDaysThisYear || 0} / ${stats.daysPassedThisYear || 0} jours`, 75, sec5Y + 196);
      ctx.fillText(`🔥 Titres visionnés sur l'année : ${stats.thisYearWatchedCount || 0} œuvres`, 75, sec5Y + 223);

      // Chronologie des Derniers Mois (Droite)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.beginPath();
      ctx.roundRect(gx, sec5Y, colW, sec5H, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('📊 Chronologie des Derniers Mois', gx + 25, sec5Y + 36);

      const timelineItems = (stats.timeline || []).slice(0, 4);
      if (timelineItems.length > 0) {
        timelineItems.forEach((t, idx) => {
          const ty = sec5Y + 76 + idx * 42;
          ctx.fillStyle = '#f8fafc';
          ctx.font = 'bold 13.5px sans-serif';
          ctx.fillText(t.label, gx + 25, ty);

          ctx.fillStyle = '#38bdf8';
          ctx.font = '600 12.5px sans-serif';
          ctx.fillText(`${t.count} visionnage${t.count > 1 ? 's' : ''}`, gx + 175, ty);

          ctx.fillStyle = '#64748b';
          ctx.font = '11.5px sans-serif';
          ctx.fillText(`(${t.movies}f, ${t.tv}s, ${t.anime}m)`, gx + 330, ty);
        });
      } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '13px sans-serif';
        ctx.fillText('Aucun historique mensuel enregistré.', gx + 25, sec5Y + 120);
      }

      // 8. Section 6 : File d'Attente & Records Personnels (Y: 1335 - 1495)
      const sec6Y = 1335;
      const sec6H = 150;
      const cardW3 = 346;

      const drawFooterKpi = (x: number, title: string, bigVal: string, sub1: string, sub2: string, col: string) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x, sec6Y, cardW3, sec6H, 18);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(title, x + 20, sec6Y + 28);

        ctx.fillStyle = col;
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(bigVal, x + 20, sec6Y + 66);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '500 12px sans-serif';
        ctx.fillText(sub1, x + 20, sec6Y + 98);

        ctx.fillStyle = '#64748b';
        ctx.font = '11px sans-serif';
        ctx.fillText(sub2, x + 20, sec6Y + 124);
      };

      drawFooterKpi(
        50,
        '🔖 FILE D\'ATTENTE (WATCHLIST)',
        `${stats.backlogTitlesCount || 0} Titres à voir`,
        `≈ ${stats.backlogDays || 0} jours de visionnage cumulé`,
        'Enregistré dans votre liste personnelle',
        '#818cf8'
      );

      drawFooterKpi(
        50 + cardW3 + kpiGapX,
        '🏆 ANNÉE PIC HISTORIQUE',
        stats.peakYear ? String(stats.peakYear) : '—',
        `${stats.peakYearHours || 0} heures cumulées`,
        'Votre record annuel absolu de visionnage',
        '#f59e0b'
      );

      drawFooterKpi(
        50 + (cardW3 + kpiGapX) * 2,
        '🌟 COMPLÉTION DES SÉRIES',
        `${stats.completionRate || 0}% de Réussite`,
        `${stats.completedTitles || 0} œuvres entièrement achevées`,
        `${stats.finishedEpisodes || 0} épisodes clôturés avec succès`,
        '#10b981'
      );

      // 9. Footer Signature
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(50, height - 60);
      ctx.lineTo(width - 50, height - 60);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '500 12px sans-serif';
      ctx.fillText('FRAME • Hub Intelligent de Streaming, Recommandations & Bilan Multimédia', 50, height - 32);

      ctx.textAlign = 'right';
      ctx.fillText(`Partagé depuis Frame • https://github.com/hollow313/Frame`, width - 50, height - 32);
      ctx.textAlign = 'left';

      // Télécharger le canvas en image PNG haute résolution
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
      {/* VUE 1 : STATISTIQUES & BILAN DÉTAILLÉ (STYLE SIMKL OFFICIEL)              */}
      {/* ========================================================================= */}
      {activeView === 'stats' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Action Bar & En-tête All Time */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-dark-900 via-dark-850 to-primary-950/30 border border-white/5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                  STATISTIQUES SIMKL & FRAME
                </span>
                <span className="text-xs text-slate-400 font-semibold">• Bilan global</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2 tracking-tight">
                <span>
                  {stats?.totalDays 
                    ? `Près de ${Math.max(1, Math.round(stats.totalDays / 30))} mois (${stats.totalDays} jours) de visionnage cumulé.`
                    : 'Bilan complet de votre temps de visionnage.'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Chaque série, chaque animé, chaque film et session de visionnage synchronisée.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleSyncSonarr}
                disabled={syncingSonarr}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-slate-200 border border-white/10 text-xs font-bold transition-all hover:scale-105 disabled:opacity-50"
                title="Importer les mangas et séries non monitorés de Sonarr dans Déjà Vu"
              >
                <RefreshCw className={`w-4 h-4 text-sky-400 ${syncingSonarr ? 'animate-spin' : ''}`} />
                <span>{syncingSonarr ? 'Import Sonarr...' : 'Importer depuis Sonarr'}</span>
              </button>

              <button
                onClick={handleShareStats}
                disabled={generatingShare || !stats}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-xs font-bold shadow-glow transition-all hover:scale-105 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{generatingShare ? 'Génération...' : 'Partager mes statistiques (Image PNG)'}</span>
              </button>
            </div>
          </div>

          {loadingStats ? (
            <div className="h-72 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : stats ? (
            <>
              {/* ================================================================= */}
              {/* SECTION 1 : HERO CARTE TEMPS TOTAL (SPENT) + GRILLE KPIS          */}
              {/* ================================================================= */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Carte Principale SPENT (Gauche) */}
                <div className="lg:col-span-5 p-6 sm:p-8 rounded-3xl bg-dark-900 border border-white/5 flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
                  
                  <div>
                    <span className="text-emerald-400 font-black tracking-widest text-lg sm:text-2xl block uppercase">
                      TEMPS PASSÉ
                    </span>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mt-1">
                      DEVANT VOS SÉRIES, ANIMÉS & FILMS
                    </span>

                    {/* Grands Chiffres Jours : Heures : Minutes */}
                    <div className="flex items-baseline gap-2 sm:gap-4 my-6">
                      <div className="text-center">
                        <span className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                          {stats.totalDays}
                        </span>
                        <span className="text-[11px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-widest block mt-1">
                          JOURS
                        </span>
                      </div>
                      <span className="text-3xl sm:text-5xl font-black text-slate-600 pb-4">:</span>
                      <div className="text-center">
                        <span className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                          {stats.remainingHours}
                        </span>
                        <span className="text-[11px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-widest block mt-1">
                          HEURES
                        </span>
                      </div>
                      <span className="text-3xl sm:text-5xl font-black text-slate-600 pb-4">:</span>
                      <div className="text-center">
                        <span className="text-5xl sm:text-6xl font-black text-white tracking-tight">
                          {stats.remainingMinutes}
                        </span>
                        <span className="text-[11px] sm:text-xs font-extrabold text-slate-400 uppercase tracking-widest block mt-1">
                          MINUTES
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{stats.totalMinutes?.toLocaleString()} minutes réelles</span>
                    </span>
                    <span className="font-semibold text-slate-300">
                      ≈ {stats.totalHours?.toLocaleString()}h cumulées
                    </span>
                  </div>
                </div>

                {/* Grille 3x3 des 9 Métriques Clés (Droite) */}
                <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-3xl bg-dark-900 border border-white/5">
                  {/* KPI 1 : Titres suivis */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      TITRES SUIVIS
                    </span>
                    <div className="my-1.5">
                      <span className="text-2xl font-black text-white">{stats.titlesTracked}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {stats.completedTitles} terminés • {stats.completionRate}%
                    </span>
                  </div>

                  {/* KPI 2 : Épisodes vus */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      ÉPISODES
                    </span>
                    <div className="my-1.5">
                      <span className="text-2xl font-black text-white">{stats.totalEpisodes?.toLocaleString()}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {stats.totalRewatchesCount && stats.totalRewatchesCount > 0 ? (
                        <span>{stats.finishedEpisodes?.toLocaleString()} finis • <strong className="text-emerald-400">+{stats.totalRewatchesCount} revues</strong></span>
                      ) : (
                        <span>{stats.finishedEpisodes?.toLocaleString()} finis • {stats.inProgressEpisodes?.toLocaleString()} en cours</span>
                      )}
                    </span>
                  </div>

                  {/* KPI 3 : Note Moyenne */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      NOTE MOYENNE
                    </span>
                    <div className="my-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-amber-400">
                        {stats.averageRating ? stats.averageRating : '—'}
                      </span>
                      {stats.averageRating && <span className="text-xs text-slate-400 font-semibold">/ 10</span>}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {stats.ratingCount ? `${stats.ratingCount} avis enregistrés` : 'aucun avis pour le moment'}
                    </span>
                  </div>

                  {/* KPI 4 : Année Record */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      ANNÉE RECORD
                    </span>
                    <div className="my-1.5">
                      <span className="text-2xl font-black text-amber-300">{stats.peakYear}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {stats.peakYearHours?.toLocaleString()}h en {stats.peakYear}
                    </span>
                  </div>

                  {/* KPI 5 : Jour de prédilection */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      JOUR FAVORI
                    </span>
                    <div className="my-1.5">
                      <span className="text-2xl font-black text-amber-400">{stats.topWeekday}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {stats.topWeekdayAvgFormatted}
                    </span>
                  </div>

                  {/* KPI 6 : Watch Streak Record */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      SÉRIE RECORD
                    </span>
                    <div className="my-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">{stats.longestStreak}</span>
                      <span className="text-xs font-bold text-slate-400">jours</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      record consécutif sur l'année
                    </span>
                  </div>

                  {/* KPI 7 : 30 Derniers Jours */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      30 DERNIERS JOURS
                    </span>
                    <div className="my-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white">{stats.last30DaysHours}</span>
                      <span className="text-xs font-bold text-slate-400">h</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      sur {stats.last30DaysActiveDays} jours d'activité
                    </span>
                  </div>

                  {/* KPI 8 : Jours Actifs Cette Année */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      JOURS ACTIFS ({stats.currentYear || 2026})
                    </span>
                    <div className="my-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-emerald-400">{stats.watchDaysThisYear}</span>
                      <span className="text-xs font-bold text-slate-400">/ {stats.daysPassedThisYear}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      jours avec du visionnage
                    </span>
                  </div>

                  {/* KPI 9 : Backlog (À Voir) */}
                  <div className="p-3.5 rounded-2xl bg-dark-850/70 border border-white/5 flex flex-col justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      À VOIR (EN ATTENTE)
                    </span>
                    <div className="my-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-primary-400">{stats.backlogDays}</span>
                      <span className="text-xs font-bold text-slate-400">jours</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      sur {stats.backlogTitlesCount} titres en liste
                    </span>
                  </div>
                </div>
              </div>

              {/* ================================================================= */}
              {/* SECTION 2 : HEATMAP 365 JOURS ("One square, one day.")            */}
              {/* ================================================================= */}
              <div className="p-6 rounded-3xl bg-dark-900 border border-white/5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 block mb-1">
                      365 JOURS, CARTOGRAPHIÉS
                    </span>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      <span>Une <span className="text-emerald-400">case</span>, un jour.</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Vos 12 derniers mois de visionnage • Chaque session de lecture dans l'année.
                    </p>
                  </div>

                  {/* Filtres de catégorie pour la heatmap */}
                  <div className="flex items-center gap-1.5 p-1 bg-dark-850 rounded-xl border border-white/5 text-xs">
                    {(['all', 'tv', 'anime', 'movie'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setHeatmapFilter(mode)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                          heatmapFilter === mode
                            ? 'bg-emerald-600 text-white shadow-glow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mode === 'all' ? 'TOUT' : mode === 'tv' ? 'SÉRIES TV' : mode === 'anime' ? 'ANIMÉS' : 'FILMS'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Résumé chiffré au-dessus de la grille */}
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 pb-2 border-b border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-200">365 JOURS</span>
                    <span>•</span>
                    <span className="text-emerald-400 font-semibold">
                      {stats.heatmap?.filter((d) => d.count > 0).length || 0} AVEC ACTIVITÉ
                    </span>
                    <span>•</span>
                    <span>
                      {stats.heatmap?.filter((d) => d.count === 0).length || 0} JOURS DE PAUSE
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>RECORD CONSÉCUTIF : <strong className="text-white">{stats.longestStreak} JOURS</strong></span>
                  </div>
                </div>

                {/* Grille Heatmap : 7 lignes x 53 colonnes */}
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[760px]">
                    <div className="grid grid-flow-col grid-rows-7 gap-1">
                      {(stats.heatmap || []).map((day, idx) => {
                        let cellLevel = day.level;
                        if (heatmapFilter === 'tv') {
                          cellLevel = day.tvMinutes > 240 ? 4 : day.tvMinutes > 120 ? 3 : day.tvMinutes > 45 ? 2 : day.tvMinutes > 0 ? 1 : 0;
                        } else if (heatmapFilter === 'anime') {
                          cellLevel = day.animeMinutes > 240 ? 4 : day.animeMinutes > 120 ? 3 : day.animeMinutes > 45 ? 2 : day.animeMinutes > 0 ? 1 : 0;
                        } else if (heatmapFilter === 'movie') {
                          cellLevel = day.movieMinutes > 240 ? 4 : day.movieMinutes > 120 ? 3 : day.movieMinutes > 45 ? 2 : day.movieMinutes > 0 ? 1 : 0;
                        }

                        const levelColors = [
                          'bg-dark-800/80 border border-white/5',
                          'bg-emerald-950 border border-emerald-800/40',
                          'bg-emerald-700 border border-emerald-600/40',
                          'bg-emerald-500 border border-emerald-400/50',
                          'bg-emerald-400 shadow-sm shadow-emerald-400/50 border border-emerald-300',
                        ];

                        return (
                          <div
                            key={day.date || idx}
                            onMouseEnter={() => setHoveredDay(day)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`w-3.5 h-3.5 rounded-sm transition-all cursor-pointer hover:scale-125 ${levelColors[cellLevel]}`}
                            title={`${day.date} : ${Math.floor(day.minutes / 60)}h ${day.minutes % 60}m (${day.count} œuvres)`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Légende & Détail au survol */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs">
                  <div className="text-slate-400 font-medium">
                    {hoveredDay ? (
                      <span className="text-emerald-300 font-semibold">
                        📅 {new Date(hoveredDay.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} : {Math.floor(hoveredDay.minutes / 60)}h {hoveredDay.minutes % 60}m passées ({hoveredDay.count} visionnages)
                      </span>
                    ) : (
                      <span>Survolez n'importe quelle case pour afficher les détails du jour.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                    <span>Calme</span>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-sm bg-dark-800 border border-white/5" />
                      <div className="w-3 h-3 rounded-sm bg-emerald-950 border border-emerald-800/40" />
                      <div className="w-3 h-3 rounded-sm bg-emerald-700" />
                      <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                      <div className="w-3 h-3 rounded-sm bg-emerald-400" />
                    </div>
                    <span>Binge-watching</span>
                  </div>
                </div>

                {/* Carte Série en cours & Performance de la semaine */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                  {/* Streak Actuel */}
                  <div className="p-4 rounded-2xl bg-dark-850/60 border border-white/5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-2 border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                      <Flame className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-black text-white">{stats.currentStreak}</span>
                        <span className="text-xs font-bold text-slate-400 uppercase">JOURS</span>
                      </div>
                      <span className="text-[11px] text-slate-400">Série en cours (Jours consécutifs)</span>
                    </div>
                  </div>

                  {/* Activité Semaine Actuelle (Lun..Dim) */}
                  <div className="p-4 rounded-2xl bg-dark-850/60 border border-white/5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                      ACTIVITÉ DE LA SEMAINE
                    </span>
                    <div className="flex items-center justify-between">
                      {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((name, i) => {
                        const active = stats.weekStreakDays?.[i];
                        return (
                          <div key={name} className="flex flex-col items-center gap-1">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                active
                                  ? 'bg-emerald-500 text-dark-950 shadow-sm shadow-emerald-500/50'
                                  : 'border border-dashed border-slate-600 text-slate-500'
                              }`}
                            >
                              {active ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : '·'}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">{name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Record Personnel */}
                  <div className="p-4 rounded-2xl bg-dark-850/60 border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                        RECORD PERSONNEL
                      </span>
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        <span>{stats.longestStreak} Jours</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-dark-800 overflow-hidden my-2">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-amber-400"
                        style={{
                          width: `${Math.min(100, Math.round((stats.currentStreak / Math.max(1, stats.longestStreak)) * 100))}%`,
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {Math.max(0, stats.longestStreak - stats.currentStreak)} jours restants pour battre votre record
                    </span>
                  </div>
                </div>
              </div>

              {/* ================================================================= */}
              {/* SECTION 3 : LES 3 GRANDS PILIERS (SÉRIES TV, ANIMÉS, FILMS)       */}
              {/* ================================================================= */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* PILIER 1 : SÉRIES TV (BLEU) */}
                <div className="p-6 rounded-3xl bg-dark-900 border border-blue-500/20 relative overflow-hidden flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    {/* En-tête Pilier */}
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-glow">
                        <Tv className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-xs font-black text-blue-300">
                        {stats.tvStats?.percentage || 0}% du total
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-blue-400">
                        SÉRIES TV VISIONNÉES
                      </h4>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mt-0.5">
                        TEMPS TOTAL DE VISIONNAGE
                      </span>

                      {/* Grands Chiffres */}
                      <div className="flex items-baseline gap-2 my-3">
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.tvStats?.days || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">J</span>
                        </div>
                        <span className="text-xl font-bold text-slate-600">:</span>
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.tvStats?.hours || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">H</span>
                        </div>
                        <span className="text-xl font-bold text-slate-600">:</span>
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.tvStats?.minutes || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">M</span>
                        </div>
                      </div>
                    </div>

                    {/* Sparkline des 90 jours */}
                    <div className="py-2 border-t border-b border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Tendance 90 jours</span>
                        <span>{stats.tvHours}h totales</span>
                      </div>
                      <div className="py-1">
                        <Sparkline data={stats.tvStats?.sparkline} color="#3b82f6" height={36} />
                      </div>
                    </div>

                    {/* Tableau Détails */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-slate-300 font-semibold">{stats.tvStats?.completedCount || 0} terminées</span>
                        <span className="text-slate-400">{stats.tvStats?.totalEpisodes?.toLocaleString() || 0} épisodes</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-slate-300 font-semibold">{stats.tvStats?.watchingCount || 0} en cours</span>
                        <span className="text-slate-400">{stats.tvStats?.watchingEpisodes?.toLocaleString() || 0} épisodes vus</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-300 font-semibold">{stats.tvStats?.planToWatchCount || 0} à voir</span>
                        <span className="text-blue-300 font-semibold">dans votre watchlist</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PILIER 2 : ANIMÉS & MANGAS (JAUNE / OR) */}
                <div className="p-6 rounded-3xl bg-dark-900 border border-amber-500/20 relative overflow-hidden flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    {/* En-tête Pilier */}
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-glow">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs font-black text-amber-300">
                        {stats.animeStats?.percentage || 0}% du total
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-amber-400">
                        ANIMÉS VISIONNÉS
                      </h4>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mt-0.5">
                        TEMPS TOTAL DE VISIONNAGE
                      </span>

                      {/* Grands Chiffres */}
                      <div className="flex items-baseline gap-2 my-3">
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.animeStats?.days || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">J</span>
                        </div>
                        <span className="text-xl font-bold text-slate-600">:</span>
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.animeStats?.hours || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">H</span>
                        </div>
                        <span className="text-xl font-bold text-slate-600">:</span>
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.animeStats?.minutes || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">M</span>
                        </div>
                      </div>
                    </div>

                    {/* Sparkline des 90 jours */}
                    <div className="py-2 border-t border-b border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Tendance 90 jours</span>
                        <span>{stats.animeHours}h totales</span>
                      </div>
                      <div className="py-1">
                        <Sparkline data={stats.animeStats?.sparkline} color="#eab308" height={36} />
                      </div>
                    </div>

                    {/* Tableau Détails */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-slate-300 font-semibold">{stats.animeStats?.completedCount || 0} terminés</span>
                        <span className="text-slate-400">{stats.animeStats?.totalEpisodes?.toLocaleString() || 0} épisodes</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-slate-300 font-semibold">{stats.animeStats?.watchingCount || 0} en cours</span>
                        <span className="text-slate-400">{stats.animeStats?.watchingEpisodes?.toLocaleString() || 0} épisodes vus</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-300 font-semibold">{stats.animeStats?.planToWatchCount || 0} à voir</span>
                        <span className="text-amber-300 font-semibold">dans votre watchlist</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PILIER 3 : FILMS (ROSE / MAGENTA) */}
                <div className="p-6 rounded-3xl bg-dark-900 border border-pink-500/20 relative overflow-hidden flex flex-col justify-between space-y-5">
                  <div className="space-y-4">
                    {/* En-tête Pilier */}
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400 shadow-glow">
                        <Film className="w-6 h-6" />
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-pink-500/15 border border-pink-500/30 text-xs font-black text-pink-300">
                        {stats.movieStats?.percentage || 0}% du total
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-pink-400">
                        FILMS VISIONNÉS
                      </h4>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mt-0.5">
                        TEMPS TOTAL DE VISIONNAGE
                      </span>

                      {/* Grands Chiffres */}
                      <div className="flex items-baseline gap-2 my-3">
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.movieStats?.days || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">J</span>
                        </div>
                        <span className="text-xl font-bold text-slate-600">:</span>
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.movieStats?.hours || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">H</span>
                        </div>
                        <span className="text-xl font-bold text-slate-600">:</span>
                        <div>
                          <span className="text-3xl sm:text-4xl font-black text-white">{stats.movieStats?.minutes || 0}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">M</span>
                        </div>
                      </div>
                    </div>

                    {/* Sparkline des 90 jours */}
                    <div className="py-2 border-t border-b border-white/5 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Tendance 90 jours</span>
                        <span>{stats.moviesHours}h totales</span>
                      </div>
                      <div className="py-1">
                        <Sparkline data={stats.movieStats?.sparkline} color="#ec4899" height={36} />
                      </div>
                    </div>

                    {/* Tableau Détails */}
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-slate-300 font-semibold">{stats.movieStats?.completedCount || 0} vus</span>
                        <span className="text-slate-400">
                          {stats.movieStats?.days || 0}.{Math.floor((stats.movieStats?.hours || 0) / 2.4)} jours
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-slate-300 font-semibold">{stats.movieStats?.planToWatchCount || 0} à voir</span>
                        <span className="text-pink-300 font-semibold">dans votre watchlist</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-slate-300 font-semibold">0 abandonné</span>
                        <span className="text-slate-400">0 jour</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ================================================================= */}
              {/* SECTION 4 : TOP GENRES (BARRE COULEUR HORIZONTALE SIMKL)          */}
              {/* ================================================================= */}
              <div className="p-6 rounded-3xl bg-dark-900 border border-white/5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      <span>Vos genres <span className="text-amber-400">favoris</span></span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Classés par titres vus ou temps passé :
                    </p>
                  </div>

                  {/* Switch par Titres vs par Temps */}
                  <div className="flex items-center gap-1.5 p-1 bg-dark-850 rounded-xl border border-white/5 text-xs">
                    <button
                      onClick={() => setGenreSortBy('items')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        genreSortBy === 'items'
                          ? 'bg-amber-500 text-dark-950 shadow-glow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      PAR TITRES
                    </button>
                    <button
                      onClick={() => setGenreSortBy('time')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        genreSortBy === 'time'
                          ? 'bg-amber-500 text-dark-950 shadow-glow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      PAR TEMPS PASSÉ
                    </button>
                  </div>
                </div>

                {/* Barre Multi-couleur Segmentée */}
                {stats.topGenres && stats.topGenres.length > 0 ? (
                  <div className="space-y-4">
                    <div className="w-full h-8 sm:h-10 rounded-xl overflow-hidden flex bg-dark-800 shadow-inner">
                      {stats.topGenres.slice(0, 10).map((g) => (
                        <div
                          key={g.name}
                          style={{
                            width: `${Math.max(3, g.percentage)}%`,
                            backgroundColor: g.color || '#3b82f6',
                          }}
                          className="h-full flex items-center justify-center text-[10px] sm:text-xs font-black text-white truncate px-1 transition-all hover:opacity-90"
                          title={`${g.name} : ${g.percentage}% (${genreSortBy === 'items' ? `${g.count} titres` : `${Math.round(g.minutes / 60)}h`})`}
                        >
                          {g.percentage >= 7 ? `${g.percentage}%` : ''}
                        </div>
                      ))}
                    </div>

                    {/* Étiquettes et Pourcentages Détaillés */}
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      {stats.topGenres.slice(0, 10).map((g) => (
                        <div
                          key={g.name}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-dark-850 border border-white/5 text-xs"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: g.color || '#3b82f6' }}
                          />
                          <span className="font-bold text-slate-200">{g.name}</span>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {g.percentage}% ({genreSortBy === 'items' ? `${g.count} vus` : `${Math.round(g.minutes / 60)}h`})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic py-4">Aucune donnée de genre enregistrée.</p>
                )}
              </div>

              {/* ================================================================= */}
              {/* SECTION 5 : TOP RÉALISATEURS (MOST-WATCHED DIRECTORS)             */}
              {/* ================================================================= */}
              <div className="p-6 rounded-3xl bg-dark-900 border border-white/5 space-y-6">
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <span>Vos réalisateurs <span className="text-amber-400">les plus vus</span></span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Les cinéastes vers lesquels vous revenez sans cesse.
                  </p>
                </div>

                {stats.topDirectors && stats.topDirectors.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Top 4 Grands Réalisateurs (Gauche - 8 cols) */}
                    <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {stats.topDirectors.slice(0, 4).map((dir, idx) => (
                        <div
                          key={dir.name}
                          className="p-4 rounded-2xl bg-dark-850/80 border border-white/5 flex gap-4 items-center group hover:border-amber-500/30 transition-all"
                        >
                          <div className="w-16 h-22 rounded-xl bg-dark-800 overflow-hidden flex-shrink-0 relative border border-white/5">
                            {dir.posterPath ? (
                              <img
                                src={getPosterUrl(dir.posterPath) || ''}
                                alt={dir.name}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600">
                                <Film className="w-6 h-6" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1 space-y-1">
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 text-[10px] font-extrabold border border-amber-500/30">
                              № 0{idx + 1}
                            </span>
                            <h5 className="font-extrabold text-sm text-white truncate group-hover:text-amber-400 transition-colors">
                              {dir.name}
                            </h5>
                            <p className="text-xs text-slate-400">
                              {dir.count} film{dir.count > 1 ? 's' : ''} • <strong className="text-slate-200">{dir.hours} h</strong>
                            </p>
                            {dir.sampleTitle && (
                              <p className="text-[11px] text-slate-500 truncate italic">
                                Ex : {dir.sampleTitle}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Rangs 5 à 10 (Droite - 4 cols) */}
                    <div className="lg:col-span-4 p-4 rounded-2xl bg-dark-850/50 border border-white/5 flex flex-col justify-between">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-3">
                        RANGS 5 À 10
                      </span>

                      <div className="space-y-2.5">
                        {stats.topDirectors.slice(4, 10).map((dir, idx) => (
                          <div key={dir.name} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-[11px] font-extrabold text-slate-500">
                                {String(idx + 5).padStart(2, '0')}
                              </span>
                              <div className="w-6 h-8 rounded bg-dark-800 overflow-hidden flex-shrink-0">
                                {dir.posterPath && (
                                  <img src={getPosterUrl(dir.posterPath) || ''} alt={dir.name} className="w-full h-full object-cover" />
                                )}
                              </div>
                              <span className="font-bold text-slate-200 truncate">{dir.name}</span>
                            </div>
                            <span className="text-slate-400 font-semibold text-[11px] flex-shrink-0">
                              {dir.count} film{dir.count > 1 ? 's' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic py-4">
                    Les informations de réalisateurs seront affichées après vos prochains visionnages de films.
                  </p>
                )}
              </div>

              {/* ================================================================= */}
              {/* SECTION 6 : TOP 5 DES ŒUVRES LES PLUS REVUES (REWATCHES)          */}
              {/* ================================================================= */}
              {stats.topRewatched && stats.topRewatched.length > 0 && (
                <div className="p-6 rounded-3xl bg-dark-900 border border-white/5 space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-xl font-black text-white flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-emerald-400" />
                        <span>Vos œuvres <span className="text-emerald-400">les plus revues</span></span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Les films, séries et mangas que vous aimez redécouvrir encore et encore.
                      </p>
                    </div>
                    {stats.totalRewatchesCount && stats.totalRewatchesCount > 0 && (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                        <Repeat className="w-3.5 h-3.5" />
                        <span>{stats.totalRewatchesCount} relectures au total</span>
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {stats.topRewatched.map((item, idx) => {
                      const posterUrl = getPosterUrl(item.posterPath);
                      return (
                        <div
                          key={`${item.mediaType}-${item.tmdbId}`}
                          onClick={() => onSelectMedia({
                            id: item.tmdbId,
                            media_type: item.mediaType,
                            title: item.title,
                            overview: '',
                            poster_path: posterUrl,
                            backdrop_path: item.backdropPath,
                            vote_average: 0,
                            vote_count: 0,
                            isWatched: true,
                          })}
                          className="p-3.5 rounded-2xl bg-dark-850/80 border border-white/5 hover:border-emerald-500/40 transition-all flex flex-col justify-between group cursor-pointer"
                        >
                          <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-dark-800 border border-white/5 mb-3 shadow">
                            {posterUrl ? (
                              <img
                                src={posterUrl}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600">
                                <Film className="w-8 h-8" />
                              </div>
                            )}

                            {/* Badge Rang */}
                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-dark-950/80 backdrop-blur-md text-amber-300 text-[10px] font-black border border-amber-500/30 shadow">
                              № 0{idx + 1}
                            </span>

                            {/* Badge Type */}
                            <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-md bg-dark-950/80 backdrop-blur-md text-[9px] font-bold uppercase text-slate-300 border border-white/10">
                              {item.isAnime ? 'Animé' : item.mediaType === 'movie' ? 'Film' : 'Série'}
                            </span>
                          </div>

                          <div className="space-y-1.5">
                            <h5 className="font-extrabold text-sm text-white truncate group-hover:text-emerald-400 transition-colors" title={item.title}>
                              {item.title}
                            </h5>
                            <div className="flex items-center justify-between text-xs">
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-extrabold text-[11px] border border-emerald-500/30">
                                Vu {item.rewatchCount}x
                              </span>
                              <span className="text-[11px] text-slate-400 font-medium">
                                +{item.additionalWatches} {item.mediaType === 'movie' ? 'revue' + (item.additionalWatches > 1 ? 's' : '') : 'ép.'}
                              </span>
                            </div>
                            {item.totalRewatchMinutes > 0 && (
                              <p className="text-[10px] text-slate-500 truncate">
                                ≈ {Math.max(1, Math.round(item.totalRewatchMinutes / 60))}h en relecture
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* SECTION 6 : RÉCAPITULATIF MENSUEL & HEBDOMADAIRE (RECAPS)         */}
              {/* ================================================================= */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. RÉCAPITULATIF MENSUEL */}
                {(() => {
                  const mRecap = monthTab === 'last' ? stats.lastMonthRecap : stats.thisMonthRecap;
                  return (
                    <div className="p-6 rounded-3xl bg-dark-900 border border-white/5 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-white flex items-center gap-2">
                            <span>Votre mois, <span className="text-amber-400">récapitulé</span></span>
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Bilan de votre temps de visionnage mensuel
                          </p>
                        </div>

                        {/* Switch Mois Dernier vs Ce Mois */}
                        <div className="flex items-center gap-1 p-1 bg-dark-850 rounded-xl border border-white/5 text-xs">
                          <button
                            onClick={() => setMonthTab('last')}
                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                              monthTab === 'last' ? 'bg-amber-500 text-dark-950 font-black shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            MOIS DERNIER
                          </button>
                          <button
                            onClick={() => setMonthTab('this')}
                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                              monthTab === 'this' ? 'bg-amber-500 text-dark-950 font-black shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            CE MOIS-CI
                          </button>
                        </div>
                      </div>

                      {/* Bannière SPENT */}
                      <div className="p-4 rounded-2xl bg-dark-850 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            {monthTab === 'last' ? 'TEMPS PASSÉ LE MOIS DERNIER' : 'TEMPS PASSÉ CE MOIS-CI'}
                          </span>
                          <span className="text-xs font-bold text-amber-400">{mRecap?.label}</span>
                        </div>

                        <div className="flex flex-wrap items-baseline justify-between gap-4">
                          <div>
                            <span className="text-3xl font-black text-white">
                              {mRecap?.totalHours || 0}h {mRecap?.totalMinutes || 0}m
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>📺 {mRecap?.tvShowsCount || 0} séries : <strong className="text-slate-200">{mRecap?.tvHours || 0}h</strong></span>
                            <span>✨ {mRecap?.animeCount || 0} animés : <strong className="text-amber-300">{mRecap?.animeHours || 0}h</strong></span>
                            <span>🎬 {mRecap?.movieCount || 0} films : <strong className="text-pink-300">{mRecap?.movieHours || 0}h</strong></span>
                          </div>
                        </div>

                        {/* Mini KPIs du mois */}
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Jours actifs</span>
                            <strong className="text-slate-200">{mRecap?.activeDays || 0} jours</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Moyenne/jour</span>
                            <strong className="text-slate-200">
                              {Math.floor((mRecap?.avgMinutesPerDay || 0) / 60)}h {(mRecap?.avgMinutesPerDay || 0) % 60}m
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Jour record</span>
                            <strong className="text-amber-300 truncate block">
                              {mRecap?.mostActiveDay?.label ? `${mRecap.mostActiveDay.hours}h (${mRecap.mostActiveDay.label.split(' ')[0]})` : '—'}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Podiums Top Animés & Films du Mois */}
                      <div className="space-y-3">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          LES PLUS REGARDÉS CE MOIS
                        </span>

                        <div className="grid grid-cols-3 gap-3">
                          {(mRecap?.topAnime && mRecap.topAnime.length > 0 ? mRecap.topAnime : mRecap?.topShows || []).slice(0, 3).map((item, idx) => (
                            <div key={item.title + idx} className="p-2.5 rounded-xl bg-dark-850 border border-white/5 space-y-1.5 text-center group">
                              <div className="w-full aspect-[2/3] rounded-lg bg-dark-800 overflow-hidden relative">
                                {item.posterPath ? (
                                  <img src={getPosterUrl(item.posterPath) || ''} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                                    <Sparkles className="w-6 h-6" />
                                  </div>
                                )}
                                <span className="absolute top-1 left-1 w-5 h-5 rounded-md bg-amber-500 text-dark-950 text-[10px] font-black flex items-center justify-center shadow">
                                  {idx + 1}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-white truncate" title={item.title}>{item.title}</p>
                              <p className="text-[10px] text-slate-400">{item.plays ? `${item.plays} épisodes` : `${Math.round(item.minutes / 60)}h`}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 2. RÉCAPITULATIF HEBDOMADAIRE */}
                {(() => {
                  const wRecap = weekTab === 'last' ? stats.lastWeekRecap : stats.thisWeekRecap;
                  return (
                    <div className="p-6 rounded-3xl bg-dark-900 border border-white/5 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-black text-white flex items-center gap-2">
                            <span>Votre semaine, <span className="text-amber-400">récapitulée</span></span>
                          </h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Bilan de votre temps de visionnage hebdomadaire
                          </p>
                        </div>

                        {/* Switch Semaine Dernière vs Cette Semaine */}
                        <div className="flex items-center gap-1 p-1 bg-dark-850 rounded-xl border border-white/5 text-xs">
                          <button
                            onClick={() => setWeekTab('last')}
                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                              weekTab === 'last' ? 'bg-amber-500 text-dark-950 font-black shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            SEMAINE DERNIÈRE
                          </button>
                          <button
                            onClick={() => setWeekTab('this')}
                            className={`px-3 py-1 rounded-lg font-bold transition-all ${
                              weekTab === 'this' ? 'bg-amber-500 text-dark-950 font-black shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            CETTE SEMAINE
                          </button>
                        </div>
                      </div>

                      {/* Bannière SPENT */}
                      <div className="p-4 rounded-2xl bg-dark-850 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            {weekTab === 'last' ? 'TEMPS PASSÉ LA SEMAINE DERNIÈRE' : 'TEMPS PASSÉ CETTE SEMAINE'}
                          </span>
                          <span className="text-xs font-bold text-amber-400">{wRecap?.label}</span>
                        </div>

                        <div className="flex flex-wrap items-baseline justify-between gap-4">
                          <div>
                            <span className="text-3xl font-black text-white">
                              {wRecap?.totalHours || 0}h {wRecap?.totalMinutes || 0}m
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            <span>📺 {wRecap?.tvShowsCount || 0} séries : <strong className="text-slate-200">{wRecap?.tvHours || 0}h</strong></span>
                            <span>✨ {wRecap?.animeCount || 0} animés : <strong className="text-amber-300">{wRecap?.animeHours || 0}h</strong></span>
                          </div>
                        </div>

                        {/* Mini KPIs de la semaine */}
                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/5 text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Jours actifs</span>
                            <strong className="text-slate-200">{wRecap?.activeDays || 0} / 7 jours</strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Moyenne/jour</span>
                            <strong className="text-slate-200">
                              {Math.floor((wRecap?.avgMinutesPerDay || 0) / 60)}h {(wRecap?.avgMinutesPerDay || 0) % 60}m
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Jour record</span>
                            <strong className="text-amber-300 truncate block">
                              {wRecap?.mostActiveDay?.label ? `${wRecap.mostActiveDay.hours}h` : '—'}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {/* Podiums Séries les plus vues cette semaine */}
                      <div className="space-y-3">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          SÉRIES & ANIMÉS LES PLUS SUIVIS
                        </span>

                        <div className="grid grid-cols-3 gap-3">
                          {(wRecap?.topShows && wRecap.topShows.length > 0 ? wRecap.topShows : wRecap?.topAnime || []).slice(0, 3).map((item, idx) => (
                            <div key={item.title + idx} className="p-2.5 rounded-xl bg-dark-850 border border-white/5 space-y-1.5 text-center group">
                              <div className="w-full aspect-[2/3] rounded-lg bg-dark-800 overflow-hidden relative">
                                {item.posterPath ? (
                                  <img src={getPosterUrl(item.posterPath) || ''} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-all" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-slate-600">
                                    <Tv className="w-6 h-6" />
                                  </div>
                                )}
                                <span className="absolute top-1 left-1 w-5 h-5 rounded-md bg-amber-500 text-dark-950 text-[10px] font-black flex items-center justify-center shadow">
                                  {idx + 1}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-white truncate" title={item.title}>{item.title}</p>
                              <p className="text-[10px] text-slate-400">{item.plays ? `${item.plays} épisodes` : `${Math.round(item.minutes / 60)}h`}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          ) : (
            <div className="py-20 text-center space-y-4 bg-dark-900/40 rounded-3xl border border-white/5">
              <BarChart3 className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-base font-semibold text-slate-300">
                Impossible de charger vos statistiques ou historique vide.
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Assurez-vous d'avoir synchronisé votre compte Simkl ou vos médias vus dans Sonarr.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={loadStats}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-glow transition-all"
                >
                  Actualiser les statistiques
                </button>
                <button
                  onClick={handleSyncSonarr}
                  disabled={syncingSonarr}
                  className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-slate-200 border border-white/10 text-xs font-bold transition-all"
                >
                  Importer depuis Sonarr
                </button>
              </div>
            </div>
          )}
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
                Animés
              </button>
              <button
                onClick={() => setFilterType('manga')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterType === 'manga' ? 'bg-pink-500 text-white font-bold shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Mangas
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

                      {/* Badge Nb de fois vu (Revues) */}
                      {item.watch_count && item.watch_count > 1 && (
                        <span
                          className="absolute top-1 right-1 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500 text-dark-950 shadow flex items-center gap-0.5"
                          title={`Visionné ${item.watch_count} fois`}
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>{item.watch_count}x</span>
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
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleRewatch(item)}
                              className="p-1 rounded text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Marquer comme revu (+1 visionnage)"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                              title="Retirer des vus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span className={`uppercase text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            item.media_type === 'manga'
                              ? 'bg-pink-500/20 text-pink-300'
                              : isAnime
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-dark-800 text-slate-300'
                          }`}>
                            {item.media_type === 'manga' ? 'Manga' : isAnime ? 'Animé' : item.media_type === 'movie' ? 'Film' : 'Série'}
                          </span>
                          {item.release_date && (
                            <span>{new Date(item.release_date).getFullYear()}</span>
                          )}
                          {(item.watchedEpisodesCount ?? 0) > 0 && (
                            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              {item.watchedEpisodesCount} ép. vus
                              {item.nextEpisode ? ` • Prochain : S${item.nextEpisode.seasonNumber}E${item.nextEpisode.episodeNumber}` : ''}
                            </span>
                          )}
                        </div>

                        {item.review && (
                          <p className="text-xs text-slate-300 line-clamp-2 mt-2 italic bg-dark-850 p-2 rounded-lg border border-white/5">
                            « {item.review} »
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs text-slate-400 mt-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(item.watched_at).toLocaleDateString('fr-FR')}</span>
                          </div>
                          {item.watch_count && item.watch_count > 1 && (
                            <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded text-[10px]">
                              Vu {item.watch_count}x
                            </span>
                          )}
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
