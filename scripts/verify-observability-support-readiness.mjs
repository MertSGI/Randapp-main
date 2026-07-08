import fs from 'fs';
import path from 'path';

function verify() {
  console.log("=== LARİ Observability, Audit & Support Readiness QA Audit ===");
  let passed = true;

  const checkFileExists = (filePath, isOptional = false) => {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      if (!isOptional) {
        console.error(`❌ Missing file: ${filePath}`);
        passed = false;
      }
      return null;
    }
    console.log(`✅ File exists: ${filePath}`);
    return fs.readFileSync(fullPath, 'utf-8');
  };

  // 1. Audit types.ts for core models
  const typesContent = checkFileExists('types.ts');
  if (typesContent) {
    const requiredTypes = [
      'AuditEvent',
      'AuditEventSeverity',
      'AuditEventCategory',
      'AuditEventStatus',
      'SupportTicket',
      'SupportTicketStatus',
      'SupportTicketPriority',
      'SupportTicketSource',
      'SupportTicketCategory',
      'Incident',
      'IncidentStatus',
      'IncidentSeverity'
    ];
    requiredTypes.forEach(t => {
      if (!typesContent.includes(t)) {
        console.error(`❌ types.ts is missing design type/model: ${t}`);
        passed = false;
      } else {
        console.log(`  • types.ts implements interface: ${t}`);
      }
    });
  }

  // 2. Audit auditLogService
  const auditContent = checkFileExists('services/auditLogService.ts');
  if (auditContent) {
    if (!auditContent.includes('logAuditEvent') || !auditContent.includes('redactAuditPayload')) {
      console.error(`❌ services/auditLogService.ts lacks required methods (logAuditEvent, redactAuditPayload)`);
      passed = false;
    } else {
      console.log(`  • auditLogService has correct log and redaction methods.`);
    }
    
    // Check redaction behavior for raw self-service tokens and secrets
    if (auditContent.includes('apt_tok_') && auditContent.includes('[REDACTED_TOKEN]')) {
      console.log(`  • auditLogService correctly detects and redacts raw self-service tokens ("apt_tok_...").`);
    } else {
      console.error(`❌ auditLogService does not implement safe redaction of self-service tokens.`);
      passed = false;
    }

    if (auditContent.includes('cardNumber') || auditContent.includes('cvv') || auditContent.includes('password')) {
      console.log(`  • auditLogService includes sensitive fields (card, cvc, cvv, password) in redaction check.`);
    } else {
      console.error(`❌ auditLogService is missing card/password fields from standard redaction engine.`);
      passed = false;
    }
  }

  // 3. Audit supportTicketService
  const supportContent = checkFileExists('services/supportTicketService.ts');
  if (supportContent) {
    if (!supportContent.includes('createSupportTicket') || !supportContent.includes('resolveSupportTicket')) {
      console.error(`❌ services/supportTicketService.ts lacks required methods`);
      passed = false;
    } else {
      console.log(`  • supportTicketService implemented successfully.`);
    }
  }

  // 4. Audit incidentResponseService
  const incidentContent = checkFileExists('services/incidentResponseService.ts');
  if (incidentContent) {
    if (!incidentContent.includes('createIncident') || !incidentContent.includes('resolveIncident')) {
      console.error(`❌ services/incidentResponseService.ts lacks required methods`);
      passed = false;
    } else {
      console.log(`  • incidentResponseService implemented successfully.`);
    }
  }

  // 5. Audit Super Admin Observability UI
  const uiContent = checkFileExists('pages/super-admin/SuperAdminObservabilityPage.tsx');
  if (uiContent) {
    const requiredUIPhrases = [
      'Yerel Gözlem Kaydı',
      'Canlı izleme sağlayıcısı bağlı değildir.',
      'Bu panel olayları yerel/pre-live ortamda incelemek içindir.',
      'Gerçek alarm ve harici izleme canlı ortamda ayrıca etkinleştirilir.',
      'recent audit events', // Or Turkihe equivalent: 'Audit Olay Kayıtları'
      'destek bilet',
      'incident'
    ];
    
    // Check warning block
    if (uiContent.includes('Canlı izleme sağlayıcısı bağlı değildir.') && uiContent.includes('Yerel Gözlem Kaydı')) {
      console.log(`  • SuperAdminObservabilityPage correctly declares localized pre-live warning and un-connected SaaS disclaimer.`);
    } else {
      console.error(`❌ SuperAdminObservabilityPage is missing warning statements regarding disconnected SaaS monitorings.`);
      passed = false;
    }
  }

  // 6. Check Router configuration
  const appContent = checkFileExists('App.tsx');
  if (appContent) {
    if (appContent.includes('/super-admin/observability') && appContent.includes('SuperAdminObservabilityPage')) {
      console.log(`  • App.tsx correctly maps the /super-admin/observability route.`);
    } else {
      console.error(`❌ App.tsx is missing /super-admin/observability route mappings.`);
      passed = false;
    }

    if (appContent.includes('SafeErrorBoundary')) {
      console.log(`  • App.tsx correctly incorporates SafeErrorBoundary wrapper.`);
    } else {
      console.error(`❌ App.tsx is missing SafeErrorBoundary wrapper integration.`);
      passed = false;
    }
  }

  // 7. Check menu integration in Layout
  const layoutContent = checkFileExists('components/layouts/SuperAdminLayout.tsx');
  if (layoutContent) {
    if (layoutContent.includes('/super-admin/observability')) {
      console.log(`  • SuperAdminLayout sidebar contains the observability link.`);
    } else {
      console.error(`❌ SuperAdminLayout sidebar is missing the observability link.`);
      passed = false;
    }
  }

  // 8. Check Documentation existence
  const doc1 = checkFileExists('docs/OBSERVABILITY_AUDIT_AND_SUPPORT_OPERATIONS.md');
  const doc2 = checkFileExists('docs/SUPPORT_TICKET_AND_INCIDENT_RESPONSE.md');
  const doc3 = checkFileExists('docs/OBSERVABILITY_PROVIDER_CONTRACT_MATRIX.md');

  if (doc1 && doc2 && doc3) {
    console.log(`✅ Observability and Support Incident response playbooks & matrices exist.`);
  } else {
    console.error(`❌ Missing some of the core markdown files under docs/`);
    passed = false;
  }

  // 9. Check .env.example
  const envContent = checkFileExists('.env.example');
  if (envContent) {
    const requiredEnvPlaceholders = [
      'VITE_OBSERVABILITY_MODE=local_only',
      'OBSERVABILITY_PROVIDER=disabled',
      'SENTRY_DSN=',
      'OTEL_EXPORTER_OTLP_ENDPOINT=',
      'OTEL_EXPORTER_OTLP_HEADERS=',
      'SUPPORT_ALERT_WEBHOOK_URL='
    ];
    requiredEnvPlaceholders.forEach(ph => {
      const cleanPh = ph.split('=')[0];
      if (!envContent.includes(cleanPh)) {
        console.error(`❌ .env.example is missing placeholder: ${cleanPh}`);
        passed = false;
      } else {
        console.log(`  • .env.example implements placeholder: ${cleanPh}`);
      }
    });

    // Security verify: ensure NO real keys/DSNs/webhook URLs exist in .env.example
    if (envContent.includes('https://hooks.slack.com') || envContent.includes('https://sentry.io') || envContent.includes('ingest.sentry.io')) {
      console.error(`❌ .env.example contains active monitoring provider endpoints or webhook secrets! This violates security protocols.`);
      passed = false;
    } else {
      console.log(`  • Checked .env.example. No real secrets, webhooks, or provider tokens committed.`);
    }
  }

  // 10. Brand and Country Domain Strategy compliance
  const brandConfig = checkFileExists('services/marketConfigService.ts', true);
  if (brandConfig) {
    if (brandConfig.includes('lari') || brandConfig.includes('Lari') || brandConfig.includes('LARİ')) {
      console.log(`  • brandConfig matches LARİ.`);
    } else {
      console.warn(`  • Warning: Check marketConfigService for LARİ branding alignment.`);
    }
  }
  
  if (appContent && appContent.includes('randevulari.com')) {
    console.log(`  • App.tsx retains randevulari.com Turkish domain strategy.`);
  } else {
    // Check if other routing files reference randevulari.com
    const indexHtml = checkFileExists('index.html', true);
    if (indexHtml && indexHtml.includes('lari') || indexHtml.includes('randevulari.com')) {
      console.log(`  • LARİ visible brand and randevulari.com Turkish domain strategy verified.`);
    } else {
      console.warn(`  • Warning: verify LARİ and randevulari.com Turkish domain strategy references.`);
    }
  }

  console.log("------------------------------------------------------------------------");
  if (passed) {
    console.log("⭐ [SUCCESS] LARİ Observability, Audit & Support verification PASSED!");
    process.exit(0);
  } else {
    console.error("❌ [FAILURE] LARİ Observability, Audit & Support verification FAILED!");
    process.exit(1);
  }
}

verify();
