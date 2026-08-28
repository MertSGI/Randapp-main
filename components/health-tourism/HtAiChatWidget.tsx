import React, { useState, useRef, useEffect } from 'react';
import { HealthTourismAiService } from '../../utils/healthTourismAiService';
import { HtAiChatResponse } from '../../types/healthTourismAi';
import { MessageCircle, Send, X, User, Bot, ArrowRightLeft } from 'lucide-react';

interface Props {
  tenantSlug: string;
  preferredLanguage: string;
  translations: {
    chatTitle: string;
    chatPlaceholder: string;
    chatSend: string;
    chatHandoff: string;
    chatWelcome: string;
    chatMedicalDisclaimer: string;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const aiService = new HealthTourismAiService();

/**
 * HtAiChatWidget — Public AI chat widget for Health Tourism landing page.
 *
 * All messages flow through the ht-ai-chat Edge Function.
 * NEVER writes directly to ht_ai_conversations or ht_ai_messages.
 *
 * Medical safety: Defers medical questions to human coordinators.
 * AI summary is explicitly labeled as assistive, not verified clinical fact.
 */
export const HtAiChatWidget: React.FC<Props> = ({ tenantSlug, preferredLanguage, translations }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [handoffTriggered, setHandoffTriggered] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      timestamp: new Date(),
    }]);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || sending || handoffTriggered) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    addMessage('user', userMessage);
    setSending(true);

    try {
      const response: HtAiChatResponse = await aiService.sendMessage({
        session_token: sessionToken || undefined,
        message: userMessage,
        tenant_slug: tenantSlug,
        preferred_language: preferredLanguage,
      });

      if (response.success) {
        if (response.session_token) {
          setSessionToken(response.session_token);
        }
        if (response.reply) {
          addMessage('assistant', response.reply);
        }
        if (response.handoff_triggered) {
          setHandoffTriggered(true);
        }
      } else {
        addMessage('assistant', response.error?.message || 'Üzgünüz, bir hata oluştu. Lütfen daha sonra tekrar deneyin.');
      }
    } catch {
      addMessage('assistant', 'Bağlantı hatası. Lütfen daha sonra tekrar deneyin.');
    }

    setSending(false);
  };

  const handleHandoff = async () => {
    if (!sessionToken) return;
    setSending(true);

    try {
      const response = await aiService.requestHumanHandoff(sessionToken, tenantSlug, 'user_requested');
      if (response.success && response.reply) {
        addMessage('assistant', response.reply);
      }
      setHandoffTriggered(true);
    } catch {
      addMessage('assistant', 'Bağlantı hatası.');
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center"
        title={translations.chatTitle}
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] max-h-[520px] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white">
        <div className="flex items-center space-x-2">
          <Bot className="h-5 w-5" />
          <span className="text-sm font-bold">{translations.chatTitle}</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Medical disclaimer */}
      <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/30">
        <p className="text-[9px] text-amber-700 dark:text-amber-300 text-center leading-tight">
          {translations.chatMedicalDisclaimer}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[340px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Bot className="h-10 w-10 mx-auto text-teal-400 mb-2" />
            <p className="text-xs text-slate-500 dark:text-slate-400">{translations.chatWelcome}</p>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex items-start space-x-2 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
          >
            <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
              msg.role === 'user'
                ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300'
            }`}>
              {msg.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            </div>
            <div className={`max-w-[260px] px-3 py-2 rounded-xl text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-500 text-white rounded-tr-sm'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-start space-x-2">
            <div className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Bot className="h-3 w-3 text-slate-400 animate-pulse" />
            </div>
            <div className="bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded-xl rounded-tl-sm">
              <div className="flex space-x-1">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-200 dark:border-slate-700 p-2">
        {handoffTriggered ? (
          <div className="text-center py-2 px-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
            <p className="text-[10px] text-green-700 dark:text-green-300 font-medium">
              ✓ Bir koordinatör en kısa sürede sizinle iletişime geçecektir.
            </p>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={handleHandoff}
              disabled={!sessionToken || sending}
              className="flex-shrink-0 p-2 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors disabled:opacity-30"
              title={translations.chatHandoff}
            >
              <ArrowRightLeft className="h-4 w-4" />
            </button>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={translations.chatPlaceholder}
              disabled={sending}
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || sending}
              className="flex-shrink-0 p-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
