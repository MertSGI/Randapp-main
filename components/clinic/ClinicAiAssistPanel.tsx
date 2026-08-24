import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ClinicStaffContext, EncounterStatus } from '../../types/clinic';
import type { ClinicAiAssistState, ClinicSoapDraftResult } from '../../types/clinicAiAssist';
import {
  MAX_RECORDING_DURATION_MS,
  SUPPORTED_AUDIO_MIMES,
  MAX_AUDIO_PAYLOAD_BYTES,
} from '../../types/clinicAiAssist';
import { requestTranscription, requestSoapDraft } from '../../services/clinicAiAssistService';
import {
  Mic, MicOff, Square, X, Send, Sparkles, Check, Trash2,
  AlertCircle, Loader2, Volume2, FileText,
} from 'lucide-react';

// ============================================================================
// ClinicAiAssistPanel
//
// Self-contained AI dictation workflow for the Clinic encounter.
// ALL audio, transcript, and draft data is held ONLY in volatile React state.
//
// STRICT INVARIANTS:
// - ZERO clinic note save calls
// - ZERO clinic encounter complete calls
// - Use Draft → calls onUseDraft() callback only (populates SOAP editor)
// - Reject Draft → clears volatile state, zero writes
// - Page reload → all AI material lost (intentional)
// ============================================================================

interface ClinicAiAssistPanelProps {
  context: ClinicStaffContext;
  encounterStatus: EncounterStatus | null;
  assignedStaffId: string | null;
  encounterReason?: string;
  onUseDraft: (draft: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  }) => void;
}

export const ClinicAiAssistPanel: React.FC<ClinicAiAssistPanelProps> = ({
  context,
  encounterStatus,
  assignedStaffId,
  encounterReason,
  onUseDraft,
}) => {
  // -------------------------------------------------------------------------
  // State — ALL volatile, held only in component memory
  // -------------------------------------------------------------------------
  const [aiState, setAiState] = useState<ClinicAiAssistState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recording
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('audio/webm');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);

  // Transcript
  const [transcript, setTranscript] = useState<string>('');

  // SOAP Draft
  const [draftForm, setDraftForm] = useState<ClinicSoapDraftResult>({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    warnings: [],
  });

  // Refs for MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // -------------------------------------------------------------------------
  // Browser Support Check
  // -------------------------------------------------------------------------
  const isBrowserSupported = typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices !== 'undefined'
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && typeof MediaRecorder !== 'undefined';

  // -------------------------------------------------------------------------
  // Cleanup on unmount — stop recording and release resources
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      stopAndCleanupRecording();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAndCleanupRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // -------------------------------------------------------------------------
  // Recording Handlers
  // -------------------------------------------------------------------------

  const handleStartRecording = useCallback(async () => {
    setErrorMessage(null);
    setAiState('requesting_microphone');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Determine best supported MIME
      let selectedMime = 'audio/webm';
      for (const mime of SUPPORTED_AUDIO_MIMES) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }
      setAudioMimeType(selectedMime);

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(selectedMime) ? selectedMime : undefined,
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: selectedMime });
        if (blob.size > 0 && blob.size <= MAX_AUDIO_PAYLOAD_BYTES) {
          setAudioBlob(blob);
          setAiState('recorded');
        } else if (blob.size > MAX_AUDIO_PAYLOAD_BYTES) {
          setErrorMessage(`Kayıt boyutu sınırı aşıldı (maks. ${Math.round(MAX_AUDIO_PAYLOAD_BYTES / 1024 / 1024)} MB).`);
          setAiState('error');
        } else {
          setErrorMessage('Ses kaydı boş. Lütfen tekrar deneyin.');
          setAiState('error');
        }
        // Release stream
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recorder.onerror = () => {
        setErrorMessage('Kayıt sırasında bir hata oluştu.');
        setAiState('error');
        stopAndCleanupRecording();
      };

      recorder.start(1000); // collect data every second
      startTimeRef.current = Date.now();
      setRecordingDuration(0);
      setAiState('recording');

      // Timer for duration display and max duration enforcement
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        setRecordingDuration(elapsed);

        if (elapsed >= MAX_RECORDING_DURATION_MS) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
      }, 500);
    } catch (err) {
      const isPermissionDenied = err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');

      setErrorMessage(
        isPermissionDenied
          ? 'Mikrofon erişim izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.'
          : 'Mikrofon erişimi sağlanamadı. Lütfen cihazınızı kontrol edin.'
      );
      setAiState('error');
      stopAndCleanupRecording();
    }
  }, [stopAndCleanupRecording]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleCancelRecording = useCallback(() => {
    stopAndCleanupRecording();
    setAudioBlob(null);
    setRecordingDuration(0);
    setTranscript('');
    setDraftForm({ subjective: '', objective: '', assessment: '', plan: '', warnings: [] });
    setErrorMessage(null);
    setAiState('idle');
  }, [stopAndCleanupRecording]);

  // -------------------------------------------------------------------------
  // Transcription Handler
  // -------------------------------------------------------------------------

  const handleTranscribe = useCallback(async () => {
    if (!audioBlob) return;
    setErrorMessage(null);
    setAiState('transcribing');

    const result = await requestTranscription(audioBlob, audioMimeType, 'tr');

    if (result.success && result.data) {
      setTranscript(result.data.transcript);
      setAiState('transcribed');
    } else {
      const errMsg = result.error?.code === 'AI_PROVIDER_NOT_CONFIGURED'
        ? 'AI sağlayıcısı yapılandırılmamış. Manuel SOAP girişi kullanılabilir.'
        : result.error?.message || 'Transkripsiyon başarısız oldu.';
      setErrorMessage(errMsg);
      setAiState('error');
    }
  }, [audioBlob, audioMimeType]);

  // -------------------------------------------------------------------------
  // SOAP Draft Handler
  // -------------------------------------------------------------------------

  const handleGenerateDraft = useCallback(async () => {
    if (!transcript.trim()) return;
    setErrorMessage(null);
    setAiState('drafting');

    const result = await requestSoapDraft(transcript, encounterReason);

    if (result.success && result.data) {
      setDraftForm({
        subjective: result.data.subjective,
        objective: result.data.objective,
        assessment: result.data.assessment,
        plan: result.data.plan,
        warnings: result.data.warnings || [],
      });
      setAiState('draft_ready');
    } else {
      const errMsg = result.error?.code === 'AI_PROVIDER_NOT_CONFIGURED'
        ? 'AI sağlayıcısı yapılandırılmamış. Manuel SOAP girişi kullanılabilir.'
        : result.error?.message || 'SOAP taslak oluşturma başarısız oldu.';
      setErrorMessage(errMsg);
      // Keep transcript available for retry
      setAiState('transcribed');
    }
  }, [transcript, encounterReason]);

  // -------------------------------------------------------------------------
  // Use Draft / Reject Draft — ZERO clinical writes
  // -------------------------------------------------------------------------

  const handleUseDraft = useCallback(() => {
    // Populate existing SOAP editor via callback — ZERO save calls
    onUseDraft({
      subjective: draftForm.subjective,
      objective: draftForm.objective,
      assessment: draftForm.assessment,
      plan: draftForm.plan,
    });

    // Clear volatile AI state
    setAudioBlob(null);
    setTranscript('');
    setDraftForm({ subjective: '', objective: '', assessment: '', plan: '', warnings: [] });
    setRecordingDuration(0);
    setErrorMessage(null);
    setAiState('idle');
  }, [draftForm, onUseDraft]);

  const handleRejectDraft = useCallback(() => {
    // Clear ALL volatile AI state — ZERO clinical writes
    setAudioBlob(null);
    setTranscript('');
    setDraftForm({ subjective: '', objective: '', assessment: '', plan: '', warnings: [] });
    setRecordingDuration(0);
    setErrorMessage(null);
    setAiState('idle');
  }, []);

  // -------------------------------------------------------------------------
  // Reset from error state
  // -------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    stopAndCleanupRecording();
    setAudioBlob(null);
    setTranscript('');
    setDraftForm({ subjective: '', objective: '', assessment: '', plan: '', warnings: [] });
    setRecordingDuration(0);
    setErrorMessage(null);
    setAiState('idle');
  }, [stopAndCleanupRecording]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // -------------------------------------------------------------------------
  // Render — Browser Not Supported
  // -------------------------------------------------------------------------

  if (!isBrowserSupported) {
    return (
      <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex items-center space-x-2">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Bu tarayıcı ses kaydını desteklemiyor. AI destekli dikte için güncel bir tarayıcı kullanın.</span>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="border border-purple-200 dark:border-purple-800/50 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase tracking-wider flex items-center space-x-2">
          <Sparkles className="h-4 w-4" />
          <span>AI Destekli Dikte</span>
        </h5>
        <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
          🤖 Hekim onayı gereklidir
        </span>
      </div>

      {/* Error Display */}
      {errorMessage && (
        <div className="p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-600 dark:text-red-400 flex items-start space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={handleReset}
              className="ml-2 text-red-700 dark:text-red-300 underline hover:no-underline font-semibold"
            >
              Sıfırla
            </button>
          </div>
        </div>
      )}

      {/* STATE: Idle */}
      {aiState === 'idle' && (
        <button
          type="button"
          onClick={handleStartRecording}
          className="w-full inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Mic className="h-4 w-4" />
          <span>Dikteye Başla</span>
        </button>
      )}

      {/* STATE: Requesting Microphone */}
      {aiState === 'requesting_microphone' && (
        <div className="flex items-center justify-center space-x-2 text-xs text-purple-600 dark:text-purple-400 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Mikrofon izni bekleniyor...</span>
        </div>
      )}

      {/* STATE: Recording */}
      {aiState === 'recording' && (
        <div className="space-y-3">
          <div className="flex items-center justify-center space-x-3 py-2">
            <div className="relative">
              <Volume2 className="h-5 w-5 text-red-500 animate-pulse" />
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-red-500 rounded-full animate-ping" />
            </div>
            <span className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
              {formatDuration(recordingDuration)}
            </span>
            <span className="text-[10px] text-slate-500">
              / {formatDuration(MAX_RECORDING_DURATION_MS)}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleStopRecording}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-xl font-bold text-xs text-white bg-red-600 hover:bg-red-700 transition-colors shadow-sm"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Durdur</span>
            </button>
            <button
              type="button"
              onClick={handleCancelRecording}
              className="inline-flex items-center justify-center px-3 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span className="ml-1">İptal</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE: Recorded — ready for transcription */}
      {aiState === 'recorded' && (
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-400">
            <MicOff className="h-4 w-4" />
            <span>Kayıt tamamlandı ({formatDuration(recordingDuration)})</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleTranscribe}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-xl font-bold text-xs text-white bg-purple-600 hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Metne Dönüştür</span>
            </button>
            <button
              type="button"
              onClick={handleCancelRecording}
              className="inline-flex items-center justify-center px-3 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="ml-1">Sil</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE: Transcribing */}
      {aiState === 'transcribing' && (
        <div className="flex items-center justify-center space-x-2 text-xs text-purple-600 dark:text-purple-400 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Ses metne dönüştürülüyor...</span>
        </div>
      )}

      {/* STATE: Transcribed — editable transcript + generate draft */}
      {aiState === 'transcribed' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Transkript (düzenlenebilir)
            </label>
            <textarea
              rows={4}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              placeholder="AI tarafından oluşturulan transkript..."
            />
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={!transcript.trim()}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-xl font-bold text-xs text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>SOAP Taslağı Oluştur</span>
            </button>
            <button
              type="button"
              onClick={handleCancelRecording}
              className="inline-flex items-center justify-center px-3 py-2 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="ml-1">Sil</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE: Drafting */}
      {aiState === 'drafting' && (
        <div className="flex items-center justify-center space-x-2 text-xs text-purple-600 dark:text-purple-400 py-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>SOAP taslağı oluşturuluyor...</span>
        </div>
      )}

      {/* STATE: Draft Ready — editable SOAP fields + Use/Reject */}
      {aiState === 'draft_ready' && (
        <div className="space-y-3">
          {/* AI Safety Warning */}
          <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-[10px] text-amber-700 dark:text-amber-400 flex items-start space-x-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>AI tarafından oluşturulan taslak — hekim incelemesi ve onayı zorunludur. Bu bir kesinleşmiş tıbbi kayıt değildir.</span>
          </div>

          {/* Draft Warnings from Provider */}
          {draftForm.warnings && draftForm.warnings.length > 0 && (
            <div className="p-2 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg text-[10px] text-orange-700 dark:text-orange-400">
              {draftForm.warnings.map((w, i) => (
                <div key={i} className="flex items-start space-x-1">
                  <span>⚠️</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Editable SOAP Fields */}
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div>
              <label className="block font-bold text-purple-700 dark:text-purple-300 mb-1 text-[11px]">
                S - Subjective (AI Taslak)
              </label>
              <textarea
                rows={2}
                value={draftForm.subjective}
                onChange={(e) => setDraftForm({ ...draftForm, subjective: e.target.value })}
                className="w-full p-2 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-purple-700 dark:text-purple-300 mb-1 text-[11px]">
                O - Objective (AI Taslak)
              </label>
              <textarea
                rows={2}
                value={draftForm.objective}
                onChange={(e) => setDraftForm({ ...draftForm, objective: e.target.value })}
                className="w-full p-2 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-purple-700 dark:text-purple-300 mb-1 text-[11px]">
                A - Assessment (AI Taslak)
              </label>
              <textarea
                rows={2}
                value={draftForm.assessment}
                onChange={(e) => setDraftForm({ ...draftForm, assessment: e.target.value })}
                className="w-full p-2 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-bold text-purple-700 dark:text-purple-300 mb-1 text-[11px]">
                P - Plan (AI Taslak)
              </label>
              <textarea
                rows={2}
                value={draftForm.plan}
                onChange={(e) => setDraftForm({ ...draftForm, plan: e.target.value })}
                className="w-full p-2 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={handleUseDraft}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-xl font-bold text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Taslağı Kullan</span>
            </button>
            <button
              type="button"
              onClick={handleRejectDraft}
              className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 rounded-xl font-bold text-xs text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Taslağı Reddet</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
