import React, { useState } from 'react';
import type {
  DiscoveryBusinessDetailDTO,
  DiscoveryServiceDetailDTO,
  DiscoveryRecentReviewDTO,
} from '../../types/discoveryMarketplaceDTOs';

export interface DiscoveryPortfolioProps {
  business: DiscoveryBusinessDetailDTO;
  onSelectService?: (service: DiscoveryServiceDetailDTO) => void;
  onBookNow?: (service?: DiscoveryServiceDetailDTO) => void;
}

export const DiscoveryPortfolio: React.FC<DiscoveryPortfolioProps> = ({
  business,
  onSelectService,
  onBookNow,
}) => {
  const [activeTab, setActiveTab] = useState<'about' | 'services' | 'reviews' | 'gallery'>('services');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const {
    name,
    businessCategory,
    shortDescription,
    aboutText,
    city,
    district,
    address,
    coverImageUrl,
    logoUrl,
    galleryImages = [],
    amenities = [],
    services = [],
    reviewsSummary,
    recentReviews = [],
    branches = [],
    phone,
    instagramUrl,
    websiteUrl,
    openingHoursSummary,
  } = business;

  const defaultCover = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80';
  const reviewCount = reviewsSummary?.totalReviews ?? 0;
  const hasRating = reviewCount > 0 && (reviewsSummary?.averageRating ?? 0) > 0;

  return (
    <div className="discovery-portfolio bg-white text-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 max-w-5xl mx-auto my-8">
      {/* Cover Header */}
      <div className="relative h-64 md:h-80 w-full bg-gray-900">
        <img
          src={coverImageUrl || defaultCover}
          alt={name}
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        
        <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4 text-white">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${name} Logo`}
                className="w-20 h-20 rounded-xl object-cover border-2 border-white shadow-lg bg-white"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-white shadow-lg">
                {name.charAt(0)}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/80 text-white">
                  {businessCategory}
                </span>
                <span className="text-xs text-gray-200">
                  {district}, {city}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1">
                {name}
              </h1>
              {shortDescription && (
                <p className="text-sm text-gray-200 line-clamp-1 max-w-xl">
                  {shortDescription}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-center border border-white/20">
              <div className="flex items-center justify-center gap-1 text-amber-400 font-bold text-lg">
                {hasRating ? (
                  <>
                    <span>★</span>
                    <span>{reviewsSummary.averageRating.toFixed(1)}</span>
                  </>
                ) : (
                  <span className="text-sm text-white">Yeni</span>
                )}
              </div>
              <div className="text-xs text-gray-300">
                {reviewCount > 0 ? `${reviewCount} değerlendirme` : 'Henüz değerlendirme yok'}
              </div>
            </div>
            {onBookNow && (
              <button
                onClick={() => onBookNow()}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition duration-150 shadow-md"
              >
                Randevu Al
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 bg-gray-50/50 px-6 flex gap-8">
        {(['services', 'about', 'gallery', 'reviews'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`py-4 font-medium text-sm border-b-2 transition-colors duration-150 capitalize ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab === 'services' && `Hizmetler (${services.length})`}
            {tab === 'about' && 'Hakkında'}
            {tab === 'gallery' && `Galeri (${galleryImages.length})`}
            {tab === 'reviews' && `Yorumlar (${recentReviews.length})`}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6 md:p-8">
        {/* Services Tab */}
        {activeTab === 'services' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Sunulan Hizmetler</h2>
            {services.length === 0 ? (
              <p className="text-gray-500 text-sm">Bu işletme için listelenen aktif hizmet bulunmamaktadır.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((service) => (
                  <div
                    key={service.id}
                    className="p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition bg-white flex justify-between items-center"
                  >
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base">
                        {service.nameTr || service.name}
                      </h3>
                      {service.category && (
                        <span className="text-xs text-gray-500">{service.category} • </span>
                      )}
                      <span className="text-xs text-gray-500">{service.duration} dk</span>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <span className="font-bold text-indigo-600 text-base">
                        ₺{service.price.toLocaleString('tr-TR')}
                      </span>
                      <button
                        onClick={() => {
                          if (onSelectService) onSelectService(service);
                          if (onBookNow) onBookNow(service);
                        }}
                        className="text-xs font-semibold px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition"
                      >
                        Seç & Randevu Al
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">İşletme Profili</h2>
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                {aboutText || shortDescription || 'İşletme hakkında detaylı açıklama bulunmuyor.'}
              </p>
            </div>

            {amenities.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">
                  Öne Çıkan Olanaklar & Ayrıcalıklar
                </h3>
                <div className="flex flex-wrap gap-2">
                  {amenities.map((item, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium"
                    >
                      ✓ {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">İletişim & Konum</h3>
                <p className="text-xs text-gray-600 mb-1">
                  <strong>Adres:</strong> {address || `${district}, ${city}`}
                </p>
                {phone && (
                  <p className="text-xs text-gray-600 mb-1">
                    <strong>Telefon:</strong> {phone}
                  </p>
                )}
                {openingHoursSummary && (
                  <p className="text-xs text-gray-600 mb-1">
                    <strong>Çalışma Saatleri:</strong> {openingHoursSummary}
                  </p>
                )}
              </div>

              {branches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Şubeler</h3>
                  <div className="space-y-1">
                    {branches.map((b) => (
                      <div key={b.id} className="text-xs text-gray-600 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span>{b.name}</span>
                        {b.isPrimary && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                            Merkez
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Gallery Tab */}
        {activeTab === 'gallery' && (
          <div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Fotoğraf Galerisi</h2>
            {galleryImages.length === 0 ? (
              <p className="text-gray-500 text-sm">Henüz galeri görseli yüklenmemiş.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {galleryImages.map((img, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    className="aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition group relative"
                  >
                    <img
                      src={img}
                      alt={`${name} Galeri ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Modal preview */}
            {selectedImage && (
              <div
                className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
                onClick={() => setSelectedImage(null)}
              >
                <div className="relative max-w-4xl max-h-[90vh]">
                  <img
                    src={selectedImage}
                    alt="Büyük Görsel"
                    className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl"
                  />
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute -top-10 right-0 text-white font-bold text-lg hover:text-gray-300"
                  >
                    ✕ Kapat
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Müşteri Yorumları</h2>
                <p className="text-xs text-gray-500">
                  Doğrulanmış randevu sahiplerinden gerçek geri bildirimler.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-black ${hasRating ? 'text-2xl text-amber-500' : 'text-sm text-gray-500'}`}>
                  {hasRating ? reviewsSummary.averageRating.toFixed(1) : 'Puan yok'}
                </span>
                <div className="text-xs text-gray-500">
                  {hasRating && <div>★★★★★</div>}
                  <div>{reviewCount > 0 ? `${reviewCount} değerlendirme` : 'Henüz değerlendirme yok'}</div>
                </div>
              </div>
            </div>

            {recentReviews.length === 0 ? (
              <p className="text-gray-500 text-sm">Henüz yayınlanmış bir yorum bulunmuyor.</p>
            ) : (
              <div className="space-y-4">
                {recentReviews.map((rev) => (
                  <div key={rev.id} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-500 text-sm">
                          {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                        </span>
                        {rev.title && <span className="font-semibold text-xs text-gray-800">{rev.title}</span>}
                      </div>
                      <span className="text-[11px] text-gray-400">
                        {new Date(rev.createdAt).toLocaleDateString('tr-TR')}
                      </span>
                    </div>
                    {rev.content && <p className="text-xs text-gray-600 leading-relaxed">{rev.content}</p>}
                    {rev.responseText && (
                      <div className="mt-3 pl-3 border-l-2 border-indigo-400 text-xs text-gray-500 bg-white p-2 rounded-r-lg">
                        <strong className="text-indigo-600 block mb-0.5">İşletme Yanıtı:</strong>
                        {rev.responseText}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DiscoveryPortfolio;
