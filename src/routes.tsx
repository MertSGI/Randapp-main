import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { HealthTourismLanding } from './pages/HealthTourismLanding';
import { ClinicDashboard } from './pages/ClinicDashboard';
import { DiscoveryMarketplace } from './pages/DiscoveryMarketplace';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/health-tourism" element={<HealthTourismLanding />} />
      <Route path="/clinic" element={<ClinicDashboard />} />
      <Route path="/demo/health-tourism" element={<HealthTourismLanding />} />
      <Route path="/demo/clinic" element={<ClinicDashboard />} />
      <Route path="/discovery" element={<DiscoveryMarketplace />} />
      <Route path="/discovery/:slug" element={<DiscoveryMarketplace />} />
    </Routes>
  );
};