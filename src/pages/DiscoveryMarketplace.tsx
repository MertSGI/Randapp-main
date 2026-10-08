import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { discoveryMarketplaceService } from '../../services/discoveryMarketplaceService';
import { tenantService } from '../../services/tenantService';
import { DiscoveryPortfolio } from '../components/DiscoveryPortfolio';
import type {
  DiscoveryListingDTO,
  DiscoveryBusinessDetailDTO,
  DiscoveryServiceDetailDTO,
} from '../../types/discoveryMarketplaceDTOs';

const PAGE_SIZE = 20;

export const DiscoveryMarketplace: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // State
  const [listings, setListings] = useState<DiscoveryListingDTO[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Selected detail state if viewing single business / portfolio
  const [selectedBusiness, setSelectedBusiness] = useState<DiscoveryBusinessDetailDTO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Filter state from URL search params
  const searchQuery = searchParams.get('q') || '';
  const city = searchParams.get('city') || '';
  const district = searchParams.get('district') || '';
  const category = searchParams.get('cat') || '';
  const minRating = Number(searchParams.get('rating')) || 0;

  // Initial load and filter changes. A short debounce avoids issuing an RPC
  // for every keystroke; the active flag prevents stale responses winning.
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      const result = await discoveryMarketplaceService.getListings({
        searchQuery: searchQuery || undefined,
        city: city || undefined,
        district: district || undefined,
        category: category || undefined,
        minRating: minRating > 0 ? minRating : undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (!active) return;
      if (result.success === true) {
        setListings(result.data.listings);
        setTotalCount(result.data.totalCount);
      } else {
        setListings([]);
        setTotalCount(0);
        setError(result.error.message || 'İşletmeler listelenirken bir hata oluştu.');
      }
      setLoading(false);
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchQuery, city, district, category, minRating]);

  // Fetch detail if slug present in route
  useEffect(() => {
    if (!slug) {
      setSelectedBusiness(null);
      return;
    }

    let isCancelled = false;
    const fetchDetailData = async () => {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const business = await tenantService.getTenantDiscoveryConfig(slug);
        if (isCancelled) return;
        if (business) {
          setSelectedBusiness(business);
        } else {
          setSelectedBusiness(null);
          setDetailError('Bu işletme şu anda keşif portföyünde görünmüyor.');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setDetailError(err?.message || 'Beklenmeyen hata.');
        }
      } finally {
        if (!isCancelled) {
          setLoadingDetail(false);
        }
      }
    };

    fetchDetailData();

    return () => {
      isCancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = selectedBusiness
      ? `${selectedBusiness.name} | Lari Discovery`
      : 'Lari Discovery | Klinik ve Salonları Keşfedin';
    if (description) {
      description.content = selectedBusiness?.shortDescription
        || 'Doğrulanmış klinik ve salonları keşfedin, güncel hizmetleri inceleyin.';
    }
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
    };
  }, [selectedBusiness]);

  const handleLoadMore = async () => {
    if (loadingMore || listings.length >= totalCount) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await discoveryMarketplaceService.getListings({
        searchQuery: searchQuery || undefined,
        city: city || undefined,
        district: district || undefined,
        category: category || undefined,
        minRating: minRating > 0 ? minRating : undefined,
        limit: PAGE_SIZE,
        offset: listings.length,
      });
      if (result.success === false) {
        setError(result.error.message || 'Daha fazla işletme yüklenemedi.');
        return;
      }
      setListings(current => {
        const known = new Set(current.map(item => item.tenantId));
        return [...current, ...result.data.listings.filter(item => !known.has(item.tenantId))];
      });
      setTotalCount(result.data.totalCount);
    } catch (cause) {
      console.error('Discovery pagination failed', cause);
      setError('Daha fazla işletme yüklenemedi.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearchChange = (field: string, val: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (val) {
      nextParams.set(field, val);
    } else {
      nextParams.delete(field);
    }
    setSearchParams(nextParams);
  };

  const handleSelectBusiness = (businessSlug: string) => {
    const query = searchParams.toString();
    navigate(`/discovery/${encodeURIComponent(businessSlug)}${query ? `?${query}` : ''}`);
  };

  const handleBackToList = () => {
    const query = searchParams.toString();
    navigate(`/discovery${query ? `?${query}` : ''}`);
  };

  const handleBookNow = (_service?: DiscoveryServiceDetailDTO) => {
    if (selectedBusiness) {
      navigate(`/booking/${encodeURIComponent(selectedBusiness.slug)}`);
    }
  };

  // If a slug is active, render the Portfolio Detail View
  if (slug) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-5xl mx-auto mb-6 flex items-center justify-between">
          <button
            onClick={handleBackToList}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition shadow-sm"
          >
            ← Keşif Listesine Dön
          </button>
          <span className="text-xs text-gray-400">
            Randevu Lari • Doğrulanmış Sağlık & Güzellik Portföyü
          </span>
        </div>

        {loadingDetail && (
          <div className="max-w-5xl mx-auto p-12 text-center bg-white rounded-2xl border border-gray-100 shadow">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500 font-medium">İşletme portföyü yükleniyor...</p>
          </div>
        )}

        {detailError && (
          <div className="max-w-5xl mx-auto p-8 bg-red-50 border border-red-200 rounded-2xl text-center text-red-700">
            <p className="font-semibold text-lg mb-2">İşletme Detayı Bulunamadı</p>
            <p className="text-sm mb-4">{detailError}</p>
            <button
              onClick={handleBackToList}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition"
            >
              Listeye Geri Dön
            </button>
          </div>
        )}

        {selectedBusiness && !loadingDetail && (
          <DiscoveryPortfolio
            business={selectedBusiness}
            onBookNow={handleBookNow}
          />
        )}
      </div>
    );
  }

  // Marketplace Listings View
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-16">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-indigo-950 text-white py-14 px-4 sm:px-6 lg:px-8 shadow-inner">
        <div className="max-w-6xl mx-auto text-center">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 uppercase tracking-widest inline-block mb-3">
            Lari Discovery Network
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            En Seçkin Klinik ve Salonları Keşfedin
          </h1>
          <p className="text-base sm:text-lg text-indigo-200 max-w-2xl mx-auto">
            Türkiye genelinde güvenilir uzmanlar, şeffaf fiyatlandırma ve gerçek müşteri geri bildirimleriyle randevunuzu saniyeler içinde planlayın.
          </p>

          {/* Search and Filters Bar */}
          <div className="mt-8 bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-gray-800 text-left">
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                İşletme veya Hizmet
              </label>
              <input
                type="text"
                placeholder="Örn: Estetik, Lazer, Saç..."
                value={searchQuery}
                onChange={(e) => handleSearchChange('q', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                Şehir
              </label>
              <select
                value={city}
                onChange={(e) => handleSearchChange('city', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Tüm Şehirler</option>
                <option value="İstanbul">İstanbul</option>
                <option value="Ankara">Ankara</option>
                <option value="İzmir">İzmir</option>
                <option value="Antalya">Antalya</option>
                <option value="Bursa">Bursa</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                İlçe
              </label>
              <input
                type="text"
                placeholder="Örn: Kadıköy"
                value={district}
                onChange={(e) => handleSearchChange('district', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => handleSearchChange('cat', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Tüm Kategoriler</option>
                <option value="Klinik">Klinik</option>
                <option value="Güzellik Merkezi">Güzellik Merkezi</option>
                <option value="Kuaför & Berber">Kuaför & Berber</option>
                <option value="Diş Kliniği">Diş Kliniği</option>
                <option value="Spa & Masaj">Spa & Masaj</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">
                Minimum Puan
              </label>
              <select
                value={minRating || ''}
                onChange={(e) => handleSearchChange('rating', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Fark Etmez</option>
                <option value="4.5">★ 4.5 ve üzeri</option>
                <option value="4.0">★ 4.0 ve üzeri</option>
                <option value="3.5">★ 3.5 ve üzeri</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {loading ? 'Yükleniyor...' : `${totalCount} Onaylı İşletme Bulundu`}
          </h2>
          <span className="text-xs text-gray-500">
            En iyi eşleşmeler gösteriliyor
          </span>
        </div>

        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-500 font-medium">İşletmeler taranıyor...</p>
          </div>
        ) : error && listings.length === 0 ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center text-red-700">
            <p className="font-semibold mb-1">Hata</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-lg font-bold text-gray-700 mb-1">Sonuç Bulunamadı</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">
              Arama kriterlerinize uygun işletme bulunamadı. Lütfen filtrelerinizi genişletin.
            </p>
            <button
              onClick={() => setSearchParams(new URLSearchParams())}
              className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-semibold text-xs rounded-lg transition"
            >
              Filtreleri Sıfırla
            </button>
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {listings.map((item) => (
              <div
                key={item.tenantId}
                onClick={() => handleSelectBusiness(item.slug)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleSelectBusiness(item.slug);
                  }
                }}
                role="button"
                tabIndex={0}
                className="bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition duration-200 overflow-hidden flex flex-col cursor-pointer group"
              >
                {/* Cover thumbnail */}
                <div className="relative h-44 w-full bg-gray-100 overflow-hidden">
                  <img
                    src={
                      item.coverImageUrl ||
                      'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80'
                    }
                    alt={item.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-0.5 rounded-full text-xs font-semibold text-indigo-800 shadow-sm">
                    {item.businessCategory}
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1">
                    {item.reviewCount > 0 && item.averageRating > 0 ? (
                      <>
                        <span className="text-amber-400">★</span>
                        <span>{item.averageRating.toFixed(1)}</span>
                        <span className="text-[10px] text-gray-300">({item.reviewCount})</span>
                      </>
                    ) : (
                      <span>Yeni</span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition">
                      {item.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <span>📍</span>
                      <span>
                        {item.district}, {item.city}
                      </span>
                    </p>

                    {item.shortDescription && (
                      <p className="text-xs text-gray-600 mt-2 line-clamp-2 leading-relaxed">
                        {item.shortDescription}
                      </p>
                    )}

                    {/* Featured services chips */}
                    {item.featuredServices && item.featuredServices.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                          Öne Çıkan Hizmetler
                        </span>
                        <div className="space-y-1">
                          {item.featuredServices.slice(0, 2).map((srv) => (
                            <div
                              key={srv.id}
                              className="flex justify-between items-center text-xs text-gray-700 bg-gray-50 px-2.5 py-1 rounded"
                            >
                              <span className="truncate pr-2">{srv.nameTr || srv.name}</span>
                              <span className="font-semibold text-indigo-600">
                                ₺{srv.price.toLocaleString('tr-TR')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-gray-400">
                      {item.amenities && item.amenities.length > 0
                        ? `${item.amenities.length} Olanak`
                        : 'Doğrulanmış İşletme'}
                    </span>
                    <span className="font-semibold text-indigo-600 group-hover:underline flex items-center gap-0.5">
                      Portföyü İncele →
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
              {error}
            </p>
          )}
          {listings.length < totalCount && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingMore ? 'Daha fazla işletme yükleniyor...' : 'Daha fazla işletme göster'}
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};

export default DiscoveryMarketplace;
