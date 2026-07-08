import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SalonWebsiteView from '../../components/SalonWebsiteView';
import { Service, Staff, SalonBusinessProfile } from '../../types';
import { getStaffList } from '../../services/staffService';
import { getServices } from '../../services/serviceCatalogService';
import { businessProfileService } from '../../services/businessProfileService';
import { useLanguage } from '../../contexts/LanguageContext';

const SuperAdminTenantPreviewPage: React.FC = () => {
    const { tenantId } = useParams<{ tenantId: string }>();
    const { currentUser } = useAuth();
    const { language } = useLanguage();
    
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [servicesList, setServicesList] = useState<Service[]>([]);
    const [businessProfile, setBusinessProfile] = useState<SalonBusinessProfile | null>(null);

    useEffect(() => {
        if (tenantId && currentUser && currentUser.role === 'super_admin') {
            getStaffList(tenantId, { activeOnly: true }).then(setStaffList);
            getServices(tenantId, { activeOnly: true }).then(setServicesList);
            businessProfileService.getPublicBusinessProfile(tenantId).then(setBusinessProfile);
        }
    }, [tenantId, currentUser]);

    if (!tenantId) {
        return <div className="p-8 text-center text-red-600">Missing Tenant ID</div>;
    }

    if (currentUser?.role !== 'super_admin') {
        return <div className="p-8 text-center text-red-600">Unauthorized Access</div>;
    }

    // Mock tenant skeleton for preview
    const mockTenant: any = {
        id: tenantId,
        slug: tenantId,
        name: 'Tenant Preview',
    };

    return (
        <div className="bg-gray-100 min-h-screen">
            <div className={`p-3 bg-purple-100 text-purple-800 border-b border-purple-200 text-sm text-center font-medium shadow-sm sticky top-0 z-50`}>
                Super Admin Preview Mode: This page is not public.
            </div>
            <div className="py-8">
                <SalonWebsiteView 
                    tenant={mockTenant}
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

export default SuperAdminTenantPreviewPage;
