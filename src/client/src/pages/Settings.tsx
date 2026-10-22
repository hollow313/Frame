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
  Lock,
  Info,
  HelpCircle,
  Link as LinkIcon
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
  const [userSimklClientId, setUserSimklClientId] = useState('');
  const [userSimklClientSecret, setUserSimklClientSecret] = useState('');
  const [simklRedirectUri, setSimklRedirectUri] = useState(`${window.location.origin}/settings`);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [simklConnectingOAuth, setSimklConnectingOAuth] = useState(false);
  const [simklOAuthError, setSimklOAuthError] = useState<string | null>(null);
  const [simklPastedCode, setSimklPastedCode] = useState('');
  const [validatingPastedCode, setValidatingPastedCode] = useState(false);
  const [simklDeviceCode, setSimklDeviceCode] = useState<string | null>(null);
  const [simklPinData, setSimklPinData] = useState<{ user_code: string; verification_url: string; device_code?: string } | null>(null);
  const [simklGeneratingPin, setSimklGeneratingPin] = useState(false);
  const [checkingPin, setCheckingPin] = useState(false);
  const [simklPinError, setSimklPinError] = useState<string | null>(null);
  const [simklManualToken, setSimklManualToken] = useState('');
  const [linkingSimklManual, setLinkingSimklManual] = useState(false);
  const [simklManualError, setSimklManualError] = useState<string | null>(null);
  const [syncingSimkl, setSyncingSimkl] = useState(false);
  const [simklSyncMessage, setSimklSyncMessage] = useState<string | null>(null);

  // Form states for User Jellyfin
  const [userJellyfinUrl, setUserJellyfinUrl] = useState('');
  const [jellyfinAuthMode, setJellyfinAuthMode] = useState<'credentials' | 'apikey'>('credentials');
  const [jellyfinUsername, setJellyfinUsername] = useState('');
  const [jellyfinPassword, setJellyfinPassword] = useState('');
  const [jellyfinApiKey, setJellyfinApiKey] = useState('');
  const [jellyfinTestingServer, setJellyfinTestingServer] = useState(false);
  const [jellyfinServerTestResult, setJellyfinServerTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [jellyfinLinking, setJellyfinLinking] = useState(false);
  const [jellyfinError, setJellyfinError] = useState<string | null>(null);
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
    if (user?.simklClientId) {
      setUserSimklClientId(user.simklClientId);
    }
    if (user?.simklClientSecret) {
      setUserSimklClientSecret(user.simklClientSecret);
    }
    if (user?.jellyfinServerUrl) {
      setUserJellyfinUrl(user.jellyfinServerUrl);
    } else {
      api.getJellyfinServerInfo().then((info) => {
        if (info.serverUrl) setUserJellyfinUrl(info.serverUrl);
      }).catch(() => {});
    }

    // Traiter un retour de redirection OAuth Simkl si ?code= est présent
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      const verifier = localStorage.getItem('simkl_oauth_verifier');
      const redirectUri = localStorage.getItem('simkl_oauth_redirect_uri') || `${window.location.origin}/settings`;
      const savedClientId = localStorage.getItem('simkl_oauth_client_id') || undefined;
      const savedClientSecret = localStorage.getItem('simkl_oauth_client_secret') || undefined;

      if (verifier) {
        setSimklConnectingOAuth(true);
        api.callbackSimklOAuth({
          code,
          codeVerifier: verifier,
          redirectUri,
          clientId: savedClientId,
          clientSecret: savedClientSecret,
        })
          .then(async (res) => {
            alert(res.message || 'Compte Simkl lié avec succès !');
            localStorage.removeItem('simkl_oauth_verifier');
            localStorage.removeItem('simkl_oauth_state');
            localStorage.removeItem('simkl_oauth_redirect_uri');
            localStorage.removeItem('simkl_oauth_client_id');
            localStorage.removeItem('simkl_oauth_client_secret');
            window.history.replaceState({}, document.title, window.location.pathname);
            await refreshUser();
          })
          .catch((err) => {
            setSimklOAuthError(err.message || 'Erreur lors de la validation OAuth Simkl');
          })
          .finally(() => {
            setSimklConnectingOAuth(false);
          });
      }
    }
  }, [isAdmin, user]);

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

  // ================= SIMKL OAUTH & PIN FLOW =================
  const handleStartSimklOAuth = async (inNewTab = false) => {
    if (!userSimklClientId.trim()) {
      setSimklOAuthError('Veuillez renseigner votre Client ID Simkl avant de vous connecter.');
      return;
    }
    setSimklConnectingOAuth(true);
    setSimklOAuthError(null);
    try {
      const redirectUri = simklRedirectUri.trim() || `${window.location.origin}/settings`;
      const res = await api.initSimklOAuth({
        clientId: userSimklClientId.trim(),
        clientSecret: userSimklClientSecret.trim() || undefined,
        redirectUri,
      });

      localStorage.setItem('simkl_oauth_verifier', res.codeVerifier);
      localStorage.setItem('simkl_oauth_state', res.state);
      localStorage.setItem('simkl_oauth_redirect_uri', redirectUri);
      localStorage.setItem('simkl_oauth_client_id', userSimklClientId.trim());
      if (userSimklClientSecret.trim()) {
        localStorage.setItem('simkl_oauth_client_secret', userSimklClientSecret.trim());
      }

      if (inNewTab) {
        window.open(res.authUrl, '_blank');
      } else {
        window.location.href = res.authUrl;
      }
    } catch (err: any) {
      setSimklOAuthError(err.message || 'Erreur lors de l\'initialisation OAuth');
    } finally {
      setSimklConnectingOAuth(false);
    }
  };

  const handleValidatePastedCode = async () => {
    if (!simklPastedCode.trim()) {
      setSimklOAuthError('Veuillez coller le code d\'autorisation ou l\'URL de redirection reçue.');
      return;
    }
    setValidatingPastedCode(true);
    setSimklOAuthError(null);
    try {
      const verifier = localStorage.getItem('simkl_oauth_verifier') || undefined;
      const redirectUri = simklRedirectUri.trim() || localStorage.getItem('simkl_oauth_redirect_uri') || 'https://simkl.com';
      const clientId = userSimklClientId.trim() || localStorage.getItem('simkl_oauth_client_id') || undefined;
      const clientSecret = userSimklClientSecret.trim() || localStorage.getItem('simkl_oauth_client_secret') || undefined;

      const res = await api.callbackSimklOAuth({
        code: simklPastedCode.trim(),
        codeVerifier: verifier,
        redirectUri,
        clientId,
        clientSecret,
      });

      alert(res.message || 'Compte Simkl lié avec succès !');
      setSimklPastedCode('');
      localStorage.removeItem('simkl_oauth_verifier');
      localStorage.removeItem('simkl_oauth_state');
      localStorage.removeItem('simkl_oauth_redirect_uri');
      await refreshUser();
    } catch (err: any) {
      setSimklOAuthError(err.message || 'Erreur lors de la validation du code Simkl');
    } finally {
      setValidatingPastedCode(false);
    }
  };

  const handleStartSimklPin = async () => {
    setSimklGeneratingPin(true);
    setSimklPinError(null);
    try {
      const pin = await api.getSimklPin(
        userSimklClientId.trim() || undefined,
        userSimklClientSecret.trim() || undefined
      );
      setSimklPinData(pin);
      if (pin.device_code) {
        setSimklDeviceCode(pin.device_code);
      }
    } catch (err: any) {
      setSimklPinError(err.message || 'Impossible de générer le code PIN Simkl.');
    } finally {
      setSimklGeneratingPin(false);
    }
  };

  const handleCheckSimklPin = async () => {
    if (!simklPinData) return;
    setCheckingPin(true);
    setSimklPinError(null);
    try {
      const res = await api.checkSimklPin(
        simklPinData.user_code,
        userSimklClientId.trim() || undefined,
        simklDeviceCode || simklPinData.device_code || undefined,
        userSimklClientSecret.trim() || undefined
      );
      if (res.authorized) {
        alert(res.message);
        setSimklPinData(null);
        setSimklDeviceCode(null);
        await refreshUser();
      } else {
        setSimklPinError(res.message || 'Le code n\'a pas encore été validé sur Simkl. Cliquez sur « Valider sur Simkl », connectez-vous et autorisez Frame.');
      }
    } catch (err: any) {
      setSimklPinError(err.message || 'Erreur vérification code');
    } finally {
      setCheckingPin(false);
    }
  };

  const handleLinkSimklManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simklManualToken.trim()) return;
    setLinkingSimklManual(true);
    setSimklManualError(null);
    try {
      const res = await api.linkSimkl({
        accessToken: simklManualToken.trim(),
        clientId: userSimklClientId.trim() || undefined,
      });
      alert(res.message);
      setSimklManualToken('');
      await refreshUser();
    } catch (err: any) {
      setSimklManualError(err.message || 'Erreur lors de la validation du token Simkl');
    } finally {
      setLinkingSimklManual(false);
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
  const handleTestJellyfinServer = async () => {
    if (!userJellyfinUrl.trim()) {
      setJellyfinServerTestResult({
        success: false,
        message: 'Veuillez saisir une URL de serveur Jellyfin (ex: http://192.168.1.50:8096)',
      });
      return;
    }
    setJellyfinTestingServer(true);
    setJellyfinServerTestResult(null);
    try {
      const res = await api.testJellyfinServer(userJellyfinUrl.trim());
      setJellyfinServerTestResult(res);
    } catch (err: any) {
      setJellyfinServerTestResult({
        success: false,
        message: err.message || 'Erreur lors du test de connexion',
      });
    } finally {
      setJellyfinTestingServer(false);
    }
  };

  const handleLinkJellyfin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJellyfinLinking(true);
    setJellyfinError(null);
    try {
      const payload: { username?: string; password?: string; apiKey?: string; serverUrl?: string } = {
        serverUrl: userJellyfinUrl.trim() || undefined,
      };

      if (jellyfinAuthMode === 'apikey') {
        if (!jellyfinApiKey.trim()) {
          throw new Error('Veuillez renseigner votre clé API Jellyfin.');
        }
        payload.apiKey = jellyfinApiKey.trim();
        if (jellyfinUsername.trim()) payload.username = jellyfinUsername.trim();
      } else {
        if (!jellyfinUsername.trim()) {
          throw new Error('Veuillez renseigner votre nom d\'utilisateur Jellyfin.');
        }
        payload.username = jellyfinUsername.trim();
        payload.password = jellyfinPassword;
      }

      const res = await api.linkJellyfin(payload);
      alert(res.message);
      setJellyfinPassword('');
      setJellyfinApiKey('');
      await refreshUser();
    } catch (err: any) {
      setJellyfinError(err.message || 'Erreur connexion Jellyfin');
    } finally {
      setJellyfinLinking(false);
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
          <div className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-600/20 text-primary-400 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Connexion Simkl</h3>
                <p className="text-xs text-slate-400">
                  Synchronisez vos films et séries déjà visionnés sur Simkl directement avec Frame.
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
                {/* Guide pas-à-pas Simkl OAuth V2 */}
                <div className="p-4 rounded-xl bg-dark-850/80 border border-white/5 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary-400">
                    <HelpCircle className="w-4 h-4" />
                    <span>Guide rapide de configuration Simkl (Auth V2) :</span>
                  </div>
                  <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside pl-1">
                    <li>
                      Ouvrez{' '}
                      <a
                        href="https://simkl.com/settings/developer/new"
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary-400 underline hover:text-primary-300 inline-flex items-center gap-1 font-medium"
                      >
                        simkl.com/settings/developer/new
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                    <li>
                      Nom de l'application : <strong className="text-white">Frame</strong>
                    </li>
                    <li>
                      Type : <strong className="text-white">Browser sign-in + server callback</strong>
                    </li>
                    <li>
                      Dans <strong>Redirect URI</strong>, collez l'URL indiquée ci-dessous (copiable en 1 clic).
                    </li>
                    <li>
                      Enregistrez l'application, copiez votre <strong>Client ID</strong> et votre <strong>Client Secret</strong>, puis cliquez sur <strong>Se connecter avec Simkl (OAuth 2.0)</strong>.
                    </li>
                  </ol>
                </div>

                {/* Formulaire OAuth 2.0 Principal */}
                <div className="p-4 rounded-xl bg-dark-850 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-white block mb-1">
                        Client ID Simkl <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={userSimklClientId}
                        onChange={(e) => setUserSimklClientId(e.target.value)}
                        placeholder="Ex: fe026d2b88c9ac258798..."
                        className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-primary-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-white block mb-1">
                        Client Secret Simkl (Requis pour OAuth V2)
                      </label>
                      <input
                        type="password"
                        value={userSimklClientSecret}
                        onChange={(e) => setUserSimklClientSecret(e.target.value)}
                        placeholder="Ex: simkl_cs_N9tbdJw..."
                        className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      URL de redirection (Redirect URI pour votre app Simkl) :
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={simklRedirectUri}
                        onChange={(e) => setSimklRedirectUri(e.target.value)}
                        className="flex-1 bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(simklRedirectUri);
                          setCopiedRedirect(true);
                          setTimeout(() => setCopiedRedirect(false), 2000);
                        }}
                        className="px-3 py-2 bg-dark-800 hover:bg-dark-750 text-slate-200 text-xs font-semibold rounded-xl border border-white/10 shrink-0"
                      >
                        {copiedRedirect ? '✓ Copié !' : 'Copier l\'URL'}
                      </button>
                    </div>

                    {/* Raccourcis d'URL de redirection */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-[11px] text-slate-400">Raccourcis :</span>
                      <button
                        type="button"
                        onClick={() => setSimklRedirectUri(`${window.location.origin}/settings`)}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-dark-800 text-slate-300 hover:text-white border border-white/5"
                      >
                        Adresse de Frame ({window.location.origin}/settings)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSimklRedirectUri('https://simkl.com')}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-dark-800 text-amber-300 hover:text-amber-200 border border-amber-500/20"
                      >
                        https://simkl.com (recommandé si IP locale)
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Assurez-vous que cette URL exacte est enregistrée dans les paramètres de votre application sur le site de Simkl.
                    </p>
                  </div>

                  {simklOAuthError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{simklOAuthError}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleStartSimklOAuth(false)}
                      disabled={simklConnectingOAuth || !userSimklClientId.trim()}
                      className="px-5 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-glow transition-all hover:scale-102 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${simklConnectingOAuth ? 'animate-spin' : ''}`} />
                      <span>Se connecter automatiquement (Redirection)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartSimklOAuth(true)}
                      disabled={simklConnectingOAuth || !userSimklClientId.trim()}
                      className="px-4 py-2.5 bg-dark-800 hover:bg-dark-750 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-primary-400" />
                      <span>1. Ouvrir l'autorisation (Nouvel onglet)</span>
                    </button>
                  </div>

                  {/* Section de validation manuelle du code ou de l'URL */}
                  <div className="p-3.5 rounded-xl bg-dark-900/80 border border-white/10 space-y-2 mt-3">
                    <label className="text-xs font-bold text-slate-200 block">
                      2. Si vous avez utilisé https://simkl.com ou une IP locale :
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Après avoir autorisé Frame sur Simkl, Simkl vous redirige vers une page avec le code dans l'adresse (ex: <code>https://simkl.com/?code=4a92c...</code>). Copiez cette URL ou ce code et collez-le ci-dessous :
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={simklPastedCode}
                        onChange={(e) => setSimklPastedCode(e.target.value)}
                        placeholder="Collez l'URL de redirection reçue ou le code..."
                        className="flex-1 bg-dark-850 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-primary-500"
                      />
                      <button
                        type="button"
                        onClick={handleValidatePastedCode}
                        disabled={validatingPastedCode || !simklPastedCode.trim()}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow transition-all hover:scale-105 disabled:opacity-50 shrink-0"
                      >
                        {validatingPastedCode ? 'Validation...' : 'Valider le code Simkl'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Option alternative : PIN Code / Device Flow */}
                <details className="group p-3.5 rounded-xl bg-dark-850/50 border border-white/5 text-xs">
                  <summary className="font-bold text-slate-400 hover:text-slate-200 cursor-pointer list-none flex items-center justify-between">
                    <span>Méthode alternative : Connexion par code PIN (TV / Console / Device flow)</span>
                    <span className="text-[10px] text-primary-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                    <p className="text-[11px] text-slate-400">
                      Si vous utilisez une application enregistrée en mode Device/TV ou Auth V1, vous pouvez générer un code PIN à valider en ligne :
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleStartSimklPin}
                        disabled={simklGeneratingPin || !userSimklClientId.trim()}
                        className="px-4 py-2 bg-dark-800 hover:bg-dark-750 text-white text-xs font-bold rounded-xl border border-white/10 disabled:opacity-50"
                      >
                        {simklGeneratingPin ? 'Génération...' : 'Générer un code PIN Simkl'}
                      </button>
                    </div>

                    {simklPinError && (
                      <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{simklPinError}</span>
                      </div>
                    )}

                    {simklPinData && (
                      <div className="p-4 rounded-xl bg-primary-600/15 border border-primary-500/30 space-y-3 mt-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-[11px] text-primary-300 block font-medium">Votre code PIN à valider :</span>
                            <span className="text-2xl font-black text-white font-mono tracking-widest">{simklPinData.user_code}</span>
                          </div>
                          <a
                            href={simklPinData.verification_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold rounded-xl shadow transition-transform hover:scale-105"
                          >
                            <span>1. Valider sur Simkl</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        <div className="pt-2 border-t border-primary-500/20 flex flex-col sm:flex-row items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-300">
                            Après avoir cliqué sur <strong>Approve</strong> sur Simkl, cliquez ci-contre :
                          </p>
                          <button
                            type="button"
                            onClick={handleCheckSimklPin}
                            disabled={checkingPin}
                            className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl shadow transition-all hover:scale-105 disabled:opacity-50"
                          >
                            {checkingPin ? 'Vérification...' : '2. J\'ai validé le code sur Simkl !'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </details>

                {/* Option alternative : Access Token direct */}
                <details className="group p-3.5 rounded-xl bg-dark-850/50 border border-white/5 text-xs">
                  <summary className="font-bold text-slate-400 hover:text-slate-200 cursor-pointer list-none flex items-center justify-between">
                    <span>Méthode alternative : Jeton d'accès direct (Bearer Token)</span>
                    <span className="text-[10px] text-primary-400 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <form onSubmit={handleLinkSimklManual} className="mt-3 pt-3 border-t border-white/5 space-y-2">
                    <p className="text-[11px] text-slate-400">
                      Si vous disposez déjà d'un jeton d'accès utilisateur Simkl, collez-le ci-dessous.
                      <br />
                      <strong className="text-amber-400 font-semibold">⚠️ Attention :</strong> Ne collez pas votre Client Secret (qui commence par <code>simkl_cs_</code>) ici ! Le Client Secret doit être saisi dans le formulaire principal au-dessus.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={simklManualToken}
                        onChange={(e) => setSimklManualToken(e.target.value)}
                        placeholder="Bearer access token Simkl (commence par simkl_at_ ou chaîne hexadécimale)..."
                        className="flex-1 bg-dark-900 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono"
                      />
                      <button
                        type="submit"
                        disabled={linkingSimklManual}
                        className="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 text-white font-bold rounded-xl border border-white/10 disabled:opacity-50"
                      >
                        {linkingSimklManual ? 'Validation...' : 'Lier le token'}
                      </button>
                    </div>
                    {simklManualError && (
                      <p className="text-xs text-rose-400">{simklManualError}</p>
                    )}
                  </form>
                </details>
              </div>
            )}
          </div>

          {/* JELLYFIN PER-USER LINK */}
          <div className="p-6 rounded-2xl bg-dark-900 border border-white/5 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Mon Compte Jellyfin</h3>
                <p className="text-xs text-slate-400">
                  Liez votre compte Jellyfin personnel pour importer vos lectures et lancer vos médias dans l'application PC.
                </p>
              </div>
            </div>

            {user?.jellyfinConnected ? (
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Compte Jellyfin actuellement connecté à Frame</span>
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
              <form onSubmit={handleLinkJellyfin} className="p-4 rounded-xl bg-dark-850 border border-white/5 space-y-4">
                {/* Configuration URL Serveur Jellyfin */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-white flex items-center justify-between">
                    <span>URL du serveur Jellyfin</span>
                    <button
                      type="button"
                      onClick={handleTestJellyfinServer}
                      disabled={jellyfinTestingServer}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-semibold disabled:opacity-50"
                    >
                      {jellyfinTestingServer ? 'Test en cours...' : 'Tester la connexion au serveur'}
                    </button>
                  </label>
                  <input
                    type="text"
                    value={userJellyfinUrl}
                    onChange={(e) => setUserJellyfinUrl(e.target.value)}
                    placeholder="http://192.168.1.50:8096"
                    className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    💡 Si Frame tourne dans un conteneur Docker, n'utilisez pas <code className="bg-dark-900 px-1 py-0.5 rounded text-amber-300">localhost</code> mais l'adresse IP de votre serveur sur votre réseau local (ex: <code className="bg-dark-900 px-1 py-0.5 rounded text-indigo-300">http://192.168.x.x:8096</code>).
                  </p>
                </div>

                {jellyfinServerTestResult && (
                  <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    jellyfinServerTestResult.success 
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                  }`}>
                    {jellyfinServerTestResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{jellyfinServerTestResult.message}</span>
                  </div>
                )}

                {/* Onglets de méthode d'authentification */}
                <div className="pt-2 border-t border-white/5 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setJellyfinAuthMode('credentials')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                        jellyfinAuthMode === 'credentials'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-dark-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      Identifiants (Nom & Mot de passe)
                    </button>
                    <button
                      type="button"
                      onClick={() => setJellyfinAuthMode('apikey')}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                        jellyfinAuthMode === 'apikey'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-dark-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      Clé API (Recommandé si LDAP / SSO)
                    </button>
                  </div>

                  {jellyfinAuthMode === 'credentials' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Nom d'utilisateur Jellyfin</label>
                        <input
                          type="text"
                          required
                          value={jellyfinUsername}
                          onChange={(e) => setJellyfinUsername(e.target.value)}
                          placeholder="Votre nom d'utilisateur..."
                          className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Mot de passe Jellyfin</label>
                        <input
                          type="password"
                          value={jellyfinPassword}
                          onChange={(e) => setJellyfinPassword(e.target.value)}
                          placeholder="Votre mot de passe..."
                          className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-300">
                        <p className="font-semibold mb-1">Comment générer une clé API sur Jellyfin ?</p>
                        <p className="text-[11px] text-slate-300">
                          Dans Jellyfin, rendez-vous dans <strong>Tableau de bord</strong> &gt; <strong>Avancé</strong> &gt; <strong>Clés d'API</strong> &gt; Cliquez sur <strong>+</strong> et donnez le nom <em>Frame</em>.
                          Cette méthode fonctionne à 100%, même si vous utilisez l'authentification LLDAP ou Authelia sur Jellyfin !
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">Clé API Jellyfin</label>
                          <input
                            type="password"
                            required
                            value={jellyfinApiKey}
                            onChange={(e) => setJellyfinApiKey(e.target.value)}
                            placeholder="Clé d'API Jellyfin..."
                            className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-400 block mb-1">Nom d'utilisateur (optionnel)</label>
                          <input
                            type="text"
                            value={jellyfinUsername}
                            onChange={(e) => setJellyfinUsername(e.target.value)}
                            placeholder="Votre pseudo Jellyfin..."
                            className="w-full bg-dark-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-100"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {jellyfinError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="font-bold block">Erreur de connexion :</span>
                      <span>{jellyfinError}</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={jellyfinLinking}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow transition-transform hover:scale-105 disabled:opacity-50"
                  >
                    {jellyfinLinking ? 'Connexion en cours...' : 'Lier mon compte Jellyfin'}
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
