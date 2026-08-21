import {
  ClinicStaffContext,
  ClinicStaffProfileWriteResult,
  ClinicEncounterStartResult,
  ClinicEncounterNoteWriteResult,
  ClinicEncounterCompletionResult,
  ClinicPatientHistory,
  ClinicOperationalDay,
  ClinicPatientProfileReadResult,
  ClinicStaffSetupProfilesResult,
  ClinicServiceResult,
  NoteStatus
} from '../types/clinic';
import { supabaseClinicRepository } from './repositories/supabaseClinicRepository';
import { getDataSourceMode } from './dataSourceConfig';

/**
 * Creates a typed UNAVAILABLE result for non-Supabase data modes.
 * No type-assertion or unsafe fallback bypass.
 */
export function createClinicUnavailableResult<T>(): ClinicServiceResult<T> {
  return {
    success: false,
    error: {
      code: 'UNAVAILABLE',
      message: 'Clinic application service requires Supabase server authority mode.'
    }
  };
}

export const clinicService = {
  async getMyClinicContext(): Promise<ClinicServiceResult<ClinicStaffContext>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getMyClinicContext();
    }
    return createClinicUnavailableResult<ClinicStaffContext>();
  },

  async setClinicStaffProfile(params: {
    staff_id: string;
    practitioner_type?: string;
    specialty?: string;
    medical_license_number?: string;
    can_manage_patient_profiles?: boolean;
    can_view_clinical_records?: boolean;
    can_write_clinical_notes?: boolean;
  }): Promise<ClinicServiceResult<ClinicStaffProfileWriteResult>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.setStaffProfile(params);
    }
    return createClinicUnavailableResult<ClinicStaffProfileWriteResult>();
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
    return createClinicUnavailableResult<{ patient_profile_id: string }>();
  },

  async startClinicEncounter(params: {
    appointment_id: string;
    reason_for_visit?: string;
  }): Promise<ClinicServiceResult<ClinicEncounterStartResult>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.startEncounter(params);
    }
    return createClinicUnavailableResult<ClinicEncounterStartResult>();
  },

  async saveClinicEncounterNote(params: {
    encounter_id: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    note_status?: NoteStatus;
  }): Promise<ClinicServiceResult<ClinicEncounterNoteWriteResult>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.saveEncounterNote(params);
    }
    return createClinicUnavailableResult<ClinicEncounterNoteWriteResult>();
  },

  async completeClinicEncounter(params: {
    encounter_id: string;
  }): Promise<ClinicServiceResult<ClinicEncounterCompletionResult>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.completeEncounterAndAppointment(params);
    }
    return createClinicUnavailableResult<ClinicEncounterCompletionResult>();
  },

  async getClinicPatientHistory(customer_id: string): Promise<ClinicServiceResult<ClinicPatientHistory>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getPatientHistory(customer_id);
    }
    return createClinicUnavailableResult<ClinicPatientHistory>();
  },

  async getClinicPatientProfile(customer_id: string): Promise<ClinicServiceResult<ClinicPatientProfileReadResult>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getPatientProfile(customer_id);
    }
    return createClinicUnavailableResult<ClinicPatientProfileReadResult>();
  },

  async getClinicStaffSetupProfiles(): Promise<ClinicServiceResult<ClinicStaffSetupProfilesResult>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getStaffSetupProfiles();
    }
    return createClinicUnavailableResult<ClinicStaffSetupProfilesResult>();
  },

  async getClinicOperationalDay(date: string, branch_id?: string): Promise<ClinicServiceResult<ClinicOperationalDay>> {
    if (getDataSourceMode() === 'supabase') {
      return supabaseClinicRepository.getOperationalDay(date, branch_id);
    }
    return createClinicUnavailableResult<ClinicOperationalDay>();
  }
};
