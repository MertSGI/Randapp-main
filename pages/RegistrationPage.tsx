import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { planService } from '../services/planService';
import { launchModeService } from '../services/launchModeService';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import { tenantRegistrationService, RegistrationData, RegistrationStatus } from '../services/tenantRegistrationService';

export default function RegistrationPage() {
  const { language } = useLanguage();
  const t = translations[language];
  const location = useLocation();
  const navigate = useNavigate();
  
  const queryParams = new URLSearchParams(location.search);
  const rawPlanId = queryParams.get('planId') || 'baslangic';
  const billingPeriod = queryParams.get('billingPeriod') || 'monthly';
  const referralCode = queryParams.get('ref') || undefined;
  
  // Public Self-Service Plan Selection Safety: Ensure only assignable public plans are selectable
  const publicPlans = planService.getPublicSelfServicePlans();
  const validatedPlanId = publicPlans.some(p => p.id === rawPlanId) ? rawPlanId : 'baslangic';
  const plan = planService.getPlan(validatedPlanId) || publicPlans[0];
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submissionState, setSubmissionState] = useState<RegistrationStatus>('AUTH_SIGNUP_PENDING');
  
  const [formData, setFormData] = useState<RegistrationData>({
    ownerName: '',
    ownerSurname: '',
    ownerEmail: '',
    ownerPhone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    businessDisplayName: '',
    businessCategory: 'Hair Salon',
    city: '',
    instagramHandle: '',
    planId: validatedPlanId,
    billingPeriod: billingPeriod as 'monthly' | 'annual',
    acceptTerms: false,
    referralCode: referralCode,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    // @ts-ignore
    const checked = type === 'checkbox' ? e.target.checked : undefined;
    setFormData(prev => ({
       ...prev,
       [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent duplicate clicks (REG-03)

    if (!formData.acceptTerms) {
      setError(language === 'tr' ? 'Lütfen KVKK ve Kullanım Şartlarını kabul edin.' : 'Please accept terms and conditions.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError(language === 'tr' ? 'Şifreler eşleşmiyor.' : 'Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    setSubmissionState('PROVISIONING_IN_PROGRESS');

    try {
      const result = await tenantRegistrationService.registerTenant(formData);
      
      if (result.status === 'EMAIL_CONFIRMATION_REQUIRED') {
        setSubmissionState('EMAIL_CONFIRMATION_REQUIRED');
        setError(result.error || (language === 'tr' ? 'Lütfen e-posta adresinizi doğrulayın.' : 'Please verify your email address.'));
        setLoading(false);
        return;
      }

      if (result.success) {
        setSubmissionState('PROVISIONED');

        // Record legal acceptance asynchronously
        import('../services/consentService').then(({ consentService }) => {
           consentService.recordBusinessOwnerTermsAcceptance(result.tenantId || 'unknown_tenant', formData.ownerEmail);
        }).catch(e => console.error(e));

        import('../services/policyAcceptanceService').then(({ policyAcceptanceService }) => {
           policyAcceptanceService.recordPolicyAcceptance({
             tenantId: result.tenantId || 'unknown_tenant',
             actorType: 'tenant_owner',
             actorId: formData.ownerEmail,
             actorDisplayName: `${formData.ownerName} ${formData.ownerSurname}`,
             actorContact: formData.ownerPhone,
             documentType: 'terms_of_service',
             acceptanceSource: 'registration'
           });
           policyAcceptanceService.recordPolicyAcceptance({
             tenantId: result.tenantId || 'unknown_tenant',
             actorType: 'tenant_owner',
             actorId: formData.ownerEmail,
             actorDisplayName: `${formData.ownerName} ${formData.ownerSurname}`,
             actorContact: formData.ownerPhone,
             documentType: 'privacy_policy',
             acceptanceSource: 'registration'
           });
        }).catch(e => console.error(e));

        // Route to canonical onboarding entry point (resumable onboarding entry)
        if (result.status === 'USER_ALREADY_HAS_TENANT') {
          navigate('/admin?tab=kurulum&notice=existing_account');
        } else {
          navigate('/admin?tab=kurulum&registration=success');
        }
      } else {
        setSubmissionState(result.status || 'PROVISIONING_FAILED_TERMINAL');
        setError(result.error || (language === 'tr' ? 'Kayıt işlemi başarısız oldu.' : 'Registration failed.'));
      }
    } catch (err: any) {
      setSubmissionState('PROVISIONING_FAILED_RETRYABLE');
      setError(err.message || (language === 'tr' ? 'Bir hata oluştu.' : 'An error occurred.'));
    } finally {
      setLoading(false);
    }
  };

  if (!plan) return <div className="p-8 text-center bg-gray-50 min-h-screen">Invalid Plan Selected</div>;

  return (
    <div className="bg-slate-50 dark:bg-slate-900 min-h-screen pt-24 pb-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-800 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-8 md:p-12">
          <h1 className="text-3xl font-extrabold mb-2 dark:text-white">
             {language === 'tr' ? 'İşletmeni Oluştur' : 'Create Your Business'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-xl">
             {!launchModeService.isOnlinePaymentEnabled() ? (
                language === 'tr'
                  ? 'Kayıt işlemini tamamladıktan sonra hesabınız kurulum ve doğrulama sürecine alınır.'
                  : 'After completing registration, your account enters onboarding setup and verification.'
              ) : (
                language === 'tr'
                  ? 'Ücretsiz denemenizi başlatmak için kaydınızı oluşturun.'
                  : 'Complete your registration to start your trial.'
              )}
          </p>

          {submissionState === 'EMAIL_CONFIRMATION_REQUIRED' && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-xl text-sm border border-amber-200 dark:border-amber-800">
              ✉️ {error || (language === 'tr' ? 'Lütfen e-posta kutunuzu kontrol ederek hesabınızı doğrulayın.' : 'Please check your email inbox to verify your account.')}
            </div>
          )}

          {error && submissionState !== 'EMAIL_CONFIRMATION_REQUIRED' && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <h2 className="text-xl font-bold border-b border-slate-100 dark:border-slate-700 pb-2 dark:text-slate-200">
                 {language === 'tr' ? '1. Hesap Bilgileri' : '1. Account Details'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">İsim *</label>
                   <input required type="text" name="ownerName" value={formData.ownerName} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Soyisim *</label>
                   <input required type="text" name="ownerSurname" value={formData.ownerSurname} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">E-posta adresi *</label>
                   <input required type="email" name="ownerEmail" value={formData.ownerEmail} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Telefon *</label>
                   <input required type="tel" name="ownerPhone" value={formData.ownerPhone} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Şifre *</label>
                   <input required type="password" name="password" value={formData.password} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Şifre Tekrar *</label>
                   <input required type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-xl font-bold border-b border-slate-100 dark:border-slate-700 pb-2 dark:text-slate-200">
                 {language === 'tr' ? '2. İşletme Bilgileri' : '2. Business Details'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="sm:col-span-2">
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Resmi İşletme Adı (Fatura İçin) *</label>
                   <input required type="text" name="businessName" value={formData.businessName} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Halka Açık Görünüm Adı *</label>
                   <input required type="text" name="businessDisplayName" value={formData.businessDisplayName} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">İlçe / İl *</label>
                   <input required type="text" name="city" value={formData.city} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Kategori</label>
                   <select name="businessCategory" value={formData.businessCategory} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50">
                     <option value="Hair Salon">Kuaför / Saç Tasarım</option>
                     <option value="Beauty Center">Güzellik Merkezi</option>
                     <option value="Barbershop">Berber</option>
                     <option value="Nail Salon">Tırnak Stüdyosu</option>
                     <option value="Spa">Spa & Wellness</option>
                   </select>
                 </div>
                 <div>
                   <label className="block text-sm font-medium mb-1 dark:text-slate-300">Instagram Handle (Opsiyonel)</label>
                   <input type="text" name="instagramHandle" placeholder="@kullanici_adi" value={formData.instagramHandle} onChange={handleChange} disabled={loading} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 disabled:opacity-50" />
                 </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <input required type="checkbox" name="acceptTerms" checked={formData.acceptTerms} onChange={handleChange} disabled={loading} className="mt-1 w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {language === 'tr' ? (
                     <>
                        <a href="/#/privacy" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline">KVKK Aydınlatma Metni ve Gizlilik Sözleşmesi</a> ile <a href="/#/terms" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline">Kullanım Şartları</a>'nı ve Mesafeli Kayıt koşullarını okudum, kabul ediyorum.
                     </>
                  ) : 'I accept the Terms and Conditions and Privacy Policy.'}
                </span>
              </label>
            </div>

            <button disabled={loading} type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/30 transition transform hover:-translate-y-0.5 disabled:opacity-70 disabled:hover:translate-y-0 text-lg">
               {loading ? 'İşleniyor...' : (
                language === 'tr' ? 'İşletmeyi Oluştur ve Başla' : 'Create Business and Start'
              )}
            </button>
            <p className="text-xs text-center text-slate-500 mt-4">
              Zaten hesabınız var mı? <Link to="/login" className="text-blue-600 font-medium hover:underline">Giriş Yap</Link>
            </p>
          </form>
        </div>

        {/* Sidebar Summary */}
        <div className="lg:col-span-4 space-y-6">
           <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800 sticky top-24">
              <div className="inline-block bg-blue-500/20 text-blue-300 px-3 py-1 text-xs font-bold uppercase tracking-widest rounded-full mb-4">
                 Seçili Plan
              </div>
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-end gap-1 mb-6 border-b border-slate-800 pb-6">
                  <span className="text-4xl font-extrabold tracking-tight">₺{plan[billingPeriod === 'annual' ? 'yearlyPrice' : 'monthlyPrice'] || planService.calculatePlanPrice(plan.id, formData.billingPeriod)}</span>
                  <span className="text-lg text-slate-400 font-medium mb-1">/{language === 'tr' ? 'ay' : 'mo'}</span>
              </div>
              
              <ul className="space-y-4 mb-8 text-slate-300 text-sm">
                 <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold mt-0.5">✓</span> Maksimum {plan.maxStaff} çalışan</li>
                 <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold mt-0.5">✓</span> {plan.maxServices > 900 ? 'Sınırsız Hizmet' : `Maksimum ${plan.maxServices} hizmet`}</li>
                 <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold mt-0.5">✓</span> Özel Müşteri Paneli</li>
                 {plan.aiRecommendationsEnabled && <li className="flex gap-3 items-start"><span className="text-blue-400 font-bold mt-0.5">✓</span> AI Stil Asistanı</li>}
              </ul>

              <div className="bg-white/5 rounded-xl p-4 mb-4">
                 <p className="text-sm text-slate-300 font-medium mb-1">✅ Kurulum ve Onboarding Süreci</p>
                 <p className="text-xs text-slate-400">Kayıt sonrası işletmeniz taslak modunda açılır. Kurulum adımlarını tamamladıktan sonra yayına alınır.</p>
              </div>

              <div className="text-center">
                 <Link to="/pricing" className="text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                    Farklı bir paket mi bakıyorsunuz? Paketleri karşılaştır.
                 </Link>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
