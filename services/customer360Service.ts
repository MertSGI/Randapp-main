/**
 * Phase 3 Customer 360 and Segmentation Service
 * Authority: LARI-AOS-PROGRAM-V2-CONTINUATION-AND-LIVE-RELAY-R1-20260911-01
 * Program: LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
 *
 * Rules:
 * 1. Reuses canonical customers and customer_memory models.
 * 2. No customers_v2 or parallel customer truth.
 * 3. Uses sanitized RPCs (get_customer_360_view, list_tenant_customer_segments, etc.)
 */

export interface Customer360Metrics {
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  firstVisitDate: string | null;
  lastVisitDate: string | null;
}

export interface CustomerSegmentSummary {
  segmentId: string;
  name: string;
  segmentType: 'manual' | 'dynamic_rule' | 'system';
  assignedAt: string;
}

export interface Customer360Memory {
  preferences: Record<string, any>;
  notes: string | null;
  photos: Array<{ id: string; url: string; caption?: string; createdAt?: string }>;
  consentFlags: Record<string, boolean>;
  updatedAt: string | null;
}

export interface CustomerRecentAppointment {
  id: string;
  date: string;
  time: string;
  status: string;
  serviceId: string;
  staffId: string;
  createdAt: string;
}

export interface Customer360View {
  customerId: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  metrics: Customer360Metrics;
  segments: CustomerSegmentSummary[];
  memory: Customer360Memory;
  recentAppointments: CustomerRecentAppointment[];
}

export interface CustomerSegment {
  id: string;
  name: string;
  description: string | null;
  segmentType: 'manual' | 'dynamic_rule' | 'system';
  criteria: Record<string, any>;
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ICustomer360Service {
  getCustomer360View(tenantId: string, customerId: string): Promise<Customer360View | null>;
  listSegments(tenantId: string): Promise<CustomerSegment[]>;
  assignCustomerToSegment(tenantId: string, segmentId: string, customerId: string, assignedBy?: string): Promise<boolean>;
  removeCustomerFromSegment(tenantId: string, segmentId: string, customerId: string): Promise<boolean>;
}

export class Customer360Service implements ICustomer360Service {
  constructor(private readonly fetchRpc: (rpcName: string, body: Record<string, any>) => Promise<any>) {}

  async getCustomer360View(tenantId: string, customerId: string): Promise<Customer360View | null> {
    if (!tenantId || !customerId) {
      throw new Error('MISSING_REQUIRED_PARAMS: tenantId and customerId are required');
    }

    const data = await this.fetchRpc('get_customer_360_view', {
      p_tenant_id: tenantId,
      p_customer_id: customerId,
    });

    if (!data) return null;

    return {
      customerId: data.customer_id,
      tenantId: data.tenant_id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      metrics: {
        totalAppointments: data.metrics?.total_appointments ?? 0,
        completedAppointments: data.metrics?.completed_appointments ?? 0,
        cancelledAppointments: data.metrics?.cancelled_appointments ?? 0,
        noShowAppointments: data.metrics?.no_show_appointments ?? 0,
        firstVisitDate: data.metrics?.first_visit_date ?? null,
        lastVisitDate: data.metrics?.last_visit_date ?? null,
      },
      segments: (data.segments || []).map((s: any) => ({
        segmentId: s.segment_id,
        name: s.name,
        segmentType: s.segment_type,
        assignedAt: s.assigned_at,
      })),
      memory: {
        preferences: data.memory?.preferences ?? {},
        notes: data.memory?.notes ?? null,
        photos: data.memory?.photos ?? [],
        consentFlags: data.memory?.consent_flags ?? {},
        updatedAt: data.memory?.updated_at ?? null,
      },
      recentAppointments: (data.recent_appointments || []).map((a: any) => ({
        id: a.id,
        date: a.date,
        time: a.time,
        status: a.status,
        serviceId: a.service_id,
        staffId: a.staff_id,
        createdAt: a.created_at,
      })),
    };
  }

  async listSegments(tenantId: string): Promise<CustomerSegment[]> {
    if (!tenantId) {
      throw new Error('MISSING_REQUIRED_PARAMS: tenantId is required');
    }

    const rows = await this.fetchRpc('list_tenant_customer_segments', {
      p_tenant_id: tenantId,
    });

    return (rows || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      segmentType: r.segment_type,
      criteria: r.criteria ?? {},
      isActive: r.is_active,
      memberCount: Number(r.member_count ?? 0),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async assignCustomerToSegment(tenantId: string, segmentId: string, customerId: string, assignedBy = 'admin'): Promise<boolean> {
    if (!tenantId || !segmentId || !customerId) {
      throw new Error('MISSING_REQUIRED_PARAMS: tenantId, segmentId, and customerId are required');
    }

    return await this.fetchRpc('assign_customer_to_segment', {
      p_tenant_id: tenantId,
      p_segment_id: segmentId,
      p_customer_id: customerId,
      p_assigned_by: assignedBy,
    });
  }

  async removeCustomerFromSegment(tenantId: string, segmentId: string, customerId: string): Promise<boolean> {
    if (!tenantId || !segmentId || !customerId) {
      throw new Error('MISSING_REQUIRED_PARAMS: tenantId, segmentId, and customerId are required');
    }

    return await this.fetchRpc('remove_customer_from_segment', {
      p_tenant_id: tenantId,
      p_segment_id: segmentId,
      p_customer_id: customerId,
    });
  }
}
