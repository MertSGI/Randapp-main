import { Appointment, Service } from '../types';

/**
 * Generate a Google Calendar Web Intent URL.
 * This allows the user to click a link and immediately add it to their calendar
 * without requiring backend OAuth (Client-side solution).
 */
export const generateGoogleCalendarLink = (appointment: Appointment, service: Service, staff: {name: string} | null = null, language: string = 'en'): string => {
  const startTime = new Date(`${appointment.date}T${appointment.time}`);
  const endTime = new Date(startTime.getTime() + service.duration * 60000);

  const formatTime = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, "");

  const serviceName = language === 'tr' ? service.name_tr : service.name;
  
  const title = language === 'tr' 
    ? `Randevu: ${serviceName} - MA Yılmaz Hair Design (Uzman: ${staff?.name || 'Bilinmiyor'})`
    : `Appointment: ${serviceName} at MA Yılmaz Hair Design (Staff: ${staff?.name || 'Unknown'})`;
  
  const details = language === 'tr'
    ? `Hizmet: ${serviceName}\nUzman: ${staff?.name || ''}\nMüşteri: ${appointment.user_name}\nNot: MA Yılmaz Hair Design üzerinden rezerve edildi.`
    : `Service: ${serviceName}\nStaff: ${staff?.name || ''}\nCustomer: ${appointment.user_name}\nNote: Booked via MA Yılmaz Hair Design`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: details,
    location: 'Mustafa Ali Yılmaz Hair Design',
    dates: `${formatTime(startTime)}/${formatTime(endTime)}`
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

/**
 * MOCK BACKEND CALENDAR SYNC
 * In a real app, this sends data to your Python backend, which uses a Service Account
 * to add the event to the Business's Master Calendar.
 */
export const syncToBusinessCalendar = async (appointment: Appointment, staff: {name: string, id: string, calendarEmail?: string}): Promise<boolean> => {
    console.group(`📅 Syncing to ${staff.name}'s Business Google Calendar...`);
    const calendarId = staff.calendarEmail || `${staff.id}@calendar.google.com`;
    console.log(`Adding event for ${appointment.date} at ${appointment.time} to calendar ID: ${calendarId}`);
    console.groupEnd();

    // Simulate API Call
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`✅ Synced to ${calendarId} successfully.`);
            resolve(true);
        }, 1500);
    });
}