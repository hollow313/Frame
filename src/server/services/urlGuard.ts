import dns from 'dns/promises';
import net from 'net';
import { getSetting, SettingKey } from './settingsService.js';

const BLOCKED = new net.BlockList();
BLOCKED.addSubnet('127.0.0.0', 8);
BLOCKED.addSubnet('10.0.0.0', 8);
BLOCKED.addSubnet('172.16.0.0', 12);
BLOCKED.addSubnet('192.168.0.0', 16);
BLOCKED.addSubnet('169.254.0.0', 16); // Link-local & Cloud metadata (169.254.169.254)
BLOCKED.addSubnet('0.0.0.0', 8);
BLOCKED.addAddress('::1', 'ipv6');
BLOCKED.addSubnet('fc00::', 7, 'ipv6');
BLOCKED.addSubnet('fe80::', 10, 'ipv6');

// Always block cloud metadata & loopback unless explicitly listed in INTERNAL_HOSTS_ALLOWLIST
const STRICT_BLOCKED = new net.BlockList();
STRICT_BLOCKED.addSubnet('127.0.0.0', 8);
STRICT_BLOCKED.addSubnet('169.254.0.0', 16);
STRICT_BLOCKED.addSubnet('0.0.0.0', 8);
STRICT_BLOCKED.addAddress('::1', 'ipv6');

function getConfiguredTrustedHosts(): Set<string> {
  const hosts = new Set<string>();
  const rawAllowlist = process.env.INTERNAL_HOSTS_ALLOWLIST || getSetting('INTERNAL_HOSTS_ALLOWLIST') || '';
  for (const h of rawAllowlist.split(',')) {
    const trimmed = h.trim().toLowerCase();
    if (trimmed) hosts.add(trimmed);
  }

  // Also trust the hostnames explicitly configured by the administrator in server settings
  const adminUrlKeys: SettingKey[] = ['JELLYFIN_URL', 'SEER_URL', 'SONARR_URL', 'RADARR_URL', 'LDAP_URL'];
  for (const key of adminUrlKeys) {
    const val = getSetting(key);
    if (val) {
      try {
        const u = new URL(val);
        if (u.hostname) hosts.add(u.hostname.toLowerCase());
      } catch {
        // Ignore invalid URL
      }
    }
  }
  return hosts;
}

export async function assertSafeTarget(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('URL invalide');
  }

  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error('Protocole non autorisé (http/https uniquement)');
  }

  const hostname = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const explicitAllow = (process.env.INTERNAL_HOSTS_ALLOWLIST || getSetting('INTERNAL_HOSTS_ALLOWLIST') || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (explicitAllow.includes(hostname)) {
    return u;
  }

  const trustedAdminHosts = getConfiguredTrustedHosts();
  const isAdminConfiguredHost = trustedAdminHosts.has(hostname);

  // If the hostname is already an IP literal, check directly without DNS lookup
  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) {
    const family = ipVersion === 6 ? 'ipv6' : 'ipv4';
    if (STRICT_BLOCKED.check(hostname, family)) {
      throw new Error(`Hôte interne refusé (${hostname}). Ajoutez-le à INTERNAL_HOSTS_ALLOWLIST si légitime.`);
    }
    if (!isAdminConfiguredHost && BLOCKED.check(hostname, family)) {
      throw new Error(`Hôte interne refusé (${hostname}). Ajoutez-le à INTERNAL_HOSTS_ALLOWLIST si légitime.`);
    }
    return u;
  }

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Impossible de résoudre l'hôte (${hostname})`);
  }

  for (const { address, family } of addrs) {
    const fam = family === 6 ? 'ipv6' : 'ipv4';
    if (STRICT_BLOCKED.check(address, fam)) {
      throw new Error(`Hôte interne refusé (${address}). Ajoutez-le à INTERNAL_HOSTS_ALLOWLIST si légitime.`);
    }
    if (!isAdminConfiguredHost && BLOCKED.check(address, fam)) {
      throw new Error(`Hôte interne refusé (${address}). Ajoutez-le à INTERNAL_HOSTS_ALLOWLIST si légitime.`);
    }
  }

  return u;
}
