import { Appointment } from '../types';

/**
 * EMAIL NOTIFICATION SERVICE
 * Real provider integration must be executed server-side via verified gateway.
 * In client/no-provider mode, resolves false without fake success or PII leakage.
 */
export const sendBookingEmail = async (
  _appointment: Appointment,
  _serviceName: string,
  _confirmationDetails: { subject: string, body: string }
): Promise<boolean> => {
  console.warn("ğŸ”” [Notification] Email provider not configured: message not dispatched");
  return Promise.resolve(false);
};

/**
 * SMS NOTIFICATION SERVICE
 * Real provider integration must be executed server-side via verified gateway.
 * In client/no-provider mode, resolves false without fake success or PII leakage.
 */
export const sendBookingSms = async (
  _appointment: Appointment,
  _serviceName: string
): Promise<boolean> => {
  console.warn("ğŸ”” [Notification] SMS provider not configured: message not dispatched");
  return Promise.resolve(false);
};

/**
 * WHATSAPP NOTIFICATION SERVICE
 * Real provider integration must be executed server-side via verified gateway.
 * In client/no-provider mode, resolves false without fake success or PII leakage.
 */
export const sendAutomatedWhatsApp = async (
  _appointment: Appointment,
  _messageText: string
): Promise<boolean> => {
  console.warn("ğŸ”” [Notification] WhatsApp provider not configured: message not dispatched");
  return Promise.resolve(false);
};

/**
 * GUEST REFERRAL NOTIFICATIONS
 * Non-sending operational event diagnostics without customer PII leakage.
 */
export const notifyReferralBooked = async (
  _referrerName: string,
  _refereeName: string,
  _campaignName: string
): Promise<void> => {
  console.log("ğŸ”” [Notification Event] Referral booking recorded (pending appointment completion)");
};

export const notifyReferralCompleted = async (
  _referrerName: string,
  _refereeName: string,
  _rewardDesc: string
): Promise<void> => {
  console.log("ğŸ”” [Notification Event] Referral completed (reward qualification recorded)");
};

export const notifyReferralRewarded = async (
  _referrerName: string,
  _rewardDesc: string
): Promise<void> => {
  console.log("ğŸ”” [Notification Event] Referral reward granted");
};

export const notifyCustomerRewardAvailable = async (
  _customerId: string,
  _rewardDesc: string
): Promise<void> => {
  console.log("ğŸ”” [Notification Event] Customer reward available");
};

export const notifyCustomerRewardUsed = async (
  _customerId: string,
  _rewardDesc: string
): Promise<void> => {
  console.log("ğŸ”” [Notification Event] Customer reward redeemed");
};

export const notifyCustomerRewardExpiring = async (
  _customerId: string,
  _rewardDesc: string
): Promise<void> => {
  console.log("ğŸ”” [Notification Event] Customer reward expiration reminder registered");
};
