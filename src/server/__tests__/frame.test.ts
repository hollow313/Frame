import { describe, it, expect, beforeEach } from 'vitest';
import { ensureJwtSecret, setSetting, getAllSettingsMasked } from '../services/settingsService.js';
import { assertSafeTarget } from '../services/urlGuard.js';
import { escapeLdapFilter } from '../services/ldapService.js';
import { containsCjk, normalizeIsoDate } from '../utils/validate.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { db, initDatabase } from '../db/index.js';
import { generateToken, extractUser } from '../middleware/auth.js';
import { ssoMiddleware } from '../middleware/sso.js';

initDatabase();

describe('Security Audit Fixes (AUDIT-SECURITE-FRAME)', () => {
  it('F-01: ensureJwtSecret generates a strong random secret (>= 48 chars) and never uses hardcoded default', () => {
    const secret = ensureJwtSecret();
    expect(secret).toBeTruthy();
    expect(secret.length).toBeGreaterThanOrEqual(48);
    expect(secret).not.toBe('frame-super-secret-jwt-key-change-in-production');
  });

  it('F-02: urlGuard blocks loopback (127.0.0.1) and cloud metadata (169.254.169.254) unless allowlisted', async () => {
    setSetting('INTERNAL_HOSTS_ALLOWLIST', '');
    setSetting('JELLYFIN_URL', '');
    await expect(assertSafeTarget('http://127.0.0.1:8096/System/Info/Public')).rejects.toThrow();
    await expect(assertSafeTarget('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(assertSafeTarget('file:///etc/passwd')).rejects.toThrow();
  });

  it('F-05: extractUser verifies DB existence and real-time role on every request', () => {
    db.prepare("DELETE FROM users WHERE username = 'temp_sec_user'").run();
    const res = db
      .prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES ('temp_sec_user', 'dummy_hash', 'Temp', 'admin')")
      .run();
    const userId = Number(res.lastInsertRowid);

    const token = generateToken({ id: userId, username: 'temp_sec_user', role: 'admin' });
    const fakeReq: any = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };

    const extracted1 = extractUser(fakeReq);
    expect(extracted1?.id).toBe(userId);
    expect(extracted1?.role).toBe('admin');

    // Demote user in DB -> extractUser must immediately reflect 'user' role despite JWT payload saying 'admin'
    db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(userId);
    const extracted2 = extractUser(fakeReq);
    expect(extracted2?.role).toBe('user');

    // Delete user in DB -> extractUser must return null (401)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    const extracted3 = extractUser(fakeReq);
    expect(extracted3).toBeNull();
  });

  it('F-07: SSO middleware ignores Remote-User header when SSO_TRUSTED_PROXIES is empty and never auto-assigns admin', () => {
    setSetting('SSO_ENABLED', 'true');
    setSetting('SSO_HEADER', 'Remote-User');
    setSetting('SSO_TRUSTED_PROXIES', '');

    const reqUntrusted: any = {
      headers: { 'remote-user': 'hacker_admin' },
      socket: { remoteAddress: '10.10.10.5' },
    };
    ssoMiddleware(reqUntrusted, {} as any, () => {});
    expect(reqUntrusted.user).toBeUndefined();

    // Now trust 10.10.10.0/24
    setSetting('SSO_TRUSTED_PROXIES', '10.10.10.0/24');
    const reqTrusted: any = {
      headers: { 'remote-user': 'sso_alice' },
      socket: { remoteAddress: '10.10.10.5' },
    };
    ssoMiddleware(reqTrusted, {} as any, () => {});
    expect(reqTrusted.user).toBeDefined();
    expect(reqTrusted.user.username).toBe('sso_alice');
    expect(reqTrusted.user.role).toBe('user');

    db.prepare("DELETE FROM users WHERE username = 'sso_alice'").run();
    setSetting('SSO_ENABLED', 'false');
  });

  it('F-08: escapeLdapFilter escapes RFC 4515 injection characters (*, (, ), \\, NUL)', () => {
    const malicious = 'admin*)(|(uid=*';
    const escaped = escapeLdapFilter(malicious);
    expect(escaped).toBe('admin\\2a\\29\\28|\\28uid=\\2a');
    expect(escaped).not.toContain('*');
    expect(escaped).not.toContain('(');
    expect(escaped).not.toContain(')');
  });

  it('F-09: getAllSettingsMasked never leaks prefix/suffix characters of secret keys', () => {
    setSetting('TMDB_API_KEY', 'super_secret_tmdb_key_123456');
    const masked = getAllSettingsMasked();
    expect(masked.TMDB_API_KEY.configured).toBe(true);
    expect(masked.TMDB_API_KEY.value).toBeUndefined();
  });

  it('F-10: AES-256-GCM transparent encryption round-trips when FRAME_ENCRYPTION_KEY is set', () => {
    const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.FRAME_ENCRYPTION_KEY = keyHex;
    const cipher = encryptSecret('my-secret-token');
    expect(cipher.startsWith('v1:')).toBe(true);
    expect(decryptSecret(cipher)).toBe('my-secret-token');
    delete process.env.FRAME_ENCRYPTION_KEY;
  });
});

describe('Roadmap & Functional Fixes (ROADMAP-AMELIORATIONS-FRAME)', () => {
  let testUserId: number;

  beforeEach(() => {
    db.prepare("DELETE FROM users WHERE username = 'roadmap_tester'").run();
    const res = db
      .prepare("INSERT INTO users (username, password_hash, display_name, role) VALUES ('roadmap_tester', 'dummy_hash', 'Tester', 'user')")
      .run();
    testUserId = Number(res.lastInsertRowid);
  });

  it('U-01: Episode-by-episode tracking stores individual episodes and computes next episode', () => {
    const nowIso = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO watched_items (user_id, tmdb_id, media_type, season_number, episode_number, title, watched_at)
      VALUES (?, ?, 'tv', ?, ?, ?, ?)
    `);
    stmt.run(testUserId, 1399, 1, 1, 'Game of Thrones', nowIso);
    stmt.run(testUserId, 1399, 1, 2, 'Game of Thrones', nowIso);

    const eps = db
      .prepare(
        `SELECT season_number, episode_number FROM watched_items
         WHERE user_id = ? AND tmdb_id = ? AND media_type = 'tv' AND season_number > 0
         ORDER BY season_number ASC, episode_number ASC`
      )
      .all(testUserId, 1399) as Array<{ season_number: number; episode_number: number }>;

    expect(eps.length).toBe(2);
    expect(eps[1]).toEqual({ season_number: 1, episode_number: 2 });

    // Unmark S01E02
    db.prepare(
      `DELETE FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND media_type = 'tv' AND season_number = 1 AND episode_number = 2`
    ).run(testUserId, 1399);

    const remaining = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM watched_items WHERE user_id = ? AND tmdb_id = ? AND season_number > 0`
      )
      .get(testUserId, 1399) as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });

  it('U-02: Manga items are stored with media_type = manga and separated from tv', () => {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO watched_items (user_id, tmdb_id, media_type, season_number, episode_number, title, genres, watched_at)
      VALUES (?, ?, 'manga', 0, 0, 'Berserk', '[{"id":16,"name":"Animation"}]', ?)
    `).run(testUserId, 55555, nowIso);

    db.prepare(`
      INSERT INTO watched_items (user_id, tmdb_id, media_type, season_number, episode_number, title, genres, watched_at)
      VALUES (?, ?, 'tv', 0, 0, 'Severance', '[{"id":18,"name":"Drame"}]', ?)
    `).run(testUserId, 95396, nowIso);

    const mangas = db
      .prepare(`SELECT * FROM watched_items WHERE user_id = ? AND media_type = 'manga'`)
      .all(testUserId);
    const tvOnly = db
      .prepare(`SELECT * FROM watched_items WHERE user_id = ? AND media_type = 'tv' AND genres NOT LIKE '%"id":16%'`)
      .all(testUserId);

    expect(mangas.length).toBe(1);
    expect(tvOnly.length).toBe(1);
  });

  it('U-03: normalizeIsoDate converts dates to ISO-8601 UTC and preserves chronological sorting', () => {
    const d1 = normalizeIsoDate('2025-11-03 14:20:00');
    const d2 = normalizeIsoDate('2026-02-15T10:00:00.000Z');
    expect(d1).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(d2).toBe('2026-02-15T10:00:00.000Z');
    expect(d2 > d1).toBe(true);
  });

  it('U-05: containsCjk accurately detects Japanese/Chinese/Korean characters vs Latin titles', () => {
    expect(containsCjk('進撃の巨人')).toBe(true);
    expect(containsCjk('呪術廻戦')).toBe(true);
    expect(containsCjk('オッドタクシー')).toBe(true);
    expect(containsCjk("L'Attaque des Titans")).toBe(false);
    expect(containsCjk('Jujutsu Kaisen')).toBe(false);
  });
});
