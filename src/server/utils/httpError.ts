import { Response } from 'express';
import { logger } from './logger.js';

export function serverError(res: Response, err: unknown, label = 'ServerError', publicMessage = 'Erreur interne du serveur.') {
  const errMsg = err instanceof Error ? err.message : String(err);
  logger.error(label, errMsg);
  return res.status(500).json({ error: publicMessage });
}
