import React, { useState } from 'react';
import { 
  Film, 
  Tv, 
  Compass, 
  CheckCircle2, 
  Bookmark, 
  CloudDownload, 
  Settings, 
  Users, 
  LogOut, 
  Search, 
  Menu, 
  X,
  Sparkles,
  Layers,
  User as UserIcon,
  Calendar as CalendarIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenSearch: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, onOpenSearch }) => {
  const { user, isAdmin, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Accueil', icon: Sparkles },
    { id: 'discover', label: 'Découvrir', icon: Compass },
    { id: 'calendar', label: 'Calendrier', icon: CalendarIcon },
    { id: 'movies', label: 'Films', icon: Film },
    { id: 'tv', label: 'Séries', icon: Tv },
    { id: 'watched', label: 'Déjà Vu', icon: CheckCircle2 },
    { id: 'watchlist', label: 'À Voir', icon: Bookmark },
    { id: 'seer', label: 'Demandes', icon: CloudDownload },
  ];

  const handleNavClick = (id: string) => {
    onSelectTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="sticky top-0 z-40 bg-dark-950/80 backdrop-blur-md border-b border-white/5 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo Brand */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => handleNavClick('dashboard')}
              className="flex items-center gap-2.5 group focus:outline-none"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 via-indigo-500 to-accent-cinema flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
                <Film className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                FRAME
              </span>
            </button>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      active
                        ? 'bg-primary-600/15 text-primary-400 border border-primary-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Search shortcut button */}
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 text-slate-400 hover:text-slate-200 border border-white/5 text-sm transition-all group"
              title="Rechercher (Ctrl+K)"
            >
              <Search className="w-4 h-4 text-slate-400 group-hover:text-primary-400 transition-colors" />
              <span className="hidden sm:inline">Rechercher...</span>
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-xs text-slate-500 bg-dark-900 border border-white/10 rounded">
                Ctrl K
              </kbd>
            </button>

            {/* Admin Shortcuts */}
            {isAdmin && (
              <button
                onClick={() => handleNavClick('settings')}
                className={`p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all ${
                  currentTab === 'settings' ? 'text-primary-400 bg-primary-600/15' : ''
                }`}
                title="Paramètres du serveur"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}

            {/* User Profile / Menu */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-lg bg-dark-850 hover:bg-dark-800 border border-white/5 focus:outline-none transition-all"
                >
                  <div className="w-7 h-7 rounded-full bg-primary-700 text-white flex items-center justify-center text-xs font-semibold uppercase">
                    {user.displayName ? user.displayName.substring(0, 2) : user.username.substring(0, 2)}
                  </div>
                  <span className="hidden sm:inline text-xs font-medium text-slate-300 max-w-[100px] truncate">
                    {user.displayName || user.username}
                  </span>
                </button>

                {userDropdownOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-52 rounded-xl bg-dark-900 border border-white/10 shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onMouseLeave={() => setUserDropdownOpen(false)}
                  >
                    <div className="px-4 py-2 border-b border-white/5">
                      <p className="text-xs text-slate-400">Connecté en tant que</p>
                      <p className="text-sm font-semibold text-slate-100 truncate">{user.displayName || user.username}</p>
                      {isAdmin && (
                        <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-400 border border-primary-500/30">
                          Administrateur
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        handleNavClick('settings');
                        setUserDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span>Paramètres & Intégrations</span>
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          handleNavClick('admin-users');
                          setUserDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                      >
                        <Users className="w-4 h-4 text-slate-400" />
                        <span>Gestion Utilisateurs</span>
                      </button>
                    )}

                    <div className="border-t border-white/5 my-1" />

                    <button
                      onClick={() => {
                        logout();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Se déconnecter</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => handleNavClick('login')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-semibold transition-all shadow-glow"
              >
                <UserIcon className="w-4 h-4" />
                <span>Connexion</span>
              </button>
            )}

            {/* Mobile menu hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 focus:outline-none"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-white/5 bg-dark-900/95 backdrop-blur-xl px-4 pt-2 pb-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary-600/20 text-primary-400 border border-primary-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
          {isAdmin && (
            <>
              <button
                onClick={() => handleNavClick('settings')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5"
              >
                <Settings className="w-4 h-4" />
                <span>Paramètres</span>
              </button>
              <button
                onClick={() => handleNavClick('admin-users')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5"
              >
                <Users className="w-4 h-4" />
                <span>Gestion Utilisateurs</span>
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
};
