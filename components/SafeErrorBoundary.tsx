import React, { Component, ErrorInfo, ReactNode } from 'react';
import { auditLogService } from '../services/auditLogService';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SafeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    try {
      // Safely log the rendering error as a redacted audit log
      auditLogService.logAuditEvent({
        actorType: 'system',
        category: 'system',
        severity: 'error',
        action: 'frontend_render_error',
        summary: `Arayüz yükleme hatası saptandı: ${error?.message || 'Bilinmeyen Hata'}`,
        safeDetails: {
          errorMessage: error?.message,
          errorName: error?.name,
          componentStack: errorInfo?.componentStack?.slice(0, 500) // Keep it brief and clean
        }
      });
    } catch (e) {
      console.error('SafeErrorBoundary components logging failed:', e);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 my-4 text-center max-w-lg mx-auto">
          <div className="text-3xl text-orange-500 mb-3">⚠️</div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
            {this.props.fallbackTitle || 'Arayüz yüklenirken bir sorun oluştu.'}
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {this.props.fallbackSubtitle || 'Bu bölüm güvenli modda kapatıldı. Sayfayı yenileyebilir veya destek birimiyle iletişime geçebilirsiniz.'}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition"
          >
            Sayfayı Yenile
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SafeErrorBoundary;
