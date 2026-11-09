/**
 * Synthetic Salon Fixture Service (Phase F)
 * Provides deterministic fixtures and rehearsal journey execution
 * for the first synthetic salon onboarding rehearsal.
 * Zero real external communications, zero real publications, zero staging writes.
 */

export interface SyntheticBranch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  district: string;
  city: string;
  phone: string;
  isActive: boolean;
}

export interface SyntheticStaff {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  serviceIds: string[];
  isActive: boolean;
}

export interface SyntheticService {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  durationMinutes: number;
  price: number;
  currency: 'TRY';
  isActive: boolean;
}

export interface SyntheticWeeklyHours {
  weekday: number; // 1 = Monday, 7 = Sunday
  weekdayName: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export interface SyntheticStaffLeave {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface SyntheticBooking {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  staffId: string;
  serviceId: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  status: 'confirmed' | 'rescheduled' | 'cancelled' | 'completed';
  contactConsent: boolean;
  manageToken: string;
  cancellationReason?: string;
}

export interface SyntheticSalonData {
  tenantId: string;
  slug: string;
  businessName: string;
  officialBusinessName: string;
  category: string;
  ownerEmail: string;
  phone: string;
  branch: SyntheticBranch;
  staff: SyntheticStaff[];
  services: SyntheticService[];
  weeklyHours: SyntheticWeeklyHours[];
  staffLeave: SyntheticStaffLeave[];
  bookings: SyntheticBooking[];
  publicBookingUrl: string;
  qrPayload: string;
}

export const SYNTHETIC_SALON_AURA: SyntheticSalonData = {
  tenantId: 'synthetic_salon_aura_001',
  slug: 'aura-nisantasi',
  businessName: 'Aura Kuaför & Güzellik',
  officialBusinessName: 'Aura Kuaför ve Güzellik Hizmetleri Tic. Ltd. Şti.',
  category: 'hair_and_beauty',
  ownerEmail: 'yonetici@auranisantaasi.com',
  phone: '+90 212 555 0142',
  branch: {
    id: 'branch_aura_nisantasi_01',
    tenantId: 'synthetic_salon_aura_001',
    name: 'Aura Nişantaşı',
    address: 'Teşvikiye Cad. No: 42, Kat: 2',
    district: 'Şişli',
    city: 'İstanbul',
    phone: '+90 212 555 0142',
    isActive: true
  },
  staff: [
    {
      id: 'staff_aura_01',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      name: 'Elif Yılmaz',
      role: 'Senior Stylist & Saç Uzmanı',
      email: 'elif@auranisantaasi.com',
      phone: '+90 532 555 1001',
      serviceIds: ['srv_aura_01', 'srv_aura_02', 'srv_aura_03', 'srv_aura_06'],
      isActive: true
    },
    {
      id: 'staff_aura_02',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      name: 'Can Demir',
      role: 'Estetisyen & Tırnak Sanatçısı',
      email: 'can@auranisantaasi.com',
      phone: '+90 532 555 1002',
      serviceIds: ['srv_aura_01', 'srv_aura_04', 'srv_aura_05', 'srv_aura_06'],
      isActive: true
    }
  ],
  services: [
    {
      id: 'srv_aura_01',
      tenantId: 'synthetic_salon_aura_001',
      name: 'Saç Kesimi & Yıkama',
      category: 'hair',
      durationMinutes: 45,
      price: 450,
      currency: 'TRY',
      isActive: true
    },
    {
      id: 'srv_aura_02',
      tenantId: 'synthetic_salon_aura_001',
      name: 'Fön & Şekillendirme',
      category: 'hair',
      durationMinutes: 30,
      price: 250,
      currency: 'TRY',
      isActive: true
    },
    {
      id: 'srv_aura_03',
      tenantId: 'synthetic_salon_aura_001',
      name: 'Organik Saç Boyama & Bakım',
      category: 'hair',
      durationMinutes: 90,
      price: 1200,
      currency: 'TRY',
      isActive: true
    },
    {
      id: 'srv_aura_04',
      tenantId: 'synthetic_salon_aura_001',
      name: 'Klasik Manikür',
      category: 'nails',
      durationMinutes: 40,
      price: 350,
      currency: 'TRY',
      isActive: true
    },
    {
      id: 'srv_aura_05',
      tenantId: 'synthetic_salon_aura_001',
      name: 'Spa Pedikür',
      category: 'nails',
      durationMinutes: 50,
      price: 450,
      currency: 'TRY',
      isActive: true
    },
    {
      id: 'srv_aura_06',
      tenantId: 'synthetic_salon_aura_001',
      name: 'Derinlemesine Cilt Bakımı',
      category: 'skincare',
      durationMinutes: 60,
      price: 850,
      currency: 'TRY',
      isActive: true
    }
  ],
  weeklyHours: [
    { weekday: 1, weekdayName: 'Pazartesi', isOpen: true, openTime: '09:00', closeTime: '19:00' },
    { weekday: 2, weekdayName: 'Salı', isOpen: true, openTime: '09:00', closeTime: '19:00' },
    { weekday: 3, weekdayName: 'Çarşamba', isOpen: true, openTime: '09:00', closeTime: '19:00' },
    { weekday: 4, weekdayName: 'Perşembe', isOpen: true, openTime: '09:00', closeTime: '19:00' },
    { weekday: 5, weekdayName: 'Cuma', isOpen: true, openTime: '09:00', closeTime: '19:00' },
    { weekday: 6, weekdayName: 'Cumartesi', isOpen: true, openTime: '09:00', closeTime: '19:00' },
    { weekday: 7, weekdayName: 'Pazar', isOpen: false, openTime: '00:00', closeTime: '00:00' }
  ],
  staffLeave: [
    {
      id: 'leave_aura_can_01',
      staffId: 'staff_aura_02',
      staffName: 'Can Demir',
      startDate: '2026-10-27',
      endDate: '2026-10-27',
      reason: 'Eğitim & Mesleki Seminer'
    }
  ],
  bookings: [
    {
      id: 'book_aura_001',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      customerId: 'cust_selin_01',
      customerName: 'Selin Arslan',
      customerPhone: '+905551112233',
      customerEmail: 'selin.arslan@example.com',
      staffId: 'staff_aura_01',
      serviceId: 'srv_aura_01',
      date: '2026-10-26',
      time: '10:00',
      duration: 45,
      price: 450,
      status: 'confirmed',
      contactConsent: true,
      manageToken: 'tok_selin_manage_hash_01'
    },
    {
      id: 'book_aura_002',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      customerId: 'cust_merve_02',
      customerName: 'Merve Çelik',
      customerPhone: '+905552223344',
      customerEmail: 'merve.celik@example.com',
      staffId: 'staff_aura_02',
      serviceId: 'srv_aura_04',
      date: '2026-10-26',
      time: '11:00',
      duration: 40,
      price: 350,
      status: 'confirmed',
      contactConsent: false, // Consent Denied: Tests skipped communication status
      manageToken: 'tok_merve_manage_hash_02'
    },
    {
      id: 'book_aura_003',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      customerId: 'cust_deniz_03',
      customerName: 'Deniz Koç',
      customerPhone: '+905553334455',
      customerEmail: 'deniz.koc@example.com',
      staffId: 'staff_aura_01',
      serviceId: 'srv_aura_03',
      date: '2026-10-28',
      time: '14:00',
      duration: 90,
      price: 1200,
      status: 'rescheduled',
      contactConsent: true,
      manageToken: 'tok_deniz_manage_hash_03'
    },
    {
      id: 'book_aura_004',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      customerId: 'cust_buket_04',
      customerName: 'Buket Aydın',
      customerPhone: '+905554445566',
      customerEmail: 'buket.aydin@example.com',
      staffId: 'staff_aura_02',
      serviceId: 'srv_aura_05',
      date: '2026-10-29',
      time: '15:30',
      duration: 50,
      price: 450,
      status: 'cancelled',
      contactConsent: true,
      manageToken: 'tok_buket_manage_hash_04',
      cancellationReason: 'Acil şehir dışı seyahat programı'
    },
    {
      id: 'book_aura_005',
      tenantId: 'synthetic_salon_aura_001',
      branchId: 'branch_aura_nisantasi_01',
      customerId: 'cust_ceren_05',
      customerName: 'Ceren Kaya',
      customerPhone: '+905555556677',
      customerEmail: 'ceren.kaya@example.com',
      staffId: 'staff_aura_01',
      serviceId: 'srv_aura_06',
      date: '2026-10-25',
      time: '16:00',
      duration: 60,
      price: 850,
      status: 'completed',
      contactConsent: true,
      manageToken: 'tok_ceren_manage_hash_05'
    }
  ],
  publicBookingUrl: 'https://randevulari.com/b/aura-nisantasi',
  qrPayload: 'LARI:V1:BOOKING:aura-nisantasi:QR_REHEARSAL_TOKEN_20261024'
};

export class SyntheticSalonFixtureService {
  static getFixture(): SyntheticSalonData {
    return JSON.parse(JSON.stringify(SYNTHETIC_SALON_AURA));
  }

  static getBrowserStorageSnapshot(): Record<string, string> {
    const fixture = this.getFixture();
    const registeredTenant = {
      id: fixture.tenantId,
      slug: fixture.slug,
      name: fixture.businessName,
      businessName: fixture.businessName,
      status: 'active',
      publicSiteStatus: 'published',
      verificationStatus: 'approved',
      businessRiskStatus: 'normal',
      planId: 'professional',
      branding: {
        tenantId: fixture.tenantId,
        businessName: fixture.businessName,
        tagline: 'Aura Kuaför ve Güzellik',
        footerText: 'Aura Kuaför & Güzellik. Tüm hakları saklıdır.',
        primaryColor: '#3b82f6',
      }
    };

    const businessProfile = {
      id: 'prof_aura_001',
      tenant_id: fixture.tenantId,
      public_display_name: fixture.businessName,
      business_name: fixture.businessName,
      short_description: 'Aura Nişantaşı şubesinde seçkin saç ve güzellik stüdyosu.',
      about_text: fixture.branch.name + ' şubesi — ' + fixture.officialBusinessName,
      business_category: fixture.category,
      address: fixture.branch.address,
      district: fixture.branch.district,
      city: fixture.branch.city,
      phone: fixture.phone,
      whatsapp_number: fixture.phone.replace(/[\s+]/g, ''),
      is_public_profile_enabled: true,
      cover_images: [],
      gallery_images: []
    };

    const subscription = {
      tenantId: fixture.tenantId,
      planId: 'professional',
      status: 'active',
      trialStart: '2026-01-01T00:00:00.000Z',
      trialEnd: '2026-12-31T23:59:59.000Z',
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: '2026-12-31T23:59:59.000Z',
      cancelAtPeriodEnd: false,
      paymentProvider: 'local_dry_run'
    };

    const branches = [
      {
        id: fixture.branch.id,
        tenantId: fixture.tenantId,
        name: fixture.branch.name,
        slug: fixture.slug,
        address: fixture.branch.address,
        district: fixture.branch.district,
        city: fixture.branch.city,
        phone: fixture.branch.phone,
        isPrimary: true,
        isActive: fixture.branch.isActive,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ];

    const services = fixture.services.map(s => ({
      id: s.id,
      tenantId: fixture.tenantId,
      name: s.name,
      name_tr: s.name,
      category: s.category,
      duration: s.durationMinutes,
      durationMinutes: s.durationMinutes,
      price: s.price,
      currency: s.currency,
      active: s.isActive,
      isActive: s.isActive
    }));

    const staff = fixture.staff.map(st => ({
      id: st.id,
      tenantId: fixture.tenantId,
      branchId: st.branchId,
      name: st.name,
      role: st.role,
      title: st.role,
      email: st.email,
      phone: st.phone,
      serviceIds: st.serviceIds,
      active: st.isActive,
      isActive: st.isActive
    }));

    const staffServices: Record<string, string[]> = {};
    for (const s of fixture.staff) {
      staffServices[s.id] = s.serviceIds;
    }

    const availabilityRules: any[] = [];
    for (const st of fixture.staff) {
      for (const h of fixture.weeklyHours) {
        availabilityRules.push({
          id: `rule_${st.id}_${h.weekday}`,
          tenantId: fixture.tenantId,
          staffId: st.id,
          weekday: h.weekday,
          is_active: h.isOpen,
          start_time: h.openTime + ':00',
          end_time: h.closeTime + ':00'
        });
      }
    }
    for (const h of fixture.weeklyHours) {
      availabilityRules.push({
        id: `rule_salon_${h.weekday}`,
        tenantId: fixture.tenantId,
        staffId: null,
        weekday: h.weekday,
        is_active: h.isOpen,
        start_time: h.openTime + ':00',
        end_time: h.closeTime + ':00'
      });
    }

    return {
      'lari_registered_tenants': JSON.stringify([registeredTenant]),
      [`mock_subscription_${fixture.tenantId}`]: JSON.stringify(subscription),
      [`lari:${fixture.tenantId}:subscription`]: JSON.stringify(subscription),
      [`mock_business_profile_${fixture.tenantId}`]: JSON.stringify(businessProfile),
      [`lari:${fixture.tenantId}:profile`]: JSON.stringify(businessProfile),
      [`lari_branches_${fixture.tenantId}`]: JSON.stringify(branches),
      [`lari:${fixture.tenantId}:services`]: JSON.stringify(services),
      [`lari:${fixture.tenantId}:staff`]: JSON.stringify(staff),
      [`lari:${fixture.tenantId}:staff_services`]: JSON.stringify(staffServices),
      [`lari:${fixture.tenantId}:availability_rules`]: JSON.stringify(availabilityRules),
      [`lari:${fixture.tenantId}:appointments`]: JSON.stringify(fixture.bookings),
      [`lari:${fixture.tenantId}:go_live_status`]: 'DEMO_REHEARSAL_APPROVED'
    };
  }

  static seedBrowserStorage(storage: Storage = localStorage): void {
    const snapshot = this.getBrowserStorageSnapshot();
    for (const [k, v] of Object.entries(snapshot)) {
      if (k === 'lari_registered_tenants') {
        const existing = JSON.parse(storage.getItem('lari_registered_tenants') || '[]');
        const updated = existing.filter((t: any) => t.id !== SYNTHETIC_SALON_AURA.tenantId);
        updated.push(...JSON.parse(v));
        storage.setItem(k, JSON.stringify(updated));
      } else {
        storage.setItem(k, v);
      }
    }
  }
}
