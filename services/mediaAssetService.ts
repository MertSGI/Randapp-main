import { 
  MediaAsset, 
  MediaAssetType, 
  MediaVisibility, 
  MediaStorageProvider, 
  MediaAssetStatus 
} from '../types';
import { businessProfileService } from './businessProfileService';
import { getStaffList, updateStaff } from './staffService';
import { getServices, updateService } from './serviceCatalogService';

const MEDIA_STORAGE_KEY = 'lari_media_assets';

// Static seed media items representing current theme and existing mock assets
const DEFAULT_ASSETS: MediaAsset[] = [
  {
    id: 'asset-default-logo-1',
    tenantId: 'tenant_demo',
    ownerType: 'business_profile',
    type: MediaAssetType.LOGO,
    visibility: MediaVisibility.PUBLIC,
    provider: MediaStorageProvider.LOCAL_PREVIEW,
    status: MediaAssetStatus.ACTIVE,
    fileName: 'logo.png',
    mimeType: 'image/png',
    sizeBytes: 15420,
    localPreviewUrl: 'https://picsum.photos/seed/lari-logo/200/200',
    publicUrl: 'https://picsum.photos/seed/lari-logo/200/200',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    altText: 'Lari Salon Logo'
  },
  {
    id: 'asset-default-cover-1',
    tenantId: 'tenant_demo',
    ownerType: 'business_profile',
    type: MediaAssetType.COVER,
    visibility: MediaVisibility.PUBLIC,
    provider: MediaStorageProvider.LOCAL_PREVIEW,
    status: MediaAssetStatus.ACTIVE,
    fileName: 'cover.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 421000,
    localPreviewUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1200&h=400',
    publicUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1200&h=400',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    altText: 'Lari Modern Salon Front'
  },
  {
    id: 'asset-default-gallery-1',
    tenantId: 'tenant_demo',
    ownerType: 'business_profile',
    type: MediaAssetType.GALLERY,
    visibility: MediaVisibility.PUBLIC,
    provider: MediaStorageProvider.LOCAL_PREVIEW,
    status: MediaAssetStatus.ACTIVE,
    fileName: 'gallery1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 310500,
    localPreviewUrl: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=600&h=400&q=80',
    publicUrl: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=600&h=400&q=80',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    altText: 'Internal styling station seating'
  },
  {
    id: 'asset-default-gallery-2',
    tenantId: 'tenant_demo',
    ownerType: 'business_profile',
    type: MediaAssetType.GALLERY,
    visibility: MediaVisibility.PUBLIC,
    provider: MediaStorageProvider.LOCAL_PREVIEW,
    status: MediaAssetStatus.ACTIVE,
    fileName: 'gallery2.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 254000,
    localPreviewUrl: 'https://images.unsplash.com/photo-1595476108010-b4d1f10d5e43?auto=format&fit=crop&w=600&h=400&q=80',
    publicUrl: 'https://images.unsplash.com/photo-1595476108010-b4d1f10d5e43?auto=format&fit=crop&w=600&h=400&q=80',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    altText: 'Cosmetology nail and make-up desk'
  }
];

export const mediaAssetService = {
  // Local storage lists of media assets
  getAllAssets(): MediaAsset[] {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(MEDIA_STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Error parsing local media assets', e);
        }
      } else {
        localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(DEFAULT_ASSETS));
        return DEFAULT_ASSETS;
      }
    }
    return DEFAULT_ASSETS;
  },

  saveAllAssets(assets: MediaAsset[]): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(assets));
    }
  },

  async createLocalPreviewAsset(input: {
    tenantId: string;
    branchId?: string;
    ownerType: 'business_profile' | 'staff' | 'service' | 'branch' | 'campaign' | 'tenant' | 'support_case';
    ownerId?: string;
    type: MediaAssetType;
    visibility: MediaVisibility;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    localPreviewUrl: string; // references/metadata only, avoids storing huge base64 in database fields directly
    altText?: string;
    width?: number;
    height?: number;
  }): Promise<MediaAsset> {
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newAsset: MediaAsset = {
      id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      type: input.type,
      visibility: input.visibility,
      provider: MediaStorageProvider.LOCAL_PREVIEW,
      status: MediaAssetStatus.ACTIVE,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
      altText: input.altText || `${input.fileName} asset`,
      localPreviewUrl: input.localPreviewUrl,
      publicUrl: input.localPreviewUrl, // Locally they are identical
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {
        dimensions: input.width && input.height ? `${input.width}x${input.height}` : undefined,
        preLiveSandbox: 'true'
      }
    };

    const assets = this.getAllAssets();
    assets.push(newAsset);
    this.saveAllAssets(assets);

    return newAsset;
  },

  listMediaAssetsForTenant(tenantId: string): MediaAsset[] {
    return this.getAllAssets().filter(
      a => a.tenantId === tenantId && a.status !== MediaAssetStatus.DELETED
    );
  },

  listPublicMediaAssetsForTenant(tenantId: string): MediaAsset[] {
    return this.getAllAssets().filter(
      a => a.tenantId === tenantId && 
           a.visibility === MediaVisibility.PUBLIC && 
           a.status === MediaAssetStatus.ACTIVE
    );
  },

  getMediaAsset(assetId: string): MediaAsset | null {
    return this.getAllAssets().find(a => a.id === assetId) || null;
  },

  updateMediaAssetMetadata(assetId: string, updates: Partial<MediaAsset>): MediaAsset | null {
    const assets = this.getAllAssets();
    const index = assets.findIndex(a => a.id === assetId);
    if (index >= 0) {
      assets[index] = {
        ...assets[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.saveAllAssets(assets);
      return assets[index];
    }
    return null;
  },

  async attachMediaAssetToBusinessProfile(tenantId: string, assetId: string, slot: 'logo' | 'cover' | 'gallery'): Promise<boolean> {
    const asset = this.getMediaAsset(assetId);
    if (!asset || asset.tenantId !== tenantId) return false;

    // Maintain profile data syncing
    const profile = await businessProfileService.getBusinessProfile(tenantId);
    if (profile) {
      if (slot === 'logo') {
        profile.logo_url = asset.localPreviewUrl;
      } else if (slot === 'cover') {
        profile.cover_image_url = asset.localPreviewUrl;
        // Also support array
        if (!profile.cover_images) profile.cover_images = [];
        profile.cover_images = [asset.localPreviewUrl!];
      } else if (slot === 'gallery') {
        if (!profile.gallery_images) profile.gallery_images = [];
        if (!profile.gallery_images.includes(asset.localPreviewUrl!)) {
          profile.gallery_images.push(asset.localPreviewUrl!);
        }
      }
      await businessProfileService.updateBusinessProfile(tenantId, profile);
      this.updateMediaAssetMetadata(assetId, { 
        ownerType: 'business_profile',
        ownerId: profile.id
      });
      return true;
    }
    return false;
  },

  async attachMediaAssetToStaff(tenantId: string, staffId: string, assetId: string): Promise<boolean> {
    const asset = this.getMediaAsset(assetId);
    if (!asset || asset.tenantId !== tenantId) return false;

    try {
      // Find staff and update their photo path
      const staffList = await getStaffList(tenantId);
      const staff = staffList.find(s => s.id === staffId);
      if (staff) {
        staff.image = asset.localPreviewUrl;
        await updateStaff(tenantId, staffId, staff);
        
        this.updateMediaAssetMetadata(assetId, {
          ownerType: 'staff',
          ownerId: staffId,
          type: MediaAssetType.STAFF_PHOTO
        });
        return true;
      }
    } catch (e) {
      console.error('Error attaching photo to staff member', e);
    }
    return false;
  },

  async attachMediaAssetToService(tenantId: string, serviceId: string, assetId: string): Promise<boolean> {
    const asset = this.getMediaAsset(assetId);
    if (!asset || asset.tenantId !== tenantId) return false;

    try {
      const services = await getServices(tenantId);
      const service = services.find(s => s.id === serviceId);
      if (service) {
        service.image = asset.localPreviewUrl;
        await updateService(tenantId, serviceId, service);

        this.updateMediaAssetMetadata(assetId, {
          ownerType: 'service',
          ownerId: serviceId,
          type: MediaAssetType.SERVICE_IMAGE
        });
        return true;
      }
    } catch (e) {
      console.error('Error attaching image to service catalog', e);
    }
    return false;
  },

  async attachMediaAssetToBranch(tenantId: string, branchId: string, assetId: string): Promise<boolean> {
    const asset = this.getMediaAsset(assetId);
    if (!asset || asset.tenantId !== tenantId) return false;

    this.updateMediaAssetMetadata(assetId, {
      branchId,
      ownerType: 'branch',
      ownerId: branchId,
      type: MediaAssetType.BRANCH_IMAGE
    });
    return true;
  },

  archiveMediaAsset(assetId: string): boolean {
    const updated = this.updateMediaAssetMetadata(assetId, { status: MediaAssetStatus.ARCHIVED });
    return updated !== null;
  },

  deleteMediaAssetRecord(assetId: string): boolean {
    const updated = this.updateMediaAssetMetadata(assetId, { status: MediaAssetStatus.DELETED });
    return updated !== null;
  },

  validateMediaFileMetadata(file: { name: string; size: number; type: string }): { valid: boolean; error?: string; recommendedAlt?: string } {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    
    // 1. Unsafe Executable/Scripts Rejections
    const extension = file.name.split('.').pop()?.toLowerCase();
    const unsafeExtensions = ['js', 'jsx', 'ts', 'tsx', 'exe', 'sh', 'bat', 'cmd', 'html', 'htm', 'php', 'py', 'svg'];
    
    if (extension && unsafeExtensions.includes(extension)) {
      return { 
        valid: false, 
        error: 'Güvenlik kısıtlaması nedeniyle betik, çalıştırılabilir dosya ve SVG formatları yüklenemez.' 
      };
    }

    if (file.type === 'image/svg+xml') {
      return { 
        valid: false, 
        error: 'Güvenlik kısıtlaması nedeniyle betik barındırabilen SVG görselleri sınırlandırılmıştır.' 
      };
    }

    // 2. MIME checking
    if (!allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        error: 'Sadece JPG, PNG ve WebP görsel formatları desteklenmektedir.' 
      };
    }

    // 3. Size boundary rejections
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 5) {
      return {
        valid: false,
        error: 'Görsel boyutu maksimum 5 MB limitini aşamaz.'
      };
    }

    // Recommend alt text based on file name description
    const rawName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    const cleanAlt = rawName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    return {
      valid: true,
      recommendedAlt: `${cleanAlt} Görseli`
    };
  },

  getMediaStorageReadinessSummary() {
    return {
      mode: 'local_pre_live_preview',
      enabled: true,
      isBucketProvisioned: false,
      isCDNDecorated: false,
      checklist: [
        { label: 'Asset metadata storage layer (lari_media_assets)', completed: true },
        { label: 'Unsafe Script/Executable content filter (XSS Protection)', completed: true },
        { label: 'Logo, cover & gallery media slot attachments', completed: true },
        { label: 'Private vs Public media visibility separation', completed: true },
        { label: 'Supabase Storage policy mapping guidelines', completed: false, comment: 'Requires deploying actual storage bucket bucket roles and RLS structures.' },
        { label: 'Resizing & Cloudflare CDN compression routing', completed: false, comment: 'Available after production domains cutover.' }
      ]
    };
  },

  mapMediaAssetForExport(asset: MediaAsset) {
    // Return safe data excluding potentially huge dataURLs if they made it into localPreviewUrl,
    // exporting the safe metadata fields structure.
    const isBase64 = asset.localPreviewUrl?.startsWith('data:');
    return {
      id: asset.id,
      tenantId: asset.tenantId,
      branchId: asset.branchId,
      ownerType: asset.ownerType,
      ownerId: asset.ownerId,
      type: asset.type,
      visibility: asset.visibility,
      status: asset.status,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      altText: asset.altText,
      storagePath: asset.storagePath || `tenants/${asset.tenantId}/${asset.type}/${asset.id}_${asset.fileName}`,
      publicUrl: isBase64 ? undefined : asset.publicUrl,
      localPreviewUrl: isBase64 ? undefined : asset.localPreviewUrl,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt
    };
  },

  validateMediaAssetForMigration(asset: MediaAsset): { valid: boolean; warnings: string[]; blockers: string[] } {
    const report = {
      valid: true,
      warnings: [] as string[],
      blockers: [] as string[]
    };

    if (!asset.tenantId) {
      report.blockers.push(`Ortam bütünlük hatası: Görsel kaydı (${asset.id}) bağlı bir tenantId bilgisi taşımıyor.`);
      report.valid = false;
    }

    if (asset.sizeBytes && asset.sizeBytes > 5 * 1024 * 1024) {
      report.blockers.push(`Görsel (${asset.fileName}) dosya boyutu bulut transfer limiti olan 5 MB sınırını aşıyor.`);
      report.valid = false;
    }

    if (asset.localPreviewUrl?.startsWith('data:')) {
      report.warnings.push(`Transfer Uyarısı: Görsel (${asset.fileName}) ham base64 verisi taşıyor. Canlıya aktarımda dosyanın fiziksel bulut kovasına yüklenmesi önerilir.`);
    }

    if (!asset.altText) {
      report.warnings.push(`Erişilebilirlik (SEO) Uyarısı: Görsel (${asset.fileName}) alt alternatif metin açıklamasına sahip değil.`);
    }

    return report;
  }
};
