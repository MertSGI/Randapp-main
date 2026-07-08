import { SelfServiceRepository } from './types';

export class LocalSelfServiceRepository implements SelfServiceRepository {
  private getStoredTokens(): any[] {
    const raw = localStorage.getItem('lari_appointment_access_tokens');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredTokens(tokens: any[]) {
    localStorage.setItem('lari_appointment_access_tokens', JSON.stringify(tokens));
  }

  private getStoredChangeRequests(): any[] {
    const raw = localStorage.getItem('lari_appointment_change_requests');
    return raw ? JSON.parse(raw) : [];
  }

  private saveStoredChangeRequests(requests: any[]) {
    localStorage.setItem('lari_appointment_change_requests', JSON.stringify(requests));
  }

  async listTokens(tenantId: string): Promise<any[]> {
    return this.getStoredTokens().filter(t => t.tenantId === tenantId);
  }

  async getTokenByHash(tokenHash: string): Promise<any | null> {
    return this.getStoredTokens().find(t => t.tokenHash === tokenHash) || null;
  }

  async createToken(tenantId: string, input: any): Promise<any> {
    const tokens = this.getStoredTokens();
    const newToken = {
      id: input.id || `tok_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      appointmentId: input.appointmentId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
      usedAt: null,
      ...input
    };
    tokens.push(newToken);
    this.saveStoredTokens(tokens);
    return newToken;
  }

  async updateToken(tokenId: string, patch: any): Promise<void> {
    const tokens = this.getStoredTokens();
    const idx = tokens.findIndex(t => t.id === tokenId);
    if (idx !== -1) {
      tokens[idx] = { ...tokens[idx], ...patch };
      this.saveStoredTokens(tokens);
    }
  }

  async listChangeRequests(tenantId: string): Promise<any[]> {
    return this.getStoredChangeRequests().filter(r => r.tenantId === tenantId);
  }

  async createChangeRequest(tenantId: string, input: any): Promise<any> {
    const requests = this.getStoredChangeRequests();
    const newRequest = {
      id: input.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      appointmentId: input.appointmentId,
      requestType: input.requestType,
      requestedBy: input.requestedBy,
      proposedDate: input.proposedDate,
      proposedTime: input.proposedTime,
      reason: input.reason,
      status: input.status || 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedBy: null,
      ...input
    };
    requests.push(newRequest);
    this.saveStoredChangeRequests(requests);
    return newRequest;
  }

  async updateChangeRequest(requestId: string, patch: any): Promise<void> {
    const requests = this.getStoredChangeRequests();
    const idx = requests.findIndex(r => r.id === requestId);
    if (idx !== -1) {
      requests[idx] = { ...requests[idx], ...patch };
      this.saveStoredChangeRequests(requests);
    }
  }
}
