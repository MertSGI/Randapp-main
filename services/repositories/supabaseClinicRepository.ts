import {
  ClinicStaffContext,
  ClinicStaffProfile,
  ClinicPatientProfile,
  ClinicEncounter,
  ClinicEncounterNote,
  ClinicPatientHistory,
  ClinicOperationalDay,
  ClinicServiceResult
} from '../../types/clinic';
import { fetchSupabase } from './supabaseClient';

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
          error: {
            code: res.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN',
            message: errorText || 'Failed to fetch clinic context'
          }
        };
      }

      const data = await res.json();
      if (!data.success) {
        return {
          success: false,
          reason_code: data.reason_code,
          error: {
            code: data.reason_code === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN',
            message: `Clinic context unavailable: ${data.reason_code}`
          }
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
        error: {
          code: 'UNKNOWN',
          message: err.message || 'Unexpected network error'
        }
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
  }): Promise<ClinicServiceResult<ClinicStaffProfile>> {
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
          error: {
            code: res.status === 401 ? 'UNAUTHENTICATED' : res.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
            message: errText
          }
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: data.profile
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
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
          error: {
            code: res.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN',
            message: errText
          }
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
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
      };
    }
  }

  async startEncounter(params: {
    appointment_id: string;
    reason_for_visit?: string;
  }): Promise<ClinicServiceResult<ClinicEncounter>> {
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
        let code: any = 'FORBIDDEN';
        if (errText.includes('APPOINTMENT_NOT_CONFIRMED')) code = 'APPOINTMENT_NOT_CONFIRMED';
        else if (errText.includes('ALREADY_EXISTS')) code = 'ALREADY_EXISTS';
        else if (errText.includes('NOT_FOUND')) code = 'NOT_FOUND';
        return {
          success: false,
          error: { code, message: errText }
        };
      }

      const data = await res.json();
      return {
        success: true,
        data
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
      };
    }
  }

  async saveEncounterNote(params: {
    encounter_id: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  }): Promise<ClinicServiceResult<ClinicEncounterNote>> {
    try {
      const res = await fetchSupabase('/rest/v1/rpc/clinic_save_encounter_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_encounter_id: params.encounter_id,
          p_subjective: params.subjective ?? null,
          p_objective: params.objective ?? null,
          p_assessment: params.assessment ?? null,
          p_plan: params.plan ?? null
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          success: false,
          error: { code: res.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: errText }
        };
      }

      const data = await res.json();
      return {
        success: true,
        data: data.note
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
      };
    }
  }

  async completeEncounterAndAppointment(params: {
    encounter_id: string;
  }): Promise<ClinicServiceResult<{ encounter_id: string; encounter_status: string; appointment_status: string }>> {
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
        let code: any = 'FORBIDDEN';
        if (errText.includes('INVARIANT_VIOLATION')) code = 'INVARIANT_VIOLATION';
        else if (errText.includes('INVALID_STATE')) code = 'INVALID_STATE';
        else if (errText.includes('NOT_FOUND')) code = 'NOT_FOUND';
        return {
          success: false,
          error: { code, message: errText }
        };
      }

      const data = await res.json();
      return {
        success: true,
        reason_code: data.reason_code,
        data
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
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
          error: { code: res.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: errText }
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
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
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
          error: { code: res.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: errText }
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
        error: { code: 'UNKNOWN', message: err.message || 'Network error' }
      };
    }
  }
}

export const supabaseClinicRepository = new SupabaseClinicRepository();
