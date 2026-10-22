import { Client } from 'ldapts';
import { getSetting } from './settingsService.js';

export interface LDAPUserInfo {
  username: string;
  displayName: string;
  email?: string;
}

export class LDAPService {
  public static isEnabled(): boolean {
    return getSetting('LDAP_ENABLED') === 'true';
  }

  private static getClient(): Client {
    const url = getSetting('LDAP_URL');
    if (!url) {
      throw new Error('URL du serveur LDAP / LLDAP non configurée.');
    }
    return new Client({
      url,
      timeout: 5000,
      connectTimeout: 5000,
    });
  }

  /**
   * Tester la connexion LDAP
   */
  public static async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isEnabled()) {
      return { success: false, message: 'LDAP désactivé' };
    }

    const client = this.getClient();
    const bindDn = getSetting('LDAP_BIND_DN');
    const bindPassword = getSetting('LDAP_BIND_PASSWORD');

    try {
      if (bindDn && bindPassword) {
        await client.bind(bindDn, bindPassword);
      } else {
        await client.bind(); // Anonymous
      }
      return { success: true, message: 'Connexion LDAP / LLDAP réussie !' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Échec de connexion LDAP' };
    } finally {
      try {
        await client.unbind();
      } catch {}
    }
  }

  /**
   * Authentifier un utilisateur via LDAP / LLDAP
   */
  public static async authenticate(username: string, password: string): Promise<LDAPUserInfo | null> {
    if (!this.isEnabled() || !username || !password) {
      return null;
    }

    const client = this.getClient();
    const bindDn = getSetting('LDAP_BIND_DN');
    const bindPassword = getSetting('LDAP_BIND_PASSWORD');
    const baseDn = getSetting('LDAP_BASE_DN');
    let filterTemplate = getSetting('LDAP_SEARCH_FILTER') || '(&(objectClass=person)(|(uid={{username}})(mail={{username}})))';
    const filter = filterTemplate.replace(/\{\{username\}\}/g, username.trim());

    try {
      // 1. Liaison admin pour rechercher l'utilisateur
      if (bindDn && bindPassword) {
        await client.bind(bindDn, bindPassword);
      } else {
        await client.bind();
      }

      // 2. Recherche du compte utilisateur
      const searchRes = await client.search(baseDn, {
        scope: 'sub',
        filter,
        attributes: ['dn', 'cn', 'displayName', 'mail', 'uid'],
      });

      if (!searchRes.searchEntries || searchRes.searchEntries.length === 0) {
        return null;
      }

      const userEntry = searchRes.searchEntries[0];
      const userDn = userEntry.dn;

      // 3. Liaison avec le DN utilisateur et son mot de passe
      const userClient = this.getClient();
      try {
        await userClient.bind(userDn, password);
        await userClient.unbind();

        const displayName = (userEntry.displayName || userEntry.cn || username) as string;
        const email = userEntry.mail as string | undefined;

        return {
          username: (userEntry.uid || username) as string,
          displayName,
          email,
        };
      } catch (bindErr) {
        // Mauvais mot de passe
        return null;
      }
    } catch (err) {
      console.error('[LDAP] Erreur d\'authentification:', err);
      return null;
    } finally {
      try {
        await client.unbind();
      } catch {}
    }
  }
}
