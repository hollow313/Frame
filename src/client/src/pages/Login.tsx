import React, { useState, useEffect } from 'react';
import { Film, Lock, User, Sparkles, AlertCircle, Shield, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, setToken } from '../services/api';

interface LoginProps {
  onSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const { login, register, isInitialized, refreshUser } = useAuth();
  const [allowRegistration, setAllowRegistration] = useState<boolean>(true);
  const [ldapEnabled, setLdapEnabled] = useState<boolean>(false);
  const [ssoEnabled, setSsoEnabled] = useState<boolean>(false);
  const [ssoProfiles, setSsoProfiles] = useState<Array<{
    id: number;
    username: string;
    displayName: string;
    role: string;
    authProvider: string;
  }>>([]);
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState(!isInitialized);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAuthStatus().then((status) => {
      setAllowRegistration(status.allowRegistration);
      setLdapEnabled(status.ldapEnabled);
      setSsoEnabled(status.ssoEnabled);
      if (status.ssoProfiles && status.ssoProfiles.length > 0) {
        setSsoProfiles(status.ssoProfiles);
      }

      // Si authentifié automatiquement via l'en-tête SSO du Reverse Proxy (ex: Remote-User)
      if (status.ssoUser) {
        api.loginSso()
          .then((res) => {
            if (res.token) setToken(res.token);
            return refreshUser();
          })
          .then(() => onSuccess())
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const handleSelectSsoProfile = async (profileId: number) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.loginSso(profileId);
      if (res.token) setToken(res.token);
      await refreshUser();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Impossible de charger ce profil');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegistering) {
        await register({ username, password, displayName });
      } else {
        await login({ username, password });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-dark-900 border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-primary-600 via-indigo-500 to-accent-cinema flex items-center justify-center shadow-glow mx-auto">
            <Film className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">FRAME</h1>
          <p className="text-xs text-slate-400">
            {isRegistering ? 'Créez votre profil sur le serveur' : 'Connectez-vous pour accéder à vos médias'}
          </p>
        </div>

        {/* First-time Admin Notice */}
        {!isInitialized && (
          <div className="p-3.5 rounded-xl bg-primary-600/15 border border-primary-500/30 text-xs text-primary-300 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-white">Premier démarrage</p>
              <p>Aucun utilisateur configuré. Le premier compte créé sera configuré avec les droits <strong>Administrateur</strong>.</p>
            </div>
          </div>
        )}

        {/* LDAP Active Notice */}
        {ldapEnabled && (
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Authentification centralisée LDAP / LLDAP active.</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Sélecteur de profil 1-clic (SSO + Groupe LDAP synchronisé) */}
        {ssoEnabled && ssoProfiles.length > 0 && !showManualForm ? (
          <div className="space-y-4">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>SSO validé — Choisissez votre profil pour continuer :</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 max-h-72 overflow-y-auto pr-1">
              {ssoProfiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  disabled={loading}
                  onClick={() => handleSelectSsoProfile(profile.id)}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-dark-850 hover:bg-primary-600/15 border border-white/10 hover:border-primary-500/40 transition-all text-left group disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600/30 to-indigo-500/30 border border-primary-500/30 flex items-center justify-center text-white font-black text-sm uppercase shrink-0 group-hover:scale-105 transition-transform">
                      {(profile.displayName || profile.username).slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate group-hover:text-primary-300 transition-colors">
                        {profile.displayName || profile.username}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">@{profile.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {profile.role === 'admin' && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                        Admin
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase">
                      {profile.authProvider || 'LDAP'}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setShowManualForm(true)}
                className="text-xs text-slate-400 hover:text-primary-400 transition-colors"
              >
                Se connecter manuellement avec un mot de passe
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Nom d'utilisateur</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={ldapEnabled ? "Identifiant local ou LDAP" : "Ex: alex"}
                    className="w-full bg-dark-850 border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {isRegistering && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Nom d'affichage (optionnel)</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Ex: Alexandre"
                      className="w-full bg-dark-850 border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Mot de passe</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-dark-850 border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-bold text-sm shadow-glow transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {loading ? 'Traitement...' : isRegistering ? 'Créer mon compte' : 'Se connecter'}
              </button>
            </form>

            {ssoEnabled && ssoProfiles.length > 0 && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  ← Retour à la sélection rapide de profil SSO
                </button>
              </div>
            )}

            {/* Toggle Register / Login si autorisé */}
            {allowRegistration && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setError(null);
                  }}
                  className="text-xs text-slate-400 hover:text-primary-400 transition-colors"
                >
                  {isRegistering
                    ? 'Vous avez déjà un compte ? Connectez-vous'
                    : 'Nouveau sur Frame ? Créer un compte'}
                </button>
              </div>
            )}

            {!allowRegistration && isInitialized && (
              <p className="text-center text-[11px] text-slate-500">
                Inscription publique désactivée. Demandez un accès à l'administrateur.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
