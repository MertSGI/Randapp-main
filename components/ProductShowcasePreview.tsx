import React from "react";
import { useLanguage } from "../contexts/LanguageContext";

export const ProductShowcasePreview: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  const { language } = useLanguage();

  return (
    <div className={`relative w-full max-w-lg mx-auto ${className}`}>
      {/* 
        Container with perspective and responsive scaling. 
        On mobile, it shows a stacked centered view. 
        On desktop, we can use absolute positioning to create a clustered floating look.
      */}
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-[32px] md:rounded-[40px] p-3.5 md:p-6 border-[6px] md:border-8 border-slate-200/60 dark:border-slate-800 shadow-2xl relative overflow-hidden ring-1 ring-slate-900/5 dark:ring-white/10 flex flex-col gap-3 md:gap-4 md:block md:min-h-[480px]">
        {/* Browser Notch / Top Bar (Mobile only or shared) */}
        <div className="md:hidden h-1.5 w-14 bg-slate-300 dark:bg-slate-700/80 rounded-full mx-auto mb-4"></div>
        {/* Browser Top Bar (Desktop only) */}
        <div className="hidden md:flex items-center gap-1.5 mb-4 px-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          <div className="ml-2 h-4 w-32 bg-slate-200 dark:bg-slate-700/50 rounded flex-1"></div>
        </div>

        {/* Mini business website card */}
        <div className="md:absolute md:top-14 md:left-6 md:w-64 bg-white dark:bg-slate-800 rounded-2xl p-3 md:p-4 shadow-sm border border-slate-100 dark:border-slate-700 flex flex-row md:flex-col items-center md:items-start gap-3 md:gap-4 z-10 transition-transform hover:scale-[1.02]">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-violet-100 to-blue-50 dark:from-violet-900/40 dark:to-blue-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400 font-extrabold shadow-inner text-sm md:text-base border border-violet-100 dark:border-violet-800/50 shrink-0">
            ✦
          </div>
          <div className="flex-1 text-left w-full">
            <div className="h-3 md:h-4 w-24 md:w-32 bg-slate-800 dark:bg-slate-200 rounded-full mb-2"></div>
            <div className="flex gap-1.5 flex-wrap">
              <div className="h-1.5 md:h-2 w-1.5 md:w-2 rounded-full bg-violet-400 dark:bg-violet-500"></div>
              <div className="h-1.5 md:h-2 w-1.5 md:w-2 rounded-full bg-violet-400 dark:bg-violet-500"></div>
              <div className="h-1.5 md:h-2 w-1.5 md:w-2 rounded-full bg-violet-400 dark:bg-violet-500"></div>
              <div className="h-1.5 md:h-2 w-8 md:w-10 rounded-full bg-slate-200 dark:bg-slate-700 ml-1"></div>
            </div>
          </div>
          <div className="hidden md:block w-full">
            <div className="h-20 bg-slate-100 dark:bg-slate-700/30 rounded-xl mb-3"></div>
            <div className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold text-center">
              {language === "tr" ? "Randevu Al" : "Book Now"}
            </div>
          </div>
        </div>

        {/* Booking card */}
        <div className="md:absolute md:top-32 md:right-4 md:w-60 bg-white dark:bg-slate-800 rounded-2xl p-3.5 md:p-4 shadow-xl border border-slate-100 dark:border-slate-700 text-left z-20 transition-transform hover:scale-[1.02]">
          <div className="text-[11px] md:text-xs font-bold text-slate-800 dark:text-slate-300 tracking-wide mb-2.5 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            {language === "tr" ? "Bugün Uygun Saatler" : "Available Today"}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="h-9 md:h-10 bg-blue-500 rounded-lg flex items-center justify-center text-[13px] md:text-sm font-bold text-white shadow-sm shadow-blue-500/20">
              14:00
            </div>
            <div className="h-9 md:h-10 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 rounded-lg flex items-center justify-center text-[13px] md:text-sm font-semibold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              15:30
            </div>
            <div className="h-9 md:h-10 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-center text-[13px] md:text-sm font-semibold text-slate-400 dark:text-slate-500">
              16:45
            </div>
          </div>
          <div className="hidden md:flex mt-3 h-8 items-center bg-slate-50 dark:bg-slate-900/50 rounded-lg px-2 border border-slate-100 dark:border-slate-700">
            <div className="w-16 h-2 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
          </div>
        </div>

        {/* AI assistant card */}
        <div className="md:absolute md:bottom-24 md:left-10 md:w-72 bg-gradient-to-r from-violet-50/80 to-indigo-50/80 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-2xl p-3 md:p-4 shadow-lg border border-violet-100/60 dark:border-violet-800/20 flex flex-row items-start gap-3 z-30 transition-transform hover:-translate-y-1">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-sm md:text-base shrink-0 border border-slate-100 dark:border-slate-700">
            ✨
          </div>
          <div className="flex-1 text-left pt-0.5">
            <div className="text-[11px] md:text-xs font-bold text-violet-800 dark:text-violet-300 mb-1.5">
              {language === "tr" ? "AI Stil Önerisi" : "AI Style Suggestion"}
            </div>
            <div className="hidden md:block text-[10px] text-violet-600/70 dark:text-violet-400/70 font-medium mb-2 leading-tight">
              {language === "tr"
                ? "Yüz şekli ve stile dayalı asistan analizi"
                : "Assistant analysis based on face shape and style"}
            </div>
            <div className="space-y-1.5">
              <div className="h-1.5 md:h-2 w-full bg-violet-200/80 dark:bg-violet-800/40 rounded-full"></div>
              <div className="h-1.5 md:h-2 w-2/3 bg-violet-200/80 dark:bg-violet-800/40 rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Owner panel chip */}
        <div className="md:absolute md:bottom-6 md:right-6 md:w-64 bg-slate-900 dark:bg-slate-950 rounded-[18px] md:rounded-2xl p-3 md:p-4 flex items-center gap-3 shadow-xl shadow-slate-900/10 border border-slate-800 relative overflow-hidden z-40 transition-transform hover:-translate-y-1">
          <div className="absolute right-0 top-0 w-16 h-16 md:w-20 md:h-20 bg-blue-500/10 blur-xl rounded-full"></div>
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center text-lg md:text-xl border border-green-500/20 shadow-inner">
            👤
          </div>
          <div className="flex-1 text-left relative z-10">
            <div className="text-[10px] md:text-[11px] text-slate-400 font-medium tracking-wide mb-1 uppercase">
              {language === "tr" ? "Lari Panel" : "Lari Admin"}
            </div>
            <div className="text-[13px] md:text-sm font-bold text-white flex items-center justify-between">
              {language === "tr" ? "Bugünkü randevular" : "Today's bookings"}
              <span className="bg-blue-600 text-white text-[10px] md:text-xs px-2 py-0.5 rounded-full font-bold">
                4
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
