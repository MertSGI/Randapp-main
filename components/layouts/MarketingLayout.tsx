import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useDialog } from '../../contexts/DialogContext';
import { marketConfigService } from '../../services/marketConfigService';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition" aria-label="Toggle Dark Mode">
      {theme === 'light' ? (
        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      ) : (
        <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      )}
    </button>
  );
};

const MarketingLayout: React.FC = () => {
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { confirm: showConfirm } = useDialog();

  // Close mobile menu when navigating
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
      <header className="bg-white dark:bg-slate-800 shadow-sm sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/" className="flex-shrink-0 flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold tracking-tighter">{marketConfigService.getBrandName().charAt(0)}</div>
                <span className="font-semibold text-xl text-primary dark:text-white whitespace-nowrap">{marketConfigService.getBrandName()}</span>
              </Link>
              <nav className="hidden md:ml-8 md:flex md:space-x-8">
                <Link to="/features" className={`border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1 py-5 border-b-2 text-sm font-medium ${location.pathname === '/features' ? 'text-gray-900 border-blue-500' : ''}`}>{language === 'tr' ? 'Özellikler' : 'Features'}</Link>
                <Link to="/mobile-app" className={`border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1 py-5 border-b-2 text-sm font-medium ${location.pathname === '/mobile-app' ? 'text-gray-900 border-accent' : ''}`}>{language === 'tr' ? 'Mobil Uygulama' : 'Mobile App'}</Link>
                <Link to="/pricing" className={`border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1 py-5 border-b-2 text-sm font-medium ${location.pathname === '/pricing' ? 'text-gray-900 border-blue-500' : ''}`}>{language === 'tr' ? 'Fiyatlar' : 'Pricing'}</Link>
                <Link to="/contact" className={`border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1 py-5 border-b-2 text-sm font-medium ${location.pathname === '/contact' ? 'text-gray-900 border-blue-500' : ''}`}>{language === 'tr' ? 'İletişim' : 'Contact'}</Link>
              </nav>
            </div>
            
            <div className="hidden md:flex items-center gap-4">
              <ThemeToggle />
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                <button onClick={() => setLanguage('en')} className={`px-3 py-1 rounded-md text-xs font-semibold ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-300'}`}>EN</button>
                <button onClick={() => setLanguage('tr')} className={`px-3 py-1 rounded-md text-xs font-semibold ${language === 'tr' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-300'}`}>TR</button>
              </div>
              <Link to="/login" className="text-gray-600 dark:text-gray-200 text-sm font-medium hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap">{language === 'tr' ? 'Giriş Yap' : 'Login'}</Link>
              <Link to="/demo" className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:bg-blue-700 transition whitespace-nowrap">{language === 'tr' ? 'İşletmeni Önizle' : 'Preview Your Business'}</Link>
            </div>

            <div className="flex items-center md:hidden gap-2">
               <ThemeToggle />
               <button
                 onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                 className="p-2 -mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                 aria-label="Menu"
               >
                 {mobileMenuOpen ? (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 ) : (
                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
                 )}
               </button>
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 absolute w-full left-0 shadow-lg top-16">
            <div className="flex flex-col px-4 pt-2 pb-6 space-y-1">
              <Link to="/" className={`block px-3 py-2 rounded-md text-base font-medium ${location.pathname === '/' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700'}`}>{language === 'tr' ? 'Ana Sayfa' : 'Home'}</Link>
              <Link to="/features" className={`block px-3 py-2 rounded-md text-base font-medium ${location.pathname === '/features' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700'}`}>{language === 'tr' ? 'Özellikler' : 'Features'}</Link>
              <Link to="/mobile-app" className={`block px-3 py-2 rounded-md text-base font-medium ${location.pathname === '/mobile-app' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700'}`}>{language === 'tr' ? 'Mobil Uygulama' : 'Mobile App'}</Link>
              <Link to="/pricing" className={`block px-3 py-2 rounded-md text-base font-medium ${location.pathname === '/pricing' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700'}`}>{language === 'tr' ? 'Fiyatlar' : 'Pricing'}</Link>
              <Link to="/contact" className={`block px-3 py-2 rounded-md text-base font-medium ${location.pathname === '/contact' ? 'bg-blue-50 text-blue-600 dark:bg-slate-700 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700'}`}>{language === 'tr' ? 'İletişim' : 'Contact'}</Link>
              
              <div className="border-t border-gray-100 dark:border-slate-700 my-2 pt-2"></div>
              
              <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-1 mx-3 mb-2 max-w-[120px]">
                <button onClick={() => setLanguage('en')} className={`flex-1 py-1 rounded-md text-xs font-semibold ${language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-300'}`}>EN</button>
                <button onClick={() => setLanguage('tr')} className={`flex-1 py-1 rounded-md text-xs font-semibold ${language === 'tr' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 dark:text-gray-300'}`}>TR</button>
              </div>
              
              <Link to="/login" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-700">{language === 'tr' ? 'Giriş Yap' : 'Login'}</Link>
              <Link to="/demo" className="block w-full text-center mt-2 px-3 py-3 rounded-md text-base font-bold bg-blue-600 text-white hover:bg-blue-700">{language === 'tr' ? 'İşletmeni Önizle' : 'Preview Your Business'}</Link>
            </div>
          </div>
        )}
      </header>
      <main className="flex-grow w-full">
        <Outlet />
      </main>
      <footer className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 mt-auto py-12">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">{marketConfigService.getBrandName().charAt(0)}</div>
                   <span className="font-semibold text-xl dark:text-white">{marketConfigService.getBrandName()}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{language === 'tr' ? 'Kuaförler, klinikler, stüdyolar ve randevu yönetimine ihtiyaç duyan tüm yerel işletmeler için tasarlanmış profesyonel web sitesi ve akıllı yönetim platformu.' : 'Professional website, smart booking, and customer management platform for any appointment-based business.'}</p>
            </div>
            <div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-4">{language === 'tr' ? 'Ürün' : 'Product'}</h4>
                <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                    <li><Link to="/features" className="hover:text-blue-600">{language === 'tr' ? 'Özellikler' : 'Features'}</Link></li>
                    <li><Link to="/pricing" className="hover:text-blue-600">{language === 'tr' ? 'Fiyatlar' : 'Pricing'}</Link></li>
                    <li><Link to="/ai-visualizer" className="hover:text-blue-600">{language === 'tr' ? 'AI Stil Asistanı' : 'AI Style Assistant'}</Link></li>
                    <li><Link to="/demo" className="hover:text-blue-600">{language === 'tr' ? 'Kendi İşletmeni Önizle' : 'Preview Your Business'}</Link></li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-gray-900 dark:text-white mb-4">{language === 'tr' ? 'Şirket' : 'Company'}</h4>
                <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                    <li><Link to="/contact" className="hover:text-blue-600">{language === 'tr' ? 'İletişim' : 'Contact Us'}</Link></li>
                    <li><Link to="/contact" className="hover:text-blue-600">{language === 'tr' ? 'Yardım / Destek' : 'Help / Support'}</Link></li>
                    <li><Link to="/contact" className="hover:text-blue-600">{language === 'tr' ? 'KVKK & Gizlilik' : 'Privacy & KVKK'}</Link></li>
                    <li><Link to="/contact" className="hover:text-blue-600">{language === 'tr' ? 'Kullanım Şartları' : 'Terms of Service'}</Link></li>
                </ul>
            </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400 dark:text-gray-600 mt-12 pt-8 border-t border-gray-100 dark:border-slate-800">
          {(import.meta as any).env.VITE_DATA_MODE === 'mock' && window.location.search.includes('demoTools=1') && (
            <div className="flex flex-col items-center gap-2 mb-6 p-4 bg-gray-100 dark:bg-slate-800 rounded-lg max-w-sm mx-auto">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                {language === 'tr' ? 'Demo Araçları (Sadece Geliştirici Modu)' : 'Demo Utils (Dev Mode Only)'}
              </span>
              <div className="flex justify-center gap-4">
                 <button onClick={() => {
                    import('../../utils/demoSeeder').then(m => m.seedDemoData());
                 }} className="text-blue-500 hover:text-blue-700 text-xs font-semibold uppercase tracking-wider">
                   {language === 'tr' ? 'Pilot Demo Verisi Yükle' : 'Seed Pilot Demo Data'}
                 </button>
                 <button onClick={async () => {
                    const confirmed = await showConfirm({ message: language === 'tr' ? 'Tüm yerel veriler silinecek (Demo sıfırlama). Bu işlem geri alınamaz. Emin misiniz?' : 'All local demo data will be wiped. This Cannot be undone. Are you sure?'});
                    if(confirmed) {
                       localStorage.clear();
                       window.location.reload();
                    }
                 }} className="text-red-500 hover:text-red-700 text-xs font-semibold uppercase tracking-wider">
                   {language === 'tr' ? 'Yerel Veriyi Sıfırla' : 'Reset Local Data'}
                 </button>
              </div>
            </div>
          )}
          &copy; {new Date().getFullYear()} {marketConfigService.getCurrentMarketConfig().companyName}. {language === 'tr' ? 'Tüm hakları saklıdır.' : 'All rights reserved.'}
        </div>
      </footer>
    </div>
  );
};

export default MarketingLayout;
