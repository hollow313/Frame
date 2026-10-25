import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, setToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isInitialized: boolean;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  register: (payload: { username: string; password: string; displayName?: string }) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(true);

  const checkInitialStatus = async () => {
    try {
      const status = await api.getAuthStatus();
      setIsInitialized(status.initialized);

      // 1. Si une identité SSO est validée par le proxy / portail SSO, connexion automatique immédiate (0 clic)
      if (status.ssoUser) {
        try {
          const ssoRes = await api.loginSso();
          if (ssoRes?.token) {
            setToken(ssoRes.token);
          }
          const meSso: any = await api.getMe();
          setUser(meSso);
          return;
        } catch {
          // Continuer vers la session par jeton
        }
      }

      // 2. Sinon, vérifier la session locale existante par jeton (ex: connexion locale LAN)
      try {
        const me: any = await api.getMe();
        if (me?.token) {
          setToken(me.token);
        }
        setUser(me);
        return;
      } catch {
        setToken(null);
      }

      setUser(null);
    } catch (e) {
      console.error('Erreur initialisation AuthContext', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkInitialStatus();
  }, []);

  const login = async (credentials: { username: string; password: string }) => {
    const res = await api.login(credentials);
    setToken(res.token);
    setUser(res.user);
    await refreshUser();
  };

  const register = async (payload: { username: string; password: string; displayName?: string }) => {
    const res = await api.register(payload);
    setToken(res.token);
    setUser(res.user);
    setIsInitialized(true);
    return res.message;
  };

  const logout = async () => {
    try {
      const res = await api.logout();
      setToken(null);
      setUser(null);
      if (res?.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
    } catch (e) {
      setToken(null);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const me: any = await api.getMe();
      if (me?.token) {
        setToken(me.token);
      }
      setUser(me);
    } catch (e) {
      // Ignorer
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin: user?.role === 'admin',
        isAuthenticated: Boolean(user),
        isInitialized,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
