import assert from 'node:assert/strict';
import {
  BookingIntervalDataError,
  bookingIntervalsOverlap,
  parseBookingTimeMinutes,
  requireServiceDurationMinutes,
} from './bookingInterval.ts';

export function runBookingIntervalTests(): void {
  // 1. Valid time parsing (HH:mm and HH:mm:ss)
  assert.equal(parseBookingTimeMinutes('00:00'), 0);
  assert.equal(parseBookingTimeMinutes('09:30'), 570);
  assert.equal(parseBookingTimeMinutes('23:59'), 1439);
  assert.equal(parseBookingTimeMinutes('10:15:30'), 615.5);

  // 2. Malformed time inputs fail closed with BookingIntervalDataError
  for (const invalidTime of ['', '9:30', '24:00', '12:60', '12:00:60', 'invalid']) {
    assert.throws(
      () => parseBookingTimeMinutes(invalidTime),
      (err: unknown) => err instanceof BookingIntervalDataError && err.message === 'invalid_booking_time',
      `Expected invalid time '${invalidTime}' to throw BookingIntervalDataError`
    );
  }

  // 3. Service duration validation
  assert.equal(requireServiceDurationMinutes({ duration: 45 }), 45);
  for (const invalidService of [null, undefined, { duration: 0 }, { duration: -15 }, { duration: 30.5 }]) {
    assert.throws(
      () => requireServiceDurationMinutes(invalidService as any),
      (err: unknown) =>
        err instanceof BookingIntervalDataError &&
        err.message === 'unresolved_or_invalid_service_duration',
      'Expected invalid service duration to throw BookingIntervalDataError'
    );
  }

  // 4. Interval overlap matrix (inclusive conflict, exclusive boundary)
  // 10:00-11:00 vs 10:30-11:00 -> overlap
  assert.equal(bookingIntervalsOverlap(630, 30, 600, 60), true);
  // 10:00-11:00 vs 11:00-11:30 -> adjacent, no overlap
  assert.equal(bookingIntervalsOverlap(660, 30, 600, 60), false);
  // 10:00-10:30 vs 09:30-10:00 -> adjacent before, no overlap
  assert.equal(bookingIntervalsOverlap(600, 30, 570, 30), false);
  // Contained inside existing
  assert.equal(bookingIntervalsOverlap(615, 15, 600, 60), true);
  // Enclosing existing
  assert.equal(bookingIntervalsOverlap(585, 90, 600, 30), true);
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('bookingInterval.test.ts');

if (isDirectExecution) {
  runBookingIntervalTests();
  console.log('[PASS] bookingInterval.test.ts');
}
