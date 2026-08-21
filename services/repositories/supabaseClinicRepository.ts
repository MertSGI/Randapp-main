import {
  ClinicStaffContext,
  ClinicStaffProfileWriteResult,
  ClinicPatientHistoryProfile,
  ClinicEncounterStartResult,
  ClinicEncounterNoteWriteResult,
  ClinicEncounterCompletionResult,
  ClinicPatientHistory,
  ClinicOperationalDay,
  ClinicOperationalAppointment,
  ClinicEncounter,
  ClinicEncounterNote,
  ClinicServiceResult,
  ClinicServiceErrorCode,
  NoteStatus,
  EncounterStatus,
  PractitionerType
} from '../../types/clinic';
import { fetchSupabase } from './supabaseClient';

// =========================================================================
// Error Normalization
// =========================================================================

export function normalizeClinicError(status: number, rawText: string): { code: ClinicServiceErrorCode; message: string } {
  const messageLower = (rawText || '').toLowerCase();

  let code: ClinicServiceErrorCode = 'UNKNOWN';
  let safeMessage = 'An unexpected clinic operational error occurred.';

  if (status === 401 || messageLower.includes('unauthenticated')) {
    code = 'UNAUTHENTICATED';
    safeMessage = 'Authentication required to access clinic services.';
  } else if (messageLower.includes('appointment_not_confirmed')) {
    code = 'APPOINTMENT_NOT_CONFIRMED';
    safeMessage = 'Only confirmed appointments can be started.';
  } else if (messageLower.includes('already_exists')) {
    code = 'ALREADY_EXISTS';
    safeMessage = 'A clinic encounter already exists for this appointment.';
  } else if (messageLower.includes('invariant_violation')) {
    code = 'INVARIANT_VIOLATION';
    safeMessage = 'Operational invariant violation encountered during completion.';
  } else if (messageLower.includes('invalid_state')) {
    code = 'INVALID_STATE';
    safeMessage = 'Invalid operational state for this action.';
  } else if (messageLower.includes('tenant mismatch')) {
    code = 'TENANT_MISMATCH';
    safeMessage = 'Cross-tenant access denied.';
  } else if (status === 404 || messageLower.includes('not_found') || messageLower.includes('not found')) {
    code = 'NOT_FOUND';
    safeMessage = 'Requested clinic resource was not found.';
  } else if (status === 403 || messageLower.includes('forbidden')) {
    code = 'FORBIDDEN';
    safeMessage = 'Insufficient clinic permissions to perform this operation.';
  }

  return { code, message: safeMessage };
}

// =========================================================================
// Pure Response Mapper Functions (exported for production + test use)
// =========================================================================

export function mapClinicStaffProfileWriteResponse(data: Record<string, unknown>): ClinicStaffProfileWriteResult {
  if (!data || typeof data.staff_id !== 'string') {
    throw new Error('Malformed clinic_set_staff_profile response: missing staff_id');
  }
  return {
    staff_id: data.staff_id as string,
    tenant_id: data.tenant_id as string,
    can_manage_patient_profiles: !!data.can_manage_patient_profiles,
    can_view_clinical_records: !!data.can_view_clinical_records,
    can_write_clinical_notes: !!data.can_write_clinical_notes
  };
}

export function mapClinicEncounterStartResponse(data: Record<string, unknown>): ClinicEncounterStartResult {
  if (!data || typeof data.encounter_id !== 'string') {
    throw new Error('Malformed clinic_start_encounter response: missing encounter_id');
  }
  return {
    encounter_id: data.encounter_id as string,
    appointment_id: (data.appointment_id as string) ?? undefined,
    status: data.status as EncounterStatus,
    started_at: data.started_at as string
  };
}

export function mapClinicEncounterNoteWriteResponse(data: Record<string, unknown>): ClinicEncounterNoteWriteResult {
  if (!data || typeof data.note_id !== 'string') {
    throw new Error('Malformed clinic_save_encounter_note response: missing note_id');
  }
  return {
    note_id: data.note_id as string,
    encounter_id: data.encounter_id as string,
    version: data.version as number,
    note_status: data.note_status as NoteStatus,
    created_at: data.created_at as string
  };
}

export function mapClinicEncounterCompletionResponse(data: Record<string, unknown>): ClinicEncounterCompletionResult {
  if (!data || typeof data.encounter_id !== 'string') {
    throw new Error('Malformed clinic_complete_encounter_and_appointment response: missing encounter_id');
  }
  return {
    encounter_id: data.encounter_id as string,
    encounter_status: data.encounter_status as EncounterStatus,
    appointment_status: data.appointment_status as string,
    completed_at: data.completed_at as string
  };
}

export function mapClinicPatientHistoryResponse(data: Record<string, unknown>): ClinicPatientHistory {
  if (!data || !Array.isArray(data.encounters)) {
    throw new Error('Malformed clinic_get_patient_history response: missing encounters array');
  }
  const rawProfile = data.patient_profile as Record<string, unknown> | null;
  let patientProfile: ClinicPatientHistoryProfile | null = null;

  if (rawProfile && typeof rawProfile === 'object') {
    patientProfile = {
      id: rawProfile.id as string,
      date_of_birth: (rawProfile.date_of_birth as string | null) ?? null,
      sex_at_birth: (rawProfile.sex_at_birth as string | null) ?? null,
      emergency_contact_name: (rawProfile.emergency_contact_name as string | null) ?? null,
      emergency_contact_phone: (rawProfile.emergency_contact_phone as string | null) ?? null,
      emergency_contact_relationship: (rawProfile.emergency_contact_relationship as string | null) ?? null,
      blood_type: (rawProfile.blood_type as string | null) ?? null,
      allergies: (rawProfile.allergies as string | null) ?? null,
      chronic_conditions: (rawProfile.chronic_conditions as string | null) ?? null,
      updated_at: rawProfile.updated_at as string
    };
  }

  const encounters: ClinicEncounter[] = (data.encounters as Record<string, unknown>[]).map(e => {
    const notes: ClinicEncounterNote[] = Array.isArray(e.notes)
      ? (e.notes as Record<string, unknown>[]).map(n => ({
          id: n.id as string,
          version: n.version as number,
          author_staff_id: n.author_staff_id as string,
          subjective: (n.subjective as string | null) ?? null,
          objective: (n.objective as string | null) ?? null,
          assessment: (n.assessment as string | null) ?? null,
          plan: (n.plan as string | null) ?? null,
          note_status: n.note_status as NoteStatus,
          supersedes_note_id: (n.supersedes_note_id as string | null) ?? null,
          created_at: n.created_at as string
        }))
      : [];
    return {
      id: e.id as string,
      appointment_id: e.appointment_id as string,
      branch_id: (e.branch_id as string | null) ?? null,
      practitioner_staff_id: e.practitioner_staff_id as string,
      status: e.status as EncounterStatus,
      reason_for_visit: (e.reason_for_visit as string | null) ?? null,
      started_at: e.started_at as string,
      completed_at: (e.completed_at as string | null) ?? null,
      notes
    };
  });

  return { patient_profile: patientProfile, encounters };
}

export function mapClinicOperationalDayResponse(data: Record<string, unknown>): ClinicOperationalDay {
  if (!data || !Array.isArray(data.appointments)) {
    throw new Error('Malformed clinic_get_operational_day response: missing appointments array');
  }
  const appointments: ClinicOperationalAppointment[] = (data.appointments as Record<string, unknown>[]).map(a => ({
    appointment_id: a.appointment_id as string,
    appointment_date: a.appointment_date as string,
    appointment_time: a.appointment_time as string,
    duration_minutes: a.duration_minutes as number,
    appointment_status: a.appointment_status as string,
    branch_id: (a.branch_id as string | null) ?? null,
    branch_name: (a.branch_name as string | null) ?? null,
    staff_id: (a.staff_id as string | null) ?? null,
    staff_name: (a.staff_name as string | null) ?? null,
    practitioner_type: (a.practitioner_type as PractitionerType | null) ?? null,
    specialty: (a.specialty as string | null) ?? null,
    service_id: (a.service_id as string | null) ?? null,
    service_name: (a.service_name as string | null) ?? null,
    customer_id: (a.customer_id as string | null) ?? null,
    customer_name: (a.customer_name as string | null) ?? null,
    customer_phone: (a.customer_phone as string | null) ?? null,
    encounter_id: (a.encounter_id as string | null) ?? null,
    encounter_status: (a.encounter_status as EncounterStatus | null) ?? null,
    encounter_started_at: (a.encounter_started_at as string | null) ?? null,
    encounter_completed_at: (a.encounter_completed_at as string | null) ?? null
  }));
  return {
    date: data.date as string,
    branch_id: (data.branch_id as string | null) ?? null,
    appointments
  };
}

// =========================================================================
// Repository Class
// =========================================================================

export class SupabaseClinicRepository {
  async getMyClinicContext(): Promise<ClinicServiceResult<ClinicStaffContext>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_get_my_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const errorText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errorText)
        };
      }

      const data = await res.json();
      if (!data.success) {
        return {
          success: false,
          reason_code: data.reason_code,
          error: normalizeClinicError(403, `forbidden: ${data.reason_code}`)
        };
      }

      return {
        success: true,
        data: {
          tenant_id: data.tenant_id,
          staff_id: data.staff_id,
          staff_name: data.staff_name,
          practitioner_type: data.practitioner_type,
          specialty: data.specialty,
          can_manage_patient_profiles: !!data.can_manage_patient_profiles,
          can_view_clinical_records: !!data.can_view_clinical_records,
          can_write_clinical_notes: !!data.can_write_clinical_notes,
          permitted_branch_ids: Array.isArray(data.permitted_branch_ids) ? data.permitted_branch_ids : []
        }
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async setStaffProfile(params: {
    staff_id: string;
    practitioner_type?: string;
    specialty?: string;
    medical_license_number?: string;
    can_manage_patient_profiles?: boolean;
    can_view_clinical_records?: boolean;
    can_write_clinical_notes?: boolean;
  }): Promise<ClinicServiceResult<ClinicStaffProfileWriteResult>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_set_staff_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_staff_id: params.staff_id,
          p_practitioner_type: params.practitioner_type ?? null,
          p_specialty: params.specialty ?? null,
          p_medical_license_number: params.medical_license_number ?? null,
          p_can_manage_patient_profiles: params.can_manage_patient_profiles ?? false,
          p_can_view_clinical_records: params.can_view_clinical_records ?? false,
          p_can_write_clinical_notes: params.can_write_clinical_notes ?? false
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: mapClinicStaffProfileWriteResponse(data)
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async upsertPatientProfile(params: {
    customer_id: string;
    date_of_birth?: string;
    sex_at_birth?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    emergency_contact_relationship?: string;
    blood_type?: string;
    allergies?: string;
    chronic_conditions?: string;
  }): Promise<ClinicServiceResult<{ patient_profile_id: string }>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_upsert_patient_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_customer_id: params.customer_id,
          p_date_of_birth: params.date_of_birth ?? null,
          p_sex_at_birth: params.sex_at_birth ?? null,
          p_emergency_contact_name: params.emergency_contact_name ?? null,
          p_emergency_contact_phone: params.emergency_contact_phone ?? null,
          p_emergency_contact_relationship: params.emergency_contact_relationship ?? null,
          p_blood_type: params.blood_type ?? null,
          p_allergies: params.allergies ?? null,
          p_chronic_conditions: params.chronic_conditions ?? null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: { patient_profile_id: data.patient_profile_id }
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async startEncounter(params: {
    appointment_id: string;
    reason_for_visit?: string;
  }): Promise<ClinicServiceResult<ClinicEncounterStartResult>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_start_encounter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_appointment_id: params.appointment_id,
          p_reason_for_visit: params.reason_for_visit ?? null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: mapClinicEncounterStartResponse(data)
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async saveEncounterNote(params: {
    encounter_id: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    note_status?: NoteStatus;
  }): Promise<ClinicServiceResult<ClinicEncounterNoteWriteResult>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_save_encounter_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_encounter_id: params.encounter_id,
          p_subjective: params.subjective ?? null,
          p_objective: params.objective ?? null,
          p_assessment: params.assessment ?? null,
          p_plan: params.plan ?? null,
          p_note_status: params.note_status ?? 'draft'
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: mapClinicEncounterNoteWriteResponse(data)
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async completeEncounterAndAppointment(params: {
    encounter_id: string;
  }): Promise<ClinicServiceResult<ClinicEncounterCompletionResult>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_complete_encounter_and_appointment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_encounter_id: params.encounter_id
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        reason_code: data.reason_code,
        data: mapClinicEncounterCompletionResponse(data)
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async getPatientHistory(customer_id: string): Promise<ClinicServiceResult<ClinicPatientHistory>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_get_patient_history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_customer_id: customer_id })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: mapClinicPatientHistoryResponse(data)
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }

  async getOperationalDay(date: string, branch_id?: string): Promise<ClinicServiceResult<ClinicOperationalDay>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_get_operational_day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_date: date,
          p_branch_id: branch_id ?? null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: normalizeClinicError(res.status, errText)
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: mapClinicOperationalDayResponse(data)
      };
    } catch {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }
}

export const supabaseClinicRepository = new SupabaseClinicRepository();
