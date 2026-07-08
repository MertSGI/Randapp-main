export type FeatureStatus = 
  | 'live_in_mock'
  | 'pilot_ready'
  | 'sandbox_ready'
  | 'backend_required'
  | 'roadmap'
  | 'production_ready'
  | 'ai_backend_required';

export interface FeatureDefinition {
  id: string;
  nameEn: string;
  nameTr: string;
  status: FeatureStatus;
  descriptionEn?: string;
  descriptionTr?: string;
}

export const FEATURE_STATUSES: Record<string, FeatureDefinition> = {
  mini_website: {
    id: 'mini_website',
    nameEn: 'Mini Website',
    nameTr: 'Mini Web Sitesi',
    status: 'pilot_ready'
  },
  online_booking: {
    id: 'online_booking',
    nameEn: 'Online Booking',
    nameTr: 'Online Randevu',
    status: 'pilot_ready'
  },
  customer_portal: {
    id: 'customer_portal',
    nameEn: 'Customer Portal',
    nameTr: 'Müşteri Paneli',
    status: 'pilot_ready'
  },
  appointment_cancellation: {
    id: 'appointment_cancellation',
    nameEn: 'Appointment Cancellation',
    nameTr: 'Randevu İptali',
    status: 'pilot_ready'
  },
  customer_memory: {
    id: 'customer_memory',
    nameEn: 'Customer Memory',
    nameTr: 'Müşteri Hafızası',
    status: 'live_in_mock'
  },
  customer_notes: {
    id: 'customer_notes',
    nameEn: 'Customer Notes',
    nameTr: 'Müşteri Notları',
    status: 'live_in_mock'
  },
  reference_photos: {
    id: 'reference_photos',
    nameEn: 'Reference Photos',
    nameTr: 'Referans Fotoğraflar',
    status: 'backend_required'
  },
  referral_campaigns: {
    id: 'referral_campaigns',
    nameEn: 'Referral Campaigns',
    nameTr: 'Referans Kampanyaları',
    status: 'live_in_mock'
  },
  dynamic_plans: {
    id: 'dynamic_plans',
    nameEn: 'Dynamic Plans',
    nameTr: 'Dinamik Planlar',
    status: 'pilot_ready'
  },
  trial_checkout: {
    id: 'trial_checkout',
    nameEn: 'Trial Checkout',
    nameTr: 'Deneme Sürümü Alışverişi',
    status: 'sandbox_ready'
  },
  live_payment: {
    id: 'live_payment',
    nameEn: 'Live Payment',
    nameTr: 'Canlı Ödeme',
    status: 'backend_required'
  },
  iyzico_sandbox: {
    id: 'iyzico_sandbox',
    nameEn: 'Iyzico Sandbox',
    nameTr: 'Iyzico Sandbox',
    status: 'sandbox_ready'
  },
  ai_recommendation: {
    id: 'ai_recommendation',
    nameEn: 'AI Recommendation',
    nameTr: 'Yapay Zeka Önerileri',
    status: 'backend_required'
  },
  ai_visualization: {
    id: 'ai_visualization',
    nameEn: 'AI Visualization',
    nameTr: 'Yapay Zeka Görselleştirme',
    status: 'ai_backend_required'
  },
  mobile_app: {
    id: 'mobile_app',
    nameEn: 'Mobile App',
    nameTr: 'Mobil Uygulama',
    status: 'roadmap'
  },
  location_discovery: {
    id: 'location_discovery',
    nameEn: 'Location-Based Discovery',
    nameTr: 'Konum Bazlı Keşif',
    status: 'roadmap'
  },
  ratings_reviews: {
    id: 'ratings_reviews',
    nameEn: 'Ratings & Reviews',
    nameTr: 'Değerlendirmeler ve Yorumlar',
    status: 'roadmap'
  },
  custom_domain: {
    id: 'custom_domain',
    nameEn: 'Custom Domain Support',
    nameTr: 'Özel Alan Adı Desteği',
    status: 'backend_required'
  },
  super_admin_management: {
    id: 'super_admin_management',
    nameEn: 'Super Admin Plan Management',
    nameTr: 'Süper Admin Plan Yönetimi',
    status: 'live_in_mock'
  }
};

export const getFeatureStatusBadge = (status: FeatureStatus, language: 'en' | 'tr' = 'en') => {
  const badges = {
    live_in_mock: { en: 'Interactive Preview', tr: 'İnteraktif Önizleme', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    pilot_ready: { en: 'In Preview', tr: 'Önizlemede', color: 'bg-green-100 text-green-800 border-green-200' },
    sandbox_ready: { en: 'Early Access', tr: 'Erken Erişim', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    backend_required: { en: 'Early Access', tr: 'Erken Erişim', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    ai_backend_required: { en: 'Advanced AI', tr: 'Gelişmiş AI', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    roadmap: { en: 'Expansion', tr: 'Platform Genişlemesi', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    production_ready: { en: 'Live', tr: 'Yayında', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  };
  
  const b = badges[status];
  return {
    label: b[language],
    className: `text-xs font-semibold px-2 py-0.5 rounded-full border ${b.color}`
  };
};
