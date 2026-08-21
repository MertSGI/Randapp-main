export type PractitionerType = 'physician' | 'dentist' | 'nurse' | 'physiotherapist' | 'psychologist' | 'dietitian' | 'other';
export type EncounterStatus = 'open' | 'completed' | 'voided';
export type NoteStatus = 'draft' | 'final';

export type ClinicServiceErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'ALREADY_EXISTS'
  | 'TENANT_MISMATCH'
  | 'APPOINTMENT_NOT_CONFIRMED'
  | 'INVARIANT_VIOLATION'
  | 'UNAVAILABLE'
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

export interface ClinicStaffProfileWriteResult {
  staff_id: string;
  tenant_id: string;
  can_manage_patient_profiles: boolean;
  can_view_clinical_records: boolean;
  can_write_clinical_notes: boolean;
}

/**
 * Full ClinicPatientProfile entity (table-level).
 */
export interface ClinicPatientProfile {
  id?: string;
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
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Exact projection of the clinic_get_patient_history RPC's patient_profile output.
 * Does NOT include tenant_id, customer_id, created_at, created_by, updated_by.
 */
export interface ClinicPatientHistoryProfile {
  id: string;
  date_of_birth: string | null;
  sex_at_birth: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  blood_type: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  updated_at: string;
}

export interface ClinicEncounter {
  id: string;
  appointment_id: string;
  branch_id: string | null;
  practitioner_staff_id: string;
  status: EncounterStatus;
  reason_for_visit: string | null;
  started_at: string;
  completed_at: string | null;
  notes?: ClinicEncounterNote[];
}

export interface ClinicEncounterStartResult {
  encounter_id: string;
  appointment_id?: string;
  status: EncounterStatus;
  started_at: string;
}

export interface ClinicEncounterNote {
  id: string;
  version: number;
  author_staff_id: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  note_status: NoteStatus;
  supersedes_note_id: string | null;
  created_at: string;
}

export interface ClinicEncounterNoteWriteResult {
  note_id: string;
  encounter_id: string;
  version: number;
  note_status: NoteStatus;
  created_at: string;
}

export interface ClinicEncounterCompletionResult {
  encounter_id: string;
  encounter_status: EncounterStatus;
  appointment_status: string;
  completed_at: string;
}

export interface ClinicPatientHistory {
  patient_profile: ClinicPatientHistoryProfile | null;
  encounters: ClinicEncounter[];
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

export interface ClinicServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  reason_code?: string;
  error?: {
    code: ClinicServiceErrorCode;
    message: string;
  };
}
