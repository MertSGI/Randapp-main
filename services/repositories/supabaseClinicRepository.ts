import {
  ClinicStaffContext,
  ClinicStaffProfileWriteResult,
  ClinicPatientProfile,
  ClinicEncounterStartResult,
  ClinicEncounterNoteWriteResult,
  ClinicEncounterCompletionResult,
  ClinicPatientHistory,
  ClinicOperationalDay,
  ClinicServiceResult,
  ClinicServiceErrorCode
} from '../../types/clinic';
import { fetchSupabase } from './supabaseClient';

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
    } catch (err: any) {
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
        data: {
          staff_id: data.staff_id,
          tenant_id: data.tenant_id,
          can_manage_patient_profiles: !!data.can_manage_patient_profiles,
          can_view_clinical_records: !!data.can_view_clinical_records,
          can_write_clinical_notes: !!data.can_write_clinical_notes
        }
      };
    } catch (err: any) {
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
    } catch (err: any) {
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
        data: {
          encounter_id: data.encounter_id,
          appointment_id: data.appointment_id,
          status: data.status,
          started_at: data.started_at
        }
      };
    } catch (err: any) {
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
    note_status?: string;
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
        data: {
          note_id: data.note_id,
          encounter_id: data.encounter_id,
          version: data.version,
          note_status: data.note_status,
          created_at: data.created_at
        }
      };
    } catch (err: any) {
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
        data: {
          encounter_id: data.encounter_id,
          encounter_status: data.encounter_status,
          appointment_status: data.appointment_status,
          completed_at: data.completed_at
        }
      };
    } catch (err: any) {
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
        data: {
          patient_profile: data.patient_profile,
          encounters: data.encounters || []
        }
      };
    } catch (err: any) {
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
        data: {
          date: data.date,
          branch_id: data.branch_id,
          appointments: data.appointments || []
        }
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: 'Network error communicating with clinic service.' }
      };
    }
  }
}

export const supabaseClinicRepository = new SupabaseClinicRepository();
