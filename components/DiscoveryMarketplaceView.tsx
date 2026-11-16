import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { discoveryMarketplaceService } from '../services/discoveryMarketplaceService';
import { publicLinkService } from '../services/publicLinkService';
import { DiscoveryPortfolio, safeExternalUrl } from './DiscoveryPortfolio';
import type {
  DiscoveryBusinessDetailDTO,
  DiscoveryDetailRequest,
  DiscoveryDetailResponse,
  DiscoveryError,
  DiscoveryListingDTO,
  FastRebookingSeedDTO,
  Result,
} from '../types/discoveryMarketplaceDTOs';

export type DiscoveryDetailFetcher = (
  request: DiscoveryDetailRequest
) => Promise<Result<DiscoveryDetailResponse, DiscoveryError>>;

/** Fetches a single business detail record for a `/discovery/:tenantSlug` route without inventing placeholder data. */
export async function loadDiscoveryDetailBySlug(
  slug: string,
  detailFetcher: DiscoveryDetailFetcher = (req) => discoveryMarketplaceService.getDetail(req)
): Promise<{ business: DiscoveryBusinessDetailDTO | null; error: string | null }> {
  const cleanSlug = slug.trim();
  if (!cleanSlug) {
    return { business: null, error: 'Geçersiz işletme adresi.' };
  }
  const res = await detailFetcher({ slug: cleanSlug });
  if (res.success === true) {
    return { business: res.data.business, error: null };
  }
  return { business: null, error: res.error.message };
}

export interface DiscoveryMarketplaceViewProps {
  initialListings?: DiscoveryListingDTO[];
  initialSelectedBusiness?: DiscoveryBusinessDetailDTO | null;
  initialSlug?: string;
  initialError?: string | null;
  marketplaceEnabled?: boolean;
  detailFetcher?: DiscoveryDetailFetcher;
  onSelectBusinessSlug?: (slug: string) => void;
  onClearSelection?: () => void;
  onBookBusiness?: (slug: string) => void;
  onFastRebookSeed?: (seed: FastRebookingSeedDTO) => void;
}

export const DiscoveryMarketplaceView: React.FC<DiscoveryMarketplaceViewProps> = ({
  initialListings,
  initialSelectedBusiness = null,
  initialSlug,
  initialError = null,
  marketplaceEnabled = true,
  detailFetcher,
  onSelectBusinessSlug,
  onClearSelection,
  onBookBusiness,
  onFastRebookSeed,
}) => {
  const [listings, setListings] = useState<DiscoveryListingDTO[]>(initialListings ?? []);
  const [totalCount, setTotalCount] = useState<number>(initialListings?.length ?? 0);
  const [selectedBusiness, setSelectedBusiness] = useState<DiscoveryBusinessDetailDTO | null>(
    initialSelectedBusiness
  );
  const [loading, setLoading] = useState<boolean>(
    marketplaceEnabled && (initialListings === undefined || Boolean(initialSlug?.trim() && !initialSelectedBusiness))
  );
  const [error, setError] = useState<string | null>(initialError);

  const [searchQuery, setSearchQuery] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');

  // Verified Review & Fast Rebooking via Manage Token
  const [manageToken, setManageToken] = useState('');
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [reviewIdempotencyKey, setReviewIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [rebookSeed, setRebookSeed] = useState<FastRebookingSeedDTO | null>(null);
  const [rebookStatus, setRebookStatus] = useState<string | null>(null);

  useEffect(() => {
    setReviewIdempotencyKey(crypto.randomUUID());
  }, [manageToken, reviewRating, reviewTitle, reviewContent, selectedBusiness?.slug]);

  const resolveDetail = useCallback(
    (req: DiscoveryDetailRequest) =>
      detailFetcher ? detailFetcher(req) : discoveryMarketplaceService.getDetail(req),
    [detailFetcher]
  );

  useEffect(() => {
    if (!marketplaceEnabled || initialListings !== undefined || Boolean(initialSlug?.trim())) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    discoveryMarketplaceService
      .getListings({
        searchQuery: searchQuery || undefined,
        city: city || undefined,
        category: category || undefined,
        limit: 20,
        offset: 0,
      })
      .then((res) => {
        if (!active) return;
        if (res.success === true) {
          setListings(res.data.listings);
          setTotalCount(res.data.totalCount);
        } else {
          setListings([]);
          setTotalCount(0);
          setError(res.error.message);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [marketplaceEnabled, initialListings, initialSlug, searchQuery, city, category]);

  useEffect(() => {
    if (!marketplaceEnabled) {
      return;
    }
    const cleanSlug = initialSlug?.trim();
    if (!cleanSlug) {
      if (initialSelectedBusiness === null) {
        setSelectedBusiness(null);
      }
      return;
    }
    if (initialSelectedBusiness && initialSelectedBusiness.slug === cleanSlug) {
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    loadDiscoveryDetailBySlug(cleanSlug, resolveDetail).then((result) => {
      if (!active) return;
      setSelectedBusiness(result.business);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [marketplaceEnabled, initialSlug, initialSelectedBusiness, resolveDetail]);

  const handleOpenDetail = async (slug: string) => {
    if (onSelectBusinessSlug) {
      onSelectBusinessSlug(slug);
      return;
    }
    setError(null);
    const result = await loadDiscoveryDetailBySlug(slug, resolveDetail);
    if (result.business) {
      setSelectedBusiness(result.business);
    } else {
      setError(result.error);
    }
  };

  const handleSubmitTokenReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setReviewStatus(null);
    const res = await discoveryMarketplaceService.createVerifiedReviewByManageToken({
      manageToken,
      rating: reviewRating,
      title: reviewTitle || undefined,
      content: reviewContent || undefined,
      idempotencyKey: reviewIdempotencyKey,
      expectedTenantSlug: selectedBusiness?.slug,
    });
    if (res.success === true) {
      setReviewStatus('Doğrulanmış yorumunuz moderasyon onayına gönderildi.');
    } else {
      setReviewStatus(`Yorum reddedildi (${res.error.reasonCode || res.error.code}): ${res.error.message}`);
    }
  };

  const handleLoadFastRebooking = async () => {
    setRebookStatus(null);
    setRebookSeed(null);
    const res = await discoveryMarketplaceService.getFastRebookingSeed({ manageToken });
    if (res.success === true && res.data.seed) {
      setRebookSeed(res.data.seed);
      onFastRebookSeed?.(res.data.seed);
    } else if (res.success === false) {
      setRebookStatus(`Hızlı yeniden randevu başlatılamadı: ${res.error.reasonCode || res.error.code}`);
    }
  };

  if (!marketplaceEnabled) {
    return (
      <div
        data-testid="discovery-marketplace-disabled"
        className="max-w-3xl mx-auto p-6 bg-white rounded-2xl border border-gray-200 shadow-sm text-center space-y-2"
      >
        <h2 className="text-lg font-bold text-gray-900">Keşif Pazar Yeri Kapalı</h2>
        <p className="text-sm text-gray-600">
          V1 doğrudan mağaza bağlantıları (/#/s/:slug ve alt alan adları) Pazar Yeri aktivasyonundan bağımsız olarak
          çalışmaya devam eder.
        </p>
      </div>
    );
  }

  if (selectedBusiness) {
    const directUrl = publicLinkService.getDirectStorefrontUrl(
      { id: selectedBusiness.tenantId, slug: selectedBusiness.slug },
      { style: 'legacy_s' }
    );
    return (
      <div
        data-testid="discovery-marketplace-detail-view"
        data-discovery-route-slug={initialSlug?.trim() || selectedBusiness.slug}
        className="space-y-6"
      >
        <button
          type="button"
          onClick={() => {
            setSelectedBusiness(null);
            onClearSelection?.();
          }}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          ← Tüm İşletmelere Dön
        </button>

        <DiscoveryPortfolio
          business={selectedBusiness}
          directStorefrontUrl={directUrl}
          onBookNow={() => onBookBusiness?.(selectedBusiness.slug)}
        />

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <form
            onSubmit={handleSubmitTokenReview}
            data-testid="verified-review-form"
            className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3"
          >
            <h3 className="text-base font-bold text-gray-900">Doğrulanmış Yorum Yaz</h3>
            <p className="text-xs text-gray-500">
              Yalnızca tamamlanmış randevunuza ait yönetim kodu (manage token) ile yorum bırakabilirsiniz.
            </p>
            <input
              type="text"
              value={manageToken}
              onChange={(e) => setManageToken(e.target.value)}
              placeholder="Randevu yönetim kodu"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <select
              value={reviewRating}
              onChange={(e) => setReviewRating(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} Yıldız
                </option>
              ))}
            </select>
            <input
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="Başlık (isteğe bağlı)"
              maxLength={160}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <textarea
              value={reviewContent}
              onChange={(e) => setReviewContent(e.target.value)}
              placeholder="Deneyiminizi paylaşın"
              maxLength={4000}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
            >
              Yorumu Gönder
            </button>
            {reviewStatus && (
              <p role="status" className="text-xs text-gray-700">
                {reviewStatus}
              </p>
            )}
          </form>

          <div
            data-testid="fast-rebooking-panel"
            className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3"
          >
            <h3 className="text-base font-bold text-gray-900">Hızlı Yeniden Randevu</h3>
            <p className="text-xs text-gray-500">
              Tamamlanmış randevunuzdaki hizmet ve uzman bilgisini güncel uygunluk saatleriyle yeniden yükleyin.
            </p>
            <button
              type="button"
              onClick={handleLoadFastRebooking}
              className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg"
            >
              Hızlı Randevu Bilgilerini Getir
            </button>
            {rebookSeed && (
              <div className="p-3 bg-indigo-50 rounded-xl text-xs text-indigo-900 space-y-1">
                <div>
                  <strong>Hizmet:</strong> {rebookSeed.serviceName} ({rebookSeed.currentServiceDurationMinutes} dk)
                </div>
                <div>
                  <strong>Uzman:</strong> {rebookSeed.staffName}
                </div>
                <div>
                  <strong>Fiyat:</strong> ₺{rebookSeed.currentServicePrice.toLocaleString('tr-TR')}
                </div>
              </div>
            )}
            {rebookStatus && (
              <p role="alert" className="text-xs text-red-600">
                {rebookStatus}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="discovery-marketplace-view"
      data-discovery-route-slug={initialSlug?.trim() || ''}
      className="max-w-6xl mx-auto space-y-6"
    >
      <div className="bg-white rounded-2xl border border-gray-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="İşletme veya hizmet ara..."
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Şehir"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <input
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Kategori"
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-500">İşletmeler yükleniyor...</div>
      ) : listings.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500 bg-white rounded-2xl border border-gray-200">
          Kriterlerinize uygun yayında işletme bulunamadı ({totalCount}).
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((item) => {
            const safeCover = safeExternalUrl(item.coverImageUrl);
            return (
              <div
                key={item.tenantId}
                className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-44 bg-gray-100">
                    {safeCover ? (
                      <img src={safeCover} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-slate-200 flex items-center justify-center text-indigo-700 font-bold text-xl">
                        {item.name.charAt(0)}
                      </div>
                    )}
                    <div className="absolute top-3 left-3 bg-white/90 px-2.5 py-0.5 rounded-full text-xs font-semibold text-indigo-800">
                      {item.businessCategory}
                    </div>
                    <div className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-0.5 rounded-lg text-xs font-semibold">
                      {item.reviewCount > 0 && item.averageRating > 0
                        ? `★ ${item.averageRating.toFixed(1)} (${item.reviewCount})`
                        : 'Yeni'}
                    </div>
                  </div>
                  <div className="p-5 space-y-2">
                    <h3 className="text-lg font-bold text-gray-900">{item.name}</h3>
                    <p className="text-xs text-gray-500">
                      {item.district}, {item.city}
                    </p>
                    {item.shortDescription && (
                      <p className="text-xs text-gray-600 line-clamp-2">{item.shortDescription}</p>
                    )}
                  </div>
                </div>
                <div className="px-5 pb-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => void handleOpenDetail(item.slug)}
                    className="text-xs font-semibold text-indigo-600 hover:underline"
                  >
                    Portföyü İncele →
                  </button>
                  <a
                    href={publicLinkService.getDirectStorefrontUrl(
                      { id: item.tenantId, slug: item.slug },
                      { style: 'legacy_s' }
                    )}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Doğrudan Mağaza
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DiscoveryMarketplaceRoute: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const navigate = useNavigate();
  return (
    <DiscoveryMarketplaceView
      initialSlug={tenantSlug}
      onSelectBusinessSlug={(slug) => navigate(`/discovery/${encodeURIComponent(slug)}`)}
      onClearSelection={() => navigate('/discovery')}
      onBookBusiness={(slug) => navigate(`/s/${encodeURIComponent(slug)}`)}
    />
  );
};

export default DiscoveryMarketplaceRoute;
