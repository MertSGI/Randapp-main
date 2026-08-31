/**
 * Grounding & Provider Execution Policy for ht-ai-chat Edge Function
 */

/** Deterministic Grounding Guard Helper */
export function isProviderReplyGrounded(reply: string): boolean {
  const lower = reply.toLowerCase();

  // Affirmative/predictive coordinator contact promises or timeline/channel promises
  const coordinatorContactPromises = [
    /coordinator\s+(will|shall|is\s+going\s+to)\s+(contact|reach\s+out|review|call|email)/u,
    /our\s+team\s+will\s+(contact|reach\s+out|review|call|email)/u,
    /will\s+reach\s+out(?:\s+to\s+you)?\s+usually\s+by/u,
    /usually\s+by\s+(email|phone|whatsapp)/u,
    /reach\s+out(?:\s+to\s+you)?\s+by\s+(email|phone|whatsapp)/u,
    /koordinasyon\s+ekibimize\s+ileteceğim/u,
    /koordinasyon\s+ekibi\s+sizinle\s+iletişime\s+geçecek/u,
    /genellikle\s+e-posta\s+veya\s+telefon/u,
    /e-posta\s+veya\s+telefonla\s+iletişim/u,
    /hizmet\s+sağlayıcılarla\s+iletişim/u,
    /koordinationsteam\s+kontaktiert\s+sie/u,
    /an\s+unser\s+koordinationsteam\s+weiterleiten/u,
    /передам\s+.*координатору/u,
    /координаторы\s+.*свяжутся/u,
    /إرسال\s+الطلب|تمرير\s+الطلب/u,
    /سيتواصل\s+معك\s+المنسق/u,
  ];

  if (coordinatorContactPromises.some(pattern => pattern.test(lower))) {
    return false;
  }

  // Bounded regex patterns for forbidden provider assertions with Unicode-aware boundaries
  const forbiddenPatterns = [
    // 1. Passport / ID / Document processing or requirements assertions
    /(?<!\p{L})passport(?!\p{L})/u,
    /(?<!\p{L})pasaport(?!\p{L})/u,
    /(?<!\p{L})паспорт(?!\p{L})/u,
    /(?<!\p{L})جواز(?!\p{L})/u,
    /(?<!\p{L})reisepass(?!\p{L})/u,
    /upload\s+document/u,
    /upload\s+report/u,
    /upload\s+file/u,
    /send\s+your\s+reports/u,
    /send\s+your\s+documents/u,
    /providing\s+information\s+packets/u,
    /formal\s+request\s+process/u,
    /additional\s+documents\s+may\s+be\s+needed/u,
    /gerekli\s+belgeler/u,
    /randevu\s+talebi\s+formu/u,
    /zusätzliche\s+unterlagen/u,
    /дополнительные\s+(сведения|документы)\s+потребуются/u,
    /المستندات\s+المطلوبة/u,

    // 2. Visa processing assertions
    /visa\s+processing/u,
    /process\s+your\s+visa/u,
    /vize\s+işle/u,
    /оформим\s+визу/u,
    /معالجة\s+التأشيرة/u,
    /visum\s+bearbeiten/u,

    // 3. Flight / Hotel / Accommodation booking assertions
    /book\s+your\s+flight/u,
    /book\s+your\s+hotel/u,
    /uçak\s+biletiniz/u,
    /oteliniz/u,
    /забронируем\s+отель/u,
    /حجز\s+فندق/u,
    /konaklama\s+ve\s+ulaşım/u,
    /reiseplanungen/u,

    // 4. Airport transfer / logistics arrangement assertions
    /arrange\s+your\s+transfer/u,
    /arrange\s+transfer/u,
    /transferinizi\s+ayarla/u,
    /организуем\s+трансфер/u,
    /ترتيب\s+المواصلات/u,
    /transfer\s+arrangieren/u,
    /logistics\s*\/\s*transfer\s*\/\s*travel\s+planning/u,
    /lojistik\s+planı/u,
    /трансфер/u,
    /логистика/u,
    /النقل\s*\/\s*الخدمات\s+اللوجستية/u,

    // 5. Payment / Deposit / Financial plan assertions
    /(?<!\p{L})deposit(?!\p{L})/u,
    /(?<!\p{L})depozito(?!\p{L})/u,
    /(?<!\p{L})депозит(?!\p{L})/u,
    /(?<!\p{L})عربون(?!\p{L})/u,
    /payment\s+plan/u,
    /ödeme\s+planı/u,

    // 6. Automatic SMS / WhatsApp / Email confirmation assertions
    /automatic\s+sms/u,
    /automatic\s+whatsapp/u,
    /automatic\s+email/u,
    /otomatik\s+sms/u,
    /otomatik\s+whatsapp/u,
    /otomatik\s+e-posta/u,

    // 7. Automatic clinic matching assertions
    /automatically\s+match/u,
    /otomatik\s+eşleştir/u,

    // 8. Partner clinic forwarding / sending assertions
    /partner\s+clinic/u,
    /partner\s+klinik/u,
    /partnerklinik/u,
    /клиники-партнёры/u,
    /клиникам-партнёрам/u,
    /العيادات\s+الشريكة/u,
    /send\s+your\s+inquiry\s+to\s+our\s+partner/u,
    /forward\s+your\s+inquiry\s+to\s+our\s+partner/u,
    /forward\s+it\s+for\s+you/u,
    /talebinizi\s+partner\s+klinik/u,
    /направим\s+ваш\s+запрос/u,
    /إرسال\s+طلبك/u,

    // 9. Appointment / Consultation booking or scheduling assertions
    /schedule\s+a\s+consultation/u,
    /schedule\s+your\s+appointment/u,
    /book\s+a\s+consultation/u,
    /book\s+your\s+appointment/u,
    /randevunuzu\s+ayarla/u,
    /randevu\s+oluştur/u,
    /назначим\s+консультацию/u,
    /запишем\s+на\s+приём/u,
    /نحدد\s+لك\s+موعد/u,
    /حجز\s+موعد\s+استشارة/u,
    /vereinbaren\s+einen\s+termin/u,

    // 10. Guaranteed response time, concrete logistics plan, quote or additional services promises
    /guarantee\s+response/u,
    /guaranteed\s+quote/u,
    /guaranteed\s+price/u,
    /logistics\s+plan\s+will\s+be\s+created/u,
    /дополнительные\s+услуги/u
  ];

  if (forbiddenPatterns.some(pattern => pattern.test(lower))) {
    return false;
  }

  // General phrase checks for unsupported operational claims
  if (lower.includes('partner clinic') || lower.includes('partner-klinik') || lower.includes('partnerklinik')) return false;
  if (lower.includes('schedule a consultation') || lower.includes('randevunuzu ayarlayacağız') || lower.includes('vereinbaren einen termin')) return false;
  if (lower.includes('направим ваш запрос в клиники') || lower.includes('سنرسل طلبك إلى العيادات')) return false;

  return true;
}

/** Localized Grounded Replacement Helper */
export function buildGroundedReplacementResponse(language: string): string {
  switch (language) {
    case "tr":
      return "Talebinizi özetlememe, iletişim ve dil tercihlerinizi almanıza ve bir insan koordinatör yönlendirmesi talep etmenize yardımcı olabilirim. Desteklenmeyen operasyonel hizmetleri bu asistan üzerinden doğrudan teyit edemiyorum.";
    case "de":
      return "Ich kann Ihnen helfen, Ihre Anfrage zusammenzufassen, Ihre Kontakt- und Sprachpräferenzen aufzunehmen und eine Weiterleitung an einen Koordinator anzufragen. Nicht unterstützte operative Dienstleistungen kann ich über diesen Assistenten nicht direkt bestätigen.";
    case "ru":
      return "Я могу помочь вам составить описание запроса, зафиксировать ваши контактные данные и языковые предпочтения, а также запросить передачу координатору. Неподдерживаемые операционные услуги не могут быть подтверждены через этого ассистента.";
    case "ar":
      return "يمكنني مساعدتك في تلخيص طلبك وتسجيل تفضيلات التواصل واللغة وطلب التوصيل بمنسق الخدمة. لا يمكنني تأكيد الخدمات التشغيلية غير المدعومة من خلال هذا المساعد مباشرة.";
    default:
      return "I can help summarize your inquiry, collect your contact and language preferences, and request a human coordinator handoff. I cannot confirm unsupported operational capabilities directly through this assistant.";
  }
}

/** Executable Provider Fetch Logic for unit testing and index.ts */
export interface ProviderFetchConfig {
  aiApiKey?: string;
  aiProvider?: string;
  aiModel?: string;
  preferredLanguage?: string;
  message: string;
  conversationMessages?: Array<{ role: string; content: string }>;
  fetchImpl?: typeof fetch;
  buildSystemPrompt: (lang: string) => string;
}

export interface ProviderFetchResult {
  success: boolean;
  rawReply?: string;
  errorCode?: string;
  errorMessage?: string;
  statusCode?: number;
}

export async function executeProviderCall(config: ProviderFetchConfig): Promise<ProviderFetchResult> {
  const {
    aiApiKey,
    aiProvider = "groq",
    aiModel = "llama-3.1-70b-versatile",
    preferredLanguage = "en",
    message,
    conversationMessages = [],
    fetchImpl = globalThis.fetch,
    buildSystemPrompt
  } = config;

  if (!aiApiKey) {
    return {
      success: false,
      errorCode: "AI_PROVIDER_UNAVAILABLE",
      errorMessage: "AI provider service is currently unavailable.",
      statusCode: 503
    };
  }

  try {
    const systemPrompt = buildSystemPrompt(preferredLanguage);
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...conversationMessages.filter(m => m.role !== "system").slice(-10),
      { role: "user", content: message.trim() },
    ];

    const apiUrl = aiProvider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";

    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages: chatMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        errorCode: "AI_PROVIDER_UNAVAILABLE",
        errorMessage: "AI provider service returned an error.",
        statusCode: 503
      };
    }

    const data = await response.json();
    const choice = data?.choices?.[0]?.message?.content;

    if (choice && typeof choice === "string" && choice.trim().length > 0) {
      return {
        success: true,
        rawReply: choice.trim()
      };
    } else {
      return {
        success: false,
        errorCode: "AI_PROVIDER_UNAVAILABLE",
        errorMessage: "AI provider returned empty content.",
        statusCode: 503
      };
    }
  } catch (e: any) {
    return {
      success: false,
      errorCode: "AI_PROVIDER_UNAVAILABLE",
      errorMessage: e?.message || "AI provider fetch failed.",
      statusCode: 503
    };
  }
}
