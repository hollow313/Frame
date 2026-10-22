import { Router, Response } from 'express';
import { SeerService } from '../services/seerService.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Statut de connexion public ou auth
router.get('/status', async (_req, res) => {
  try {
    const configured = SeerService.isConfigured();
    if (!configured) {
      res.json({ configured: false, connected: false, message: 'Seer n\'est pas configuré' });
      return;
    }
    const test = await SeerService.testConnection();
    res.json({ configured: true, connected: test.success, message: test.message, version: test.version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vérifier la disponibilité d'un média
router.get('/check/:mediaType/:tmdbId', async (req, res: Response): Promise<void> => {
  try {
    const { mediaType, tmdbId } = req.params;
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      res.status(400).json({ error: 'Type invalide' });
      return;
    }

    const status = await SeerService.getMediaStatus(mediaType, parseInt(tmdbId, 10));
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Les actions de demande et de consultation nécessitent une session utilisateur
router.use(authenticateToken);

// Récupérer la liste des demandes
router.get('/requests', async (req, res) => {
  try {
    const take = parseInt(req.query.take as string, 10) || 20;
    const skip = parseInt(req.query.skip as string, 10) || 0;
    const filter = (req.query.filter as string) || 'all';

    const requests = await SeerService.getRequests(take, skip, filter);
    res.json(requests);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Envoyer une demande vers Seer
router.post('/request', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { mediaType, mediaId, seasons, is4k } = req.body;

    if (!mediaType || !mediaId) {
      res.status(400).json({ error: 'mediaType et mediaId sont requis' });
      return;
    }

    const result = await SeerService.createRequest({
      mediaType,
      mediaId: parseInt(mediaId, 10),
      seasons,
      is4k: Boolean(is4k),
    });

    res.json({ success: true, message: 'Demande envoyée avec succès à Seer !', result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
