import React, { useState, useEffect } from 'react';
import { Users, Shield, User as UserIcon, Trash2, Calendar, Film, Bookmark } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const AdminUsers: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, newRole: 'admin' | 'user') => {
    try {
      await api.updateUserRole(userId, newRole);
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Erreur modification rôle');
    }
  };

  const handleDeleteUser = async (userId: number, username: string) => {
    if (!confirm(`Supprimer définitivement l'utilisateur « ${username} » ainsi que toutes ses données ?`)) return;
    try {
      await api.deleteUser(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err: any) {
      alert(err.message || 'Erreur suppression utilisateur');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Users className="w-7 h-7 text-primary-400" />
          <span>Gestion des Utilisateurs</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Gérez les comptes autorisés à se connecter sur votre serveur Frame.
        </p>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div
                key={u.id}
                className="p-4 rounded-2xl bg-dark-900 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-full bg-primary-600/20 text-primary-400 flex items-center justify-center font-bold text-sm uppercase">
                    {u.username.substring(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {u.display_name || u.username}
                      </span>
                      <span className="text-xs text-slate-400">(@{u.username})</span>
                      {isSelf && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary-500/20 text-primary-400">
                          Vous
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" />
                        {u.watched_count} vus
                      </span>
                      <span className="flex items-center gap-1">
                        <Bookmark className="w-3 h-3" />
                        {u.watchlist_count} à voir
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <select
                    value={u.role}
                    disabled={isSelf}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                    className="bg-dark-850 border border-white/10 text-xs rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                  >
                    <option value="admin">Administrateur</option>
                    <option value="user">Membre</option>
                  </select>

                  {!isSelf && (
                    <button
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
