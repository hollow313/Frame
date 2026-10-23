import { Router, Response } from 'express';
import {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  AuthenticatedRequest,
} from '../middleware/auth.js';
import { RecoFeedService, invalidateUserRecoCache } from '../services/reco/feedService.js';
import { validateMediaType, validateTmdbId } from '../utils/validate.js';
import { serverError } from '../utils/httpError.js';
import db from '../db/index.js';

const router = Router();

/**
 * GET /api/reco/feed — Flux complet de recommandations hybrides v2
 */
router.get('/feed', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentification requise pour le flux personnalisé.' });
      return;
    }
    const force = req.query.refresh === '1';
    const feed = await RecoFeedService.getPersonalizedFeed(req.user.id, force);
    res.json(feed);
  } catch (err: any) {
    serverError(res, err, 'RecoFeed');
  }
});

/**
 * POST /api/reco/event — Enregistrer un événement (impression, click, watchlist, watched, not_interested, dismiss)
 */
router.post('/event', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mediaType, tmdbId: rawId, event, section } = req.body;
    const tmdbId = validateTmdbId(rawId);
    const validEvents = new Set(['impression', 'click', 'watchlist', 'watched', 'not_interested', 'dismiss']);

    if (!tmdbId || !validateMediaType(mediaType) || !validEvents.has(event)) {
      res.status(400).json({ error: 'Paramètres event, mediaType ou tmdbId invalides.' });
      return;
    }

    RecoFeedService.recordEvent({
      userId: req.user!.id,
      mediaType,
      tmdbId,
      event,
      section: typeof section === 'string' ? section.slice(0, 100) : undefined,
    });

    res.json({ success: true });
  } catch (err: any) {
    serverError(res, err, 'RecoEvent');
  }
});

/**
 * POST /api/reco/not-interested — Exclure définitivement un titre des recommandations
 */
router.post('/not-interested', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mediaType, tmdbId: rawId } = req.body;
    const tmdbId = validateTmdbId(rawId);
    if (!tmdbId || !validateMediaType(mediaType)) {
      res.status(400).json({ error: 'mediaType et tmdbId valides sont requis.' });
      return;
    }

    RecoFeedService.recordEvent({
      userId: req.user!.id,
      mediaType,
      tmdbId,
      event: 'not_interested',
    });

    res.json({
      success: true,
      message: 'Ce média ne vous sera plus recommandé.',
    });
  } catch (err: any) {
    serverError(res, err, 'RecoNotInterested');
  }
});

/**
 * DELETE /api/reco/not-interested/:mediaType/:tmdbId — Réintégrer un média exclu
 */
router.delete('/not-interested/:mediaType/:tmdbId', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { mediaType } = req.params;
    const tmdbId = validateTmdbId(req.params.tmdbId);
    if (!tmdbId || !validateMediaType(mediaType)) {
      res.status(400).json({ error: 'Paramètres invalides.' });
      return;
    }

    db.prepare('DELETE FROM reco_exclusions WHERE user_id = ? AND media_type = ? AND tmdb_id = ?').run(
      req.user!.id,
      mediaType,
      tmdbId
    );
    invalidateUserRecoCache(req.user!.id);

    res.json({ success: true, message: 'Exclusion levée.' });
  } catch (err: any) {
    serverError(res, err, 'RecoDeleteNotInterested');
  }
});

/**
 * GET /api/reco/why/:mediaType/:tmdbId — Détail complet du score et des raisons d'un item
 */
router.get('/why/:mediaType/:tmdbId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mediaType = (req.params.mediaType === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';
    const tmdbId = validateTmdbId(req.params.tmdbId);
    if (!tmdbId) {
      res.status(400).json({ error: 'tmdbId invalide.' });
      return;
    }

    const explanation = await RecoFeedService.explainItem(req.user!.id, mediaType, tmdbId);
    res.json(explanation);
  } catch (err: any) {
    serverError(res, err, 'RecoWhy');
  }
});

/**
 * GET /api/reco/debug — Inspection du profil vectoriel long/court/négatif et des poids LinUCB (Admin)
 */
router.get('/debug', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = req.query.userId ? parseInt(req.query.userId as string, 10) : req.user!.id;
    const debug = await RecoFeedService.getDebugInfo(targetUserId);
    res.json(debug);
  } catch (err: any) {
    serverError(res, err, 'RecoDebug');
  }
});

export default router;
