import type { DataSourceMode } from './dataSourceConfig';

export const PILOT_DEMO_TENANT_ID = 'tenant_pilot_demo';

export function isPilotLocalBypassAllowed(dataMode: DataSourceMode): boolean {
  return dataMode === 'local';
}

export function hasPilotDemoSignal(params: {
  activeTenantId?: string | null;
  inPilotDemo?: boolean;
  hash?: string;
  pathname?: string;
  args?: unknown[];
}): boolean {
  return (
    params.activeTenantId === PILOT_DEMO_TENANT_ID ||
    params.inPilotDemo === true ||
    !!params.hash?.includes(PILOT_DEMO_TENANT_ID) ||
    !!params.hash?.includes('pilot/customer') ||
    !!params.pathname?.includes(PILOT_DEMO_TENANT_ID) ||
    !!params.pathname?.includes('pilot/customer') ||
    !!params.args?.includes(PILOT_DEMO_TENANT_ID)
  );
}

export function shouldUsePilotLocalBypass(
  dataMode: DataSourceMode,
  params: Parameters<typeof hasPilotDemoSignal>[0]
): boolean {
  return isPilotLocalBypassAllowed(dataMode) && hasPilotDemoSignal(params);
}