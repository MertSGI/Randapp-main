export type PractitionerType = 'physician' | 'dentist' | 'nurse' | 'physiotherapist' | 'psychologist' | 'dietitian' | 'other';
export type EncounterStatus = 'open' | 'completed' | 'cancelled';

export type ClinicServiceErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'ALREADY_EXISTS'
  | 'TENANT_MISMATCH'
  | 'APPOINTMENT_NOT_CONFIRMED'
  | 'INVARIANT_VIOLATION'
  | 'UNKNOWN';

export interface ClinicStaffContext {
  tenant_id: string;
  staff_id: string;
  staff_name: string;
  practitioner_type: PractitionerType | null;
  specialty: string | null;
  can_manage_patient_profiles: boolean;
  can_view_clinical_records: boolean;
  can_write_clinical_notes: boolean;
  permitted_branch_ids: string[];
}

export interface ClinicStaffProfile {
  id: string;
  tenant_id: string;
  staff_id: string;
  practitioner_type: PractitionerType | null;
  specialty: string | null;
  medical_license_number: string | null;
  can_manage_patient_profiles: boolean;
  can_view_clinical_records: boolean;
  can_write_clinical_notes: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClinicPatientProfile {
  id: string;
  tenant_id: string;
  customer_id: string;
  date_of_birth: string | null;
  sex_at_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicEncounter {
  id: string;
  tenant_id: string;
  appointment_id: string;
  customer_id: string;
  practitioner_staff_id: string;
  branch_id: string | null;
  status: EncounterStatus;
  reason_for_visit: string | null;
  started_at: string;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ClinicEncounterNote {
  id: string;
  tenant_id: string;
  encounter_id: string;
  version: number;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  created_by: string;
  created_at: string;
}

export interface ClinicPatientHistory {
  patient_profile: ClinicPatientProfile | null;
  encounters: Array<{
    encounter: ClinicEncounter;
    notes: ClinicEncounterNote[];
  }>;
}

export interface ClinicOperationalAppointment {
  appointment_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  appointment_status: string;
  branch_id: string | null;
  branch_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  practitioner_type: PractitionerType | null;
  specialty: string | null;
  service_id: string | null;
  service_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  encounter_id: string | null;
  encounter_status: EncounterStatus | null;
  encounter_started_at: string | null;
  encounter_completed_at: string | null;
}

export interface ClinicOperationalDay {
  date: string;
  branch_id: string | null;
  appointments: ClinicOperationalAppointment[];
}

export interface ClinicServiceResult<T = any> {
  success: boolean;
  data?: T;
  reason_code?: string;
  error?: {
    code: ClinicServiceErrorCode;
    message: string;
  };
}
