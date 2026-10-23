import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { MediaModal } from './components/MediaModal';
import { RatingModal } from './components/RatingModal';
import { SearchModal } from './components/SearchModal';
import { Dashboard } from './pages/Dashboard';
import { Discover } from './pages/Discover';
import { Calendar } from './pages/Calendar';
import { WatchedHistory } from './pages/WatchedHistory';
import { Watchlist } from './pages/Watchlist';
import { SeerRequests } from './pages/SeerRequests';
import { Settings } from './pages/Settings';
import { AdminUsers } from './pages/AdminUsers';
import { Login } from './pages/Login';
import { MediaItem } from './types';
import { api } from './services/api';

const AppContent: React.FC = () => {
  const { user, isAdmin, refreshUser } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Modals state
  const [selectedMedia, setSelectedMedia] = useState<{ type: 'movie' | 'tv' | 'manga'; id: number } | null>(null);
  const [ratingMedia, setRatingMedia] = useState<MediaItem | null>(null);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      const verifier = localStorage.getItem('simkl_oauth_verifier');
      const redirectUri = localStorage.getItem('simkl_oauth_redirect_uri') || `${window.location.origin}/settings`;
      const savedClientId = localStorage.getItem('simkl_oauth_client_id') || undefined;
      const savedClientSecret = localStorage.getItem('simkl_oauth_client_secret') || undefined;

      if (verifier) {
        api.callbackSimklOAuth({
          code,
          codeVerifier: verifier,
          redirectUri,
          clientId: savedClientId,
          clientSecret: savedClientSecret,
        })
          .then((res) => {
            showToast(res.message || 'Compte Simkl lié avec succès !');
            localStorage.removeItem('simkl_oauth_verifier');
            localStorage.removeItem('simkl_oauth_state');
            localStorage.removeItem('simkl_oauth_redirect_uri');
            localStorage.removeItem('simkl_oauth_client_id');
            localStorage.removeItem('simkl_oauth_client_secret');
            window.history.replaceState({}, document.title, window.location.pathname);
            refreshUser();
            setCurrentTab('settings');
          })
          .catch((err) => {
            showToast('Erreur Simkl: ' + (err.message || 'Échec'));
          });
      }
    }
  }, []);

  const handleSelectMedia = (item: MediaItem) => {
    setSelectedMedia({ type: item.media_type, id: item.id });
  };

  const handleOpenRating = (item: MediaItem) => {
    if (!user) {
      setCurrentTab('login');
      return;
    }
    setRatingMedia(item);
  };

  const handleSubmitRating = async (rating: number | null, review: string | null, date: string) => {
    if (!ratingMedia) return;
    try {
      await api.markAsWatched({
        tmdbId: ratingMedia.id,
        mediaType: ratingMedia.media_type,
        title: ratingMedia.title,
        posterPath: ratingMedia.poster_path,
        backdropPath: ratingMedia.backdrop_path,
        releaseDate: ratingMedia.release_date,
        genres: ratingMedia.genres,
        overview: ratingMedia.overview,
        rating,
        review,
        watchedAt: date,
      });
      showToast(`« ${ratingMedia.title} » marqué comme vu !`);
      setRatingMedia(null);
    } catch (e: any) {
      alert(e.message || 'Erreur enregistrement');
    }
  };

  const handleDeleteWatched = async () => {
    if (!ratingMedia) return;
    try {
      await api.unmarkWatched(ratingMedia.media_type, ratingMedia.id);
      showToast(`« ${ratingMedia.title} » retiré des vus`);
      setRatingMedia(null);
    } catch (e: any) {
      alert(e.message || 'Erreur');
    }
  };

  const handleToggleWatchlist = async (item: MediaItem) => {
    if (!user) {
      setCurrentTab('login');
      return;
    }
    try {
      if (item.inWatchlist) {
        await api.removeFromWatchlist(item.media_type, item.id);
        item.inWatchlist = false;
        showToast(`Retiré de votre liste`);
      } else {
        await api.addToWatchlist({
          tmdbId: item.id,
          mediaType: item.media_type,
          title: item.title,
          posterPath: item.poster_path,
          backdropPath: item.backdrop_path,
          releaseDate: item.release_date,
          genres: item.genres,
          overview: item.overview,
        });
        item.inWatchlist = true;
        showToast(`Ajouté à votre liste !`);
      }
    } catch (e: any) {
      alert(e.message || 'Erreur watchlist');
    }
  };

  return (
    <div className="min-h-screen bg-dark-950 text-slate-100 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-primary-600 text-white font-semibold text-xs shadow-glow animate-in slide-in-from-bottom duration-200">
          {toastMessage}
        </div>
      )}

      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {currentTab === 'dashboard' && (
          <Dashboard
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onToggleWatchlist={handleToggleWatchlist}
            onNavigateTab={setCurrentTab}
          />
        )}

        {currentTab === 'discover' && (
          <Discover
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {currentTab === 'calendar' && (
          <Calendar
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {currentTab === 'platforms' && (
          <Discover
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {currentTab === 'movies' && (
          <Discover
            initialType="movie"
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {currentTab === 'tv' && (
          <Discover
            initialType="tv"
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onToggleWatchlist={handleToggleWatchlist}
          />
        )}

        {currentTab === 'watched' && (
          <WatchedHistory
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onNavigateTab={setCurrentTab}
          />
        )}

        {currentTab === 'watchlist' && (
          <Watchlist
            onSelectMedia={handleSelectMedia}
            onOpenRating={handleOpenRating}
            onNavigateTab={setCurrentTab}
          />
        )}

        {currentTab === 'seer' && (
          <SeerRequests
            onSelectMedia={handleSelectMedia}
            onNavigateTab={setCurrentTab}
          />
        )}

        {currentTab === 'settings' && <Settings />}

        {currentTab === 'admin-users' && isAdmin && <AdminUsers />}

        {currentTab === 'login' && <Login onSuccess={() => setCurrentTab('dashboard')} />}
      </main>

      {/* Global Modals */}
      {selectedMedia && (
        <MediaModal
          mediaType={selectedMedia.type}
          id={selectedMedia.id}
          isOpen={Boolean(selectedMedia)}
          onClose={() => setSelectedMedia(null)}
          onOpenRating={handleOpenRating}
          onToggleWatchlist={handleToggleWatchlist}
        />
      )}

      {ratingMedia && (
        <RatingModal
          item={ratingMedia}
          isOpen={Boolean(ratingMedia)}
          onClose={() => setRatingMedia(null)}
          onSubmit={handleSubmitRating}
          onDelete={ratingMedia.isWatched ? handleDeleteWatched : undefined}
        />
      )}

      <SearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelectMedia}
      />

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-auto text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>FRAME • Plateforme multimédia & recommandations intelligentes</span>
          <span>Hébergement conteneurisé • Données TMDB, Simkl & Seer</span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
