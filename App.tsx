import React, { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';

// Layouts
import MarketingLayout from './components/layouts/MarketingLayout';
import SalonBookingLayout from './components/layouts/SalonBookingLayout';
import AdminLayout from './components/layouts/AdminLayout';
import SuperAdminLayout from './components/layouts/SuperAdminLayout';

// Pages
import MarketingHomePage from './pages/MarketingHomePage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import ContactPage from './pages/ContactPage';
import RegistrationPage from './pages/RegistrationPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import SupportPage from './pages/SupportPage';

import BookingPage from './pages/BookingPage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import PilotDemoEntryPage from './pages/PilotDemoEntryPage';
import { PilotAdminPreviewPage } from './pages/PilotAdminPreviewPage';
import AIVisualizerPage from './pages/AIVisualizerPage';
import DemoLandingPage from './pages/DemoLandingPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminTenantsPage from './pages/super-admin/SuperAdminTenantsPage';
import SuperAdminSubscriptionsPage from './pages/super-admin/SuperAdminSubscriptionsPage';
import SuperAdminPaymentsPage from './pages/super-admin/SuperAdminPaymentsPage';
import SuperAdminOnboardingPage from './pages/super-admin/SuperAdminOnboardingPage';
import SuperAdminReportsPage from './pages/super-admin/SuperAdminReportsPage';
import SuperAdminSettingsPage from './pages/super-admin/SuperAdminSettingsPage';
import SuperAdminPaymentTestPage from './pages/super-admin/SuperAdminPaymentTestPage';
import SuperAdminAISettingsPage from './pages/super-admin/SuperAdminAISettingsPage';
import SuperAdminPlansPage from './pages/super-admin/SuperAdminPlansPage';
import SuperAdminReferralsPage from './pages/super-admin/SuperAdminReferralsPage';
import SuperAdminTenantPreviewPage from './pages/super-admin/SuperAdminTenantPreviewPage';
import SuperAdminGoLivePage from './pages/super-admin/SuperAdminGoLivePage';
import SuperAdminPilotTrackerPage from './pages/super-admin/SuperAdminPilotTrackerPage';
import SuperAdminManualProvisioningPage from './pages/super-admin/SuperAdminManualProvisioningPage';
import SuperAdminSchedulerPage from './pages/super-admin/SuperAdminSchedulerPage';
import SuperAdminObservabilityPage from './pages/super-admin/SuperAdminObservabilityPage';
import SuperAdminLegalPage from './pages/super-admin/SuperAdminLegalPage';
import SitePreviewPage from './pages/admin/SitePreviewPage';

import CustomerLoginPage from './pages/customer/CustomerLoginPage';
import CustomerPortalPage from './pages/customer/CustomerPortalPage';
import AppointmentSelfServicePage from './pages/AppointmentSelfServicePage';

import MobileAppPage from './pages/MobileAppPage';

// Diagnostic tools
import { MockDiagnosticTool } from './components/MockDiagnosticTool';

// Contexts
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { TenantProvider, useTenant } from './contexts/TenantContext';
import { AuthProvider } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppErrorBoundary from './components/AppErrorBoundary';
import SafeErrorBoundary from './components/SafeErrorBoundary';

// Use hash routing for embedded previews and browser routing for production
const Router = (import.meta as any).env.VITE_ROUTER_MODE === 'browser' 
  ? BrowserRouter 
  : HashRouter;

const AppFlowSwitcher: React.FC = () => {
  const { tenant } = useTenant();
  // If there's a tenant loaded, we're in "tenant mode" (except for admin routes which manage themselves)
  return (
    <Routes>
      {/* 1. Marketing Routes */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={
          tenant && !['localhost', '127.0.0.1'].includes(window.location.hostname) && !window.location.hostname.includes('run.app')
            ? <Navigate to="/book" replace /> 
            : <MarketingHomePage />
        } />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/mobile-app" element={<MobileAppPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/register" element={<RegistrationPage />} />
        <Route path="/demo" element={<DemoLandingPage />} />
        <Route path="/pilot" element={<PilotDemoEntryPage />} />
        <Route path="/pilot/admin" element={<PilotAdminPreviewPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/support" element={<SupportPage />} />
      </Route>

      {/* 2. Salon Booking Routes */}
      <Route element={<SalonBookingLayout />}>
        <Route path="/book" element={<BookingPage />} />
        {/* Dedicated Pilot Customer route */}
        <Route path="/pilot/customer" element={<BookingPage />} />
        {/* Dynamic Tenant Routing */}
        <Route path="/:tenantSlug" element={<BookingPage />} />
        <Route path="/booking/:tenantSlug" element={<BookingPage />} />
        {/* AI Tool - Now part of the salon booking flow */}
        <Route path="/ai-visualizer" element={<AIVisualizerPage />} />
        <Route path="/appointment/manage/:token" element={<AppointmentSelfServicePage />} />
      </Route>

      {/* 2.5 Customer Routes */}
      <Route path="/customer/login" element={<CustomerLoginPage />} />
      <Route path="/customer/appointments" element={<CustomerPortalPage />} />
      <Route path="/customer" element={<Navigate to="/customer/appointments" replace />} />

      {/* 3. Admin Routes */}
      <Route element={<ProtectedRoute allowedRoles={['tenant_owner', 'super_admin']}><AdminLayout /></ProtectedRoute>}>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/*" element={<AdminPage />} />
      </Route>
      {/* Admin preview route doesn't need standard admin layout so we place it outside it or with a minimal layout*/}
      <Route path="/admin-preview" element={<Navigate to="/admin/site-preview" replace />} />
      <Route path="/admin/site-preview" element={
        <ProtectedRoute allowedRoles={['tenant_owner']}>
          <SitePreviewPage />
        </ProtectedRoute>
      } />

      {/* 4. Super Admin Routes */}
      <Route element={<ProtectedRoute allowedRoles={['super_admin']}><SuperAdminLayout /></ProtectedRoute>}>
        <Route path="/super-admin" element={<SuperAdminDashboard />} />
        <Route path="/super-admin/tenants" element={<SuperAdminTenantsPage />} />
        <Route path="/super-admin/subscriptions" element={<SuperAdminSubscriptionsPage />} />
        <Route path="/super-admin/payments" element={<SuperAdminPaymentsPage />} />
        <Route path="/super-admin/onboarding" element={<SuperAdminOnboardingPage />} />
        <Route path="/super-admin/reports" element={<SuperAdminReportsPage />} />
        <Route path="/super-admin/settings" element={<SuperAdminSettingsPage />} />
        <Route path="/super-admin/payment-test" element={<SuperAdminPaymentTestPage />} />
        <Route path="/super-admin/ai-settings" element={<SuperAdminAISettingsPage />} />
        <Route path="/super-admin/plans" element={<SuperAdminPlansPage />} />
        <Route path="/super-admin/referrals" element={<SuperAdminReferralsPage />} />
        <Route path="/super-admin/go-live" element={<SuperAdminGoLivePage />} />
        <Route path="/super-admin/pilots" element={<SuperAdminPilotTrackerPage />} />
        <Route path="/super-admin/provisioning" element={<SuperAdminManualProvisioningPage />} />
        <Route path="/super-admin/scheduler" element={<SuperAdminSchedulerPage />} />
        <Route path="/super-admin/observability" element={<SafeErrorBoundary><SuperAdminObservabilityPage /></SafeErrorBoundary>} />
        <Route path="/super-admin/legal" element={<SafeErrorBoundary><SuperAdminLegalPage /></SafeErrorBoundary>} />
      </Route>
      <Route path="/super-admin/tenant-preview/:tenantId" element={
        <ProtectedRoute allowedRoles={['super_admin']}>
          <SuperAdminTenantPreviewPage />
        </ProtectedRoute>
      } />
      
      {/* Catch-all route to prevent white screens on unknown paths */}
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 border-t-4 border-red-500">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">Sayfa bulunamadı. Lütfen adresi kontrol edin.</p>
            <a href="/" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition">Ana Sayfaya Dön</a>
          </div>
        </div>
      } />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <DialogProvider>
          <LanguageProvider>
            <TenantProvider>
              <AuthProvider>
                <Router>
                  <AppFlowSwitcher />
                  <MockDiagnosticTool />
                </Router>
              </AuthProvider>
            </TenantProvider>
          </LanguageProvider>
        </DialogProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
};

export default App;