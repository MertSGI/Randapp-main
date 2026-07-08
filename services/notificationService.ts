import { Appointment, Service } from '../types';

/**
 * MOCK EMAIL SERVICE
 * In a real application, this would call your backend API (e.g., Python/FastAPI)
 * which would then use SMTP, SendGrid, or AWS SES.
 */
export const sendBookingEmail = async (appointment: Appointment, serviceName: string, confirmationDetails: { subject: string, body: string }): Promise<boolean> => {
  console.group("📧 Sending Email...");
  console.log(`To: ${appointment.user_email}`);
  console.log(`Subject: ${confirmationDetails.subject}`);
  console.log(`Body: ${confirmationDetails.body}`);
  console.groupEnd();
  
  // Simulate API Network Delay
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("✅ Email sent successfully via 'MockSMTP'");
      resolve(true);
    }, 800);
  });
};

/**
 * MOCK SMS SERVICE
 * In a real application, this would call your backend API
 * which would then use Twilio, SNS, or another SMS gateway.
 */
export const sendBookingSms = async (appointment: Appointment, serviceName: string): Promise<boolean> => {
  const message = `RadApp: Hello ${appointment.user_name}, your ${serviceName} appointment on ${appointment.date} at ${appointment.time} is confirmed.`;
  
  console.group("📱 Sending SMS...");
  console.log(`To: ${appointment.phone || 'No phone provided'}`);
  console.log(`Message: ${message}`);
  console.groupEnd();

  if (!appointment.phone) return Promise.resolve(false);

  // Simulate API Network Delay
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("✅ SMS sent successfully via 'MockTwilio'");
      resolve(true);
    }, 800);
  });
};

/**
 * MOCK AUTOMATED WHATSAPP BACKEND SERVICE
 * In a real application, this would call your backed API (e.g., Python/Node)
 * to send a WhatsApp message silently via the WhatsApp Business API.
 */
export const sendAutomatedWhatsApp = async (
  appointment: Appointment,
  messageText: string
): Promise<boolean> => {
  console.group("📲 Sending Automated WhatsApp...");
  console.log(`To: ${appointment.phone || 'No phone provided'}`);
  console.log(`Message: \n${messageText}`);
  console.groupEnd();
  
  if (!appointment.phone) return Promise.resolve(false);

  // Simulate API Network Delay
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("✅ Auto WhatsApp sent successfully via 'MockWhatsAppAPI'");
      resolve(true);
    }, 1200);
  });
};


/**
 * NON-SENDING GUEST REFERRAL NOTIFICATIONS
 * Mock notification hooks for when a customer makes a referral, the friend books, and rewards are granted.
 */
export const notifyReferralBooked = async (referrerName: string, refereeName: string, campaignName: string): Promise<void> => {
  console.group("🔔 [Notification Event] Müşteri Referans Kaydı Oluştu");
  console.log(`Öneren: ${referrerName}`);
  console.log(`Davet Edilen Arkadaş: ${refereeName}`);
  console.log(`Kampanya: ${campaignName}`);
  console.log(`Durum: Randevu Alındı (Bekliyor)`);
  console.log(`Eylem: Randevu tamamlandığında her iki tarafa ödül tanımlanacaktır.`);
  console.groupEnd();
};

export const notifyReferralCompleted = async (referrerName: string, refereeName: string, rewardDesc: string): Promise<void> => {
  console.group("🔔 [Notification Event] Müşteri Referansı Tamamlandı!");
  console.log(`Öneren: ${referrerName}`);
  console.log(`Davet Edilen Arkadaş: ${refereeName}`);
  console.log(`Ödül Hak Edişi: ${rewardDesc}`);
  console.log(`Eylem: İşletme sahibine hak edilen ödül bildirimi ve SMS taslağı hazırlandı.`);
  console.groupEnd();
};

export const notifyReferralRewarded = async (referrerName: string, rewardDesc: string): Promise<void> => {
  console.group("🔔 [Notification Event] Referans Ödülü Teslim Edildi");
  console.log(`Müşteri: ${referrerName}`);
  console.log(`Teslim Edilen Ödül: ${rewardDesc}`);
  console.log(`SMS Taslağı: "Sayın ${referrerName}, davet ettiğiniz arkadaşınız randevusunu tamamladı! Kazandığınız '${rewardDesc}' hesabınıza tanımlandı."`);
  console.groupEnd();
};

export const notifyCustomerRewardAvailable = async (customerId: string, rewardDesc: string): Promise<void> => {
  console.group("🔔 [Notification Event] Müşteri Kampanya Ödülü Tanımlandı");
  console.log(`Müşteri: ${customerId}`);
  console.log(`Kazanılan Ödül: ${rewardDesc}`);
  console.log(`Durum: Kullanıma Hazır (Available)`);
  console.log(`Eylem: Randevu sırasında hak edilen indirim uygulanabilir.`);
  console.groupEnd();
};

export const notifyCustomerRewardUsed = async (customerId: string, rewardDesc: string): Promise<void> => {
  console.group("🔔 [Notification Event] Müşteri Kampanya Ödülü Kullanıldı");
  console.log(`Müşteri: ${customerId}`);
  console.log(`Kullanılan Ödül: ${rewardDesc}`);
  console.log(`Durum: Kullanıldı (Used)`);
  console.log(`Eylem: Ödül başarıyla işlem tescili aldı.`);
  console.groupEnd();
};

export const notifyCustomerRewardExpiring = async (customerId: string, rewardDesc: string): Promise<void> => {
  console.group("🔔 [Notification Event] Müşteri Kampanya Ödülü Süresi Doluyor");
  console.log(`Müşteri: ${customerId}`);
  console.log(`Yaklaşan Kayıp: ${rewardDesc}`);
  console.log(`Durum: Süresi Yakın (Expiring)`);
  console.log(`Eylem: Müşteriye son kullanma tarihi hatırlatma SMS taslağı tetiklendi.`);
  console.groupEnd();
};

