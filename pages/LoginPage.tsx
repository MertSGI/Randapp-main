import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [view, setView] = useState<'login' | 'forgot_password'>('login');
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useLanguage();
  const { login, currentUser, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && currentUser) {
      if (currentUser.role === 'super_admin') {
        navigate('/super-admin', { replace: true });
      } else if (currentUser.role === 'tenant_owner') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [currentUser, isLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email) {
       setError(language === 'tr' ? 'E-posta adresinizi girin.' : 'Please enter your email.');
       return;
    }
    if (!password) {
       setError(language === 'tr' ? 'Şifrenizi girin.' : 'Please enter your password.');
       return;
    }
    
    try {
      const success = await login(email, password);
      if (success) {
        // Navigation handled by useEffect
      } else {
        setError(language === 'tr' ? 'Giriş bilgileri kontrol edilemedi.' : 'Invalid credentials.');
      }
    } catch (err) {
      setError(language === 'tr' ? 'Bir hata oluştu, lütfen tekrar deneyin.' : 'An error occurred.');
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
       setError(language === 'tr' ? 'Lütfen e-posta adresinizi girin.' : 'Please enter your email.');
       return;
    }
    setResetSent(true);
    setError('');
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-50 dark:bg-slate-900 min-h-[70vh]">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg w-full max-w-md border border-gray-100 dark:border-slate-700 transition-colors duration-300">
        
        {view === 'login' ? (
           <>
              <h2 className="text-3xl font-extrabold mb-8 text-center text-gray-900 dark:text-white transition-colors duration-300">
                 {language === 'tr' ? 'Giriş Yap' : 'Log In'}
              </h2>
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-300">
                     {language === 'tr' ? 'E-posta' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-xl border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border transition-colors duration-300"
                    placeholder={language === 'tr' ? 'ornek@isletme.com' : 'hello@business.com'}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                     <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors duration-300">
                        {language === 'tr' ? 'Şifre' : 'Password'}
                     </label>
                     <button type="button" onClick={() => { setView('forgot_password'); setResetSent(false); setError(''); }} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                        {language === 'tr' ? 'Şifremi unuttum' : 'Forgot password?'}
                     </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border transition-colors duration-300"
                    placeholder="••••••••"
                  />
                </div>
                {error && <p className="text-red-500 dark:text-red-400 text-sm transition-colors duration-300 font-medium">{error}</p>}
                
                <button
                  type="submit"
                  className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300 shadow-indigo-600/20"
                >
                  {language === 'tr' ? 'Giriş Yap' : 'Log In'}
                </button>
              </form>
              
              <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-700 text-center">
                 <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {language === 'tr' ? 'Hesabınız yok mu?' : "Don't have an account?"}
                 </p>
                 <Link to="/register" className="inline-block w-full py-3 px-4 border border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl font-bold transition-all text-sm text-center">
                    {language === 'tr' ? '14 Gün Ücretsiz Başla' : 'Start 14-Day Free Trial'}
                 </Link>
                 
                 <div className="mt-6 flex flex-col gap-2 items-center justify-center">
                    <Link to="/demo" className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline">
                       {language === 'tr' ? 'İşletmeni Önizle' : 'Preview Your Business'}
                    </Link>
                    <Link to="/pilot" className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 underline">
                       {language === 'tr' ? 'Örnek İşletmeyi Gör' : 'View Demo Business'}
                    </Link>
                 </div>
              </div>
           </>
        ) : (
           <>
              <h2 className="text-2xl font-extrabold mb-4 text-center text-gray-900 dark:text-white transition-colors duration-300">
                 {language === 'tr' ? 'Şifremi Unuttum' : 'Reset Password'}
              </h2>
              
              {resetSent ? (
                 <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                       <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                       </svg>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                       {language === 'tr' 
                          ? 'Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, sıfırlama bağlantısı gönderilecektir.' 
                          : 'If an account exists for this email, a reset link will be sent.'}
                    </p>
                    <button onClick={() => setView('login')} className="w-full py-3 text-indigo-600 font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors">
                       {language === 'tr' ? 'Giriş Sayfasına Dön' : 'Back to Login'}
                    </button>
                 </div>
              ) : (
                 <form onSubmit={handleResetPassword} className="space-y-5">
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6 leading-relaxed">
                       {language === 'tr' 
                          ? 'Şifre sıfırlama bağlantısı için e-posta adresinizi girin.' 
                          : 'Enter your email for a password reset link.'}
                    </p>
                    <div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full rounded-xl border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3 border transition-colors duration-300"
                        placeholder={language === 'tr' ? 'ornek@isletme.com' : 'hello@business.com'}
                      />
                    </div>
                    {error && <p className="text-red-500 dark:text-red-400 text-sm transition-colors duration-300 font-medium">{error}</p>}
                    <button
                      type="submit"
                      className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-300"
                    >
                      {language === 'tr' ? 'Sıfırlama Bağlantısı Gönder' : 'Send Reset Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setView('login'); setError(''); }}
                      className="w-full py-3 text-sm text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                      {language === 'tr' ? 'İptal' : 'Cancel'}
                    </button>
                 </form>
              )}
           </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;