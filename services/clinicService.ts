import {
  ClinicStaffContext,
  ClinicStaffProfile,
  ClinicPatientProfile,
  ClinicEncounter,
  ClinicEncounterNote,
  ClinicPatientHistory,
  ClinicOperationalDay,
  ClinicServiceResult
} from '../types/clinic';
import { supabaseClinicRepository } from './repositories/supabaseClinicRepository';
import { getDataSourceMode } from './dataSourceConfig';

export const clinicService = {
  async getMyClinicContext(): Promise<ClinicServiceResult<ClinicStaffContext>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getMyClinicContext();
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async setClinicStaffProfile(params: {
    staff_id: string;
    practitioner_type?: string;
    specialty?: string;
    medical_license_number?: string;
    can_manage_patient_profiles?: boolean;
    can_view_clinical_records?: boolean;
    can_write_clinical_notes?: boolean;
  }): Promise<ClinicServiceResult<ClinicStaffProfile>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.setStaffProfile(params);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async upsertClinicPatientProfile(params: {
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
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.upsertPatientProfile(params);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async startClinicEncounter(params: {
    appointment_id: string;
    reason_for_visit?: string;
  }): Promise<ClinicServiceResult<ClinicEncounter>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.startEncounter(params);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async saveClinicEncounterNote(params: {
    encounter_id: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  }): Promise<ClinicServiceResult<ClinicEncounterNote>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.saveEncounterNote(params);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async completeClinicEncounter(params: {
    encounter_id: string;
  }): Promise<ClinicServiceResult<{ encounter_id: string; encounter_status: string; appointment_status: string }>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.completeEncounterAndAppointment(params);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async getClinicPatientHistory(customer_id: string): Promise<ClinicServiceResult<ClinicPatientHistory>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getPatientHistory(customer_id);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  },

  async getClinicOperationalDay(date: string, branch_id?: string): Promise<ClinicServiceResult<ClinicOperationalDay>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getOperationalDay(date, branch_id);
    }
    return {
      success: false,
      error: {
        code: 'UNAVAILABLE',
        message: 'Clinic application service requires Supabase server authority mode.'
      } as any
    };
  }
};
