import { Appointment, CustomerProfile, Staff, Service, SalonBusinessProfile } from '../types';

export const seedDemoData = () => {
  if ((import.meta as any).env.VITE_DATA_MODE !== 'mock') {
    console.warn('Demo seeder is only available in mock data mode.');
    return;
  }

  const tenantId = 'demo-tenant-1'; // Default tenant name used around the app

  // 1. Remove Legacy & Current Keys to ensure clean state
  const keysToClean = [
    // Legacy keys
    'users',
    `business_profile_${tenantId}`,
    `services_${tenantId}`,
    `staff_${tenantId}`,
    `appointments_${tenantId}`,
    // Active keys
    `randapp:${tenantId}:services`,
    `randapp:${tenantId}:staff`,
    `randapp:${tenantId}:appointments`,
    `randapp:${tenantId}:branding`,
    `randapp_customer_profile_${tenantId}`,
    `mock_business_profile_${tenantId}`,
    `mock_tenant_customers_${tenantId}`,
    `mock_subscription_${tenantId}`,
    `randapp:${tenantId}:go_live_status`,
    `randapp:${tenantId}:provisioning_status`
  ];

  keysToClean.forEach(k => localStorage.removeItem(k));
  
  // 1. Business Profile
  const businessProfile: SalonBusinessProfile = {
      id: 'prof_1',
      tenant_id: tenantId,
      short_description: 'Elegance & Professional Beauty',
      about_text: 'Welcome to our premium salon. We offer top-notch hair and beauty services with our expert staff.',
      business_category: 'Beauty Salon, Hairdresser',
      address: 'Barbaros Bulvarı No: 123',
      city: 'Istanbul',
      district: 'Beşiktaş',
      phone: '+90 555 123 45 67',
      whatsapp_number: '+90 555 123 45 67',
      instagram_url: 'https://instagram.com/randapp',
      email: 'hello@randapp.com',
      logo_url: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=200&q=80',
      cover_image_url: 'https://images.unsplash.com/photo-1521590832167-7bfcfaa6362f?auto=format&fit=crop&w=1600&q=80',
      is_public_profile_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
  };
  localStorage.setItem(`mock_business_profile_${tenantId}`, JSON.stringify(businessProfile));

  // 2. Services
  const services: Service[] = [
      { id: 'srv_1', tenantId, name: "Haircut & Styling", name_tr: 'Saç Kesimi & Şekillendirme', duration: 45, price: 400, image: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80', active: true },
      { id: 'srv_2', tenantId, name: 'Hair Coloring', name_tr: 'Saç Boyası / Röfle', duration: 120, price: 1200, image: 'https://images.unsplash.com/photo-1519014816548-bf5fe059e98b?auto=format&fit=crop&w=800&q=80', active: true },
      { id: 'srv_3', tenantId, name: 'Manicure & Pedicure', name_tr: 'Manikür & Pedikür', duration: 60, price: 500, image: 'https://images.unsplash.com/photo-1610992015732-2449b061919c?auto=format&fit=crop&w=800&q=80', active: true },
      { id: 'srv_4', tenantId, name: 'Bridal Makeup', name_tr: 'Gelin Makyajı', duration: 90, price: 2000, image: 'https://images.unsplash.com/photo-1487412947147-3a15998a1cc2?auto=format&fit=crop&w=800&q=80', active: true }
  ];
  localStorage.setItem(`randapp:${tenantId}:services`, JSON.stringify(services));

  // 3. Staff
  const staffList: Staff[] = [
      { id: 'stf_1', tenantId, name: 'Mustafa Ali Yılmaz', title: 'Master Stylist / Owner', phone: '05551230001', active: true, isOwner: true, image: 'https://ui-avatars.com/api/?name=Mustafa+Ali+Yilmaz&background=random' },
      { id: 'stf_2', tenantId, name: 'Ayşe Kaya', title: 'Color Expert', phone: '05551230002', active: true, image: 'https://ui-avatars.com/api/?name=Ayse+Kaya&background=random' },
      { id: 'stf_3', tenantId, name: 'Merve Demir', title: 'Nail Technician', phone: '05551230003', active: true, image: 'https://ui-avatars.com/api/?name=Merve+Demir&background=random' }
  ];
  localStorage.setItem(`randapp:${tenantId}:staff`, JSON.stringify(staffList));

  // 4. Appointments
  const today = new Date();
  const dStr = (offset: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d.toISOString().split('T')[0];
  };

  const appointments: Appointment[] = [
      { id: 'apt_1', tenantId, user_name: 'Zeynep Yılmaz', user_email: 'zeynep@example.com', phone: '05559998877', serviceId: 'srv_1', staffId: 'stf_1', date: dStr(0), time: '10:00', status: 'confirmed', createdAt: new Date().toISOString(), syncedToGoogle: false },
      { id: 'apt_2', tenantId, user_name: 'Cem Yıldız', user_email: 'cem@example.com', phone: '05554443322', serviceId: 'srv_1', staffId: 'stf_1', date: dStr(0), time: '14:00', status: 'confirmed', createdAt: new Date().toISOString(), syncedToGoogle: false },
      { id: 'apt_3', tenantId, user_name: 'Selin Gür', user_email: 'selin@example.com', phone: '05558887766', serviceId: 'srv_2', staffId: 'stf_2', date: dStr(1), time: '11:00', status: 'confirmed', createdAt: new Date().toISOString(), syncedToGoogle: false },
      { id: 'apt_4', tenantId, user_name: 'Zeynep Yılmaz', user_email: 'zeynep@example.com', phone: '05559998877', serviceId: 'srv_3', staffId: 'stf_3', date: dStr(-15), time: '15:00', status: 'completed', createdAt: new Date().toISOString(), syncedToGoogle: false },
  ];
  localStorage.setItem(`randapp:${tenantId}:appointments`, JSON.stringify(appointments));


  // 5. Customer Profile Memory data
  const customerProfileData: Record<string, CustomerProfile> = {
    '05559998877_zeynep@example.com': {
        id: 'cust_seed_1',
        tenantId,
        fullName: 'Zeynep Yılmaz',
        email: 'zeynep@example.com',
        phone: '05559998877',
        firstVisitAt: dStr(-15),
        lastAppointmentAt: dStr(0),
        totalAppointments: 2,
        preferredStaffId: 'stf_1',
        lastServiceId: 'srv_1',
        stylePreference: 'Modern Lob, easy to manage',
        colorFormula: 'Wella 7.1 + 8.1 20vol (Last used)',
        avoidNotes: 'Hates warm/brassy tones',
        careNotes: 'Sensitive scalp',
        internalNotes: [
            { id: 'note_1', text: 'Likes to drink green tea during appointment.', createdAt: new Date().toISOString(), createdBy: 'Mustafa Ali Yılmaz' }
        ],
        referencePhotos: [
            { id: 'photo_1', url: 'https://images.unsplash.com/photo-1595476108010-b4d1f10d5e43?auto=format&fit=crop&w=200&q=80', createdAt: new Date().toISOString() }
        ],
        appointmentIds: ['apt_1', 'apt_4']
    }
  };
  localStorage.setItem(`mock_tenant_customers_${tenantId}`, JSON.stringify(customerProfileData));

  // Mark status as seeded
  localStorage.setItem(`randapp:${tenantId}:is_seeded`, 'true');

  alert('Demo data seeded successfully! Reloading...');
  window.location.reload();
};
