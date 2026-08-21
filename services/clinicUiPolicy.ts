import { ClinicStaffContext, EncounterStatus, ClinicServiceResult, ClinicStaffSetupProfile } from '../types/clinic';
import { Role } from '../types';

export type ClinicWorkspaceMode = 'workspace' | 'setup_only' | 'access_not_configured' | 'unauthorized';

export type ClinicContextResolutionState =
  | 'loading'
  | 'ready'
  | 'not_configured'
  | 'setup_only'
  | 'unavailable'
  | 'unauthenticated'
  | 'forbidden'
  | 'error';

export type ClinicStaffSetupSelectionState =
  | 'existing_profile'
  | 'confirmed_unconfigured'
  | 'setup_read_failed'
  | 'staff_missing_from_authority_result';

/**
 * Pure policy helper: derives explicit fail-closed selection state for owner staff setup.
 * Prevents setup read failures from defaulting to editable new profiles.
 */
export function deriveClinicStaffSetupSelectionState(
  staffId: string,
  setupReadSuccess: boolean,
  setupProfilesMap: Record<string, ClinicStaffSetupProfile> | null
): ClinicStaffSetupSelectionState {
  if (!setupReadSuccess || !setupProfilesMap) {
    return 'setup_read_failed';
  }

  const profile = setupProfilesMap[staffId];
  if (!profile) {
    return 'staff_missing_from_authority_result';
  }

  if (profile.clinic_profile_exists) {
    return 'existing_profile';
  }

  return 'confirmed_unconfigured';
}

/**
 * Pure state resolver function for Clinic surface context result.
 * Prevents non-Supabase UNAVAILABLE or unknown errors from defaulting to setup_only or not_configured.
 */
export function resolveClinicContextState(
  authRole: Role | undefined,
  res: ClinicServiceResult<ClinicStaffContext> | null
): ClinicContextResolutionState {
  if (!res) return 'loading';

  if (!res.success) {
    if (res.error?.code === 'UNAVAILABLE') {
      return 'unavailable';
    }
    if (res.error?.code === 'UNAUTHENTICATED') {
      return 'unauthenticated';
    }
    if (res.reason_code === 'no_clinic_profile' || res.reason_code === 'not_clinic_staff') {
      if (authRole === 'tenant_owner') return 'setup_only';
      if (authRole === 'staff') return 'not_configured';
    }
    if (res.error?.code === 'FORBIDDEN') {
      return 'forbidden';
    }
    return 'error';
  }

  if (res.data && res.data.staff_id) {
    if (authRole === 'super_admin') return 'forbidden';
    return 'ready';
  }

  if (authRole === 'tenant_owner') return 'setup_only';
  if (authRole === 'staff') return 'not_configured';
  return 'forbidden';
}

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
 * Requires non-null assignedStaffId matching context.staff_id and NO existing encounter.
 */
export function canStartClinicEncounter(
  context: ClinicStaffContext | null,
  apptStatus: string,
  assignedStaffId: string | null | undefined,
  existingEncounterId?: string | null
): boolean {
  if (!context) return false;
  if (!context.can_write_clinical_notes) return false;
  if (apptStatus !== 'confirmed') return false;
  if (existingEncounterId) return false;
  if (!assignedStaffId || assignedStaffId !== context.staff_id) return false;
  return true;
}

/**
 * Pure policy function: Can practitioner write/save encounter notes?
 * Requires non-null practitionerStaffId matching context.staff_id and status === 'open'.
 */
export function canWriteClinicEncounterNote(
  context: ClinicStaffContext | null,
  encounterStatus?: EncounterStatus | null,
  practitionerStaffId?: string | null
): boolean {
  if (!context) return false;
  if (!context.can_write_clinical_notes) return false;
  if (!encounterStatus || encounterStatus !== 'open') return false;
  if (!practitionerStaffId || practitionerStaffId !== context.staff_id) return false;
  return true;
}

/**
 * Pure policy function: Can practitioner complete encounter?
 * Requires non-null practitionerStaffId matching context.staff_id and status === 'open'.
 */
export function canCompleteClinicEncounter(
  context: ClinicStaffContext | null,
  encounterStatus?: EncounterStatus | null,
  practitionerStaffId?: string | null
): boolean {
  if (!context) return false;
  if (!context.can_write_clinical_notes) return false;
  if (!encounterStatus || encounterStatus !== 'open') return false;
  if (!practitionerStaffId || practitionerStaffId !== context.staff_id) return false;
  return true;
}
