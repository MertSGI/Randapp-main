import React from 'react';
import { Appointment, Staff, Service } from '../types';
import { bookingAbuseProtectionService, NoShowRiskBadge } from '../services/bookingAbuseProtectionService';
import { isTerminalStatus } from '../services/adminAppointmentService';

export interface AppointmentCardProps {
  appointment: Appointment;
  assignedStaff?: Staff;
  assignedService?: Service;
  branchName?: string;
  serviceName?: string;
  isOwner?: boolean;
  isMutating?: boolean;
  onViewProfile?: (appointmentId: string) => void;
  onComplete?: (appointmentId: string) => void;
  onNoShow?: (appointmentId: string) => void;
  onCancel?: (appointmentId: string) => void;
  onCallConfirm?: (appointment: Appointment, badge: NoShowRiskBadge) => void;
  allAppointments?: Appointment[];
  language?: string;
}

export const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  assignedStaff,
  assignedService,
  branchName,
  serviceName,
  isOwner = false,
  isMutating = false,
  onViewProfile,
  onComplete,
  onNoShow,
  onCancel,
  onCallConfirm,
  allAppointments,
  language = 'tr',
}) => {
  // Query customer's no-show risk signals and badge
  const riskBadge: NoShowRiskBadge = bookingAbuseProtectionService.getNoShowRiskBadge(
    appointment.phone,
    appointment.tenantId,
    allAppointments
  );

  const displayServiceName =
    serviceName ||
    (language === 'tr' ? (assignedService?.name_tr || assignedService?.name) : assignedService?.name) ||
    (language === 'tr' ? 'Hizmet' : 'Service');

  const handleCallAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCallConfirm) {
      onCallConfirm(appointment, riskBadge);
      return;
    }
    if (appointment.phone) {
      const promptMsg =
        language === 'tr'
          ? `Müşteri: ${appointment.user_name}\nTelefon: ${appointment.phone}\nGeçmiş No-Show: ${riskBadge.count} kez.\n\nRandevu katılımını teyit etmek için aramak istiyor musunuz?`
          : `Customer: ${appointment.user_name}\nPhone: ${appointment.phone}\nPast No-Shows: ${riskBadge.count} times.\n\nDo you want to call to confirm this appointment?`;
      if (typeof window !== 'undefined' && window.confirm(promptMsg)) {
        window.location.href = `tel:${appointment.phone}`;
      }
    }
  };

  const getStatusBadgeClass = (status: string) => {
    if (status === 'confirmed') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    if (status === 'completed') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
    if (status === 'no_show') return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    if (status.includes('cancel')) return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  const getStatusLabel = (status: string) => {
    const labelsTr: Record<string, string> = {
      confirmed: 'Onaylandı',
      completed: 'Tamamlandı',
      no_show: 'Gelmedi',
      cancelled: 'İptal Edildi',
      cancelled_by_customer: 'Müşteri İptal Etti',
      cancelled_by_salon: 'Salon İptal Etti',
      cancelled_by_system: 'Sistem İptali',
      pending: 'Bekliyor',
    };
    const labelsEn: Record<string, string> = {
      confirmed: 'Confirmed',
      completed: 'Completed',
      no_show: 'No Show',
      cancelled: 'Cancelled',
      cancelled_by_customer: 'Cancelled by Customer',
      cancelled_by_salon: 'Cancelled by Salon',
      cancelled_by_system: 'Cancelled by System',
      pending: 'Pending',
    };
    return (language === 'tr' ? labelsTr[status] : labelsEn[status]) || status;
  };

  return (
    <li
      key={appointment.id}
      data-testid={`appointment-card-${appointment.id}`}
      className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors duration-300 border-b border-gray-100 dark:border-slate-700/60 last:border-b-0"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-accent dark:text-blue-400 truncate transition-colors duration-300">
              {appointment.user_name}
            </p>
            {/* Visual Risk Badge: Only rendered if customer has 1 or more past no-shows */}
            {riskBadge.hasRisk && (
              <span
                data-testid="no-show-risk-badge"
                title={riskBadge.actionText}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all ${
                  riskBadge.level === 'high'
                    ? 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
                    : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                }`}
              >
                <span>{riskBadge.badgeText}</span>
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 transition-colors duration-300 mt-0.5">
            {appointment.date} at {appointment.time} • {displayServiceName}
            {assignedStaff && ` (${language === 'tr' ? 'ile' : 'with'} ${assignedStaff.name})`}
            {branchName && ` • [${branchName}]`}
          </p>

          <div className="mt-1 flex flex-wrap items-center text-xs text-gray-400 dark:text-gray-500 gap-x-2 gap-y-1 transition-colors duration-300">
            <span>{appointment.user_email}</span>
            <span className="hidden sm:inline">⬢</span>
            <span>{appointment.phone || (language === 'tr' ? 'Telefon Yok' : 'No Phone')}</span>
          </div>

          {/* Quick Call Action: Exposed to staff for confirmation when no-show risk exists */}
          {riskBadge.hasRisk && appointment.phone && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="no-show-call-action"
                onClick={handleCallAction}
                title={riskBadge.actionText}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 dark:bg-amber-900/40 dark:hover:bg-amber-900/60 dark:text-amber-200 dark:border-amber-700 shadow-sm transition-colors cursor-pointer"
              >
                <span>📞</span>
                <span>{language === 'tr' ? 'Teyit İçin Ara' : 'Call & Confirm'}</span>
              </button>
              <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                {riskBadge.actionText}
              </span>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 flex items-center gap-3 sm:gap-4 justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0">
          {onViewProfile && (
            <button
              type="button"
              onClick={() => onViewProfile(appointment.id)}
              className="text-accent hover:text-blue-700 text-sm font-medium"
            >
              {language === 'tr' ? 'Profili Gör' : 'View Profile'}
            </button>
          )}

          <div className="flex flex-col items-end gap-1">
            <span
              className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(
                appointment.status
              )}`}
            >
              {getStatusLabel(appointment.status)}
            </span>
            {appointment.status.includes('cancel') && appointment.cancelReason && (
              <span
                className="text-[10px] text-red-500 max-w-[150px] truncate block text-right"
                title={appointment.cancelReason}
              >
                {appointment.cancelReason}
              </span>
            )}
          </div>

          {isOwner && appointment.status === 'confirmed' && !isTerminalStatus(appointment.status) && (
            <div className="flex flex-col sm:flex-row items-center gap-2">
              {isMutating ? (
                <span className="text-xs text-gray-500 dark:text-gray-400 animate-pulse">
                  {language === 'tr' ? 'İşleniyor...' : 'Processing...'}
                </span>
              ) : (
                <>
                  {onComplete && (
                    <button
                      type="button"
                      onClick={() => onComplete(appointment.id)}
                      disabled={isMutating}
                      className="text-green-600 hover:text-green-900 text-xs font-semibold px-2 py-1 bg-green-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {language === 'tr' ? 'Tamamlandı' : 'Complete'}
                    </button>
                  )}
                  {onNoShow && (
                    <button
                      type="button"
                      onClick={() => onNoShow(appointment.id)}
                      disabled={isMutating}
                      className="text-orange-600 hover:text-orange-900 text-xs font-semibold px-2 py-1 bg-orange-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {language === 'tr' ? 'Gelmedi' : 'No Show'}
                    </button>
                  )}
                  {onCancel && (
                    <button
                      type="button"
                      onClick={() => onCancel(appointment.id)}
                      disabled={isMutating}
                      className="text-red-600 hover:text-red-900 text-xs font-semibold px-2 py-1 bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {language === 'tr' ? 'İptal' : 'Cancel'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

export default AppointmentCard;
