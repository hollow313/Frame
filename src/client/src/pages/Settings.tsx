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
  Check
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const Settings: React.FC = () => {
  const { user, isAdmin, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'server' | 'user'>(isAdmin ? 'server' : 'user');

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

  // Form states for User Simkl
  const [simklToken, setSimklToken] = useState('');
  const [syncingSimkl, setSyncingSimkl] = useState(false);
  const [simklSyncMessage, setSimklSyncMessage] = useState<string | null>(null);

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
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServerSettings = async (e: React.FormEvent) => {
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
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      loadSettings();
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la sauvegarde');
    }
  };

  const handleTestService = async (service: 'tmdb' | 'seer' | 'sonarr' | 'radarr') => {
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

  const handleLinkSimkl = async () => {
    if (!simklToken.trim()) return;
    try {
      const res = await api.linkSimkl(simklToken.trim());
      alert(res.message);
      refreshUser();
      setSimklToken('');
    } catch (err: any) {
      alert(err.message || 'Erreur liaison Simkl');
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

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <SettingsIcon className="w-7 h-7 text-primary-400" />
          <span>Paramètres & Intégrations</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Gérez vos clés d'API, les connexions à vos serveurs de médias et vos préférences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/5 pb-2">
        {isAdmin && (
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
          <span>Profil & Simkl</span>
        </button>
      </div>

      {/* Admin Server Integrations Tab */}
      {isAdmin && activeTab === 'server' && (
        <form onSubmit={handleSaveServerSettings} className="space-y-6">
          {saveSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>Paramètres enregistrés avec succès dans le fichier de configuration et la base SQLite.</span>
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
                  <p className="text-xs text-slate-400">Récupération des métadonnées, affiches et synopsis en français</p>
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

          {/* Sonarr Section */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <Tv className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Sonarr (Séries TV)</h3>
                  <p className="text-xs text-slate-400">Vérification de la médiathèque et des épisodes téléchargés</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTestService('sonarr')}
                disabled={testResults.sonarr?.loading}
                className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 text-xs font-semibold border border-white/5"
              >
                {testResults.sonarr?.loading ? 'Test...' : 'Tester'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">URL Sonarr</label>
                <input
                  type="text"
                  value={sonarrUrl}
                  onChange={(e) => setSonarrUrl(e.target.value)}
                  placeholder="http://serveur:8989"
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Clé API Sonarr</label>
                <input
                  type="password"
                  value={sonarrApiKey}
                  onChange={(e) => setSonarrApiKey(e.target.value)}
                  placeholder="Clé API Sonarr..."
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {testResults.sonarr && (
              <p className={`text-xs ${testResults.sonarr.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResults.sonarr.message}
              </p>
            )}
          </div>

          {/* Radarr Section */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Radarr (Films)</h3>
                  <p className="text-xs text-slate-400">Vérification de la présence des films sur le disque</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleTestService('radarr')}
                disabled={testResults.radarr?.loading}
                className="px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-300 text-xs font-semibold border border-white/5"
              >
                {testResults.radarr?.loading ? 'Test...' : 'Tester'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">URL Radarr</label>
                <input
                  type="text"
                  value={radarrUrl}
                  onChange={(e) => setRadarrUrl(e.target.value)}
                  placeholder="http://serveur:7878"
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Clé API Radarr</label>
                <input
                  type="password"
                  value={radarrApiKey}
                  onChange={(e) => setRadarrApiKey(e.target.value)}
                  placeholder="Clé API Radarr..."
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            {testResults.radarr && (
              <p className={`text-xs ${testResults.radarr.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResults.radarr.message}
              </p>
            )}
          </div>

          {/* Langue & Paramètres généraux */}
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <h3 className="text-sm font-bold text-white">Langue des métadonnées</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Langue par défaut</label>
                <select
                  value={defaultLanguage}
                  onChange={(e) => setDefaultLanguage(e.target.value)}
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                >
                  <option value="fr-FR">Français (France - fr-FR) [Prioritaire]</option>
                  <option value="en-US">English (en-US)</option>
                  <option value="es-ES">Español (es-ES)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Simkl Client ID (Global)</label>
                <input
                  type="text"
                  value={simklClientId}
                  onChange={(e) => setSimklClientId(e.target.value)}
                  placeholder="Client ID Simkl..."
                  className="w-full bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                />
              </div>
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

      {/* User Simkl & Profile Tab */}
      {activeTab === 'user' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-dark-900 border border-white/5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-600/20 text-primary-400 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Intégration & Synchronisation Simkl</h3>
                <p className="text-xs text-slate-400">
                  Importez automatiquement votre historique de films et séries vus depuis Simkl vers Frame.
                </p>
              </div>
            </div>

            {user?.simklConnected ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Compte Simkl lié avec succès</span>
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
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  Pour connecter Simkl, récupérez votre <strong>Access Token</strong> dans les paramètres développeur de votre compte Simkl et collez-le ci-dessous.
                </p>

                <div className="flex gap-2">
                  <input
                    type="password"
                    value={simklToken}
                    onChange={(e) => setSimklToken(e.target.value)}
                    placeholder="Collez votre Simkl Access Token..."
                    className="flex-1 bg-dark-850 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-primary-500"
                  />
                  <button
                    type="button"
                    onClick={handleLinkSimkl}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold shadow transition-transform hover:scale-105"
                  >
                    Lier
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
