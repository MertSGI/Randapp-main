import { Appointment, Service } from '../types';

export const reportingService = {
  getReportMetrics(appointments: Appointment[], services: Service[], dateRange: 'this_month' | 'last_month' | 'last_30_days') {
    const now = new Date();
    
    // Filter dates
    const filteredAppointments = appointments.filter(apt => {
      const aptDate = new Date(apt.date);
      if (dateRange === 'this_month') {
        return aptDate.getMonth() === now.getMonth() && aptDate.getFullYear() === now.getFullYear();
      }
      if (dateRange === 'last_month') {
        const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        return aptDate.getMonth() === lastMonth && aptDate.getFullYear() === year;
      }
      if (dateRange === 'last_30_days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return aptDate >= thirtyDaysAgo && aptDate <= now;
      }
      return true;
    });

    const totalAppointments = filteredAppointments.length;
    const completedAppointments = filteredAppointments.filter(a => a.status === 'confirmed').length;
    const canceledAppointments = filteredAppointments.filter(a => a.status === 'cancelled').length;

    let estimatedRevenue = 0;
    const serviceRevenueMap: Record<string, number> = {};
    const serviceCountMap: Record<string, number> = {};

    const sourceCountMap: Record<string, number> = {};

    filteredAppointments.forEach(apt => {
      if (apt.source) {
         sourceCountMap[apt.source] = (sourceCountMap[apt.source] || 0) + 1;
      }
      
      if (apt.status === 'cancelled') return;
      
      const service = services.find(s => s.id === apt.serviceId);
      // Fallback to service current price if no snapshot exists currently
      const price = service ? service.price : 0;
      estimatedRevenue += price;

      if (service) {
        serviceRevenueMap[service.name] = (serviceRevenueMap[service.name] || 0) + price;
        serviceCountMap[service.name] = (serviceCountMap[service.name] || 0) + 1;
      }
    });

    const averageAppointmentValue = completedAppointments > 0 ? estimatedRevenue / completedAppointments : 0;

    let mostBookedService = '';
    let maxCount = 0;
    for (const [s, count] of Object.entries(serviceCountMap)) {
      if (count > maxCount) { maxCount = count; mostBookedService = s; }
    }

    let topRevenueService = '';
    let maxRev = 0;
    for (const [s, rev] of Object.entries(serviceRevenueMap)) {
      if (rev > maxRev) { maxRev = rev; topRevenueService = s; }
    }

    return {
      totalAppointments,
      completedAppointments,
      canceledAppointments,
      estimatedRevenue,
      averageAppointmentValue,
      mostBookedService,
      topRevenueService,
      sourceBreakdown: sourceCountMap
    };
  }
};
