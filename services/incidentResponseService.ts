import { Incident, IncidentStatus, IncidentSeverity, AuditEventCategory } from '../types';
import { auditLogService } from './auditLogService';

const INCIDENT_STORAGE_KEY = 'lari_incidents_v1';

export const incidentResponseService = {
  createIncident(input: {
    severity: IncidentSeverity;
    title: string;
    summary: string;
    affectedTenantIds: string[];
    affectedCategories: AuditEventCategory[];
    relatedAuditEventIds?: string[];
    relatedSupportTicketIds?: string[];
    owner?: string;
    metadata?: any;
  }): Incident {
    const list = this._getIncidentsFromStore();

    const newIncident: Incident = {
      id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'detected',
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      affectedTenantIds: input.affectedTenantIds,
      affectedCategories: input.affectedCategories,
      relatedAuditEventIds: input.relatedAuditEventIds || [],
      relatedSupportTicketIds: input.relatedSupportTicketIds || [],
      startedAt: new Date().toISOString(),
      detectedAt: new Date().toISOString(),
      owner: input.owner,
      metadata: input.metadata || {}
    };

    list.unshift(newIncident);
    this._saveIncidentsToStore(list);

    // Instrument with custom high priority audit event
    auditLogService.logAuditEvent({
      actorType: 'system',
      category: 'security',
      severity: input.severity === 'sev1_critical' || input.severity === 'sev2_major' ? 'critical' : 'warning',
      action: 'incident_detected',
      entityType: 'Incident',
      entityId: newIncident.id,
      summary: `[INCIDENT] ${newIncident.severity.toUpperCase()} Detected: "${newIncident.title}"`,
      safeDetails: {
        incidentId: newIncident.id,
        affectedTenants: newIncident.affectedTenantIds,
        categories: newIncident.affectedCategories
      }
    });

    return newIncident;
  },

  listIncidents(filters?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
  }): Incident[] {
    let list = this._getIncidentsFromStore();

    if (filters) {
      if (filters.status) {
        list = list.filter(i => i.status === filters.status);
      }
      if (filters.severity) {
        list = list.filter(i => i.severity === filters.severity);
      }
    }

    return list;
  },

  getIncident(incidentId: string): Incident | undefined {
    const list = this._getIncidentsFromStore();
    return list.find(i => i.id === incidentId);
  },

  updateIncidentStatus(incidentId: string, status: IncidentStatus): Incident | undefined {
    const list = this._getIncidentsFromStore();
    const idx = list.findIndex(i => i.id === incidentId);
    if (idx !== -1) {
      list[idx].status = status;
      if (status === 'resolved') {
        list[idx].resolvedAt = new Date().toISOString();
      }
      this._saveIncidentsToStore(list);

      // Audit status update
      auditLogService.logAuditEvent({
        actorType: 'system',
        category: 'system',
        severity: 'notice',
        action: 'incident_status_changed',
        entityType: 'Incident',
        entityId: incidentId,
        summary: `Incident status transitioned to ${status} (#${incidentId})`
      });

      return list[idx];
    }
    return undefined;
  },

  linkAuditEventToIncident(incidentId: string, auditEventId: string): Incident | undefined {
    const list = this._getIncidentsFromStore();
    const idx = list.findIndex(i => i.id === incidentId);
    if (idx !== -1) {
      if (!list[idx].relatedAuditEventIds.includes(auditEventId)) {
        list[idx].relatedAuditEventIds.push(auditEventId);
        this._saveIncidentsToStore(list);
      }
      return list[idx];
    }
    return undefined;
  },

  linkTicketToIncident(incidentId: string, ticketId: string): Incident | undefined {
    const list = this._getIncidentsFromStore();
    const idx = list.findIndex(i => i.id === incidentId);
    if (idx !== -1) {
      if (!list[idx].relatedSupportTicketIds.includes(ticketId)) {
        list[idx].relatedSupportTicketIds.push(ticketId);
        this._saveIncidentsToStore(list);
      }
      return list[idx];
    }
    return undefined;
  },

  addMitigationNote(incidentId: string, note: string): Incident | undefined {
    const list = this._getIncidentsFromStore();
    const idx = list.findIndex(i => i.id === incidentId);
    if (idx !== -1) {
      list[idx].mitigationNotes = (list[idx].mitigationNotes || '') + `\n--- [${new Date().toISOString()}] ---\n${note}`;
      this._saveIncidentsToStore(list);
      return list[idx];
    }
    return undefined;
  },

  resolveIncident(incidentId: string, resolution: string): Incident | undefined {
    const list = this._getIncidentsFromStore();
    const idx = list.findIndex(i => i.id === incidentId);
    if (idx !== -1) {
      list[idx].status = 'resolved';
      list[idx].resolvedAt = new Date().toISOString();
      list[idx].postmortemNotes = (list[idx].postmortemNotes || '') + `\n[Postmortem Note: ${resolution}]`;
      this._saveIncidentsToStore(list);

      // Audit incident closure
      auditLogService.logAuditEvent({
        actorType: 'super_admin',
        category: 'security',
        severity: 'info',
        action: 'incident_resolved',
        entityType: 'Incident',
        entityId: incidentId,
        summary: `Incident resolved successfully: ${resolution} (#${incidentId})`
      });

      return list[idx];
    }
    return undefined;
  },

  getIncidentReadinessSummary() {
    const list = this._getIncidentsFromStore();
    return {
      totalIncidents: list.length,
      unresolvedIncidents: list.filter(i => i.status !== 'resolved' && i.status !== 'closed').length,
      criticalIncidents: list.filter(i => i.severity === 'sev1_critical').length,
      majorIncidents: list.filter(i => i.severity === 'sev2_major').length,
      hasEscalationProcedure: true,
      localSimulationActive: true
    };
  },

  _getIncidentsFromStore(): Incident[] {
    try {
      const data = localStorage.getItem(INCIDENT_STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  _saveIncidentsToStore(list: Incident[]): void {
    try {
      localStorage.setItem(INCIDENT_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to write incidents stream', e);
    }
  }
};
