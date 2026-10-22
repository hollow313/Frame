import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { authenticateToken, AuthenticatedRequest, generateToken } from '../middleware/auth.js';

const router = Router();

// Vérifier si le premier compte administrateur a été créé
router.get('/status', (_req, res) => {
  try {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    res.json({ initialized: result.count > 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Inscription
router.post('/register', async (req, res: Response): Promise<void> => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || username.trim().length < 3 || password.length < 6) {
      res.status(400).json({ error: 'Le nom d\'utilisateur (min 3 car.) et le mot de passe (min 6 car.) sont requis.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();

    // Vérifier si un utilisateur avec ce nom existe déjà
    const checkStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    if (checkStmt.get(cleanUsername)) {
      res.status(409).json({ error: 'Ce nom d\'utilisateur est déjà utilisé.' });
      return;
    }

    // Si c'est le tout premier utilisateur, il devient automatiquement administrateur
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM users');
    const count = (countStmt.get() as { count: number }).count;
    const role = count === 0 ? 'admin' : 'user';

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password_hash, role, display_name)
      VALUES (?, ?, ?, ?)
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

// Connexion
router.post('/login', async (req, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
      return;
    }

    const cleanUsername = username.trim().toLowerCase();
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(cleanUsername) as any;

    if (!user) {
      res.status(401).json({ error: 'Identifiants incorrects.' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
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
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur lors de la connexion.' });
  }
});

// Obtenir profil actuel
router.get('/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const stmt = db.prepare('SELECT id, username, role, display_name, avatar_url, simkl_access_token, created_at FROM users WHERE id = ?');
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
      simklConnected: Boolean(user.simkl_access_token),
      createdAt: user.created_at,
    });
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
