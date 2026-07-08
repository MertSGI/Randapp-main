import { Tenant, User, TenantBranding } from '../types';
import { tenantService } from './tenantService';
import { authService } from './authService';
import { dataProvider } from './dataProvider';
import { TRIAL_CONFIG } from './trialConfigService';

export const DEMO_PILOT_TENANT_ID = 'tenant_pilot_demo';

const createSVGPlaceholder = (text: string, color1: string, color2: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color1};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${color2};stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="800" height="600" fill="url(#grad)" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="bold" font-size="48" fill="white" opacity="0.9">${text}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const PILOT_TENANT: Tenant = {
  id: DEMO_PILOT_TENANT_ID,
  slug: 'demo',
  name: 'Lumina Güzellik & Kuaför',
  status: 'active',
  publicSiteStatus: 'published',
  verificationStatus: 'approved',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  branding: {
    tenantId: DEMO_PILOT_TENANT_ID,
    businessName: 'Lumina Güzellik & Kuaför',
    tagline: 'Kendinizi özel hissedeceğiniz o yer',
    footerText: 'Lumina Güzellik. Tüm hakları saklıdır.',
    primaryColor: '#8b5cf6',
  }
};

const PILOT_BUSINESS_PROFILE = {
    tenantId: DEMO_PILOT_TENANT_ID,
    public_display_name: 'Lumina Güzellik & Kuaför',
    about_text: 'Şehrin merkezinde, kendinizi özel hissedeceğiniz profesyonel saç, cilt ve tırnak bakım stüdyosu. Uzman kadromuzla yanınızdayız.',
    short_description: 'Şehrin en iyi saç tasarım ve bakım stüdyosu.',
    contact_phone: '0555 123 45 67',
    contact_email: 'info@luminaguzellik.local',
    address: 'Atatürk Caddesi, No: 123, Kat: 2',
    city: 'İstanbul',
    district: 'Kadıköy',
    instagram_handle: 'luminaguzellik',
    business_category: 'Güzellik Salonu',
    working_hours: {
      "Monday": "09:00-19:00",
      "Tuesday": "09:00-19:00",
      "Wednesday": "09:00-19:00",
      "Thursday": "09:00-19:00",
      "Friday": "09:00-20:00",
      "Saturday": "09:00-20:00",
      "Sunday": "Kapalı"
    },
    logo_url: createSVGPlaceholder('Lumina', '#1e1b4b', '#4c1d95'),
    cover_images: [
      createSVGPlaceholder('Stüdyo İç Mekan', '#312e81', '#4338ca'),
      createSVGPlaceholder('Saç Tasarım Merkezi', '#4c1d95', '#6d28d9'),
      createSVGPlaceholder('Manikür Masası', '#7c3aed', '#8b5cf6'),
      createSVGPlaceholder('Berber Bölümü', '#1e1b4b', '#3730a3'),
      createSVGPlaceholder('Bekleme Alanı', '#3730a3', '#4f46e5')
    ],
    gallery_images: [
      createSVGPlaceholder('Saç Kesimi', '#1e1b4b', '#3730a3'),
      createSVGPlaceholder('Manikür', '#4338ca', '#4f46e5'),
      createSVGPlaceholder('Saç Boyama', '#4c1d95', '#6d28d9'),
      createSVGPlaceholder('Müşteri Geri Bildirimi', '#312e81', '#4338ca')
    ]
};

const PILOT_USER: User = {
  id: 'user_pilot_owner',
  tenantId: DEMO_PILOT_TENANT_ID,
  name: 'Demo Sahibi',
  email: 'owner@lumina.local',
  role: 'tenant_owner',
  active: true,
};

// Realistic mock services and staff
const PILOT_SERVICES = [
  { id: 'srv_1', tenantId: DEMO_PILOT_TENANT_ID, name: 'Saç Kesimi', description: 'Yüz şeklinize uygun, modern ve trend kesimler.', duration: 45, price: 750, categoryId: 'cat_hair', image: createSVGPlaceholder('Saç Kesimi', '#1e1b4b', '#312e81') },
  { id: 'srv_2', tenantId: DEMO_PILOT_TENANT_ID, name: 'Dip Boya', description: 'Amonyaksız, saç derisine uyumlu profesyonel dip boyama.', duration: 60, price: 900, categoryId: 'cat_hair', image: createSVGPlaceholder('Dip Boya', '#312e81', '#4338ca') },
  { id: 'srv_3', tenantId: DEMO_PILOT_TENANT_ID, name: 'Fön (Kırık & Düz)', description: 'Kalıcı ve dolgun görünümlü şekillendirici profesyonel fön.', duration: 30, price: 350, categoryId: 'cat_hair', image: createSVGPlaceholder('Fön', '#4338ca', '#4f46e5') },
  { id: 'srv_4', tenantId: DEMO_PILOT_TENANT_ID, name: 'Manikür', description: 'Klasik tırnak bakımı, kütikül temizliği ve nemlendirme.', duration: 45, price: 450, categoryId: 'cat_nails', image: createSVGPlaceholder('Manikür', '#4c1d95', '#6d28d9') },
  { id: 'srv_5', tenantId: DEMO_PILOT_TENANT_ID, name: 'Kalıcı Oje', description: 'UV destekli, 3 haftaya kadar kalıcı parlak oje uygulaması.', duration: 60, price: 650, categoryId: 'cat_nails', image: createSVGPlaceholder('Kalıcı Oje', '#6d28d9', '#7c3aed') },
  { id: 'srv_6', tenantId: DEMO_PILOT_TENANT_ID, name: 'Cilt Bakımı', description: 'Derinlemesine gözenek temizliği, maske ve yüz masajı.', duration: 90, price: 1500, categoryId: 'cat_skin', image: createSVGPlaceholder('Cilt Bakımı', '#7c3aed', '#8b5cf6') },
  { id: 'srv_7', tenantId: DEMO_PILOT_TENANT_ID, name: 'Lazer Epilasyon (Tüm Vücut)', description: 'Spor sonrası dahi ferah hissettiren yüksek teknoloji buz lazer.', duration: 60, price: 2500, categoryId: 'cat_body', image: createSVGPlaceholder('Lazer', '#4c1d95', '#1e1b4b') },
];

const PILOT_STAFF = [
  { id: 'stf_1', tenantId: DEMO_PILOT_TENANT_ID, name: 'Elif Yılmaz', role: 'Saç Uzmanı', title: 'Master Saç Stilisti', isAvailable: true, services: ['srv_1', 'srv_2', 'srv_3'], image: createSVGPlaceholder('EY', '#4c1d95', '#7c3aed') },
  { id: 'stf_2', tenantId: DEMO_PILOT_TENANT_ID, name: 'Zeynep Kaya', role: 'Tırnak Uzmanı', title: 'Nail Artist', isAvailable: true, services: ['srv_4', 'srv_5'], image: createSVGPlaceholder('ZK', '#4338ca', '#4f46e5') },
  { id: 'stf_3', tenantId: DEMO_PILOT_TENANT_ID, name: 'Ahmet Demir', role: 'Kuaför', title: 'Senior Kuaför (Kesim & Renk)', isAvailable: true, services: ['srv_1', 'srv_2', 'srv_3'], image: createSVGPlaceholder('AD', '#312e81', '#3730a3') },
  { id: 'stf_4', tenantId: DEMO_PILOT_TENANT_ID, name: 'Ceren Şahin', role: 'Estetisyen', title: 'Kıdemli Estetisyen (Cilt & Vücut)', isAvailable: true, services: ['srv_6', 'srv_7'], image: createSVGPlaceholder('CŞ', '#6d28d9', '#8b5cf6') },
];

const PILOT_CUSTOMERS = [
  { id: 'cus_1', tenantId: DEMO_PILOT_TENANT_ID, name: 'Ayşe T.', phone: '5551234567', notes: 'Boya sonrası hassasiyet. Papatya çayı tercih ediyor.', appointmentCount: 6, lastVisit: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(), consent_marketing: true, consent_kvkk: true },
  { id: 'cus_2', tenantId: DEMO_PILOT_TENANT_ID, name: 'Deniz K.', phone: '5559876543', notes: 'Hafta sonu sabah saatlerini tercih eder. Röfle seviyor.', appointmentCount: 12, lastVisit: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), consent_marketing: true, consent_kvkk: true },
  { id: 'cus_3', tenantId: DEMO_PILOT_TENANT_ID, name: 'Merve S.', phone: '5551112233', notes: 'Yeni taşınmış, mahalleyi keşfediyor, referansla geldi.', appointmentCount: 1, lastVisit: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), consent_marketing: false, consent_kvkk: true },
  { id: 'cus_4', tenantId: DEMO_PILOT_TENANT_ID, name: 'Selim B.', phone: '5554445566', notes: 'Hızlı olmak istiyor, tıraş esnasında telefon görüşmesi yapabilir.', appointmentCount: 8, lastVisit: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(), consent_marketing: true, consent_kvkk: true },
  { id: 'cus_5', tenantId: DEMO_PILOT_TENANT_ID, name: 'Gülçin E.', phone: '5557778899', notes: 'Tırnak yapısı hassas.', appointmentCount: 2, lastVisit: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(), consent_marketing: false, consent_kvkk: false },
  { id: 'cus_6', tenantId: DEMO_PILOT_TENANT_ID, name: 'Hande V.', phone: '5550001122', notes: '', appointmentCount: 0, lastVisit: null },
];

const todayStr = new Date().toISOString().split('T')[0];
const yesterdayStr = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString().split('T')[0];
const tomorrowStr = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().split('T')[0];

const PILOT_APPOINTMENTS = [
  { id: 'app_1', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_1', staffId: 'stf_1', customerName: 'Ayşe T.', customerPhone: '5551234567', date: todayStr, time: '10:00', status: 'confirmed', source: 'whatsapp' },
  { id: 'app_2', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_4', staffId: 'stf_2', customerName: 'Hande V.', customerPhone: '5550001122', date: todayStr, time: '14:30', status: 'pending', source: 'instagram', notes: 'İlk gelişi, yönlendirmeyle buldu.' },
  { id: 'app_3', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_2', staffId: 'stf_3', customerName: 'Deniz K.', customerPhone: '5559876543', date: todayStr, time: '16:00', status: 'confirmed', source: 'web' },
  { id: 'app_4', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_5', staffId: 'stf_2', customerName: 'Gülçin E.', customerPhone: '5557778899', date: yesterdayStr, time: '11:00', status: 'confirmed', source: 'web' }, // count as completed for stats demo purposes
  { id: 'app_5', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_7', staffId: 'stf_4', customerName: 'Merve S.', customerPhone: '5551112233', date: yesterdayStr, time: '15:00', status: 'cancelled', cancelReason: 'Hasta olduğu için gelemedi', source: 'whatsapp' },
  { id: 'app_6', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_6', staffId: 'stf_4', customerName: 'Ayşe T.', customerPhone: '5551234567', date: yesterdayStr, time: '17:00', status: 'no_show', source: 'google_maps' },
  { id: 'app_7', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_1', staffId: 'stf_3', customerName: 'Selim B.', customerPhone: '5554445566', date: tomorrowStr, time: '09:00', status: 'confirmed', source: 'web' },
  { id: 'app_8', tenantId: DEMO_PILOT_TENANT_ID, serviceId: 'srv_3', staffId: 'stf_1', customerName: 'Bilinmeyen', customerPhone: '5559990099', date: tomorrowStr, time: '11:30', status: 'pending', source: 'qr' },
];

export const pilotDemoService = {
  
  async seedDemoDataOnly() {
    // Seed Data into dataprovider explicitly for `tenant_pilot_demo`
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:branding`, PILOT_TENANT.branding);
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:profile`, PILOT_BUSINESS_PROFILE);
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:services`, PILOT_SERVICES);
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:staff`, PILOT_STAFF);
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:appointments`, PILOT_APPOINTMENTS);
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:customers`, PILOT_CUSTOMERS);
    
    // Seed campaign data
    const mockCampaigns = [{
      id: 'camp_demo',
      tenantId: DEMO_PILOT_TENANT_ID,
      name: 'Yaz Başlangıcı Arkadaşını Getir',
      type: 'refer_friend',
      isActive: true,
      rewardDescription: 'Referansla gelen müşterinin ilk randevusundan sonra her ikinize de indirim.',
      customerReward: 'Bir sonraki randevuda %15 indirim',
      referredCustomerReward: 'İlk randevuda %10 indirim',
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      maxUses: 50,
      terms: 'Sadece yeni müşteri getirenler için geçerlidir.',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
    }];
    
    const mockReferrals = [
      {
        id: 'cref_demo_1',
        tenantId: DEMO_PILOT_TENANT_ID,
        campaignId: 'camp_demo',
        referrerCustomerId: 'cus_2', // Deniz K.
        referredCustomerName: 'Merve S.',
        referredCustomerPhone: '5551112233',
        status: 'rewarded',
        appointmentId: 'app_5', // Used in some history
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString()
      },
      {
        id: 'cref_demo_2',
        tenantId: DEMO_PILOT_TENANT_ID,
        campaignId: 'camp_demo',
        referrerCustomerId: 'cus_1', // Ayşe T.
        referredCustomerName: 'Hande V.',
        referredCustomerPhone: '5550001122',
        status: 'booked',
        appointmentId: 'app_2',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        updatedAt: yesterdayStr
      }
    ];
    
    const mockRewards = [
      {
        id: 'crew_demo_1',
        tenantId: DEMO_PILOT_TENANT_ID,
        campaignId: 'camp_demo',
        customerReferralId: 'cref_demo_1',
        customerId: 'cus_2',
        rewardOwnerType: 'referrer_customer',
        rewardDescription: 'Bir sonraki randevuda %15 indirim',
        rewardValueType: 'percent_discount',
        rewardValue: 15,
        status: 'available',
        availableAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString()
      }
    ];

    localStorage.setItem('lari_customer_campaigns_by_tenant', JSON.stringify(mockCampaigns));
    localStorage.setItem('lari_customer_referrals_by_tenant', JSON.stringify(mockReferrals));
    localStorage.setItem('lari_customer_campaign_rewards_by_tenant', JSON.stringify(mockRewards));
    // Also use the randapp keys just in case
    localStorage.setItem(`randapp_business_campaigns`, JSON.stringify(mockCampaigns));
    localStorage.setItem(`randapp_business_referrals`, JSON.stringify(mockReferrals));
    
    // Seed billing status to pass admin gates
    const mockSub = {
        tenantId: DEMO_PILOT_TENANT_ID,
        planId: 'professional',
        status: 'active',
        trialStart: new Date().toISOString(),
        trialEnd: new Date(new Date().setDate(new Date().getDate() + TRIAL_CONFIG.trialDayCount)).toISOString(),
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        cancelAtPeriodEnd: false,
        paymentProvider: 'local_dry_run'
    };
    await dataProvider.set(`randapp:${DEMO_PILOT_TENANT_ID}:subscription`, mockSub);
    localStorage.setItem(`mock_subscription_${DEMO_PILOT_TENANT_ID}`, JSON.stringify(mockSub));
    
    // Set allowed client-facing keys
    localStorage.setItem('lari_demo_context', 'true');
    localStorage.setItem('lari_active_demo_tenant_id', DEMO_PILOT_TENANT_ID);
  },

  async seedAndEnterDemoContext() {
    // First ensure the demo data itself is fully seeded
    await this.seedDemoDataOnly();

    // Save previous state to restore later if needed
    const prevTenant = localStorage.getItem('lari_active_tenant_id');
    const prevSession = localStorage.getItem('lari_active_owner_session');
    
    // We do NOT overwrite lari_registered_tenants array, just the active one for the session
    if (prevTenant && prevTenant !== DEMO_PILOT_TENANT_ID) {
       localStorage.setItem('lari_saved_real_tenant_id', prevTenant);
    }
    if (prevSession && !prevSession.includes('user_pilot_owner')) {
       localStorage.setItem('lari_saved_real_session', prevSession);
    }
    
    // Auth and tenant active for OWNER
    localStorage.setItem('lari_active_tenant_id', DEMO_PILOT_TENANT_ID);
    localStorage.setItem('lari_active_owner_session', JSON.stringify(PILOT_USER));
    localStorage.setItem('lari_in_pilot_demo', 'true');
    
    // Append to registered tenants list only if not exists, but we can also just let it be loaded from session
    const regArr = JSON.parse(localStorage.getItem('lari_registered_tenants') || '[]');
    if (!regArr.some((t: any) => t.id === DEMO_PILOT_TENANT_ID)) {
       regArr.push({
           id: DEMO_PILOT_TENANT_ID,
           businessName: PILOT_TENANT.name,
           email: PILOT_USER.email,
           planId: 'professional',
           status: 'active',
           publicSiteStatus: 'published',
           verificationStatus: 'approved',
           created_at: new Date().toISOString()
       });
       localStorage.setItem('lari_registered_tenants', JSON.stringify(regArr));
     }
  },

  async startPilotOwnerDemoSession() {
     await this.seedAndEnterDemoContext();
  },

  async exitDemoContext() {
     localStorage.removeItem('lari_in_pilot_demo');
     localStorage.removeItem('lari_demo_context');
     localStorage.removeItem('lari_active_demo_tenant_id');
     
     const savedTenant = localStorage.getItem('lari_saved_real_tenant_id');
     if (savedTenant) {
         localStorage.setItem('lari_active_tenant_id', savedTenant);
         localStorage.removeItem('lari_saved_real_tenant_id');
     } else {
         localStorage.removeItem('lari_active_tenant_id');
     }
     
     const savedSession = localStorage.getItem('lari_saved_real_session');
     if (savedSession) {
         localStorage.setItem('lari_active_owner_session', savedSession);
         localStorage.removeItem('lari_saved_real_session');
     } else {
         localStorage.removeItem('lari_active_owner_session');
     }
  },
  
  isPilotDemoActive() {
      return localStorage.getItem('lari_in_pilot_demo') === 'true';
  }
};
