import { ManualProvisioningRepository } from './types';

export class LocalManualProvisioningRepository implements ManualProvisioningRepository {
  async getProvisioningLog(tenantId: string): Promise<any | null> {
    const raw = localStorage.getItem(`mock_provisioning_log_${tenantId}`);
    return raw ? JSON.parse(raw) : null;
  }

  async logProvisioningSuccess(tenantId: string, log: any): Promise<void> {
    localStorage.setItem(`mock_provisioning_log_${tenantId}`, JSON.stringify({
      ...log,
      loggedAt: new Date().toISOString()
    }));
  }
}
