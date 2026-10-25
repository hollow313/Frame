import { Client } from 'ldapts';
import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import { getSetting } from './settingsService.js';
import { logger } from '../utils/logger.js';

export interface LdapUserProfile {
  username: string;
  displayName: string;
  email?: string;
}

/**
 * Échappe les caractères spéciaux dans un filtre LDAP selon la RFC 4515 (F-08)
 */
export function escapeLdapFilter(value: string): string {
  return value.replace(/[\\*()\0]/g, (ch) => '\\' + ch.charCodeAt(0).toString(16).padStart(2, '0'));
}

export class LdapService {
  /**
   * Vérifier si l'authentification LDAP / LLDAP est activée
   */
  public static isEnabled(): boolean {
    return getSetting('LDAP_ENABLED') === 'true' && Boolean(getSetting('LDAP_URL'));
  }

  /**
   * Tester la connexion au serveur LDAP (ex: LLDAP) avec le compte Bind DN et synchroniser les membres du groupe
   */
  public static async testConnection(): Promise<{ success: boolean; message: string }> {
    const url = getSetting('LDAP_URL');
    const bindDn = getSetting('LDAP_BIND_DN');
    const bindPass = getSetting('LDAP_BIND_PASSWORD');
    const baseDn = getSetting('LDAP_BASE_DN');

    if (!url || !baseDn) {
      return { success: false, message: 'URL LDAP ou Base DN manquant.' };
    }

    if (!bindDn || !bindPass) {
      return { success: false, message: 'Bind DN et mot de passe Bind requis (bind anonyme interdit).' };
    }

    const client = new Client({
      url,
      timeout: 5000,
      connectTimeout: 5000,
    });

    try {
      await client.bind(bindDn, bindPass);
      await client.unbind();
      const syncRes = await this.syncUsersFromLdap();
      return {
        success: true,
        message: `Connexion LDAP / LLDAP réussie ! (${syncRes.totalLdapUsers} utilisateur(s) trouvé(s) dans le filtre, ${syncRes.importedCount} nouveau(x) importé(s))`,
      };
    } catch (err: any) {
      logger.warn('LDAP', 'Échec du test de connexion LDAP', { error: err?.message });
      return { success: false, message: 'Échec de connexion au serveur LDAP. Vérifiez vos paramètres.' };
    }
  }

  /**
   * Récupérer tous les utilisateurs LDAP correspondant au filtre configuré (ex: membres du groupe Frame sur LLDAP)
   * et les créer automatiquement dans la base SQLite de Frame sans avoir besoin de les créer manuellement.
   */
  public static async syncUsersFromLdap(): Promise<{
    totalLdapUsers: number;
    importedCount: number;
    users: LdapUserProfile[];
    error?: string;
  }> {
    if (!this.isEnabled()) {
      return { totalLdapUsers: 0, importedCount: 0, users: [] };
    }

    const url = getSetting('LDAP_URL');
    const bindDn = getSetting('LDAP_BIND_DN');
    const bindPass = getSetting('LDAP_BIND_PASSWORD');
    const baseDn = getSetting('LDAP_BASE_DN');
    const filterTemplate =
      getSetting('LDAP_SEARCH_FILTER') ||
      '(&(objectClass=person)(|(uid={{username}})(cn={{username}})(mail={{username}})))';

    if (!url || !baseDn || !bindDn || !bindPass) {
      return {
        totalLdapUsers: 0,
        importedCount: 0,
        users: [],
        error: !bindPass
          ? 'Mot de passe Bind LDAP non enregistré dans Paramètres → Sécurité & Authentification.'
          : 'Configuration LDAP incomplète (URL, Base DN ou Bind DN manquant).',
      };
    }

    const client = new Client({
      url,
      timeout: 6000,
      connectTimeout: 6000,
    });

    try {
      await client.bind(bindDn, bindPass);

      // Si le filtre contient {{username}}, on le remplace par * pour lister tous les utilisateurs éligibles.
      // S'il ne contient pas {{username}} (ex: (&(objectClass=person)(memberOf=cn=Frame,ou=groups,...))), on l'utilise tel quel.
      const listFilter = filterTemplate.includes('{{username}}')
        ? filterTemplate.replace(/\{\{username\}\}/g, '*')
        : filterTemplate;

      const userAttributes = ['uid', 'user_id', 'sAMAccountName', 'cn', 'displayName', 'mail', 'memberOf', 'isMemberOf'];
      let matchedEntries: any[] = [];

      // 1. Recherche directe avec le filtre configuré sur baseDn et ou=people,baseDn
      const candidateBases = baseDn.toLowerCase().startsWith('ou=')
        ? [baseDn]
        : [baseDn, `ou=people,${baseDn}`, `ou=users,${baseDn}`];

      for (const searchBase of candidateBases) {
        try {
          const { searchEntries } = await client.search(searchBase, {
            scope: 'sub',
            filter: listFilter,
            attributes: userAttributes,
          });
          if (searchEntries && searchEntries.length > 0) {
            matchedEntries.push(...searchEntries);
            break;
          }
        } catch {
          // Continuer vers la base suivante
        }
      }

      // 2. Fallback LLDAP / OpenLDAP : si le filtre porte sur un groupe (ex: memberOf=cn=Frame,ou=groups,...)
      // et que la recherche directe n'a rien renvoyé (ex: casse du groupe cn=frame vs cn=Frame ou overlay memberOf),
      // on récupère les membres du groupe et les utilisateurs pour filtrer de manière insensible à la casse.
      const memberOfMatch = /memberOf=([^)]+)/i.exec(filterTemplate);
      if (matchedEntries.length === 0 && memberOfMatch) {
        const targetGroupDn = memberOfMatch[1].trim().toLowerCase();
        const cnMatch = /cn=([^,)]+)/i.exec(targetGroupDn);
        const targetGroupCn = cnMatch ? cnMatch[1].trim().toLowerCase() : '';

        // 2a. Chercher les membres déclarés dans l'entrée du groupe (ou=groups)
        const groupMemberDns = new Set<string>();
        const groupMemberUids = new Set<string>();
        const groupBases = baseDn.toLowerCase().startsWith('ou=')
          ? [baseDn]
          : [`ou=groups,${baseDn}`, baseDn];

        for (const gBase of groupBases) {
          try {
            const { searchEntries: groupEntries } = await client.search(gBase, {
              scope: 'sub',
              filter: targetGroupCn ? `(cn=${escapeLdapFilter(targetGroupCn)})` : '(objectClass=*)',
              attributes: ['cn', 'member', 'uniqueMember', 'memberUid'],
            });
            for (const gEntry of groupEntries) {
              const gCnRaw = gEntry.cn;
              const gCn = (Array.isArray(gCnRaw) ? String(gCnRaw[0]) : String(gCnRaw || '')).trim().toLowerCase();
              const gDn = String(gEntry.dn || '').trim().toLowerCase();
              if (
                (targetGroupCn && gCn === targetGroupCn) ||
                (targetGroupDn && gDn === targetGroupDn)
              ) {
                const rawMembers = [
                  ...(Array.isArray(gEntry.member) ? gEntry.member : gEntry.member ? [gEntry.member] : []),
                  ...(Array.isArray(gEntry.uniqueMember) ? gEntry.uniqueMember : gEntry.uniqueMember ? [gEntry.uniqueMember] : []),
                  ...(Array.isArray(gEntry.memberUid) ? gEntry.memberUid : gEntry.memberUid ? [gEntry.memberUid] : []),
                ];
                for (const m of rawMembers) {
                  const mStr = String(m).trim().toLowerCase();
                  if (!mStr) continue;
                  groupMemberDns.add(mStr);
                  const mUidMatch = /^(?:uid|cn)=([^,]+)/i.exec(mStr);
                  if (mUidMatch) {
                    groupMemberUids.add(mUidMatch[1].trim().toLowerCase());
                  } else if (!mStr.includes('=')) {
                    groupMemberUids.add(mStr);
                  }
                }
              }
            }
          } catch {
            // Ignorer
          }
        }

        // 2b. Parcourir tous les utilisateurs (ou=people / baseDn) et filtrer ceux appartenant au groupe
        for (const searchBase of candidateBases) {
          try {
            const { searchEntries: allUsers } = await client.search(searchBase, {
              scope: 'sub',
              filter: '(objectClass=person)',
              attributes: userAttributes,
            });
            for (const uEntry of allUsers) {
              const entryDn = String(uEntry.dn || '').trim().toLowerCase();
              const dnUidMatch = /^(?:uid|cn)=([^,]+)/i.exec(entryDn);
              const entryUid = (
                (Array.isArray(uEntry.uid) ? uEntry.uid[0] : uEntry.uid) ||
                (dnUidMatch ? dnUidMatch[1] : '') ||
                ''
              )
                .toString()
                .trim()
                .toLowerCase();

              const rawMemberOf = uEntry.memberOf || uEntry.isMemberOf;
              const memberOfList = (
                Array.isArray(rawMemberOf)
                  ? rawMemberOf
                  : rawMemberOf
                  ? [rawMemberOf]
                  : []
              ).map((x) => String(x).trim().toLowerCase());

              const matchesMemberOf = memberOfList.some(
                (m) =>
                  m === targetGroupDn ||
                  (targetGroupCn && m.includes(`cn=${targetGroupCn},`)) ||
                  (targetGroupCn && m === targetGroupCn)
              );
              const matchesGroupList =
                (entryDn && groupMemberDns.has(entryDn)) ||
                (entryUid && groupMemberUids.has(entryUid));

              if (matchesMemberOf || matchesGroupList) {
                matchedEntries.push(uEntry);
              }
            }
            if (matchedEntries.length > 0) break;
          } catch {
            // Continuer
          }
        }
      }

      await client.unbind();

      const profiles: LdapUserProfile[] = [];
      const seenUsernames = new Set<string>();
      let importedCount = 0;

      for (const entry of matchedEntries) {
        // Extraire l'identifiant (uid) depuis entry.uid, ou depuis le DN (ex: uid=alex,ou=people,dc=...), ou entry.cn
        const dnUidMatch = /^(?:uid|cn)=([^,]+)/i.exec(String(entry.dn || ''));
        const rawUid =
          entry.uid ||
          entry.user_id ||
          entry.sAMAccountName ||
          (dnUidMatch ? dnUidMatch[1] : undefined) ||
          entry.cn;
        if (!rawUid) continue;
        const uidStr = (Array.isArray(rawUid) ? String(rawUid[0]) : String(rawUid)).trim().toLowerCase();
        if (!uidStr || !/^[a-zA-Z0-9._@-]{1,64}$/.test(uidStr) || seenUsernames.has(uidStr)) continue;
        seenUsernames.add(uidStr);

        const rawDisplay = entry.displayName || entry.cn || uidStr;
        const displayName = Array.isArray(rawDisplay) ? String(rawDisplay[0]) : String(rawDisplay);
        const rawMail = entry.mail;
        const email = rawMail ? (Array.isArray(rawMail) ? String(rawMail[0]) : String(rawMail)) : undefined;

        profiles.push({ username: uidStr, displayName, email });

        const existing = db
          .prepare('SELECT id, display_name, auth_provider FROM users WHERE lower(username) = lower(?)')
          .get(uidStr) as { id: number; display_name?: string; auth_provider?: string } | undefined;

        if (!existing) {
          const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
          const role = countRow.count === 0 ? 'admin' : 'user';
          const dummyHash = bcrypt.hashSync(`ldap_sync_${Date.now()}_${Math.random()}`, 10);

          db.prepare(
            `INSERT INTO users (username, password_hash, role, display_name, auth_provider)
             VALUES (?, ?, ?, ?, 'ldap')`
          ).run(uidStr, dummyHash, role, displayName);
          importedCount++;
        } else {
          if (!existing.display_name && displayName) {
            db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, existing.id);
          }
          if (existing.auth_provider !== 'ldap') {
            db.prepare("UPDATE users SET auth_provider = 'ldap' WHERE id = ?").run(existing.id);
          }
        }
      }

      if (importedCount > 0) {
        logger.info('LDAP', `${importedCount} nouvel(s) utilisateur(s) importé(s) automatiquement depuis le groupe LDAP`);
      }

      return {
        totalLdapUsers: profiles.length,
        importedCount,
        users: profiles,
      };
    } catch (err: any) {
      try {
        await client.unbind();
      } catch {
        // Ignorer
      }
      logger.warn('LDAP', 'Impossible de synchroniser la liste des utilisateurs LDAP', { error: err?.message });
      return {
        totalLdapUsers: 0,
        importedCount: 0,
        users: [],
        error: err?.message || 'Erreur de connexion au serveur LDAP.',
      };
    }
  }

  /**
   * Authentifier un utilisateur via LDAP / LLDAP (F-08)
   */
  public static async authenticate(username: string, password: string): Promise<LdapUserProfile | null> {
    if (!this.isEnabled() || !username || !password || !password.trim()) {
      return null;
    }

    const cleanUsername = username.trim();
    if (!/^[a-zA-Z0-9._@-]{1,64}$/.test(cleanUsername)) {
      logger.warn('LDAP', "Format de nom d'utilisateur LDAP invalide refusé", { username: cleanUsername });
      return null;
    }

    const url = getSetting('LDAP_URL');
    const bindDn = getSetting('LDAP_BIND_DN');
    const bindPass = getSetting('LDAP_BIND_PASSWORD');
    const baseDn = getSetting('LDAP_BASE_DN');
    const filterTemplate =
      getSetting('LDAP_SEARCH_FILTER') ||
      '(&(objectClass=person)(|(uid={{username}})(cn={{username}})(mail={{username}})))';

    if (!url || !baseDn || !bindDn || !bindPass) {
      logger.warn('LDAP', 'Configuration LDAP incomplète (Bind DN et mot de passe obligatoires)');
      return null;
    }

    const client = new Client({
      url,
      timeout: 6000,
      connectTimeout: 6000,
    });

    try {
      // 1. Bind administrateur obligatoire (pas de bind anonyme)
      await client.bind(bindDn, bindPass);

      // 2. Rechercher le DN de l'utilisateur avec échappement RFC 4515
      const safeUsername = escapeLdapFilter(cleanUsername);
      const searchFilter = filterTemplate.includes('{{username}}')
        ? filterTemplate.replace(/\{\{username\}\}/g, safeUsername)
        : `(&${filterTemplate}(|(uid=${safeUsername})(cn=${safeUsername})(mail=${safeUsername})))`;
      const { searchEntries } = await client.search(baseDn, {
        scope: 'sub',
        filter: searchFilter,
        attributes: ['dn', 'uid', 'cn', 'displayName', 'mail'],
      });

      if (searchEntries.length !== 1) {
        await client.unbind();
        return null;
      }

      const entry = searchEntries[0];
      const userDn = entry.dn;
      if (!userDn) {
        await client.unbind();
        return null;
      }

      // 3. Tester le bind avec le DN de l'utilisateur et son mot de passe non vide
      await client.bind(userDn, password);
      await client.unbind();

      const displayName = (entry.displayName || entry.cn || entry.uid || cleanUsername) as string;
      const email = (entry.mail || undefined) as string | undefined;

      return {
        username: ((entry.uid as string) || cleanUsername).toLowerCase(),
        displayName: Array.isArray(displayName) ? displayName[0] : displayName,
        email: Array.isArray(email) ? email[0] : email,
      };
    } catch (err: any) {
      try {
        await client.unbind();
      } catch {
        // Ignorer
      }
      logger.warn('LDAP', 'Échec authentification utilisateur LDAP', { username: cleanUsername });
      return null;
    }
  }
}
