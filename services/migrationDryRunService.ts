import { TenantSnapshot } from './dataExportService';

export interface MigrationDryRunResult {
  ready: boolean;
  warnings: string[];
  blockers: string[];
  recommendedFixes: string[];
}

export const migrationDryRunService = {
  
  validateSnapshotForMigration(snapshot: TenantSnapshot | null): MigrationDryRunResult {
    const result: MigrationDryRunResult = {
      ready: false,
      warnings: [],
      blockers: [],
      recommendedFixes: []
    };

    if (!snapshot) {
      result.blockers.push("No data snapshot provided.");
      return result;
    }

    // 1. Tenant configuration and basic fields
    const account = snapshot.tenantAccount;
    if (!account) {
      result.blockers.push("Tenant Account object is missing.");
    } else {
      if (!account.id) {
        result.blockers.push("Tenant Account has no unique ID.");
      }
      if (!account.slug) {
        result.blockers.push("Tenant Account has no matching URL slug.");
        result.recommendedFixes.push("Ensure reservation slug is defined before migration.");
      }
      if (!account.plan) {
         result.warnings.push("Tenant Account has no plan assigned. Defaulting to 'basic'.");
      }
      if (!account.subscriptionStatus) {
         result.warnings.push("Tenant Account has no explicit billing status state.");
      }
    }
    
    // 2. Business profile check
    if (!snapshot.businessProfile) {
      result.blockers.push("Business profile object is completely missing.");
    } else {
      const bp = snapshot.businessProfile;
      if (!bp.public_display_name && (!account || !account.name)) {
        result.blockers.push("Business profile lacks a display name.");
      }
      // Public site fields check
      if (bp.is_public_profile_enabled === undefined) {
         result.warnings.push("Business profile lacks public-site visibility status configuration.");
      }
    }

    // 3. Catalog validations (Services & Staff)
    const services = snapshot.catalog?.services || [];
    const staff = snapshot.catalog?.staff || [];
    
    if (services.length === 0) {
      result.blockers.push("Business has no services defined.");
    } else {
      services.forEach(s => {
        if (!s.id || !s.name || s.price === undefined) {
          result.blockers.push(`Service entry ${s.id || 'unknown'} has invalid properties (missing name or price).`);
        }
      });
    }
    
    if (staff.length === 0) {
      result.blockers.push("Business has no staff defined.");
    } else {
      staff.forEach(st => {
        if (!st.id || !st.name) {
          result.blockers.push(`Staff entry ${st.id || 'unknown'} has invalid properties (missing name).`);
        }
      });
    }

    // 4. Secure Session & Credentials Checks (Safety Net)
    const snapshotString = JSON.stringify(snapshot);
    if (snapshotString.includes('"password"') || snapshotString.includes('"hashedPassword"')) {
       result.blockers.push("Snapshot contains user credentials or password fields, which must never be migrated.");
    }
    if (snapshotString.includes('"cardNumber"') || snapshotString.includes('"cvv"') || snapshotString.includes('"card_cvc"')) {
       result.blockers.push("Snapshot contains prohibited raw payment card details.");
    }
    if (snapshotString.includes('"apiKey"') || snapshotString.includes('"api_key"') || snapshotString.includes('"smtp_password"')) {
       result.blockers.push("Snapshot contains prohibited integration secrets or API credentials.");
    }

    // 5. Relational integrity (Appointments & Branches & Customers)
    const appointments = snapshot.appointments || [];
    const tenantIdStr = snapshot.tenantId;

    appointments.forEach(apt => {
        if (!apt.tenantId) {
            result.warnings.push(`Appointment ${apt.id} lacks a valid tenant_id binding.`);
        } else if (apt.tenantId !== tenantIdStr) {
            result.blockers.push(`Appointment ${apt.id} is associated with an incorrect tenant ${apt.tenantId}.`);
        }
        const serviceExists = services.some(s => s.id === apt.serviceId);
        if (!serviceExists) {
            result.warnings.push(`Appointment ${apt.id} references non-existent service ${apt.serviceId}`);
        }
    });

    // Branches validation
    const branches = snapshot.branches || [];
    branches.forEach(b => {
        if (!b.tenantId) {
           result.warnings.push(`Branch ${b.id || 'unknown'} is missing tenantId attribute.`);
        }
    });

    // Customers validation
    const customers = snapshot.customers || [];
    customers.forEach(c => {
       if (!c.tenantId && account?.id) {
          result.warnings.push(`Customer metadata for ${c.fullName || c.id} does not explicitly hold a tenant_id tag.`);
       }
    });

    // 6. Communication Log & Outbox Validations
    const onboarding = snapshot.onboardingState || {};
    const commEvents = (onboarding.communicationEvents || []) as any[];
    commEvents.forEach((ev, idx) => {
       if (!ev.tenantId) {
          result.warnings.push(`Communication log entry #${idx} is missing a tenant_id.`);
       }
       if (!ev.audience || !ev.channel || !ev.status || !ev.type) {
          result.warnings.push(`Communication log entry #${idx} has incomplete tracking fields (audience, channel, status, type).`);
       }
    });

    // 7. Site Provisioning Validation
    if (account) {
       if (account.slug === undefined) {
         result.blockers.push("Site provisioning is missing slug parameter.");
       }
       if (account.isPublished === undefined) {
         result.warnings.push("Site isPublished status not explicitly captured in snapshot.");
       }
       if (account.publicSiteStatus === undefined) {
         result.warnings.push("Site publicSiteStatus parameter missing in snapshot metadata.");
       }
    }

    // 8. Manual Provisioning Bypasses & Setup Validation
    const mpInfo = onboarding.manualProvisioning || {};
    if (mpInfo) {
       // Validate that fields are included or accounted for in staging considerations
       if (mpInfo.offline_payment === undefined && mpInfo.offlinePayment === undefined) {
          result.warnings.push("Manual provisioning offline_payment setting is missing or unverified.");
       }
       if (mpInfo.complimentary === undefined) {
          result.warnings.push("Manual provisioning complimentary flag is missing or not provided.");
       }
       if (mpInfo.pilot_exception === undefined && mpInfo.pilotException === undefined) {
          result.warnings.push("Manual provisioning pilot_exception parameter lacks confirmation.");
       }
       if (!mpInfo.setupNotes && !mpInfo.notes) {
          result.warnings.push("Manual provisioning setup notes are missing or empty.");
       }
       if (!mpInfo.billingSource && !mpInfo.source) {
          result.warnings.push("Manual provisioning billing source details are absent.");
       }
    }

    // 9. Media & Asset Storage Validation (Pre-live migration checks)
    const mediaAssets = snapshot.mediaAssets || [];
    if (mediaAssets.length === 0) {
       result.warnings.push("Veri paketi hiç tanımlı görsel veya döküman (media_assets) kaydı barındırmıyor.");
    } else {
       mediaAssets.forEach((asset: any) => {
          // Check tenantId
          if (!asset.tenantId) {
             result.blockers.push(`Görsel (${asset.fileName || asset.id}) bağlı bir tenantId bilgisi taşımıyor.`);
          } else if (asset.tenantId !== tenantIdStr) {
             result.blockers.push(`Görsel (${asset.fileName || asset.id}) yanlış tenantId ile eşleşmiş: ${asset.tenantId}`);
          }

          // Validate file size bounds
          if (asset.sizeBytes && asset.sizeBytes > 5 * 1024 * 1024) {
             result.blockers.push(`Görsel (${asset.fileName}) boyutu bulut transfer limiti olan 5 MB sınırını aşıyor: ${Math.round(asset.sizeBytes / 1024 / 1024)} MB`);
          }

          // Validate extension safety
          const ext = asset.fileName ? asset.fileName.split('.').pop()?.toLowerCase() : '';
          const unsafeExts = ['js', 'jsx', 'ts', 'tsx', 'exe', 'sh', 'bat', 'cmd', 'html', 'php', 'svg'];
          if (unsafeExts.includes(ext) || asset.mimeType === 'image/svg+xml') {
             result.blockers.push(`Görsel (${asset.fileName}) güvenlik filtresine takıldı (SVG, HTML veya çalıştırılabilir betik kısıtlaması).`);
          }

          // Warn if missing altText for public resources
          if (asset.visibility === 'public' && !asset.altText) {
             result.warnings.push(`Erişilebilirlik (SEO) Uyarısı: Genel erişimli görsel (${asset.fileName}) için alternatif (altText) metin girilmemiş.`);
          }

          // Alert on huge inline base64 data blobs
          if (asset.localPreviewUrl?.startsWith('data:')) {
             result.warnings.push(`Optimizasyon Uyarısı: Görsel (${asset.fileName}) ham base64 verisi taşıyor. Canlıya geçiş öncesi fiziksel dosyaya dönüştürülmelidir.`);
          }
       });

       // 10. Public profile links validation
       const bp = snapshot.businessProfile;
       if (bp && bp.is_public_profile_enabled) {
          if (bp.logo_url) {
             const hasLogoAsset = mediaAssets.some((m: any) => m.localPreviewUrl === bp.logo_url || m.publicUrl === bp.logo_url);
             if (!hasLogoAsset) {
                result.warnings.push("Profil logosu harici/statik bir URL referansıdır, lari_media_assets kütüphanesine kaydedilerek bulut kovasına taşınması önerilir.");
             }
          }
          if (bp.cover_image_url) {
             const hasCoverAsset = mediaAssets.some((m: any) => m.localPreviewUrl === bp.cover_image_url || m.publicUrl === bp.cover_image_url);
             if (!hasCoverAsset) {
                result.warnings.push("Kapak resmi harici/statik bir URL referansıdır, lari_media_assets kütüphanesine kaydedilerek bulut kovasına taşınması önerilir.");
             }
          }
       }
    }

    // Resolution
    if (result.blockers.length === 0) {
      result.ready = true;
    }

    return result;
  }
};
