import React, { useState, useEffect } from 'react';
import { Film, Lock, User, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, setToken } from '../services/api';

interface LoginProps {
  onSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const { login, register, isInitialized, refreshUser } = useAuth();
  const [allowRegistration, setAllowRegistration] = useState<boolean>(true);
  const [ldapEnabled, setLdapEnabled] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState(!isInitialized);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoUser, setSsoUser] = useState<{ username: string; displayName?: string; ssoUsername?: string } | null>(null);
  const [ssoLogoutUrl, setSsoLogoutUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getAuthStatus().then((status) => {
      setAllowRegistration(status.allowRegistration);
      setLdapEnabled(status.ldapEnabled);
      setSsoUser(status.ssoUser || null);
      setSsoLogoutUrl(status.ssoLogoutUrl || null);

      // Reconnexion SSO automatique, sauf si l'utilisateur vient de se déconnecter de Frame
      if (status.ssoUser && !status.ssoPaused) {
        handleContinueSso();
      }
    }).catch(() => {});
  }, []);

  const handleContinueSso = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.loginSso();
      if (res.token) setToken(res.token);
      await refreshUser();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Session SSO introuvable');
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

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Reprise rapide de la session SSO détectée */}
        {ssoUser && !isRegistering && (
          <div className="space-y-3">
            <button
              type="button"
              disabled={loading}
              onClick={handleContinueSso}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-dark-850 hover:bg-primary-600/15 border border-white/10 hover:border-primary-500/40 transition-all text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600/30 to-indigo-500/30 border border-primary-500/30 flex items-center justify-center text-white font-black text-sm uppercase shrink-0">
                {(ssoUser.displayName || ssoUser.username).slice(0, 2)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  Continuer en tant que {ssoUser.displayName || ssoUser.username}
                </p>
                <p className="text-[11px] text-slate-400 truncate">@{ssoUser.username}</p>
              </div>
            </button>

            {ssoLogoutUrl && (
              <a
                href={ssoLogoutUrl}
                className="block text-center text-xs text-slate-400 hover:text-primary-400 transition-colors"
              >
                Changer de compte SSO
              </a>
            )}

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <div className="flex-1 h-px bg-white/10" />
              <span>ou avec un autre compte</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
};
