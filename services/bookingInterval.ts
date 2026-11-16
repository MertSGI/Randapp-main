import { Service } from '../types';

export class BookingIntervalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingIntervalDataError';
  }
}

export const parseBookingTimeMinutes = (value: string): number => {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) {
    throw new BookingIntervalDataError('invalid_booking_time');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new BookingIntervalDataError('invalid_booking_time');
  }

  return (hours * 60) + minutes + (seconds / 60);
};

export const requireServiceDurationMinutes = (
  service: Pick<Service, 'duration'> | null | undefined,
): number => {
  const duration = service?.duration;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration <= 0) {
    throw new BookingIntervalDataError('unresolved_or_invalid_service_duration');
  }

  return duration;
};

export const bookingIntervalsOverlap = (
  incomingStart: number,
  incomingDuration: number,
  existingStart: number,
  existingDuration: number,
): boolean => (
  incomingStart < existingStart + existingDuration &&
  incomingStart + incomingDuration > existingStart
);
