import assert from 'node:assert/strict';

class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  clear() {
    this.#items.clear();
  }

  getItem(key) {
    return this.#items.has(String(key)) ? this.#items.get(String(key)) : null;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key) {
    this.#items.delete(String(key));
  }

  setItem(key, value) {
    this.#items.set(String(key), String(value));
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = { location: { hash: '', pathname: '' } };

await import('../services/appointmentService.ts');
const { LocalBookingRepository } = await import('../services/repositories/localBookingRepository.ts');

const repository = new LocalBookingRepository();
const date = '2026-11-03';

const service = (id, duration, tenantId = 'tenant-a') => ({
  id,
  tenantId,
  name: id,
  name_tr: id,
  duration,
  price: 100,
  active: true,
});

const appointment = ({
  serviceId = 'service-60',
  staffId = 'staff-1',
  time = '10:00',
  status = 'confirmed',
} = {}) => ({
  user_name: 'Interval Test',
  user_email: 'interval@example.test',
  phone: '+900000000000',
  serviceId,
  staffId,
  date,
  time,
  status,
  syncedToGoogle: false,
});

const seedTenant = ({ tenantId = 'tenant-a', services, appointments = [] }) => {
  localStorage.setItem(`lari:${tenantId}:services`, JSON.stringify(services));
  localStorage.setItem(`lari:${tenantId}:is_seeded_services`, 'true');
  localStorage.setItem(
    `lari:${tenantId}:appointments`,
    JSON.stringify(appointments.map((entry, index) => ({
      ...entry,
      id: entry.id ?? `existing-${index}`,
      tenantId,
      createdAt: entry.createdAt ?? '2026-10-16T00:00:00.000Z',
    }))),
  );
};

const reset = () => localStorage.clear();

const expectRejected = async (operation, expectedName, label) => {
  await assert.rejects(operation, (error) => {
    assert.equal(error?.name, expectedName, `${label}: unexpected error type`);
    return true;
  }, label);
};

if (process.argv.includes('--reproduce-base')) {
  seedTenant({
    services: [service('service-60', 60), service('service-30', 30)],
    appointments: [appointment({ serviceId: 'service-60', time: '10:00' })],
  });

  const created = await repository.createAppointment(
    'tenant-a',
    appointment({ serviceId: 'service-30', time: '10:30' }),
  );

  assert.equal(created.time, '10:30');
  console.log('BASE_DEFECT_REPRODUCED: overlapping 10:30-11:00 booking was persisted beside 10:00-11:00.');
  process.exit(0);
}

reset();
seedTenant({
  services: [service('service-60', 60), service('service-30', 30)],
  appointments: [appointment({ serviceId: 'service-60', time: '10:00' })],
});
await expectRejected(
  () => repository.createAppointment('tenant-a', appointment({ serviceId: 'service-30', time: '10:00' })),
  'BookingSlotConflictError',
  'same-start booking must be rejected',
);
await expectRejected(
  () => repository.createAppointment('tenant-a', appointment({ serviceId: 'service-30', time: '10:30' })),
  'BookingSlotConflictError',
  'different-start overlapping booking must be rejected',
);

reset();
seedTenant({
  services: [service('service-60', 60), service('service-30', 30)],
  appointments: [appointment({ serviceId: 'service-60', time: '10:00' })],
});
assert.equal(
  (await repository.createAppointment('tenant-a', appointment({ serviceId: 'service-30', time: '11:00' }))).time,
  '11:00',
  'adjacent booking must be accepted',
);

reset();
seedTenant({
  services: [service('service-60', 60), service('service-30', 30)],
  appointments: [appointment({ serviceId: 'service-60', time: '10:00', staffId: 'staff-1' })],
});
assert.equal(
  (await repository.createAppointment('tenant-a', appointment({ serviceId: 'service-30', time: '10:30', staffId: 'staff-2' }))).staffId,
  'staff-2',
  'different staff must not conflict',
);

reset();
seedTenant({
  tenantId: 'tenant-a',
  services: [service('service-60', 60, 'tenant-a')],
  appointments: [appointment({ serviceId: 'service-60', time: '10:00' })],
});
seedTenant({
  tenantId: 'tenant-b',
  services: [service('service-30', 30, 'tenant-b')],
});
assert.equal(
  (await repository.createAppointment('tenant-b', appointment({ serviceId: 'service-30', time: '10:30' }))).tenantId,
  'tenant-b',
  'different tenant must remain isolated',
);

reset();
seedTenant({
  services: [service('service-60', 60), service('service-30', 30)],
  appointments: [appointment({ serviceId: 'service-60', time: '10:00', status: 'cancelled_by_customer' })],
});
assert.equal(
  (await repository.createAppointment('tenant-a', appointment({ serviceId: 'service-30', time: '10:30' }))).time,
  '10:30',
  'cancelled appointment interval must be reusable',
);

for (const malformedCase of [
  {
    label: 'malformed incoming time',
    services: [service('service-30', 30)],
    appointments: [],
    input: appointment({ serviceId: 'service-30', time: 'not-a-time' }),
  },
  {
    label: 'invalid incoming service duration',
    services: [service('service-invalid', 0)],
    appointments: [],
    input: appointment({ serviceId: 'service-invalid', time: '10:00' }),
  },
  {
    label: 'unresolved incoming service',
    services: [service('service-30', 30)],
    appointments: [],
    input: appointment({ serviceId: 'service-missing', time: '10:00' }),
  },
  {
    label: 'malformed existing time',
    services: [service('service-60', 60), service('service-30', 30)],
    appointments: [appointment({ serviceId: 'service-60', time: 'bad-time' })],
    input: appointment({ serviceId: 'service-30', time: '10:00' }),
  },
  {
    label: 'unresolved existing service',
    services: [service('service-30', 30)],
    appointments: [appointment({ serviceId: 'service-missing', time: '10:00' })],
    input: appointment({ serviceId: 'service-30', time: '10:15' }),
  },
]) {
  reset();
  seedTenant({ services: malformedCase.services, appointments: malformedCase.appointments });
  await expectRejected(
    () => repository.createAppointment('tenant-a', malformedCase.input),
    'BookingIntervalDataError',
    `${malformedCase.label} must fail closed`,
  );
}

console.log('LOCAL_BOOKING_INTERVAL_INTEGRITY_PASS');
