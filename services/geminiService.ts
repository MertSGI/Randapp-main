import { Appointment } from '../types';

const isMockMode = (import.meta as any).env.VITE_DATA_MODE === 'mock' || (import.meta as any).env.VITE_AI_MODE === 'mock';

export const generateBookingConfirmation = async (
  appointment: Appointment,
  serviceName: string,
  language: 'en' | 'tr' = 'en'
): Promise<{ subject: string; body: string } | null> => {
  return null; // AI disabled on frontend for Phase 2
};

export const analyzeSchedule = async (appointments: Appointment[], language: 'en' | 'tr' = 'en'): Promise<string> => {
  return language === 'tr' ? "Yapay Zeka Analizi sadece Edge Function (Supabase) mimarisinde çalışacak şekilde revize edildi. Henüz frontend tarafında aktif değil." : "AI Analysis has been moved to Supabase Edge Functions roadmap and is not active on the frontend.";
}

export const generateFullConsultation = async (
    promptText: string,
    base64Image?: string,
    language: 'en' | 'tr' = 'en'
): Promise<{ text: string, image: string | null } | null> => {
    return new Promise(resolve => setTimeout(() => resolve({
        text: language === 'tr' 
        ? `**Saç Analizi & Tavsiye:**\nHarika bir seçim! Yüklediğiniz fotoğrafa ve isteğinize göre size saçlarınızı canlandıracak bir stil öneriyoruz.\n\n**Önerilen Hizmetler:**\n- Saç Kesimi\n- Renklendirme\n- Saç Bakım Kürleri\n\n*Not: Bu bir önizleme (mock) yapay zeka önerisidir, uzmanımızla salonumuzda yapacağınız yüz yüze görüşme esastır.*` 
        : `**Hair Analysis & Recommendation:**\nGreat choice! Based on your photo and request, we recommend a style that brings life to your hair.\n\n**Recommended Services:**\n- Haircut\n- Coloring\n- Hair Treatment\n\n*Note: This is a mock AI recommendation. An in-person consultation with our stylist is recommended.*`,
        image: base64Image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=512&q=80'
    }), 1500));
};