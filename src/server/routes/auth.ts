import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { generateToken, authenticateToken, requireAdmin, AuthenticatedRequest } from '../middleware/auth.js';
import { getSetting, setSetting } from '../services/settingsService.js';
import { LdapService } from '../services/ldapService.js';
import { getSsoLogoutUrl } from '../middleware/sso.js';
import { serverError } from '../utils/httpError.js';
import { logger } from '../utils/logger.js';

const router = Router();

function getCookieOpts(req: Request) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.COOKIE_SECURE === 'true';
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: isHttps,
    path: '/',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  };
}

// Rate limiters contre le brute-force (F-04)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test' && process.env.ENABLE_RATE_LIMIT_IN_TEST !== 'true',
  message: { error: "Trop de tentatives d'inscription. Réessayez plus tard." },
});

function validatePasswordStrength(username: string, password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Le mot de passe doit contenir au moins 10 caractères.';
  }
  if (password.trim().toLowerCase() === username.trim().toLowerCase()) {
    return "Le mot de passe ne peut pas être identique au nom d'utilisateur.";
  }
  return null;
}

/**
 * Vérifier si un premier administrateur existe et renvoyer les options d'authentification actives
 * Si LDAP est actif, synchronise automatiquement les utilisateurs du groupe LDAP configuré.
 */
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (LdapService.isEnabled()) {
      LdapService.syncUsersFromLdap().catch(() => {});
    }

    const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const initialized = row.count > 0;
    const allowRegistration = !initialized || getSetting('ALLOW_REGISTRATION') === 'true';
    const ldapEnabled = LdapService.isEnabled();
    const ssoEnabled = getSetting('SSO_ENABLED') === 'true';

    res.json({
      initialized,
      allowRegistration,
      ldapEnabled,
      ssoEnabled,
      ssoUser: req.ssoIdentity
        ? {
            username: req.ssoIdentity.username,
            displayName: req.ssoIdentity.displayName || req.ssoIdentity.username,
            ssoUsername: req.ssoIdentity.ssoUsername,
          }
        : null,
      // true si l'utilisateur s'est déconnecté de Frame : pas de reconnexion SSO automatique
      ssoPaused: Boolean(req.cookies && req.cookies.frame_sso_logout === '1'),
      ssoLogoutUrl: ssoEnabled ? getSsoLogoutUrl() : null,
    });
  } catch (err: any) {
    serverError(res, err, 'AuthStatus');
  }
});

/**
 * Émettre une session JWT complète à partir de l'identité SSO du navigateur (F-07)
 */
router.post('/sso', (req: AuthenticatedRequest, res: Response) => {
  try {
    const identity = req.ssoIdentity;
    if (!identity) {
      res.status(401).json({ error: 'Aucune session SSO active détectée.' });
      return;
    }

    const user = { id: identity.id, username: identity.username, role: identity.role, displayName: identity.displayName };
    const token = generateToken(user, req.ssoCookieHash, 'sso');
    res.clearCookie('frame_sso_logout', { path: '/' });
    res.cookie('frame_token', token, getCookieOpts(req));
    res.json({
      user,
      token,
    });
  } catch (err: any) {
    serverError(res, err, 'AuthSSO');
  }
});

/**
 * Créer un compte utilisateur (Premier lancement = Admin, sinon selon ALLOW_REGISTRATION)
 */
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    if (!/^[a-zA-Z0-9._@-]{2,64}$/.test(cleanUsername)) {
      res.status(400).json({ error: "Format de nom d'utilisateur invalide." });
      return;
    }

    const pwdError = validatePasswordStrength(cleanUsername, password);
    if (pwdError) {
      res.status(400).json({ error: pwdError });
      return;
    }

    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const isFirstUser = countRow.count === 0;

    if (!isFirstUser && getSetting('ALLOW_REGISTRATION') !== 'true') {
      res.status(403).json({
        error: "La création libre de compte est désactivée par l'administrateur.",
      });
      return;
    }

    const role = isFirstUser ? 'admin' : 'user';

    // Si c'est le premier utilisateur, désactiver l'inscription publique par défaut
    if (isFirstUser) {
      setSetting('ALLOW_REGISTRATION', 'false');
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      res.status(409).json({ error: "Ce nom d'utilisateur est déjà utilisé." });
      return;
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name, auth_provider)
      VALUES (?, ?, ?, ?, 'local')
    `);

    const info = stmt.run(cleanUsername, passwordHash, role, displayName || username);
    const newUser = {
      id: Number(info.lastInsertRowid),
      username: cleanUsername,
      role: role as 'admin' | 'user',
      displayName: displayName || username,
    };

    const token = generateToken(newUser, undefined, 'password');

    res.cookie('frame_token', token, getCookieOpts(req));

    res.status(201).json({
      user: newUser,
      token,
      message: isFirstUser ? 'Compte administrateur créé avec succès.' : 'Compte créé avec succès.',
    });
  } catch (err: any) {
    serverError(res, err, 'AuthRegister');
  }
});

/**
 * Créer un compte utilisateur depuis l'administration (réservé aux Admins)
 */
router.post('/admin/create-user', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { username, password, displayName, role } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis." });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    if (!/^[a-zA-Z0-9._@-]{2,64}$/.test(cleanUsername)) {
      res.status(400).json({ error: "Format de nom d'utilisateur invalide." });
      return;
    }

    const pwdError = validatePasswordStrength(cleanUsername, password);
    if (pwdError) {
      res.status(400).json({ error: pwdError });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      res.status(409).json({ error: "Ce nom d'utilisateur existe déjà." });
      return;
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    const validRole = role === 'admin' ? 'admin' : 'user';

    const info = db
      .prepare(`
      INSERT INTO users (username, password_hash, role, display_name, auth_provider)
      VALUES (?, ?, ?, ?, 'local')
    `)
      .run(cleanUsername, passwordHash, validRole, displayName || username);

    res.status(201).json({
      success: true,
      message: `Utilisateur "${username}" créé avec succès.`,
      user: {
        id: Number(info.lastInsertRowid),
        username: cleanUsername,
        role: validRole,
        displayName: displayName || username,
      },
    });
  } catch (err: any) {
    serverError(res, err, 'AuthAdminCreateUser');
  }
});

/**
 * Connexion d'un utilisateur (Locale OU via LDAP/LLDAP)
 */
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Identifiants manquants.' });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    let userRow = db
      .prepare('SELECT * FROM users WHERE lower(username) = ?')
      .get(cleanUsername) as any;

    let authenticatedViaLdap = false;

    // 1. Essayer l'authentification LDAP si activée
    if (LdapService.isEnabled()) {
      const ldapProfile = await LdapService.authenticate(cleanUsername, String(password));
      if (ldapProfile) {
        authenticatedViaLdap = true;
        if (!userRow) {
          // Créer automatiquement l'utilisateur LDAP dans Frame (toujours 'user' sauf si aucun user en base)
          const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
          const role = countRow.count === 0 ? 'admin' : 'user';
          const dummyHash = await bcrypt.hash(`ldap_${Date.now()}_${Math.random()}`, 10);

          const info = db
            .prepare(`
            INSERT INTO users (username, password_hash, role, display_name, auth_provider)
            VALUES (?, ?, ?, ?, 'ldap')
          `)
            .run(ldapProfile.username, dummyHash, role, ldapProfile.displayName);

          userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        }
      }
    }

    // 2. Sinon, vérifier le mot de passe local
    if (!authenticatedViaLdap) {
      if (!userRow) {
        logger.warn('Auth', 'Tentative de connexion échouée (utilisateur inconnu)', {
          username: cleanUsername,
          ip: req.ip,
        });
        res.status(401).json({ error: 'Identifiants invalides.' });
        return;
      }

      const validPassword = await bcrypt.compare(String(password), userRow.password_hash);
      if (!validPassword) {
        logger.warn('Auth', 'Tentative de connexion échouée (mot de passe incorrect)', {
          username: cleanUsername,
          ip: req.ip,
        });
        res.status(401).json({ error: 'Identifiants invalides.' });
        return;
      }
    }

    const authUser = {
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      displayName: userRow.display_name,
      avatarUrl: userRow.avatar_url,
      authProvider: userRow.auth_provider || 'local',
      simklConnected: Boolean(userRow.simkl_token),
      simklClientId: userRow.simkl_client_id || '',
      simklLastSyncAt: userRow.simkl_last_sync_at || null,
      simklLastSyncStatus: userRow.simkl_last_sync_status || null,
      simklLastSyncError: userRow.simkl_last_sync_error || null,
      simklAutoSync: userRow.simkl_auto_sync !== 0,
      jellyfinConnected: Boolean(userRow.jellyfin_token),
      jellyfinServerUrl: userRow.jellyfin_server_url || '',
      seerUserId: userRow.seer_user_id || null,
      prefIncludeMovies: userRow.pref_include_movies !== 0,
      prefIncludeTv: userRow.pref_include_tv !== 0,
      prefIncludeAnime: userRow.pref_include_anime === 1,
      createdAt: userRow.created_at,
    };

    const token = generateToken(
      {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        displayName: userRow.display_name,
      },
      undefined,
      'password'
    );

    res.clearCookie('frame_sso_logout', { path: '/' });
    res.cookie('frame_token', token, getCookieOpts(req));

    res.json({
      user: authUser,
      token,
      simklConnected: Boolean(userRow.simkl_token),
      jellyfinConnected: Boolean(userRow.jellyfin_token),
    });
  } catch (err: any) {
    serverError(res, err, 'AuthLogin');
  }
});

/**
 * Obtenir le profil de l'utilisateur courant
 */
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRow = db
      .prepare(
        `SELECT id, username, role, display_name, avatar_url, auth_provider,
                simkl_token, simkl_client_id, simkl_last_sync_at, simkl_last_sync_status, simkl_last_sync_error, simkl_auto_sync,
                jellyfin_token, jellyfin_server_url, seer_user_id,
                pref_include_movies, pref_include_tv, pref_include_anime, created_at
         FROM users WHERE id = ?`
      )
      .get(req.user!.id) as any;

    if (!userRow) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    const freshToken = generateToken(
      {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        displayName: userRow.display_name,
      },
      req.ssoCookieHash,
      req.authSource
    );
    res.cookie('frame_token', freshToken, getCookieOpts(req));

    res.json({
      id: userRow.id,
      username: userRow.username,
      role: userRow.role,
      displayName: userRow.display_name,
      avatarUrl: userRow.avatar_url,
      authProvider: userRow.auth_provider || 'local',
      simklConnected: Boolean(userRow.simkl_token),
      simklClientId: userRow.simkl_client_id || '',
      simklLastSyncAt: userRow.simkl_last_sync_at || null,
      simklLastSyncStatus: userRow.simkl_last_sync_status || null,
      simklLastSyncError: userRow.simkl_last_sync_error || null,
      simklAutoSync: userRow.simkl_auto_sync !== 0,
      jellyfinConnected: Boolean(userRow.jellyfin_token),
      jellyfinServerUrl: userRow.jellyfin_server_url || '',
      seerUserId: userRow.seer_user_id || null,
      prefIncludeMovies: userRow.pref_include_movies !== 0,
      prefIncludeTv: userRow.pref_include_tv !== 0,
      prefIncludeAnime: userRow.pref_include_anime === 1,
      createdAt: userRow.created_at,
      token: freshToken,
    });
  } catch (err: any) {
    serverError(res, err, 'AuthMe');
  }
});

/**
 * Mettre à jour les préférences de contenu de l'utilisateur (Films, Séries, Mangas/Animés)
 */
router.put('/preferences', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prefIncludeMovies, prefIncludeTv, prefIncludeAnime } = req.body;

    db.prepare(`
      UPDATE users 
      SET pref_include_movies = ?, pref_include_tv = ?, pref_include_anime = ?
      WHERE id = ?
    `).run(
      prefIncludeMovies !== false ? 1 : 0,
      prefIncludeTv !== false ? 1 : 0,
      prefIncludeAnime === true ? 1 : 0,
      req.user!.id
    );

    res.json({
      success: true,
      message: 'Préférences de contenu mises à jour avec succès.',
    });
  } catch (err: any) {
    serverError(res, err, 'AuthPreferences');
  }
});

/**
 * Déconnexion : supprime la session Frame et suspend la reconnexion SSO automatique
 * (l'utilisateur peut alors choisir de continuer avec son compte SSO ou se connecter avec un autre compte)
 */
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('frame_token', { path: '/' });
  res.cookie('frame_sso_logout', '1', {
    ...getCookieOpts(req),
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ success: true });
});

export default router;
