import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authenticateToken, requireAdmin, AuthenticatedRequest, generateToken } from '../middleware/auth.js';
import { getSetting } from '../services/settingsService.js';
import { LDAPService } from '../services/ldapService.js';

const router = Router();

// Statut d'initialisation et méthodes de connexion disponibles
router.get('/status', (req: AuthenticatedRequest, res) => {
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const count = (stmt.get() as { count: number }).count;
    const initialized = count > 0;
    const allowRegistration = !initialized || getSetting('ALLOW_REGISTRATION') === 'true';
    const ldapEnabled = getSetting('LDAP_ENABLED') === 'true';
    const ssoEnabled = getSetting('SSO_ENABLED') === 'true';

    // Si authentifié via SSO middleware
    const ssoUser = req.user ? {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      displayName: req.user.displayName,
    } : null;

    res.json({
      initialized,
      allowRegistration,
      ldapEnabled,
      ssoEnabled,
      ssoUser,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Inscription publique (désactivable)
router.post('/register', async (req, res: Response): Promise<void> => {
  try {
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const count = (countStmt.get() as { count: number }).count;
    const isFirstUser = count === 0;

    // Si ce n'est pas le premier utilisateur, vérifier si les inscriptions sont autorisées
    if (!isFirstUser && getSetting('ALLOW_REGISTRATION') !== 'true') {
      res.status(403).json({
        error: "L'inscription libre est désactivée. Un administrateur doit créer votre compte.",
      });
      return;
    }

    const { username, password, displayName } = req.body;

    if (!username || !password || username.trim().length < 3 || password.length < 6) {
      res.status(400).json({ error: 'Le nom d\'utilisateur (min 3 car.) et le mot de passe (min 6 car.) sont requis.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    // Vérifier doublon
    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    if (checkStmt.get(cleanUsername)) {
      res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà utilisé.' });
      return;
    }

    const role = isFirstUser ? 'admin' : 'user';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name, auth_provider)
      VALUES (?, ?, ?, ?, 'local')
    `);

    const result = insertStmt.run(cleanUsername, passwordHash, role, displayName || cleanUsername);
    const userId = Number(result.lastInsertRowid);

    const userObj = {
      id: userId,
      username: cleanUsername,
      role: role as 'admin' | 'user',
      displayName: displayName || cleanUsername,
    };

    const token = generateToken(userObj);

    res.cookie('frame_token', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.status(201).json({
      user: userObj,
      token,
      message: role === 'admin' ? 'Compte administrateur initial créé avec succès !' : 'Compte créé avec succès !',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de l\'inscription.' });
  }
});

// Création d'un utilisateur par l'administrateur
router.post('/admin/create-user', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { username, password, displayName, role } = req.body;

    if (!username || !password || username.trim().length < 3 || password.length < 6) {
      res.status(400).json({ error: 'Nom d\'utilisateur (3+ car.) et mot de passe (6+ car.) requis.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    if (checkStmt.get(cleanUsername)) {
      res.status(409).json({ error: 'Cet identifiant existe déjà.' });
      return;
    }

    const userRole = role === 'admin' ? 'admin' : 'user';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name, auth_provider)
      VALUES (?, ?, ?, ?, 'local')
    `);

    const result = insertStmt.run(cleanUsername, passwordHash, userRole, displayName || cleanUsername);

    res.status(201).json({
      success: true,
      message: `Compte pour « ${cleanUsername} » créé avec succès.`,
      user: {
        id: Number(result.lastInsertRowid),
        username: cleanUsername,
        role: userRole,
        displayName: displayName || cleanUsername,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Connexion (Locale ou LDAP)
router.post('/login', async (req, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    let user = stmt.get(cleanUsername) as any;

    let authenticated = false;

    // 1. Tenter la vérification locale par mot de passe si utilisateur existant
    if (user && user.password_hash !== 'SSO_MANAGED_ACCOUNT') {
      authenticated = await bcrypt.compare(password, user.password_hash);
    }

    // 2. Si échec ou utilisateur non trouvé, tenter via LDAP / LLDAP si activé
    if (!authenticated && LDAPService.isEnabled()) {
      const ldapUser = await LDAPService.authenticate(cleanUsername, password);
      if (ldapUser) {
        authenticated = true;
        if (!user) {
          // Créer le compte utilisateur à la volée depuis LDAP
          const salt = await bcrypt.genSalt(10);
          const dummyHash = await bcrypt.hash(password, salt);
          const insertStmt = db.prepare(`
            INSERT INTO users (username, password_hash, role, display_name, auth_provider)
            VALUES (?, ?, 'user', ?, 'ldap')
          `);
          const insertRes = insertStmt.run(cleanUsername, dummyHash, ldapUser.displayName);
          user = {
            id: Number(insertRes.lastInsertRowid),
            username: cleanUsername,
            role: 'user',
            display_name: ldapUser.displayName,
          };
        }
      }
    }

    if (!authenticated || !user) {
      res.status(401).json({ error: 'Identifiants incorrects.' });
      return;
    }

    const userObj = {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
    };

    const token = generateToken(userObj);

    res.cookie('frame_token', token, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.json({
      user: userObj,
      token,
      simklConnected: Boolean(user.simkl_access_token),
      jellyfinConnected: Boolean(user.jellyfin_access_token),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la connexion.' });
  }
});

// Profil actuel
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stmt = db.prepare('SELECT id, username, role, display_name, avatar_url, auth_provider, simkl_access_token, simkl_client_id, jellyfin_user_id, jellyfin_server_url, pref_include_movies, pref_include_tv, pref_include_anime, created_at FROM users WHERE id = ?');
    const user = stmt.get(req.user!.id) as any;

    if (!user) {
      res.status(404).json({ error: 'Utilisateur introuvable.' });
      return;
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      authProvider: user.auth_provider || 'local',
      simklConnected: Boolean(user.simkl_access_token),
      simklClientId: user.simkl_client_id || null,
      jellyfinConnected: Boolean(user.jellyfin_user_id),
      jellyfinServerUrl: user.jellyfin_server_url || null,
      prefIncludeMovies: user.pref_include_movies !== 0,
      prefIncludeTv: user.pref_include_tv !== 0,
      prefIncludeAnime: user.pref_include_anime === 1,
      createdAt: user.created_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mettre à jour les préférences de contenu de l'utilisateur
router.put('/preferences', authenticateToken, (req: AuthenticatedRequest, res: Response): void => {
  try {
    const userId = req.user!.id;
    const { prefIncludeMovies, prefIncludeTv, prefIncludeAnime } = req.body;

    const stmt = db.prepare(`
      UPDATE users SET
        pref_include_movies = COALESCE(?, pref_include_movies),
        pref_include_tv = COALESCE(?, pref_include_tv),
        pref_include_anime = COALESCE(?, pref_include_anime),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      prefIncludeMovies !== undefined ? (prefIncludeMovies ? 1 : 0) : null,
      prefIncludeTv !== undefined ? (prefIncludeTv ? 1 : 0) : null,
      prefIncludeAnime !== undefined ? (prefIncludeAnime ? 1 : 0) : null,
      userId
    );

    res.json({ success: true, message: 'Préférences de contenu mises à jour !' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Déconnexion
router.post('/logout', (_req, res) => {
  res.clearCookie('frame_token');
  res.json({ success: true, message: 'Déconnecté' });
});

export default router;
