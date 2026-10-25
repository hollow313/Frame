import { Client } from 'ldapts';
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
   * Tester la connexion au serveur LDAP (ex: LLDAP) avec le compte Bind DN
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
      return { success: true, message: 'Connexion au serveur LDAP / LLDAP réussie !' };
    } catch (err: any) {
      logger.warn('LDAP', 'Échec du test de connexion LDAP', { error: err?.message });
      return { success: false, message: 'Échec de connexion au serveur LDAP. Vérifiez vos paramètres.' };
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
