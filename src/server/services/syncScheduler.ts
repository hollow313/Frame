import db from '../db/index.js';
import { SimklService } from './simklService.js';
import { JellyfinService } from './jellyfinService.js';
import { LdapService } from './ldapService.js';
import { logger } from '../utils/logger.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Exécute un cycle de synchronisation automatique LDAP, Simkl et Jellyfin pour tous les utilisateurs éligibles (U-04)
 */
export async function runSimklSyncOnce(): Promise<{ syncedUsers: number; errors: number }> {
  if (running) {
    return { syncedUsers: 0, errors: 0 };
  }
  running = true;
  let syncedUsers = 0;
  let errors = 0;

  try {
    // 0. Synchronisation automatique des membres du groupe LDAP / LLDAP
    if (LdapService.isEnabled()) {
      await LdapService.syncUsersFromLdap().catch(() => {});
    }

    // 1. Synchronisation automatique Simkl
    const simklUsers = db
      .prepare('SELECT id, username FROM users WHERE simkl_token IS NOT NULL AND COALESCE(simkl_auto_sync, 1) = 1')
      .all() as Array<{ id: number; username: string }>;

    for (const u of simklUsers) {
      try {
        const r = await SimklService.syncWatchedItems(u.id);
        db.prepare(
          'UPDATE users SET simkl_last_sync_at = ?, simkl_last_sync_status = ?, simkl_last_sync_error = NULL WHERE id = ?'
        ).run(new Date().toISOString(), 'ok', u.id);
        logger.info('SimklSync', `Synchronisation auto Simkl réussie pour ${u.username}`, {
          userId: u.id,
          movies: r.importedMovies,
          shows: r.importedShows,
          anime: r.importedAnime,
          manga: r.importedManga,
        });
        syncedUsers++;
      } catch (err: any) {
        errors++;
        const msg = String(err?.message || err).slice(0, 500);
        db.prepare(
          'UPDATE users SET simkl_last_sync_at = ?, simkl_last_sync_status = ?, simkl_last_sync_error = ? WHERE id = ?'
        ).run(new Date().toISOString(), 'error', msg, u.id);
        logger.error('SimklSync', `Échec synchronisation auto Simkl pour ${u.username}`, {
          userId: u.id,
          error: msg,
        });
      }
    }

    // 2. Synchronisation automatique Jellyfin (films, séries et épisodes vus)
    if (JellyfinService.isConfigured()) {
      const jellyfinUsers = db
        .prepare('SELECT id, username FROM users WHERE jellyfin_token IS NOT NULL AND jellyfin_user_id IS NOT NULL')
        .all() as Array<{ id: number; username: string }>;

      for (const u of jellyfinUsers) {
        try {
          const r = await JellyfinService.syncWatchedFromJellyfin(u.id);
          logger.info('JellyfinSync', `Synchronisation auto Jellyfin réussie pour ${u.username}`, {
            userId: u.id,
            movies: r.importedMovies,
            shows: r.importedShows,
            episodes: r.importedEpisodes,
          });
        } catch (err: any) {
          const msg = String(err?.message || err).slice(0, 500);
          logger.error('JellyfinSync', `Échec synchronisation auto Jellyfin pour ${u.username}`, {
            userId: u.id,
            error: msg,
          });
        }
      }
    }
  } finally {
    running = false;
  }

  return { syncedUsers, errors };
}

/**
 * Démarre le planificateur automatique Simkl & Jellyfin toutes les 6 heures (et 1 minute après le démarrage)
 */
export function startSimklScheduler(): void {
  if (intervalHandle) return;
  setTimeout(() => {
    runSimklSyncOnce().catch(() => {});
  }, 60_000);
  intervalHandle = setInterval(() => {
    runSimklSyncOnce().catch(() => {});
  }, SIX_HOURS_MS);
  logger.info('SimklSync', 'Planificateur automatique Simkl & Jellyfin initialisé (toutes les 6 heures).');
}
