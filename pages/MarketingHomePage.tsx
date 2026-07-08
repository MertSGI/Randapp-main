import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";
import { translations } from "../utils/translations";
import { ProductShowcasePreview } from "../components/ProductShowcasePreview";

const MarketingHomePage: React.FC = () => {
  const { language } = useLanguage();
  const t = translations[language];

  const [phraseIndex, setPhraseIndex] = useState(0);
  const phrases =
    language === "tr"
      ? [
          "Kuaförler",
          "Berberler",
          "Güzellik salonları",
          "Klinikler",
          "Randevulu işletmeler",
          "Stüdyolar",
        ]
      : [
          "Barbers",
          "Hair Salons",
          "Beauty Clinics",
          "Nail Studios",
          "Spas",
          "Appointment Businesses",
        ];

  useEffect(() => {
    if (!phrases || phrases.length === 0) return;
    const interval = setInterval(() => {
      setPhraseIndex((prev) => (prev + 1) % phrases.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [phrases.length]);

  const currentPhrase = phrases[phraseIndex] || "";

  return (
    <div className="flex flex-col space-y-16 md:space-y-24 py-8 md:py-12 relative overflow-hidden">
      {/* 1. Hero Section */}
      <section className="px-4 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left: Text Content & CTA */}
          <div className="flex flex-col text-center lg:text-left pt-4 lg:pt-0">
            <div className="inline-block bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 font-bold px-4 py-1.5 md:px-5 md:py-2 rounded-full text-xs md:text-sm mb-4 md:mb-6 border border-violet-100 dark:border-violet-800 self-center lg:self-start">
              {language === "tr"
                ? "LARI ile İşletmenizi Dijitalleştirin"
                : "Digitize Your Business with LARİ"}
            </div>

            <div className="relative h-[1.5em] md:h-[1.3em] mb-4 md:mb-6 text-[1.65rem] sm:text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight">
                  <span
                    key={currentPhrase}
                    className="absolute inset-0 animate-slideUpFade flex items-center justify-center lg:justify-start leading-tight w-full px-2"
                  >
                    {language === "en" && <span className="text-slate-800 dark:text-slate-200 mr-2 md:mr-3">For</span>}
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 text-center lg:text-left">
                      {currentPhrase}
                    </span>
                    {language === "tr" && <span className="text-slate-800 dark:text-slate-200 ml-3 whitespace-nowrap">için</span>}
                  </span>
            </div>

            {/* Desktop Headline */}
            <h1 className="hidden md:block text-4xl sm:text-5xl md:text-[3.2rem] font-extrabold tracking-tight text-slate-900 dark:text-white mb-6 leading-[1.15]">
              {language === "tr"
                ? "İşletmenize web sitesi, online randevu ve AI destekli müşteri deneyimi kazandırın."
                : "Give your business a website, online booking, and AI-powered customer experience."}
            </h1>
            {/* Mobile Headline */}
            <h1 className="block md:hidden text-[1.4rem] xs:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-3 leading-tight px-2">
              {language === "tr"
                ? "Web siteniz, randevularınız ve AI asistanınız tek yerde."
                : "Your website, bookings, and AI assistant in one place."}
            </h1>

            {/* Desktop Subtext */}
            <p className="hidden md:block mt-2 text-lg md:text-xl text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl break-words">
              {language === "tr"
                ? "LARİ; kuaförler, güzellik salonları, klinikler ve randevulu işletmeler için dijital vitrin, online randevu, müşteri hafızası, AI stil asistanı ve kampanya yönetimini tek panelde birleştirir."
                : "LARİ unifies your digital storefront, online booking, customer memory, AI style assistant, and campaign management in one dashboard."}
            </p>
            {/* Mobile Subtext */}
            <p className="block md:hidden mt-2 text-[15px] text-slate-600 dark:text-slate-300 mx-auto leading-snug w-full px-4 break-words">
              {language === "tr"
                ? "LARİ; işletmenize paylaşılabilir bir dijital vitrin, online randevu akışı ve yönetim paneli sunar."
                : "LARİ offers your business a shareable digital storefront, online booking flow, and management panel."}
            </p>

            {/* Mobile Product Visual Preview replaces the hardcoded one */}
            <div className="block lg:hidden mt-8 mb-4">
              <ProductShowcasePreview />
            </div>

            <div className="mt-8 md:mt-10 flex flex-col sm:flex-row justify-center lg:justify-start gap-3 md:gap-4 w-full max-w-[320px] sm:max-w-none mx-auto lg:mx-0 sm:px-0">
              <Link
                to="/register?planId=professional"
                className="bg-blue-600 text-white px-6 py-3.5 md:px-8 md:py-4 rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition transform hover:-translate-y-1 block w-full sm:w-auto text-center md:min-w-[200px] text-[15px] md:text-base cursor-pointer"
              >
                {language === "tr"
                  ? "14 Gün Ücretsiz Başla"
                  : "Start 14-Day Free Trial"}
              </Link>
              <Link
                to="/pilot"
                className="bg-white dark:bg-slate-800 text-slate-800 dark:text-white px-6 py-3.5 md:px-8 md:py-4 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition transform hover:-translate-y-1 block w-full sm:w-auto text-center md:min-w-[200px] text-[15px] md:text-base cursor-pointer"
              >
                {language === "tr"
                  ? "Örnek İşletmeyi Gör"
                  : "View Demo Business"}
              </Link>
            </div>
            
            <div className="mt-5 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-2 sm:gap-3 text-[13px] md:text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium opacity-85">{language === "tr" ? "Önce keşfetmek ister misiniz?" : "Want to explore first?"}</span>
              <div className="flex items-center gap-2">
                <Link to="/pricing" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold transition-colors flex items-center gap-0.5 group">
                  <span>{language === "tr" ? "Paketleri karşılaştır" : "Compare plans"}</span>
                  <span className="transform group-hover:translate-x-0.5 transition-transform font-bold">→</span>
                </Link>
                <span className="text-slate-300 dark:text-slate-700 font-light">•</span>
                <Link to="/demo" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold transition-colors flex items-center gap-0.5 group">
                  <span>{language === "tr" ? "İşletmeni önizle" : "Preview your business"}</span>
                  <span className="transform group-hover:translate-x-0.5 transition-transform font-bold">→</span>
                </Link>
              </div>
            </div>

            {/* Desktop Trust Chips */}
            <div className="hidden lg:flex mt-8 flex-wrap justify-start gap-x-6 gap-y-3 text-sm font-medium text-slate-600 dark:text-slate-400 max-w-xl">
              <div className="flex items-center gap-1.5">
                <span className="text-blue-500">✓</span>{" "}
                {language === "tr"
                  ? "Mini web sitesi hazır"
                  : "Mini website included"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500">✓</span>{" "}
                {language === "tr" ? "Online randevu akışı" : "Online booking flow"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-violet-500">✓</span>{" "}
                {language === "tr" ? "AI Stil Asistanı" : "AI Style Assistant"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-indigo-500">✓</span>{" "}
                {language === "tr" ? "Müşteri hafızası" : "Customer memory"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">✓</span>{" "}
                {language === "tr"
                  ? "14 gün ödeme alınmaz"
                  : "14 days no charge"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-500">✓</span>{" "}
                {language === "tr" ? "Güvenli kart doğrulama" : "Secure card check"}
              </div>
            </div>

            {/* Mobile Trust Chips (Horizontal Scroll or Dense 2-col) - stays visible on md screens until lg */}
            <div className="lg:hidden mt-8 border-t border-slate-100 dark:border-slate-800/60 pt-6">
              <div className="grid grid-cols-2 gap-x-2 gap-y-3 px-2 text-[12px] font-medium text-slate-600 dark:text-slate-400 mx-auto max-w-md">
                <div className="flex items-center justify-start gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-blue-500 text-sm">✓</span>{" "}
                  <span>
                    {language === "tr" ? "Mini web sitesi" : "Mini website"}
                  </span>
                </div>
                <div className="flex items-center justify-start gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-green-500 text-sm">✓</span>{" "}
                  <span>
                    {language === "tr" ? "Online randevu" : "Online booking"}
                  </span>
                </div>
                <div className="flex items-center justify-start gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-violet-500 text-sm">✓</span>{" "}
                  <span>
                    {language === "tr" ? "AI Stil Asistanı" : "AI Assistant"}
                  </span>
                </div>
                <div className="flex items-center justify-start gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-indigo-500 text-sm">✓</span>{" "}
                  <span>
                    {language === "tr" ? "Müşteri hafızası" : "Customer memory"}
                  </span>
                </div>
                <div className="flex items-center justify-start gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500 text-sm">✓</span>{" "}
                  <span>
                    {language === "tr" ? "14 gün ödeme alınmaz" : "14 days free"}
                  </span>
                </div>
                <div className="flex items-center justify-start gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-emerald-500 text-sm">✓</span>{" "}
                  <span>
                    {language === "tr" ? "Güvenli ödeme" : "Secure checkout"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Desktop Product Showcase */}
          <div className="hidden lg:block relative w-full h-full min-h-[500px]">
            <ProductShowcasePreview className="absolute top-1/2 -translate-y-1/2 right-0 2xl:-right-10 origin-right scale-[0.85] xl:scale-100" />
          </div>
        </div>
      </section>

      {/* 2. Problem Section */}
      <section className="bg-slate-50 dark:bg-slate-800/20 py-20 px-4 mt-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              {language === "tr"
                ? "Randevular neden kaçıyor?"
                : "Why are bookings lost?"}
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              {language === "tr"
                ? "Geleneksel iletişim yöntemleri ve dağınık sistemler müşterilerinizi kaybetmenize neden olur."
                : "Traditional communication and scattered systems cause you to lose customers."}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
              <div className="text-3xl mb-4">💬</div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                {language === "tr"
                  ? "Müşteri mesaj atıyor, cevap gecikiyor"
                  : "Delayed responses to customer messages"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Fiyat bilgisinden hizmet içeriğine, mesaj trafiğinde kaybolan potansiyel müşteriler."
                  : "Potential customers lost in message traffic due to pricing or service inquiries."}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
              <div className="text-3xl mb-4">🕐</div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                {language === "tr"
                  ? "Uygun saat bulmak gereksiz uzuyor"
                  : "Finding suitable times takes too long"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Müşteri ve işletme arasında müsaitlik pazarlığı yaparken harcanan gereksiz saatler."
                  : "Unnecessary hours spent negotiating availability between customer and business."}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
              <div className="text-3xl mb-4">📋</div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                {language === "tr"
                  ? "Hizmet/fiyat bilgisi dağınık kalıyor"
                  : "Service & pricing information is scattered"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Instagram öne çıkanlar, PDF dosyaları veya sadece akılda kalan profesyonellikten uzak ücret listeleri."
                  : "Unprofessional price lists scattered across Instagram highlights or PDF files."}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
              <div className="text-3xl mb-4">👤</div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                {language === "tr"
                  ? "Müşteri geçmişi ve tercihleri unutuluyor"
                  : "Customer history & preferences are forgotten"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Kağıt defterde tutulan notlar veya akılda kalan bilgilerle kişisel bir müşteri deneyimi yaratmak çok zor."
                  : "It is too hard to create a personalized customer experience with notes kept on paper."}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
              <div className="text-3xl mb-4">📱</div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                {language === "tr"
                  ? "Instagram'dan gelen ilgi randevuya dönüşmüyor"
                  : "Instagram interest doesn't convert to bookings"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Profilinizi inceleyen ilgilenen misafirleriniz, randevu alabilecekleri bir platform olmadığı için vazgeçiyor."
                  : "Interested guests exploring your profile bounce because there is no platform to quickly book."}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all hover:shadow-md">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">
                {language === "tr"
                  ? "İşletme sahibi gün sonunda tabloyu net göremiyor"
                  : "Business owner lacks clear end-of-day visibility"}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {language === "tr"
                  ? "Günün sonunda kazançları, iptalleri ve müşteri dönüşlerini analiz etmeden ilerleyen bir işletme."
                  : "Going forward blindly without properly analyzing revenue, cancellations, and customer return rates."}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Solution Section */}
      <section className="px-4 py-8 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
            {language === "tr"
              ? "LARİ bu akışı tek platformda toplar"
              : "LARİ unifies this flow"}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl font-black text-slate-400 mb-6">
              1
            </div>
            <h4 className="font-bold text-lg mb-3 text-slate-900 dark:text-white">
              {language === "tr"
                ? "Dijital vitrininizi oluşturun"
                : "Create your storefront"}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {language === "tr"
                ? "İşletme bilgileriniz, cover görseliniz, hizmetleriniz, uzmanlarınız, konumunuz ve Instagram vitrininizle kendi mağazanızı yaratın."
                : "Publish your own website with business info, services, staff, location, and Instagram showcase."}
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-2xl font-black text-blue-400 mb-6">
              2
            </div>
            <h4 className="font-bold text-lg mb-3 text-slate-900 dark:text-white">
              {language === "tr"
                ? "Müşteri hizmeti ve uzmanı seçsin"
                : "Customers choose service & staff"}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {language === "tr"
                ? "Şeffaf fiyatlar, süreler ve uzman müsaitliği ile müşterilerin kendilerine en uygun saati ve uzmanı şeffafça seçmesini sağlayın."
                : "Enable customers to book the best time and staff with transparent pricing and durations."}
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-2xl font-black text-violet-400 mb-6">
              3
            </div>
            <h4 className="font-bold text-lg mb-3 text-slate-900 dark:text-white">
              {language === "tr"
                ? "AI Stil Asistanı karar vermeyi kolaylaştırsın"
                : "AI Style Assistant simplifies decisions"}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {language === "tr"
                ? "Müşterileriniz stil hedefi için bir fotoğraf yükleyip asistan üzerinden karar sürecini hızlandırarak hemen randevuya geçsin."
                : "Customers upload photos to the AI Style Assistant to speed up decision-making and jump straight to booking."}
            </p>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-2xl font-black text-green-500 mb-6">
              4
            </div>
            <h4 className="font-bold text-lg mb-3 text-slate-900 dark:text-white">
              {language === "tr"
                ? "Müşteri hafızasıyla tekrar satış yaratın"
                : "Create repeat sales with memory"}
            </h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {language === "tr"
                ? "Müşteri tercihleri, ziyaret geçmişi, notlar, tavsiye ve kampanyalar ile onları işletmenize daha sık bağlayın."
                : "Build loyalty by offering personalized service based on preferences, history, and tailored campaigns."}
            </p>
          </div>
        </div>
      </section>

      {/* 4. Comparison Section */}
      <section className="px-4 py-16 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
            {language === "tr"
              ? "Sadece randevu linki değil, işletme web sitesi + yönetim paneli"
              : "Not just a booking link: A full website + admin panel"}
          </h2>
        </div>

        {/* Desktop Table View - Hidden on Mobile */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-800 hide-scrollbar">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="p-4 md:p-6 font-bold text-slate-900 dark:text-white"></th>
                <th className="p-4 md:p-6 font-bold text-slate-500 dark:text-slate-400 text-center w-1/4 whitespace-nowrap">
                  {language === "tr" ? "Sosyal Medya" : "Social Media"}
                </th>
                <th className="p-4 md:p-6 font-bold text-slate-500 dark:text-slate-400 text-center w-1/4 whitespace-nowrap">
                  {language === "tr" ? "Randevu Linki" : "Booking Link"}
                </th>
                <th className="p-4 md:p-6 font-bold text-blue-600 dark:text-blue-400 text-center w-1/4 bg-blue-50/50 dark:bg-blue-900/10 rounded-t-xl text-lg">
                  LARİ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                  {language === "tr" ? "Mini Web Sitesi" : "Mini Website"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white">
                  {language === "tr" ? "Online Randevu" : "Online Booking"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500">✓</td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white">
                  {language === "tr"
                    ? "Uzman / Fark Etmez Seçimi"
                    : "Staff/No-Preference Selection"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500">✓</td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white">
                  {language === "tr"
                    ? "AI Stil Asistanı"
                    : "AI Style Assistant"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white">
                  {language === "tr"
                    ? "Müşteri Hafızası (CRM Lite)"
                    : "Customer Memory (CRM Lite)"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-amber-500">
                  {language === "tr" ? "Kısmi" : "Partial"}
                </td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white">
                  {language === "tr"
                    ? "Kampanya ve Yönlendirme"
                    : "Campaign/Referral"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white">
                  {language === "tr" ? "Yönetici Paneli" : "Admin Dashboard"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500">✓</td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                  ✓
                </td>
              </tr>
              <tr>
                <td className="p-4 md:p-6 font-medium text-slate-900 dark:text-white whitespace-nowrap border-b-0">
                  {language === "tr"
                    ? "Mobil Keşif Kanalı"
                    : "Mobile Discovery Channel"}
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600 border-b-0">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-slate-300 dark:text-slate-600 border-b-0">
                  -
                </td>
                <td className="p-4 md:p-6 text-center text-green-500 bg-blue-50/50 dark:bg-blue-900/10 font-bold border-b-0 rounded-b-xl">
                  ✓
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View - Shown on Mobile only */}
        <div className="block md:hidden space-y-4">
          {[
            {
              name: language === "tr" ? "Mini Web Sitesi" : "Mini Website",
              social: "-",
              booking: "-",
              lari: "✓",
            },
            {
              name: language === "tr" ? "Online Randevu" : "Online Booking",
              social: "-",
              booking: "✓",
              lari: "✓",
            },
            {
              name:
                language === "tr"
                  ? "Uzman / Fark Etmez Seçimi"
                  : "Staff/No-Preference Selection",
              social: "-",
              booking: "✓",
              lari: "✓",
            },
            {
              name:
                language === "tr" ? "AI Stil Asistanı" : "AI Style Assistant",
              social: "-",
              booking: "-",
              lari: "✓",
            },
            {
              name:
                language === "tr"
                  ? "Müşteri Hafızası (CRM Lite)"
                  : "Customer Memory (CRM Lite)",
              social: "-",
              booking: language === "tr" ? "Kısmi" : "Partial",
              lari: "✓",
            },
            {
              name:
                language === "tr"
                  ? "Kampanya ve Yönlendirme"
                  : "Campaign/Referral",
              social: "-",
              booking: "-",
              lari: "✓",
            },
            {
              name: language === "tr" ? "Yönetici Paneli" : "Admin Dashboard",
              social: "-",
              booking: "✓",
              lari: "✓",
            },
            {
              name:
                language === "tr"
                  ? "Mobil Keşif Kanalı"
                  : "Mobile Discovery Channel",
              social: "-",
              booking: "-",
              lari: "✓",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <h4 className="font-bold text-slate-900 dark:text-white mb-3 text-sm">
                {item.name}
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block font-medium mb-1">
                    {language === "tr" ? "Sosyal" : "Social"}
                  </span>
                  <span className="font-bold text-slate-500 dark:text-slate-400">
                    {item.social}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block font-medium mb-1">
                    {language === "tr" ? "Randevu L." : "Booking"}
                  </span>
                  <span className="font-bold text-slate-500 dark:text-slate-400">
                    {item.booking}
                  </span>
                </div>
                <div className="bg-blue-50/50 dark:bg-blue-900/20 p-2.5 rounded-lg border border-blue-100 dark:border-blue-800/40">
                  <span className="text-blue-600 dark:text-blue-400 block font-bold mb-1">
                    LARİ
                  </span>
                  <span className="font-extrabold text-green-600 dark:text-green-400 text-xs">
                    {item.lari}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Brand Explanation */}
      <section className="max-w-4xl mx-auto px-4 py-8 text-center bg-transparent border-t border-slate-200 dark:border-slate-800">
        <p className="text-slate-500 text-sm md:text-base mb-2">
          {language === "tr"
            ? "Lari; Link, AI, Randevu ve İşletme kelimelerinden gelir."
            : "LARİ stands for Link, AI, Booking (Randevu) and Business (İşletme)."}
        </p>
        <p className="text-slate-600 dark:text-slate-400 text-sm md:text-base font-medium">
          {language === "tr"
            ? "İşletmenize paylaşılabilir bir dijital vitrin, online randevu akışı, AI destekli müşteri deneyimi ve yönetim paneli sunar."
            : "It provides your business with a shareable digital storefront, booking flow, AI-powered customer experience, and an administration panel."}
        </p>
      </section>

      {/* 5. Product Surface Previews/Proof */}
      <section className="bg-slate-50 dark:bg-slate-800/30 border-y border-slate-200 dark:border-slate-800 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 dark:text-white">
            {language === "tr"
              ? "Sistemi Keşfedin (Örnek Görünümler)"
              : "Explore the System (Sample Views)"}
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition">
              <div className="h-40 bg-slate-50 dark:bg-slate-900 rounded-xl w-full border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center overflow-hidden relative">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-2 mt-4 flex border border-blue-200 dark:border-blue-800/50 border-dashed items-center justify-center text-blue-500 font-bold text-xs uppercase">
                  Logo
                </div>
                <div className="h-2 w-16 bg-slate-300 dark:bg-slate-600 rounded mb-4"></div>
                <div className="grid grid-cols-2 gap-2 w-full px-4 mb-2">
                  <div className="h-10 bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 rounded-md"></div>
                  <div className="h-10 bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 rounded-md"></div>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-base dark:text-white">
                  {language === "tr"
                    ? "İşletme Web Sitesi"
                    : "Business Website"}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {language === "tr"
                    ? "İşletmenize özel tasarlanmış profesyonel görünüm, servis kartları, galeri ve lokasyon gösterimi."
                    : "A professionally designed look specific to your business, service cards, gallery, and location map."}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition">
              <div className="h-40 bg-slate-50 dark:bg-slate-900 flex justify-center pt-6 p-4 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden relative">
                <div className="w-[130px] bg-white dark:bg-slate-800 rounded-t-[1.25rem] shadow-lg border-2 border-slate-200 dark:border-slate-700 p-2.5 flex flex-col h-full shrink-0 relative z-10">
                  <div className="h-1.5 w-8 bg-slate-200 dark:bg-slate-600 rounded mx-auto mb-3"></div>
                  <div className="h-3 w-16 bg-slate-800 dark:bg-slate-200 rounded mb-2"></div>
                  <div className="flex-1 rounded-lg bg-slate-50 dark:bg-slate-900/50 p-2 border border-slate-100 dark:border-slate-700/50 mb-2 flex flex-col justify-center">
                    <div className="h-1.5 w-1/2 bg-blue-500 rounded mb-1"></div>
                    <div className="h-1.5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></div>
                  </div>
                  <div className="h-5 w-full bg-blue-600 rounded-md shrink-0"></div>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-base dark:text-white">
                  {language === "tr"
                    ? "Gömülü Randevu Akışı"
                    : "Embedded Booking Flow"}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {language === "tr"
                    ? "Müşterilerin hizmet, uzman seçimi, takvim müsaitliği ve müşteri bilgisi girişini zahmetsizce yaptığı akış."
                    : "An effortless flow for customers to pick services, staff, check calendar availability, and confirm."}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition">
              <div className="h-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden relative flex p-2">
                <div className="w-1/4 h-full bg-slate-100 dark:bg-slate-800 rounded flex flex-col gap-2 p-2">
                  <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
                  <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
                  <div className="h-2 w-1/2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
                <div className="w-3/4 h-full p-2 flex flex-col gap-2">
                  <div className="h-6 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-md shadow-sm"></div>
                  <div className="flex-1 w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-md shadow-sm p-2 flex flex-col gap-1.5">
                    <div className="w-full flex justify-between items-center">
                      <div className="w-8 h-2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                      <div className="w-6 h-2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    </div>
                    <div className="w-full flex justify-between items-center">
                      <div className="w-10 h-2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                      <div className="w-4 h-2 bg-slate-200 dark:bg-slate-700 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-base dark:text-white">
                  {language === "tr"
                    ? "Salon Sahibi Paneli"
                    : "Salon Owner Panel"}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {language === "tr"
                    ? "Günlük randevularınızı, hızlı işlemleri, personel durumlarını ve müşteri notlarınızı görebileceğiniz kontrol merkezi."
                    : "Control center to see daily appointments, quick actions, staff schedules, and customer notes."}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition">
              <div className="h-40 bg-gradient-to-tr from-violet-50 to-indigo-50 dark:from-violet-900/10 dark:to-indigo-900/10 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden relative flex flex-col p-4 items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-100 dark:border-slate-700 flex items-center justify-center text-xl mb-3">
                  ✨
                </div>
                <div className="h-2 w-3/4 bg-violet-200 dark:bg-violet-800/50 rounded mb-1.5"></div>
                <div className="h-2 w-1/2 bg-violet-200 dark:bg-violet-800/50 rounded"></div>
              </div>
              <div>
                <h4 className="font-bold text-base dark:text-white">
                  {language === "tr"
                    ? "AI Stil Asistanı"
                    : "AI Style Assistant"}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {language === "tr"
                    ? "Müşterilerinizin hedeflerini anlayıp onlara en uygun hizmeti önermek için akıllı randevu yolculuğunu başlatan asistan."
                    : "Starts a smart journey by understanding your customers goals and suggesting the best services."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. AI Positioning Section */}
      <section className="bg-gradient-to-br from-violet-900 to-indigo-900 py-16 md:py-24 px-4 text-white my-8 mx-0 md:mx-4 md:rounded-3xl shadow-xl">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-[1.15]">
              {language === "tr"
                ? "AI sadece cevap vermez, randevuya yönlendirir."
                : "AI does not just answer, it drives bookings."}
            </h2>
            <div className="bg-white/10 border border-white/10 p-6 rounded-2xl backdrop-blur-md">
              <h3 className="font-bold text-lg md:text-xl mb-2 text-violet-200 flex items-center gap-2">
                <span>📸</span>{" "}
                {language === "tr"
                  ? "Müşteri İçin: Yaratıcı AI Asistan"
                  : "For Customers: Creative AI Assistant"}
              </h3>
              <p className="text-sm md:text-base text-indigo-100/90 leading-relaxed">
                {language === "tr"
                  ? "Müşteri saç, sakal veya tırnak fikri için bir fotoğraf yükler. AI stil önerisinde bulunur ve ardından doğru hizmete eşleştirerek randevu formunu açar."
                  : "Customers upload an image for hair, beard, or nail ideas. AI offers style suggestions and matches them with the right service to open the booking step."}
              </p>
            </div>
            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl backdrop-blur-md">
              <h3 className="font-bold text-lg md:text-xl mb-2 text-indigo-300 flex items-center gap-2">
                <span>📊</span>{" "}
                {language === "tr"
                  ? "İşletme İçin: AI İçgörüleri"
                  : "For Businesses: AI Insights"}
              </h3>
              <p className="text-sm md:text-base text-indigo-100/70 leading-relaxed">
                {language === "tr"
                  ? "Sistemin kullanımı arttıkça, yoğun saatlerinizi, geri dönüş fırsatlarınızı ve hizmet performansınızı daha analitik bir şekilde değerlendirirsiniz."
                  : "As system usage grows, evaluate peak hours, return opportunities, and service performance analytically."}
              </p>
            </div>
          </div>
          <div className="flex-1 w-full max-w-sm relative hidden sm:block">
            <div className="absolute inset-0 bg-violet-500/30 blur-[60px] rounded-full"></div>
            <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-[3rem] p-5 relative z-10 mx-auto w-[280px] sm:w-[320px]">
              <div className="w-full h-12 flex justify-center items-center mb-4 border-b border-slate-800 pb-2">
                <div className="w-1/3 h-2 bg-slate-800 rounded-full"></div>
              </div>
              <div className="bg-slate-800 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xl shadow-lg shadow-violet-500/20">
                    🪄
                  </div>
                  <div className="h-4 w-24 bg-slate-700 rounded"></div>
                </div>
                <div className="h-2 w-full bg-slate-700 rounded mb-2"></div>
                <div className="h-2 w-5/6 bg-slate-700 rounded mb-2"></div>
                <div className="h-2 w-4/6 bg-slate-700 rounded"></div>
              </div>
              <div className="bg-violet-900/40 border border-violet-500/30 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="h-3 w-20 bg-violet-300/50 rounded mb-2"></div>
                  <div className="h-2 w-16 bg-violet-400/30 rounded"></div>
                </div>
                <div className="h-9 w-24 bg-violet-600 rounded-xl"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Sector Coverage */}
      <section className="px-4 py-16 max-w-6xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
          {language === "tr"
            ? "Randevulu işletmeler için tasarlandı"
            : "Designed for appointment businesses"}
        </h2>
        <p className="text-lg text-slate-600 dark:text-slate-400 mb-12 max-w-2xl mx-auto">
          {language === "tr"
            ? "Zamana dayalı hizmet veren her sektör için profesyonelce çalışan modüller."
            : "Professional modules for every industry providing time-based services."}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">✂️</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {language === "tr" ? "Kuaför & Berber" : "Hair & Barber"}
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">✨</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {language === "tr" ? "Güzellik Merkezi" : "Beauty Center"}
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">💅</span>
            <span className="font-bold text-slate-900 dark:text-white">
              Nail Studio
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">💆‍♀️</span>
            <span className="font-bold text-slate-900 dark:text-white">
              Spa & Wellness
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">🦷</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {language === "tr" ? "Diş Kliniği" : "Dental Clinic"}
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">🩺</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {language === "tr" ? "Özel Klinik" : "Private Clinic"}
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">🏋️</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {language === "tr" ? "PT / Spor Stüdyosu" : "PT / Gym Studio"}
            </span>
          </div>
          <div className="p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-sm hover:shadow-md transition">
            <span className="text-4xl mb-2">💼</span>
            <span className="font-bold text-slate-900 dark:text-white">
              {language === "tr" ? "Danışmanlık Ofisi" : "Consulting Office"}
            </span>
          </div>
        </div>
      </section>

      {/* 8. Integrations */}
      <section className="px-4 py-8 md:py-12 max-w-4xl mx-auto text-center border-t border-slate-200 dark:border-slate-800">
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-8">
          {language === "tr"
            ? "Öne Çıkan Entegrasyonlar"
            : "Featured Integrations"}
        </h2>
        <div className="flex flex-wrap justify-center gap-3 md:gap-4">
          <span className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2">
            <span className="text-green-500">✅</span> WhatsApp İletişim
          </span>
          <span className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2">
            <span className="text-pink-500">✅</span> Instagram Gösterimi
          </span>
          <span className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2">
            <span className="text-blue-500">✅</span> Güvenli Online Ödeme
          </span>
          <span className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2">
            <span className="text-amber-500">✅</span> Google Takvim Bağlantısı
          </span>
          <span className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2">
            <span className="text-indigo-500">✅</span> Müşteri Hafızası
          </span>
          <span className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-2">
            <span className="text-violet-500">✅</span> AI Stil Asistanı
          </span>
        </div>
      </section>

      {/* 9. Pricing Bridge */}
      <section className="px-4 pt-16 pb-8 text-center max-w-4xl mx-auto">
        <div className="inline-block bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold px-4 py-2 rounded-full text-xs md:text-sm mb-6 border border-blue-100 dark:border-blue-800">
          {language === "tr" ? "14 Gün Ücretsiz Pilot" : "14 Day Free Pilot"}
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white mb-6 tracking-tight">
          {language === "tr"
            ? "İşletmenizin büyüklüğüne göre paket seçin"
            : "Choose a plan based on your business size"}
        </h2>
        <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-8 max-w-2xl mx-auto leading-relaxed">
          {language === "tr"
            ? "Sınırsız randevu kapasitesi Standart pakette dahil. Ekibiniz büyüdükçe gelişmiş yapay zeka asistanı ve müşteri hafızası özellikleri için Premium plana geçebilirsiniz."
            : "Unlimited booking capacity included in Standard. Upgrade to Premium for advanced AI assistant and customer memory tools."}
        </p>
      </section>

      {/* CTA Bottom */}
      <section className="bg-blue-600 py-16 md:py-24 px-6 text-center rounded-[2.5rem] mx-4 md:max-w-6xl md:mx-auto mb-16 shadow-[0_20px_50px_-12px_rgba(37,99,235,0.4)] relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="relative z-10">
          <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6 tracking-tight">
            {language === "tr"
              ? "LARİ ile İşletmenizi Büyütün"
              : "Grow your business with LARİ"}
          </h2>
          <p className="text-blue-100 text-lg md:text-xl mb-10 max-w-2xl mx-auto font-medium">
            {language === "tr"
              ? "Teknik bilgi veya kurulum deneyimi gerekmez. 14 gün ücretsiz deneyin ve kendi işletme vitrininizi hemen oluşturun."
              : "No technical skills required. Try free for 14 days, start taking bookings immediately."}
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 max-w-xl mx-auto">
            <Link
              to="/pricing"
              className="inline-block w-full sm:w-1/2 bg-white text-blue-600 px-8 py-4 rounded-xl font-bold shadow-xl hover:bg-gray-50 transition transform hover:-translate-y-1 text-center text-lg"
            >
              {language === "tr"
                ? "14 Gün Ücretsiz Başla"
                : "Start 14-Day Free Trial"}
            </Link>
            <Link
              to="/pricing"
              className="inline-block w-full sm:w-1/2 bg-blue-700/80 backdrop-blur-sm border border-blue-400/50 text-white px-8 py-4 rounded-xl font-bold shadow-lg hover:bg-blue-800 transition transform hover:-translate-y-1 text-center text-lg"
            >
              {language === "tr" ? "Paketi Seç" : "Choose a Plan"}
            </Link>
          </div>
          <p className="mt-8 text-blue-200 text-sm opacity-90 max-w-lg mx-auto text-center">
            {language === "tr"
              ? "14 gün boyunca ödeme alınmaz; denemeyi başlatmak için güvenli kart doğrulaması gerekir."
              : "14 days free trial; secure card verification required to start."}
          </p>
        </div>
      </section>

      {/* Expanded Features CTA */}
      <section className="px-4 py-8 max-w-6xl mx-auto text-center border-t border-slate-200 dark:border-slate-800">
        <p className="text-slate-600 dark:text-slate-400 mb-4 font-medium">
          {language === "tr" ? "Platformun sunduğu 40'tan fazla modülü merak ediyor musunuz?" : "Curious about the 40+ modules our platform offers?"}
        </p>
        <Link to="/features" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold transition-colors">
          {language === "tr" ? "Tüm Özellikleri İncele →" : "View All Features →"}
        </Link>
      </section>
    </div>
  );
};

export default MarketingHomePage;
