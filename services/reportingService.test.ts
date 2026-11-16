import assert from 'node:assert/strict';
import {
  ESTIMATED_REVENUE_LIMITATION,
  reportingService,
} from './reportingService.ts';
import type { Appointment, Service } from '../types.ts';

export function runReportingServiceTests(): void {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(Math.min(28, now.getDate())).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const services: Service[] = [
    {
      id: 'srv-1',
      tenantId: 't-1',
      name: 'Haircut',
      name_tr: 'Saç Kesimi',
      duration: 45,
      price: 500,
      active: true,
    },
    {
      id: 'srv-2',
      tenantId: 't-1',
      name: 'Blowdry',
      name_tr: 'Fön',
      duration: 30,
      price: 250,
      active: true,
    },
  ];

  const appointments: Appointment[] = [
    {
      id: 'apt-1',
      tenantId: 't-1',
      user_name: 'Ayşe',
      user_email: 'ayse@example.test',
      phone: '+905551112233',
      serviceId: 'srv-1',
      staffId: 'st-1',
      date: todayStr,
      time: '10:00',
      durationMinutes: 45,
      status: 'confirmed',
      createdAt: now.toISOString(),
      syncedToGoogle: false,
      source: 'web',
    },
    {
      id: 'apt-2',
      tenantId: 't-1',
      user_name: 'Fatma',
      user_email: 'fatma@example.test',
      phone: '+905551112244',
      serviceId: 'srv-2',
      staffId: 'st-1',
      date: todayStr,
      time: '11:00',
      status: 'completed',
      createdAt: now.toISOString(),
      syncedToGoogle: false,
      source: 'web',
    },
    {
      id: 'apt-3',
      tenantId: 't-1',
      user_name: 'Zeynep',
      user_email: 'zeynep@example.test',
      phone: '+905551112255',
      serviceId: 'srv-1',
      staffId: 'st-1',
      date: todayStr,
      time: '12:00',
      status: 'cancelled_by_customer',
      createdAt: now.toISOString(),
      syncedToGoogle: false,
    },
  ];

  const metrics = reportingService.getReportMetrics(appointments, services, 'this_month');

  assert.equal(metrics.totalAppointments, 3);
  assert.equal(metrics.completedAppointments, 2);
  assert.equal(metrics.canceledAppointments, 1);
  assert.equal(metrics.estimatedRevenue, 750);
  assert.equal(metrics.averageAppointmentValue, 375);
  assert.equal(metrics.occupiedMinutes, 75); // 45 + 30 (falls back to service.duration)
  assert.equal(metrics.financialMetricClassification, 'ESTIMATED_REVENUE');
  assert.equal(metrics.financialMetricLimitation, ESTIMATED_REVENUE_LIMITATION);
  assert.equal(metrics.attributionStatus.acquisitionSourceStatus, 'NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH');
  assert.equal(metrics.attributionStatus.campaignAttributionStatus, 'NOT_AVAILABLE_IN_CURRENT_SOURCE_TRUTH');
  assert.equal(metrics.mostBookedService, 'Haircut');
  assert.equal(metrics.topRevenueService, 'Haircut');
  assert.deepEqual(metrics.sourceBreakdown, { web: 2 });
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('reportingService.test.ts');

if (isDirectExecution) {
  runReportingServiceTests();
  console.log('[PASS] reportingService.test.ts');
}
