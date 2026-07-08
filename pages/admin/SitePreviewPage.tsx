import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import SalonWebsiteView from '../../components/SalonWebsiteView';
import { Service, Staff, SalonBusinessProfile } from '../../types';
import { getStaffList } from '../../services/staffService';
import { getServices } from '../../services/serviceCatalogService';
import { businessProfileService } from '../../services/businessProfileService';
import { useLanguage } from '../../contexts/LanguageContext';

const SitePreviewPage: React.FC = () => {
    const { tenant } = useTenant();
    const { currentUser } = useAuth();
    const { language } = useLanguage();
    
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [servicesList, setServicesList] = useState<Service[]>([]);
    const [businessProfile, setBusinessProfile] = useState<SalonBusinessProfile | null>(null);

    useEffect(() => {
        if (tenant && currentUser && currentUser.role === 'tenant_owner') {
            getStaffList(tenant.id, { activeOnly: true }).then(setStaffList);
            getServices(tenant.id, { activeOnly: true }).then(setServicesList);
            businessProfileService.getPublicBusinessProfile(tenant.id).then(setBusinessProfile);
        }
    }, [tenant, currentUser]);

    if (!tenant) {
        return <div className="p-8 text-center">{language === 'tr' ? 'Yükleniyor...' : 'Loading...'}</div>;
    }

    if (currentUser?.role !== 'tenant_owner') {
        return <div className="p-8 text-center text-red-600">{language === 'tr' ? 'Yetkisiz erişim' : 'Unauthorized Access'}</div>;
    }

    return (
        <div className="bg-gray-100 min-h-screen">
            <div className={`p-3 bg-blue-100 text-blue-800 border-b border-blue-200 text-sm text-center font-medium shadow-sm sticky top-0 z-50`}>
                {language === 'tr' ? 'Önizleme Modu: Bu sayfa henüz müşterilere açık değildir.' : 'Preview Mode: This page is not yet public.'}
            </div>
            <div className="py-8">
                <SalonWebsiteView 
                    tenant={tenant}
                    businessProfile={businessProfile}
                    staffList={staffList}
                    servicesList={servicesList}
                    onStartBooking={() => {
                        console.log("Preview mode start booking");
                    }}
                    onServiceSelect={(service) => {
                        console.log("Preview mode service select:", service);
                    }}
                    language={language}
                />
            </div>
        </div>
    );
};

export default SitePreviewPage;
