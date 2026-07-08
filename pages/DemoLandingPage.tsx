import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { translations } from '../utils/translations';
import { ImageUpload } from '../components/ImageUpload';

const DemoLandingPage: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { alert: showAlert } = useDialog();
  const t = translations[language];

  const [showStickyCta, setShowStickyCta] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show sticky CTA after scrolling past the hero area
      if (window.scrollY > 400) {
        setShowStickyCta(true);
      } else {
        setShowStickyCta(false);
      }
    };
    window.addEventListener('scroll', handleScroll);

    const handleFocus = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setIsKeyboardOpen(true);
      }
    };
    const handleBlur = () => {
      setIsKeyboardOpen(false);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrases = language === 'tr' 
    ? ['Kuaför salonunuz', 'Berber işletmeniz', 'Güzellik merkeziniz', 'Nail studio’nuz', 'Kliniğiniz', 'Randevulu işletmeniz']
    : ['Your hair salon', 'Your barbershop', 'Your beauty center', 'Your nail studio', 'Your clinic', 'Your booking business'];

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % phrases.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [phrases.length]);

  const currentPhrase = phrases[phraseIndex] || '';

  const [salonName, setSalonName] = useState(language === 'tr' ? 'Örnek Salon' : 'Sample Salon');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [instagram, setInstagram] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [category, setCategory] = useState(language === 'tr' ? 'Kuaför' : 'Hair Salon');
  const [shortDesc, setShortDesc] = useState('');
  
  const [services, setServices] = useState([
    { id: 1, name: language === 'tr' ? 'Saç Kesimi' : 'Haircut', price: '500' },
    { id: 2, name: language === 'tr' ? 'Saç Boyama' : 'Coloring', price: '1200' },
  ]);
  
  const [staff, setStaff] = useState([
    { id: 1, name: language === 'tr' ? 'Ayşe Yılmaz' : 'Jane Smith', title: language === 'tr' ? 'Saç Uzmanı' : 'Hair Stylist' },
    { id: 2, name: language === 'tr' ? 'Mehmet Kaya' : 'John Doe', title: language === 'tr' ? 'Berber' : 'Barber' },
  ]);

  useEffect(() => {
    const saved = localStorage.getItem('lari_business_preview_context');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.salonName) setSalonName(data.salonName);
        if (data.category) setCategory(data.category);
        if (data.shortDesc) setShortDesc(data.shortDesc);
        if (data.whatsappNumber) setWhatsappNumber(data.whatsappNumber);
        if (data.instagram) setInstagram(data.instagram);
        if (data.address) setAddress(data.address);
        if (data.city) setCity(data.city);
        if (data.district) setDistrict(data.district);
        if (data.primaryColor) setPrimaryColor(data.primaryColor);
        if (data.services) setServices(data.services);
        if (data.staff) setStaff(data.staff);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lari_business_preview_context', JSON.stringify({
      salonName,
      category,
      shortDesc,
      whatsappNumber,
      instagram,
      address,
      city,
      district,
      primaryColor,
      services,
      staff
    }));
  }, [salonName, category, shortDesc, whatsappNumber, instagram, address, city, district, primaryColor, services, staff]);

  const handleAddService = () => setServices([...services, { id: Date.now(), name: '', price: '' }]);
  const handleUpdateService = (id: number, field: string, value: string) => {
    setServices(services.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  const handleRemoveService = (id: number) => setServices(services.filter(s => s.id !== id));

  const handleAddStaff = () => setStaff([...staff, { id: Date.now(), name: '', title: '' }]);
  const handleUpdateStaff = (id: number, field: string, value: string) => {
    setStaff(staff.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  const handleRemoveStaff = (id: number) => setStaff(staff.filter(s => s.id !== id));

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    showAlert(language === 'tr' ? 'Önizleme linki kopyalandı.' : 'Preview link copied.');
  };

  const handleContinue = () => {
    navigate('/register?planId=professional');
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen pt-12 sm:pt-24 pb-28 sm:pb-16 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Navigation / Back */}
        <div className="mb-8">
            <button 
                onClick={() => navigate('/pilot')}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                {language === 'tr' ? 'Örnek Demolara Dön' : 'Back to Demos'}
            </button>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12 md:mb-16">
          <div className="mb-4 min-h-[3.5rem] sm:min-h-[1.3em] relative inline-flex w-full justify-center align-bottom px-2 flex-col">
            <span key={currentPhrase} className="animate-slideUpFade text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 font-extrabold text-3xl sm:text-5xl md:text-[56px] leading-tight tracking-tight">
                {currentPhrase}
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 dark:text-white mb-6 leading-[1.15] max-w-4xl mx-auto">
            {language === 'tr' ? 'LARİ’de nasıl görünecek, saniyeler içinde görün.' : 'See how it will look on LARİ in seconds.'}
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed px-2">
            {language === 'tr' 
              ? 'Logo, hizmetler, uzmanlar ve marka renginizi ekleyin; müşterilerinizin göreceği dijital vitrini ve randevu akışını anında önizleyin.' 
              : 'Add your logo, services, staff, and brand color; instantly preview the digital storefront and booking flow your customers will see.'}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 px-4 sm:px-0">
            <button 
              onClick={() => document.getElementById('preview-generator')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-blue-600 text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors duration-300 text-base md:text-lg w-full sm:w-auto"
            >
              {language === 'tr' ? 'Önizlememi Oluştur' : 'Create My Preview'}
            </button>
            <button 
              onClick={() => navigate('/pricing')}
              className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700 px-8 py-3.5 rounded-xl font-bold shadow-sm hover:border-gray-300 dark:hover:border-slate-600 transition-all duration-300 text-base md:text-lg w-full sm:w-auto"
            >
              {language === 'tr' ? 'Paketleri Gör' : 'View Pricing Plans'}
            </button>
          </div>
        </div>

        <div id="preview-generator" className="flex flex-col-reverse lg:flex-row gap-8 md:gap-12 mt-8 md:mt-16 items-start">
          
          {/* Form Cards Panel */}
          <div className="w-full lg:w-3/5 space-y-6">
            
            {/* Card 1: İşletme Kimliği */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-sm">1</div>
                 {language === 'tr' ? 'İşletme Kimliği' : 'Business Identity'}
              </h2>
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'İşletme Adı' : 'Business Name'}</label>
                    <input type="text" value={salonName} onChange={e => setSalonName(e.target.value)} className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kategori' : 'Category'}</label>
                    <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder={language === 'tr' ? 'Örn: Kuaför, Klinik' : 'E.g., Salon, Clinic'} className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Kısa Açıklama / Slogan' : 'Short Description / Slogan'}</label>
                  <input type="text" value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder={language === 'tr' ? 'Güzelliğinize değer katıyoruz...' : 'Adding value to your beauty...'} className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div>
                      <ImageUpload label={language === 'tr' ? 'Logo' : 'Logo'} value={logoUrl} onChange={setLogoUrl} className="mb-2" />
                   </div>
                   <div>
                      <ImageUpload label={language === 'tr' ? 'Kapak Fotoğrafı' : 'Cover Photo'} value={coverUrl} onChange={setCoverUrl} className="mb-2" />
                   </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Marka Rengi' : 'Brand Color'}</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-16 p-1 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 cursor-pointer" />
                    <span className="text-sm font-mono text-gray-500">{primaryColor}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: İletişim ve konum */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-sm">2</div>
                 {language === 'tr' ? 'İletişim ve Konum' : 'Contact & Location'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Telefon / WhatsApp' : 'Phone / WhatsApp'}</label>
                  <input type="text" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="+90 555..." className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Instagram</label>
                  <input type="text" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@kullanici_adi" className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'İl/Şehir' : 'City'}</label>
                  <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder={language === 'tr' ? 'Örn: İstanbul' : 'E.g., London'} className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'İlçe/Bölge' : 'District/Area'}</label>
                  <input type="text" value={district} onChange={e => setDistrict(e.target.value)} placeholder={language === 'tr' ? 'Örn: Kadıköy' : 'E.g., Soho'} className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
                </div>
              </div>
              <div>
                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{language === 'tr' ? 'Açık Adres' : 'Address'}</label>
                 <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder={language === 'tr' ? 'İşletme adresinizi girin...' : 'Enter your business address...'} className="w-full rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/50 dark:text-white px-4 py-3 border focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all" />
              </div>
            </div>

            {/* Card 3: Hizmetler */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-sm">3</div>
                 {language === 'tr' ? 'Öne Çıkan Hizmetler' : 'Featured Services'}
              </h2>
              <div className="space-y-4">
                {services.map((service, index) => (
                  <div key={service.id} className="grid grid-cols-[1fr_100px_auto] gap-3 items-center">
                    <input type="text" value={service.name} onChange={e => handleUpdateService(service.id, 'name', e.target.value)} placeholder={language === 'tr' ? 'Hizmet Adı' : 'Service Name'} className="rounded-lg border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 border font-medium text-sm text-slate-900 dark:text-white w-full" />
                    <div className="relative">
                       <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₺</span>
                       <input type="number" value={service.price} onChange={e => handleUpdateService(service.id, 'price', e.target.value)} placeholder="0" className="w-full rounded-lg border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 pl-7 border text-sm" />
                    </div>
                    {services.length > 1 && (
                      <button onClick={() => handleRemoveService(service.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                
                <button onClick={handleAddService} className="mt-4 flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors py-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {language === 'tr' ? 'Hizmet Ekle' : 'Add Service'}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-4">{language === 'tr' ? 'Tüm hizmetlerinizi kurulumdan sonra admin panelinden ekleyebilirsiniz.' : 'You can add all your services from the admin panel after setup.'}</p>
            </div>

            {/* Card 4: Uzmanlar */}
            <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-sm">4</div>
                 {language === 'tr' ? 'Uzmanlar' : 'Staff Members'}
              </h2>
              <div className="space-y-4">
                {staff.map((member, index) => (
                  <div key={member.id} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
                    <input type="text" value={member.name} onChange={e => handleUpdateStaff(member.id, 'name', e.target.value)} placeholder={language === 'tr' ? 'Uzman Adı' : 'Staff Name'} className="rounded-lg border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 border font-medium text-sm text-slate-900 dark:text-white w-full" />
                    <input type="text" value={member.title} onChange={e => handleUpdateStaff(member.id, 'title', e.target.value)} placeholder={language === 'tr' ? 'Unvanı' : 'Role'} className="rounded-lg border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 border text-sm w-full" />
                    {staff.length > 1 && (
                      <button onClick={() => handleRemoveStaff(member.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                ))}

                <button onClick={handleAddStaff} className="mt-4 flex items-center gap-2 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors py-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  {language === 'tr' ? 'Uzman Ekle' : 'Add Staff'}
                </button>
              </div>
            </div>

          </div>

          {/* Live Preview Panel (Sticky) */}
          <div className="w-full lg:w-2/5 lg:sticky lg:top-24 mt-8 lg:mt-0">
            <h2 className="text-xl font-medium text-slate-800 dark:text-slate-200 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {t.marketing.demo.live_preview}
              </span>
              <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-1 rounded animate-pulse">{language === 'tr' ? 'Canlı' : 'Live'}</span>
            </h2>
            
            <div className="bg-white dark:bg-slate-800 border-[6px] border-slate-200 dark:border-slate-700 rounded-[2.5rem] overflow-hidden shadow-2xl relative" style={{ aspectRatio: '9/17', maxHeight: '800px', margin: '0 auto', maxWidth: '380px' }}>
              
              {/* Fake Mobile Status Bar */}
              <div className="h-6 bg-white dark:bg-slate-800 flex items-center justify-between px-6 text-[10px] font-bold text-slate-800 dark:text-slate-300">
                 <span>9:41</span>
                 <div className="flex gap-1 items-center">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                 </div>
              </div>

                    {/* Fake Mobile Header */}
              <div className="bg-white dark:bg-slate-800 px-4 py-3 flex items-center justify-between z-10 relative">
                <div className="flex items-center gap-2">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: primaryColor }}>
                      {salonName.charAt(0)}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="font-bold text-[13px] text-slate-900 dark:text-white truncate max-w-[130px] leading-tight">{salonName}</span>
                    {category && <span className="text-[10px] text-slate-500 leading-tight">{category}</span>}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                   <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </div>
              </div>

              {/* Fake App Content */}
              <div className="bg-slate-50 dark:bg-slate-900 h-full overflow-y-auto pb-32 hide-scrollbar">
                
                {/* Cover Image Block */}
                <div className="h-40 w-full relative bg-slate-200 dark:bg-slate-700">
                  {coverUrl ? (
                    <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center absolute inset-0 text-white" style={{ background: `linear-gradient(to bottom right, ${primaryColor}, #1e293b)` }}>
                       <span className="opacity-50 text-3xl font-extrabold">{salonName.charAt(0)}</span>
                    </div>
                  )}
                </div>

                <div className="px-4 -mt-8 relative z-10">
                   <div className="bg-white dark:bg-slate-800 rounded-[20px] p-5 shadow-sm border border-slate-100 dark:border-slate-700">
                      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{salonName}</h2>
                      <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{shortDesc}</p>
                      
                      <div className="flex gap-2 mt-4">
                         <button className="flex-1 py-3.5 rounded-xl text-white font-bold text-[13px] shadow-sm active:scale-95 transition-transform" style={{ backgroundColor: primaryColor }}>{language === 'tr' ? 'Randevu Al' : 'Book Now'}</button>
                         {whatsappNumber ? (
                           <button className="w-12 h-12 shrink-0 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 flex items-center justify-center active:scale-95 transition-transform">
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                           </button>
                         ) : (
                           <button className="w-12 h-12 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-200 dark:border-slate-600 active:scale-95 transition-transform">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg>
                           </button>
                         )}
                      </div>
                   </div>
                </div>

                {/* AI Assistant Block */}
                <div className="px-4 mt-6">
                  <div className="bg-gradient-to-r from-violet-100 to-fuchsia-100 dark:from-violet-900/40 dark:to-fuchsia-900/40 p-4 rounded-[20px] shadow-sm border border-violet-200/50 dark:border-violet-700/50 flex gap-4 items-center cursor-pointer">
                    <div className="w-10 h-10 shrink-0 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center text-violet-600 dark:text-violet-400 shadow-sm">✨</div>
                    <div className="flex-1">
                      <h4 className="font-bold text-[13px] text-violet-900 dark:text-violet-100">{language === 'tr' ? 'AI Stil Asistanı' : 'AI Style Assistant'}</h4>
                      <p className="text-[11px] text-violet-700 dark:text-violet-300 mt-0.5 leading-snug">{language === 'tr' ? 'Size en uygun modelleri bulalım.' : 'Discover the best styles for you.'}</p>
                    </div>
                  </div>
                </div>

                {/* Services */}
                {services.some(s => s.name) && (
                  <div className="px-4 mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-slate-800 dark:text-slate-200 text-[15px]">
                         {language === 'tr' ? 'Popüler Hizmetler' : 'Popular Services'}
                      </h3>
                      <span className="text-[11px] text-blue-600 font-bold cursor-pointer">{language === 'tr' ? 'Tümü' : 'All'}</span>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {services.filter(s => s.name).map((service, idx) => (
                         <div key={service.id} className="bg-white dark:bg-slate-800 p-3.5 flex justify-between items-center rounded-[16px] border border-slate-100 dark:border-slate-700 shadow-sm cursor-pointer">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400 font-bold text-xs" style={{backgroundColor: idx % 2 === 0 ? `${primaryColor}20` : undefined, color: idx % 2 === 0 ? primaryColor : undefined}}>
                                {service.name.substring(0, 2).toUpperCase()}
                              </div>
                              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200">{service.name}</span>
                            </div>
                            <span className="font-bold text-[14px]" style={{ color: primaryColor }}>₺{service.price || '0'}</span>
                         </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Staff / Fark Etmez */}
                {staff.some(s => s.name) && (
                  <div className="px-4 mt-6 overflow-hidden">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-[15px]">{language === 'tr' ? 'Uzman Seçimi' : 'Select Staff'}</h3>
                    <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar px-1">
                       {/* Fark Etmez Card */}
                       <div className="bg-white dark:bg-slate-800 p-3 rounded-[16px] min-w-[100px] shrink-0 border-2 flex flex-col items-center text-center shadow-sm cursor-pointer" style={{borderColor: primaryColor}}>
                          <div className="w-12 h-12 rounded-full mb-2 bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                            <span className="text-xl">🌟</span>
                          </div>
                          <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100 w-full" style={{ color: primaryColor }}>{language === 'tr' ? 'Fark Etmez' : 'Anyone'}</span>
                          <span className="text-[10px] text-slate-500 w-full mt-0.5">{language === 'tr' ? 'İlk Müsait' : 'First Available'}</span>
                       </div>
                       
                       {staff.filter(s => s.name).map((member) => (
                         <div key={member.id} className="bg-white dark:bg-slate-800 p-3 rounded-[16px] min-w-[100px] shrink-0 border border-slate-100 dark:border-slate-700 flex flex-col items-center text-center shadow-sm cursor-pointer">
                            <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`} alt="Staff" className="w-12 h-12 rounded-[14px] mb-2 object-cover" />
                            <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100 truncate w-full">{member.name.split(' ')[0]}</span>
                            <span className="text-[10px] text-slate-400 truncate w-full mt-0.5">{member.title || '-'}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                {/* Contact & Location Block */}
                {(address || whatsappNumber || instagram) && (
                   <div className="px-4 mt-4 mb-6">
                     <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-[15px]">{language === 'tr' ? 'İletişim & Konum' : 'Contact & Location'}</h3>
                     <div className="bg-white dark:bg-slate-800 rounded-[20px] p-4 shadow-sm border border-slate-100 dark:border-slate-700 space-y-4">
                        {address && (
                          <div className="flex gap-3 items-start">
                             <div className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mt-0.5 text-slate-500">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                             </div>
                             <div>
                               <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium">
                                  {address}
                               </p>
                               {(city || district) && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{district}{district && city && ', '}{city}</p>
                               )}
                             </div>
                          </div>
                        )}
                        {whatsappNumber && (
                           <div className="flex gap-3 items-center">
                             <div className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                             </div>
                             <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium">{whatsappNumber}</p>
                           </div>
                        )}
                        {instagram && (
                           <div className="flex gap-3 items-center">
                             <div className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.26l-7.053 3.948 1.575-7.928L.587 8.792l8.027-.952L12 .5l3.386 7.34 8.027.952-5.935 5.488 1.575 7.928z"/></svg>
                             </div>
                             <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium">{instagram}</p>
                           </div>
                        )}
                     </div>
                   </div>
                )}

              </div>
            </div>

             {/* Post-Preview Action Row */}
             <div className="mt-8 flex flex-col gap-3 max-w-[380px] mx-auto w-full">
                <button 
                  onClick={handleContinue}
                  className="w-full text-white px-6 py-4 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-colors text-lg"
                  style={{ backgroundColor: '#2563EB' }}
                >
                  {language === 'tr' ? 'Bu Önizlemeyle Devam Et' : 'Continue with this Preview'}
                </button>
                <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => navigate('/pricing')}
                     className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-gray-200 dark:border-slate-700 font-bold px-4 py-3 rounded-xl hover:border-gray-300 dark:hover:border-slate-600 transition-colors shadow-sm"
                     style={{ fontSize: '13px' }}
                   >
                     {language === 'tr' ? 'Paketleri Gör' : 'View Plans'}
                   </button>
                   <button 
                     onClick={handleCopyLink}
                     className="w-full bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white font-bold px-4 py-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                     style={{ fontSize: '13px' }}
                   >
                     {language === 'tr' ? 'Kopyala' : 'Copy Link'}
                   </button>
                </div>
                <p className="text-xs text-center text-slate-500 px-4 mt-2 leading-relaxed">
                   {language === 'tr' ? 'Bu bilgiler kurulum adımında kullanılacaktır.' : 'These details will be used during setup.'}
                </p>
             </div>
          </div>

        </div>
      </div>
      
      {/* Bottom CTA Block */}
      <div className="mt-16 text-center px-4 max-w-3xl mx-auto mb-16 sm:mb-0">
          <h4 className="text-xl md:text-2xl font-bold mb-6 dark:text-white leading-tight">
              {language === 'tr' ? 'Bu görünümü gerçek işletme paneline taşımak ister misiniz?' : 'Do you want to turn this preview into a real admin panel?'}
          </h4>
          <div className="flex flex-col sm:flex-row justify-center gap-4 flex-wrap">
              <button 
                  onClick={handleContinue}
                  className="bg-blue-600 text-white px-8 py-3.5 rounded-xl font-bold border-transparent shadow-md hover:bg-blue-700 transition shrink-0"
              >
                  {language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free'}
              </button>
              <button 
                  onClick={() => navigate('/pricing')}
                  className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-3.5 rounded-xl font-bold border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition shrink-0"
              >
                  {language === 'tr' ? 'Paketleri Karşılaştır' : 'Compare Pricing'}
              </button>
          </div>
      </div>

      {/* Smart Sticky Mobile CTA */}
      <div 
        className={`fixed bottom-0 left-0 right-0 z-[100] sm:hidden bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-t border-gray-200/50 dark:border-slate-700/50 p-4 pb-[max(env(safe-area-inset-bottom),_1rem)] transition-transform duration-300 ${
          showStickyCta && !isKeyboardOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex items-center gap-3">
          <button 
            onClick={handleContinue}
            className="flex-1 bg-blue-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-transform text-center"
          >
            {language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free'}
          </button>
          <button 
            onClick={() => navigate('/pricing')}
            className="text-[13px] font-bold text-slate-700 dark:text-slate-300 px-4 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 active:scale-[0.98] transition-transform"
          >
            {language === 'tr' ? 'Paketler' : 'Pricing'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DemoLandingPage;
