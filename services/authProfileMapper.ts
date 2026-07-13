import { User, Role } from '../types';

export const SUPABASE_AUTH_PROFILE_ERROR =
  'Account profile is not configured. Please contact support.';

const CANONICAL_SUPABASE_ROLES: Role[] = ['super_admin', 'tenant_owner', 'staff'];

interface SupabaseAuthUserInput {
  id?: string;
  email?: string | null;
}

interface SupabaseProfileInput {
  id?: string;
  tenant_id?: string | null;
  name?: string | null;
  role?: string | null;
  active?: boolean | null;
}

export function mapSupabaseProfileToUser(
  authUser: SupabaseAuthUserInput,
  profile: SupabaseProfileInput | null | undefined,
  fallbackEmail = ''
): User {
  if (!authUser.id || !profile || profile.id !== authUser.id) {
    throw new Error(SUPABASE_AUTH_PROFILE_ERROR);
  }

  if (profile.active !== true) {
    throw new Error(SUPABASE_AUTH_PROFILE_ERROR);
  }

  if (!profile.role || !CANONICAL_SUPABASE_ROLES.includes(profile.role as Role)) {
    throw new Error(SUPABASE_AUTH_PROFILE_ERROR);
  }

  const role = profile.role as Role;
  const tenantId = profile.tenant_id || undefined;

  if ((role === 'tenant_owner' || role === 'staff') && !tenantId) {
    throw new Error(SUPABASE_AUTH_PROFILE_ERROR);
  }

  if (role === 'super_admin' && profile.tenant_id !== null) {
    throw new Error(SUPABASE_AUTH_PROFILE_ERROR);
  }

  return {
    id: authUser.id,
    tenantId,
    name: profile.name || authUser.email || fallbackEmail || 'User',
    email: authUser.email || fallbackEmail,
    role,
    active: true,
  };
}
