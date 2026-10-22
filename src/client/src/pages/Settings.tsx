import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Server, 
  Key, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Globe, 
  ShieldCheck, 
  User, 
  Film, 
  Tv,
  Check,
  ExternalLink,
  Shield,
  Layers,
  Lock
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const Settings: React.FC = () => {
  const { user, isAdmin, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'server' | 'auth' | 'user'>(isAdmin ? 'server' : 'user');

  // Form states for Admin Settings
  const [tmdbKey, setTmdbKey] = useState('');
  const [seerUrl, setSeerUrl] = useState('');
  const [seerApiKey, setSeerApiKey] = useState('');
  const [sonarrUrl, setSonarrUrl] = useState('');
  const [sonarrApiKey, setSonarrApiKey] = useState('');
  const [radarrUrl, setRadarrUrl] = useState('');
  const [radarrApiKey, setRadarrApiKey] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('fr-FR');
  const [simklClientId, setSimklClientId] = useState('');
  const [jellyfinUrl, setJellyfinUrl] = useState('');

  // Form states for Admin Auth Settings
  const [allowRegistration, setAllowRegistration] = useState(false);
  const [ldapEnabled, setLdapEnabled] = useState(false);
  const [ldapUrl, setLdapUrl] = useState('');
  const [ldapBaseDn, setLdapBaseDn] = useState('');
  const [ldapBindDn, setLdapBindDn] = useState('');
  const [ldapBindPassword, setLdapBindPassword] = useState('');
  const [ldapSearchFilter, setLdapSearchFilter] = useState('');
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoHeader, setSsoHeader] = useState('Remote-User');

  // Form states for User Simkl
  const [simklPinData, setSimklPinData] = useState<{ user_code: string; verification_url: string } | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);
  const [simklToken, setSimklToken] = useState('');
  const [syncingSimkl, setSyncingSimkl] = useState(false);
  const [simklSyncMessage, setSimklSyncMessage] = useState<string | null>(null);

  // Form states for User Jellyfin
  const [jellyfinUsername, setJellyfinUsername] = useState('');
  const [jellyfinPassword, setJellyfinPassword] = useState('');
  const [syncingJellyfin, setSyncingJellyfin] = useState(false);
  const [jellyfinSyncMessage, setJellyfinSyncMessage] = useState<string | null>(null);

  // Form states for Content Preferences (Movies, TV, Anime/Manga)
  const [prefMovies, setPrefMovies] = useState<boolean>(user?.prefIncludeMovies !== false);
  const [prefTv, setPrefTv] = useState<boolean>(user?.prefIncludeTv !== false);
  const [prefAnime, setPrefAnime] = useState<boolean>(user?.prefIncludeAnime === true);
  const [prefSaved, setPrefSaved] = useState<boolean>(false);

  // Status testing states
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean; success?: boolean; message?: string }>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, [isAdmin]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const s = await api.getSettings();
        if (s.TMDB_API_KEY?.value) setTmdbKey(s.TMDB_API_KEY.value);
        if (s.SEER_URL?.value) setSeerUrl(s.SEER_URL.value);
        if (s.SEER_API_KEY?.value) setSeerApiKey(s.SEER_API_KEY.value);
        if (s.SONARR_URL?.value) setSonarrUrl(s.SONARR_URL.value);
        if (s.SONARR_API_KEY?.value) setSonarrApiKey(s.SONARR_API_KEY.value);
        if (s.RADARR_URL?.value) setRadarrUrl(s.RADARR_URL.value);
        if (s.RADARR_API_KEY?.value) setRadarrApiKey(s.RADARR_API_KEY.value);
        if (s.DEFAULT_LANGUAGE?.value) setDefaultLanguage(s.DEFAULT_LANGUAGE.value);
        if (s.SIMKL_CLIENT_ID?.value) setSimklClientId(s.SIMKL_CLIENT_ID.value);
        if (s.JELLYFIN_URL?.value) setJellyfinUrl(s.JELLYFIN_URL.value);

        setAllowRegistration(s.ALLOW_REGISTRATION?.value === 'true');
        setLdapEnabled(s.LDAP_ENABLED?.value === 'true');
        if (s.LDAP_URL?.value) setLdapUrl(s.LDAP_URL.value);
        if (s.LDAP_BASE_DN?.value) setLdapBaseDn(s.LDAP_BASE_DN.value);
        if (s.LDAP_BIND_DN?.value) setLdapBindDn(s.LDAP_BIND_DN.value);
        if (s.LDAP_BIND_PASSWORD?.value) setLdapBindPassword(s.LDAP_BIND_PASSWORD.value);
        if (s.LDAP_SEARCH_FILTER?.value) setLdapSearchFilter(s.LDAP_SEARCH_FILTER.value);

        setSsoEnabled(s.SSO_ENABLED?.value === 'true');
        if (s.SSO_HEADER?.value) setSsoHeader(s.SSO_HEADER.value);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateSettings({
        TMDB_API_KEY: tmdbKey,
        SEER_URL: seerUrl,
        SEER_API_KEY: seerApiKey,
        SONARR_URL: sonarrUrl,
        SONARR_API_KEY: sonarrApiKey,
        RADARR_URL: radarrUrl,
        RADARR_API_KEY: radarrApiKey,
        DEFAULT_LANGUAGE: defaultLanguage,
        SIMKL_CLIENT_ID: simklClientId,
        JELLYFIN_URL: jellyfinUrl,
        ALLOW_REGISTRATION: allowRegistration ? 'true' : 'false',
        LDAP_ENABLED: ldapEnabled ? 'true' : 'false',
        LDAP_URL: ldapUrl,
        LDAP_BASE_DN: ldapBaseDn,
        LDAP_BIND_DN: ldapBindDn,
        LDAP_BIND_PASSWORD: ldapBindPassword,
        LDAP_SEARCH_FILTER: ldapSearchFilter,
        SSO_ENABLED: ssoEnabled ? 'true' : 'false',
        SSO_HEADER: ssoHeader,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadSettings();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleTestService = async (service: 'tmdb' | 'seer' | 'sonarr' | 'radarr' | 'ldap' | 'jellyfin') => {
    setTestResults((prev) => ({ ...prev, [service]: { loading: true } }));
    try {
      const res = await api.testService(service);
      setTestResults((prev) => ({
        ...prev,
        [service]: { loading: false, success: res.success, message: res.message },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [service]: { loading: false, success: false, message: err.message },
      }));
    }
  };

  // ================= SIMKL PIN FLOW =================
  const handleStartSimklPin = async () => {
    try {
      const pin = await api.getSimklPin();
      setSimklPinData(pin);
    } catch (err: any) {
      alert(err.message || 'Erreur génération PIN Simkl');
    }
  };

  const handleCheckSimklPin = async () => {
    if (!simklPinData) return;
    setCheckingPin(true);
    try {
      const res = await api.checkSimklPin(simklPinData.user_code);
      if (res.authorized) {
        alert(res.message);
        setSimklPinData(null);
        refreshUser();
      } else {
        alert(res.message || 'Le code n\'a pas encore été validé sur Simkl.');
      }
    } catch (err: any) {
      alert(err.message || 'Erreur vérification code');
    } finally {
      setCheckingPin(false);
    }
  };

  const handleSyncSimkl = async () => {
    setSyncingSimkl(true);
    setSimklSyncMessage(null);
    try {
      const res = await api.syncSimkl();
      setSimklSyncMessage(res.message);
    } catch (err: any) {
      setSimklSyncMessage(err.message || 'Erreur synchronisation');
    } finally {
      setSyncingSimkl(false);
    }
  };

  const handleUnlinkSimkl = async () => {
    if (!confirm('Délier votre compte Simkl ?')) return;
    try {
      await api.unlinkSimkl();
      refreshUser();
    } catch (e) {
      console.error(e);
    }
  };

  // ================= JELLYFIN USER FLOW =================
  const handleLinkJellyfin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.linkJellyfin({ username: jellyfinUsername, password: jellyfinPassword });
      alert(res.message);
      setJellyfinPassword('');
      refreshUser();
    } catch (err: any) {
      alert(err.message || 'Erreur connexion Jellyfin');
    }
  };

  const handleSyncJellyfin = async () => {
    setSyncingJellyfin(true);
    setJellyfinSyncMessage(null);
    try {
      const res = await api.syncJellyfin();
      setJellyfinSyncMessage(res.message);
    } catch (err: any) {
      setJellyfinSyncMessage(err.message || 'Erreur synchronisation Jellyfin');
    } finally {
      setSyncingJellyfin(false);
    }
  };

  const handleUnlinkJellyfin = async () => {
    if (!confirm('Délier votre compte Jellyfin ?')) return;
    try {
      await api.unlinkJellyfin();
      refreshUser();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updatePreferences({
        prefIncludeMovies: prefMovies,
        prefIncludeTv: prefTv,
        prefIncludeAnime: prefAnime,
      });
      setPrefSaved(true);
      refreshUser();
      setTimeout(() => setPrefSaved(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Erreur enregistrement préférences');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <SettingsIcon className="w-7 h-7 text-primary-400" />
          <span>Paramètres & Intégrations</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Gérez vos clés d'API, vos comptes externes (Simkl, Jellyfin) et les options de sécurité.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab('server')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'server'
                  ? 'bg-primary-600 text-white shadow-glow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Intégrations Serveur</span>
            </button>
            <button
              onClick={() => setActiveTab('auth')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'auth'
                  ? 'bg-primary-600 text-white shadow-glow'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Sécurité & Authentification</span>
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab('user')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'user'
              ? 'bg-primary-600 text-white shadow-glow'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Mon Profil, Simkl & Jellyfin</span>
        </button>
      </div>

      {/* Admin Server Integrations Tab */}
      {isAdmin && activeTab === 'server' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {saveSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Paramètres enregistrés avec succès !</span>
            </div>
          )}

          {/* TMDB Section */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-600/20 text-primary-400 flex items-center justify-center">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">TheMovieDatabase (TMDB)</h3>
                  <p className="text-xs text-slate-400">Métadonnées, affiches, synopsis français et plateformes de streaming</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTestService('tmdb')}
                disabled={testResults.tmdb?.loading}
                className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 text-xs font-semibold border border-white/5"
              >
                {testResults.tmdb?.loading ? 'Test...' : 'Tester'}
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">Clé API TMDB (v3)</label>
              <input
                type="password"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Ex: 3a2b1c..."
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
              />
            </div>
            {testResults.tmdb && (
              <p className={`text-xs ${testResults.tmdb.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResults.tmdb.message}
              </p>
            )}
          </div>

          {/* Jellyfin Server Section */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Tv className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Serveur Jellyfin (Global)</h3>
                  <p className="text-xs text-slate-400">Suivi exact du statut de visionnage en cours</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTestService('jellyfin')}
                disabled={testResults.jellyfin?.loading}
                className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 text-xs font-semibold border border-white/5"
              >
                {testResults.jellyfin?.loading ? 'Test...' : 'Tester'}
              </button>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">URL du serveur Jellyfin</label>
              <input
                type="text"
                value={jellyfinUrl}
                onChange={(e) => setJellyfinUrl(e.target.value)}
                placeholder="http://serveur:8096"
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
              />
            </div>
            {testResults.jellyfin && (
              <p className={`text-xs ${testResults.jellyfin.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResults.jellyfin.message}
              </p>
            )}
          </div>

          {/* Overseerr / Jellyseerr Section */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-accent-cinema/20 text-accent-cinema flex items-center justify-center">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Overseerr / Jellyseerr ("Seer")</h3>
                  <p className="text-xs text-slate-400">Demandes de médias et statut de disponibilité bidirectionnel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTestService('seer')}
                disabled={testResults.seer?.loading}
                className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 text-xs font-semibold border border-white/5"
              >
                {testResults.seer?.loading ? 'Test...' : 'Tester'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">URL Seer</label>
                <input
                  type="text"
                  value={seerUrl}
                  onChange={(e) => setSeerUrl(e.target.value)}
                  placeholder="http://serveur:5055"
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Clé API Seer</label>
                <input
                  type="password"
                  value={seerApiKey}
                  onChange={(e) => setSeerApiKey(e.target.value)}
                  placeholder="Clé API Seer..."
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            {testResults.seer && (
              <p className={`text-xs ${testResults.seer.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResults.seer.message}
              </p>
            )}
          </div>

          {/* Sonarr & Radarr Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Sonarr (Séries TV)</h3>
                <button
                  type="button"
                  onClick={() => handleTestService('sonarr')}
                  disabled={testResults.sonarr?.loading}
                  className="px-2.5 py-1 rounded bg-dark-850 text-slate-300 text-xs border border-white/5"
                >
                  Tester
                </button>
              </div>
              <input
                type="text"
                value={sonarrUrl}
                onChange={(e) => setSonarrUrl(e.target.value)}
                placeholder="http://serveur:8989"
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
              />
              <input
                type="password"
                value={sonarrApiKey}
                onChange={(e) => setSonarrApiKey(e.target.value)}
                placeholder="Clé API Sonarr..."
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
              />
              {testResults.sonarr && (
                <p className={`text-xs ${testResults.sonarr.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {testResults.sonarr.message}
                </p>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Radarr (Films)</h3>
                <button
                  type="button"
                  onClick={() => handleTestService('radarr')}
                  disabled={testResults.radarr?.loading}
                  className="px-2.5 py-1 rounded bg-dark-850 text-slate-300 text-xs border border-white/5"
                >
                  Tester
                </button>
              </div>
              <input
                type="text"
                value={radarrUrl}
                onChange={(e) => setRadarrUrl(e.target.value)}
                placeholder="http://serveur:7878"
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
              />
              <input
                type="password"
                value={radarrApiKey}
                onChange={(e) => setRadarrApiKey(e.target.value)}
                placeholder="Clé API Radarr..."
                className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 focus:outline-none"
              />
              {testResults.radarr && (
                <p className={`text-xs ${testResults.radarr.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {testResults.radarr.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-glow transition-transform hover:scale-105"
            >
              Enregistrer la configuration
            </button>
          </div>
        </form>
      )}

      {/* Admin Auth & Security Tab (Registration, LDAP, SSO) */}
      {isAdmin && activeTab === 'auth' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          {saveSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Options de sécurité enregistrées avec succès !</span>
            </div>
          )}

          {/* Registration Control */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary-400" />
              <span>Contrôle des Inscriptions</span>
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowRegistration}
                onChange={(e) => setAllowRegistration(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-dark-850 text-primary-600 focus:ring-0"
              />
              <span className="text-xs text-slate-200">
                Autoriser l'inscription libre publique (décoché par défaut : seuls les administrateurs créent les comptes)
              </span>
            </label>
          </div>

          {/* LDAP / LLDAP Configuration */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Authentification LDAP / LLDAP</h3>
              </div>
              <button
                type="button"
                onClick={() => handleTestService('ldap')}
                disabled={testResults.ldap?.loading || !ldapEnabled}
                className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 text-xs font-semibold border border-white/5 disabled:opacity-40"
              >
                {testResults.ldap?.loading ? 'Test...' : 'Tester LDAP'}
              </button>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ldapEnabled}
                onChange={(e) => setLdapEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-dark-850 text-primary-600 focus:ring-0"
              />
              <span className="text-xs text-slate-200 font-semibold">
                Activer la connexion des utilisateurs via LDAP / LLDAP
              </span>
            </label>

            {ldapEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">URL LDAP (avec port)</label>
                  <input
                    type="text"
                    value={ldapUrl}
                    onChange={(e) => setLdapUrl(e.target.value)}
                    placeholder="ldap://serveur:3890"
                    className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Base DN</label>
                  <input
                    type="text"
                    value={ldapBaseDn}
                    onChange={(e) => setLdapBaseDn(e.target.value)}
                    placeholder="dc=example,dc=com"
                    className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Bind DN (Administrateur LDAP)</label>
                  <input
                    type="text"
                    value={ldapBindDn}
                    onChange={(e) => setLdapBindDn(e.target.value)}
                    placeholder="uid=admin,ou=people,dc=example,dc=com"
                    className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 block mb-1">Mot de passe Bind</label>
                  <input
                    type="password"
                    value={ldapBindPassword}
                    onChange={(e) => setLdapBindPassword(e.target.value)}
                    placeholder="Mot de passe bind..."
                    className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-400 block mb-1">Filtre de recherche utilisateur</label>
                  <input
                    type="text"
                    value={ldapSearchFilter}
                    onChange={(e) => setLdapSearchFilter(e.target.value)}
                    placeholder="(&(objectClass=person)(|(uid={{username}})(mail={{username}})))"
                    className="w-full bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                  />
                </div>
              </div>
            )}

            {testResults.ldap && (
              <p className={`text-xs ${testResults.ldap.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResults.ldap.message}
              </p>
            )}
          </div>

          {/* SSO / Reverse Proxy (Authelia, Authentik) */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>Reverse Proxy & SSO (Authelia, Authentik, Traefik)</span>
            </h3>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ssoEnabled}
                onChange={(e) => setSsoEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-dark-850 text-primary-600 focus:ring-0"
              />
              <span className="text-xs text-slate-200 font-semibold">
                Activer l'authentification automatique par en-tête Reverse Proxy
              </span>
            </label>

            {ssoEnabled && (
              <div className="pt-1">
                <label className="text-xs font-medium text-slate-400 block mb-1">Nom de l'en-tête contenant l'utilisateur</label>
                <input
                  type="text"
                  value={ssoHeader}
                  onChange={(e) => setSsoHeader(e.target.value)}
                  placeholder="Remote-User"
                  className="w-full max-w-sm bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Par défaut <code>Remote-User</code> (utilisé par Authelia). Les utilisateurs authentifiés par Authelia seront automatiquement connectés sans mot de passe supplémentaire.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-glow transition-transform hover:scale-105"
            >
              Enregistrer la configuration de sécurité
            </button>
          </div>
        </form>
      )}

      {/* User Simkl & Jellyfin Tab */}
      {activeTab === 'user' && (
        <div className="space-y-6">
          {/* CONTENT PREFERENCES (MOVIES / TV / ANIME) */}
          <form onSubmit={handleSavePreferences} className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-600/20 text-primary-400 flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Mes Préférences de Contenu</h3>
                  <p className="text-xs text-slate-400">
                    Personnalisez les types d'œuvres proposés dans votre carrousel et vos recommandations.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-bold shadow-glow"
              >
                Enregistrer
              </button>
            </div>

            {prefSaved && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>Vos préférences ont été enregistrées avec succès !</span>
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-dark-850 border border-white/5 cursor-pointer hover:border-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={prefMovies}
                  onChange={(e) => setPrefMovies(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-dark-900 text-primary-600 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Films</span>
                  <span className="text-[11px] text-slate-400">Proposer des longs-métrages</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-dark-850 border border-white/5 cursor-pointer hover:border-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={prefTv}
                  onChange={(e) => setPrefTv(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-dark-900 text-primary-600 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Séries TV</span>
                  <span className="text-[11px] text-slate-400">Proposer des séries & saisons</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-dark-850 border border-white/5 cursor-pointer hover:border-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={prefAnime}
                  onChange={(e) => setPrefAnime(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-dark-900 text-primary-600 focus:ring-0"
                />
                <div>
                  <span className="text-xs font-bold text-white block">Animés / Mangas</span>
                  <span className="text-[11px] text-slate-400">Animation japonaise (décochez pour exclure totalement les mangas)</span>
                </div>
              </label>
            </div>
          </form>
          {/* SIMKL LINK (PIN CODE FLOW & DIRECT) */}
          <div className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-600/20 text-primary-400 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Connexion Simkl Simplifiée</h3>
                <p className="text-xs text-slate-400">
                  Liez votre compte Simkl sans tracas grâce au code PIN en 1 clic.
                </p>
              </div>
            </div>

            {user?.simklConnected ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Votre compte Simkl est actuellement lié à Frame</span>
                  </div>
                  <button
                    onClick={handleUnlinkSimkl}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Délier le compte
                  </button>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSyncSimkl}
                    disabled={syncingSimkl}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow transition-transform hover:scale-105 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingSimkl ? 'animate-spin' : ''}`} />
                    <span>{syncingSimkl ? 'Synchronisation en cours...' : 'Synchroniser mes vues maintenant'}</span>
                  </button>
                </div>

                {simklSyncMessage && (
                  <p className="text-xs text-emerald-300 font-medium pt-1">
                    {simklSyncMessage}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Method 1: Instant PIN code */}
                <div className="p-4 rounded-xl bg-dark-850 border border-white/5 space-y-3">
                  <span className="text-xs font-bold text-white block">Méthode recommandée : Connexion par code PIN (1-clic)</span>
                  <p className="text-xs text-slate-400">
                    Cliquez ci-dessous pour générer un code court et l'approuver sur Simkl sans aucune configuration d'URL compliquée.
                  </p>

                  {simklPinData ? (
                    <div className="p-3.5 rounded-xl bg-primary-600/15 border border-primary-500/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-primary-300 block">Votre code PIN Simkl :</span>
                          <span className="text-2xl font-black text-white font-mono tracking-widest">{simklPinData.user_code}</span>
                        </div>
                        <a
                          href={simklPinData.verification_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-xl shadow"
                        >
                          <span>Valider sur Simkl</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleCheckSimklPin}
                          disabled={checkingPin}
                          className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl"
                        >
                          {checkingPin ? 'Vérification...' : 'J\'ai validé le code sur Simkl !'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartSimklPin}
                      className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-xl shadow-glow transition-all hover:scale-105"
                    >
                      Obtenir un code PIN Simkl
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* JELLYFIN PER-USER LINK */}
          <div className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Mon Compte Jellyfin</h3>
                <p className="text-xs text-slate-400">
                  Liez votre compte utilisateur personnel Jellyfin pour importer votre statut de lecture exact.
                </p>
              </div>
            </div>

            {user?.jellyfinConnected ? (
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Compte Jellyfin lié avec succès</span>
                  </div>
                  <button
                    onClick={handleUnlinkJellyfin}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    Délier
                  </button>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleSyncJellyfin}
                    disabled={syncingJellyfin}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-transform hover:scale-105 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingJellyfin ? 'animate-spin' : ''}`} />
                    <span>{syncingJellyfin ? 'Synchronisation Jellyfin...' : 'Synchroniser mes vues Jellyfin'}</span>
                  </button>
                </div>

                {jellyfinSyncMessage && (
                  <p className="text-xs text-indigo-300 font-medium pt-1">
                    {jellyfinSyncMessage}
                  </p>
                )}
              </div>
            ) : (
              <form onSubmit={handleLinkJellyfin} className="p-4 rounded-xl bg-dark-850 border border-white/5 space-y-3">
                <p className="text-xs text-slate-300">
                  Entrez vos identifiants Jellyfin personnels. Frame s'y connecte pour extraire vos lectures :
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Nom d'utilisateur Jellyfin</label>
                    <input
                      type="text"
                      required
                      value={jellyfinUsername}
                      onChange={(e) => setJellyfinUsername(e.target.value)}
                      placeholder="Identifiant Jellyfin..."
                      className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Mot de passe Jellyfin</label>
                    <input
                      type="password"
                      required
                      value={jellyfinPassword}
                      onChange={(e) => setJellyfinPassword(e.target.value)}
                      placeholder="Mot de passe..."
                      className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow"
                  >
                    Lier mon compte Jellyfin
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
