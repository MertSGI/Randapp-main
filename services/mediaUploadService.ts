export interface MediaItem {
  url: string;
  id?: string;
  file?: File;
}

export const mediaUploadService = {
  async uploadTenantLogo(tenantId: string, file: File): Promise<string> {
    // In mock mode, we create a local object URL
    // In supabase mode, this would upload to the storage bucket
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  },

  async uploadCoverImage(tenantId: string, file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  },

  async uploadGalleryImage(tenantId: string, file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  },

  async uploadStaffPhoto(tenantId: string, staffId: string, file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  },

  async uploadServiceImage(tenantId: string, serviceId: string, file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  },

  async deleteMedia(pathOrUrl: string): Promise<boolean> {
     // In mock mode, we just return true.
     return true;
  }
};
