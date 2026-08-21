import { ClinicStaffContext, EncounterStatus } from '../types/clinic';
import { Role } from '../types';

export type ClinicWorkspaceMode = 'workspace' | 'setup_only' | 'access_not_configured' | 'unauthorized';

/**
 * Pure policy decision function for determining Clinic surface workspace mode.
 */
export function deriveClinicWorkspaceMode(
  authRole: Role | undefined,
  context: ClinicStaffContext | null
): ClinicWorkspaceMode {
  if (authRole === 'super_admin') {
    return 'unauthorized';
  }

  if (authRole === 'staff') {
    if (context && context.staff_id) {
      return 'workspace';
    }
    return 'access_not_configured';
  }

  if (authRole === 'tenant_owner') {
    if (context && context.staff_id) {
      return 'workspace';
    }
    return 'setup_only';
  }

  return 'unauthorized';
}

/**
 * Pure policy function: Can user load patient clinical history RPC?
 */
export function canLoadClinicPatientHistory(context: ClinicStaffContext | null): boolean {
  if (!context) return false;
  return !!context.can_view_clinical_records;
}

/**
 * Pure policy function: Can user manage patient profile (upsert bounded profile)?
 */
export function canManageClinicPatientProfile(context: ClinicStaffContext | null): boolean {
  if (!context) return false;
  return !!context.can_manage_patient_profiles;
}

/**
 * Pure policy function: Can practitioner start a new encounter?
 */
export function canStartClinicEncounter(
  context: ClinicStaffContext | null,
  apptStatus: string,
  assignedStaffId: string | null,
  openEncounterId?: string | null
): boolean {
  if (!context) return false;
  if (!context.can_write_clinical_notes) return false;
  if (apptStatus !== 'confirmed') return false;
  if (openEncounterId) return false;
  if (assignedStaffId && assignedStaffId !== context.staff_id) return false;
  return true;
}

/**
 * Pure policy function: Can practitioner write/save encounter notes?
 */
export function canWriteClinicEncounterNote(
  context: ClinicStaffContext | null,
  encounterStatus?: EncounterStatus | null,
  practitionerStaffId?: string | null
): boolean {
  if (!context) return false;
  if (!context.can_write_clinical_notes) return false;
  if (encounterStatus && encounterStatus !== 'open') return false;
  if (practitionerStaffId && practitionerStaffId !== context.staff_id) return false;
  return true;
}

/**
 * Pure policy function: Can practitioner complete encounter?
 */
export function canCompleteClinicEncounter(
  context: ClinicStaffContext | null,
  encounterStatus?: EncounterStatus | null,
  practitionerStaffId?: string | null
): boolean {
  if (!context) return false;
  if (!context.can_write_clinical_notes) return false;
  if (encounterStatus !== 'open') return false;
  if (practitionerStaffId && practitionerStaffId !== context.staff_id) return false;
  return true;
}
