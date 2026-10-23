import { Router, Response } from 'express';
import { SeerService } from '../services/seerService.js';
import { TMDBService } from '../services/tmdbService.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import db from '../db/index.js';
import { serverError } from '../utils/httpError.js';

const router = Router();

/**
 * Vérifier l'état de la connexion à Overseerr / Jellyseerr (Authentification requise - F-13)
 */
router.get('/status', authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await SeerService.getStatus();
    res.json(status);
  } catch (err: any) {
    serverError(res, err, 'SeerStatus');
  }
});

/**
 * Obtenir la liste des utilisateurs Overseerr / Jellyseerr (Réservé aux administrateurs - F-03)
 */
router.get('/users', authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await SeerService.getUsers();
    res.json(users);
  } catch (err: any) {
    serverError(res, err, 'SeerUsers');
  }
});

/**
 * Vérifier la disponibilité d'un média sur Seer
 */
router.get('/check/:mediaType/:tmdbId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = req.params.mediaType as 'movie' | 'tv';
    const tmdbId = parseInt(req.params.tmdbId, 10);
    if (!['movie', 'tv'].includes(mediaType) || isNaN(tmdbId) || tmdbId <= 0) {
      res.status(400).json({ error: 'Paramètres invalides.' });
      return;
    }
    const status = await SeerService.getMediaStatus(mediaType, tmdbId);
    res.json(status);
  } catch (err: any) {
    serverError(res, err, 'SeerCheck');
  }
});

/**
 * Lister les demandes récentes sur Seer (enrichies avec titre, affiche et synopsis TMDB - B-02)
 * Pour un utilisateur non-admin ayant un seer_user_id associé, filtre ses propres demandes (F-03)
 */
router.get('/requests', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const take = Math.min(100, Math.max(1, parseInt(req.query.take as string, 10) || 25));
    const skip = Math.max(0, parseInt(req.query.skip as string, 10) || 0);
    const filter = (req.query.filter as any) || 'all';
    const data = await SeerService.getRequests(take, skip, filter);

    let results = data.results || [];

    // Filtrage par utilisateur Seerr si non-admin et seer_user_id configuré (F-03)
    if (req.user!.role !== 'admin') {
      const userRow = db.prepare('SELECT seer_user_id, username FROM users WHERE id = ?').get(req.user!.id) as any;
      if (userRow?.seer_user_id) {
        results = results.filter((r: any) => r.requestedBy?.id === Number(userRow.seer_user_id));
      }
    }

    // Enrichir chaque demande avec les métadonnées TMDB (limité à 12 appels concurrents max - B-02)
    const enrichedResults: any[] = [];
    const CONCURRENCY = 6;
    for (let i = 0; i < results.length; i += CONCURRENCY) {
      const batch = results.slice(i, i + CONCURRENCY);
      const batchEnriched = await Promise.all(
        batch.map(async (r: any) => {
          const tmdbId = r.media?.tmdbId;
          const mediaType = (r.type || r.media?.mediaType || 'movie') as 'movie' | 'tv';
          if (!tmdbId) return r;

          try {
            const details = await TMDBService.getDetails(mediaType, tmdbId);
            return {
              ...r,
              title: details.title,
              originalTitle: details.original_title,
              posterPath: details.poster_path,
              backdropPath: details.backdrop_path,
              overview: details.overview,
              releaseDate: details.release_date,
              voteAverage: details.vote_average,
              genres: details.genres,
            };
          } catch {
            return r;
          }
        })
      );
      enrichedResults.push(...batchEnriched);
    }

    res.json({
      ...data,
      results: enrichedResults,
    });
  } catch (err: any) {
    serverError(res, err, 'SeerRequests');
  }
});

/**
 * Créer une demande de film ou série sur Seer
 */
router.post('/request', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mediaType, mediaId, seasons, is4k } = req.body;

    if (!mediaType || !mediaId || !['movie', 'tv'].includes(mediaType)) {
      res.status(400).json({ error: 'mediaType et mediaId valides sont requis.' });
      return;
    }

    // Récupérer le seer_user_id de l'utilisateur Frame s'il est défini (F-03)
    const userRow = db.prepare('SELECT seer_user_id FROM users WHERE id = ?').get(req.user!.id) as any;
    const seerUserId = userRow?.seer_user_id ? Number(userRow.seer_user_id) : undefined;

    const result = await SeerService.createRequest({
      mediaType,
      mediaId: Number(mediaId),
      seasons: seasons || (mediaType === 'tv' ? 'all' : undefined),
      is4k: Boolean(is4k),
      userId: seerUserId,
    });

    res.status(201).json({
      success: true,
      message: 'Demande envoyée avec succès à Seer !',
      request: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Impossible de créer la demande Seer.' });
  }
});

/**
 * Annuler / Supprimer une demande existante sur Seer (Admin ou propriétaire - F-03)
 */
router.delete('/request/:requestId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    if (isNaN(requestId) || requestId <= 0) {
      res.status(400).json({ error: 'ID de demande invalide.' });
      return;
    }

    // Si non-admin, vérifier que l'utilisateur a le droit d'annuler cette demande (F-03)
    if (req.user!.role !== 'admin') {
      const userRow = db.prepare('SELECT seer_user_id, username, display_name FROM users WHERE id = ?').get(req.user!.id) as any;
      const allReqs = await SeerService.getRequests(50, 0, 'all');
      const targetReq = (allReqs.results || []).find((r: any) => r.id === requestId);
      if (targetReq) {
        const isOwnerById = userRow?.seer_user_id && targetReq.requestedBy?.id === Number(userRow.seer_user_id);
        const reqName = (targetReq.requestedBy?.displayName || '').toLowerCase();
        const isOwnerByName =
          reqName &&
          (reqName === String(userRow?.username || '').toLowerCase() ||
            reqName === String(userRow?.display_name || '').toLowerCase());
        if (!isOwnerById && !isOwnerByName) {
          res.status(403).json({ error: 'Accès refusé : seul un administrateur ou le demandeur peut annuler cette demande.' });
          return;
        }
      } else {
        res.status(403).json({ error: 'Accès refusé : privilèges administrateur requis.' });
        return;
      }
    }

    await SeerService.deleteRequest(requestId);
    res.json({
      success: true,
      message: 'Demande annulée avec succès sur Seer.',
    });
  } catch (err: any) {
    serverError(res, err, 'SeerDeleteRequest');
  }
});

/**
 * Approuver une demande en attente sur Seer (Réservé aux administrateurs - F-03)
 */
router.post('/request/:requestId/approve', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const result = await SeerService.approveRequest(requestId);
    res.json({
      success: true,
      message: 'Demande approuvée ! Téléchargement lancé sur Sonarr / Radarr.',
      result,
    });
  } catch (err: any) {
    serverError(res, err, 'SeerApproveRequest');
  }
});

/**
 * Refuser une demande en attente sur Seer (Réservé aux administrateurs - F-03)
 */
router.post('/request/:requestId/decline', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const result = await SeerService.declineRequest(requestId);
    res.json({
      success: true,
      message: 'Demande refusée.',
      result,
    });
  } catch (err: any) {
    serverError(res, err, 'SeerDeclineRequest');
  }
});

export default router;
