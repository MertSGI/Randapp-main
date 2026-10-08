import React, { useEffect, useState } from 'react';
import { appointmentSelfServiceService } from '../../services/appointmentSelfServiceService';
import { CustomerFavorite } from '../../services/repositories/supabaseBookingRepository';

interface FavoritesSectionProps {
  isAuthenticated: boolean;
}

export const FavoritesSection: React.FC<FavoritesSectionProps> = ({ isAuthenticated }) => {
  const [favorites, setFavorites] = useState<CustomerFavorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadFavorites = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError('');
    try {
      const result = await appointmentSelfServiceService.getCustomerFavorites(50, 0);
      if (!result.success) {
        setError(result.reasonCode);
        return;
      }
      setFavorites(result.favorites);
    } catch (cause) {
      console.error('Favorites load failed', cause);
      setError('TEMPORARY_FAILURE');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, [isAuthenticated]);

  const removeFavorite = async (tenantId: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await appointmentSelfServiceService.setCustomerFavorite(tenantId, false);
      if (!result.success) {
        setError(result.reasonCode);
        return;
      }
      setFavorites(current => current.filter(item => item.tenant_id !== tenantId));
    } catch (cause) {
      console.error('Favorite removal failed', cause);
      setError('TEMPORARY_FAILURE');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-5 text-center dark:border-blue-900 dark:bg-blue-950/20">
        <p className="mb-3 text-sm text-blue-800 dark:text-blue-200">
          Favori işletmelerinizi görmek için güvenli müşteri hesabınızla giriş yapın.
        </p>
        <a href="#/customer/login" className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Giriş yap
        </a>
      </div>
    );
  }

  return (
    <section aria-labelledby="favorites-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="favorites-heading" className="text-lg font-medium text-gray-900 dark:text-white">
          Favori işletmelerim
        </h2>
        <button type="button" onClick={() => void loadFavorites()} disabled={loading} className="text-sm font-medium text-blue-600 disabled:opacity-50">
          Yenile
        </button>
      </div>

      {loading && favorites.length === 0 && (
        <p role="status" className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800">
          Favoriler yükleniyor...
        </p>
      )}

      {!loading && favorites.length === 0 && !error && (
        <p className="rounded-xl border border-gray-100 bg-white p-5 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-800">
          Henüz favori işletmeniz yok.
        </p>
      )}

      {favorites.map(favorite => (
        <article key={favorite.favorite_id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-gray-900 dark:text-white">{favorite.tenant_name}</h3>
            <a className="text-sm text-blue-600 hover:underline" href={`#/booking/${encodeURIComponent(favorite.tenant_slug)}`}>
              Randevu oluştur
            </a>
          </div>
          <button
            type="button"
            onClick={() => void removeFavorite(favorite.tenant_id)}
            disabled={loading}
            aria-label={`${favorite.tenant_name} işletmesini favorilerden kaldır`}
            className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/20"
          >
            Kaldır
          </button>
        </article>
      ))}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-300">
          Favoriler şu anda kullanılamıyor. ({error})
        </p>
      )}
    </section>
  );
};
