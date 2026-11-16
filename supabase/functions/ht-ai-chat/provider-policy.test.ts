import { assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  isProviderReplyGrounded,
  buildGroundedReplacementResponse,
  executeProviderCall,
  resolveHtAiProviderConfig
} from "./provider-policy.ts";

function fakeBuildSystemPrompt(lang: string): string {
  return `System prompt for ${lang}`;
}

// 1. Observed Runtime Hallucination Regressions (10 cases: EN>=2, TR>=2, DE>=2, RU>=2, AR>=2)
Deno.test("isProviderReplyGrounded — Observed Runtime Unsafe Regressions", () => {
  const unsafeRegressions = [
    // EN
    { lang: 'en', reply: "I can forward it for you to our team." },
    { lang: 'en', reply: "A coordinator will review your request and reach out—usually by email or phone." },
    { lang: 'en', reply: "We provide information packets and guide you through the formal request process." },
    { lang: 'en', reply: "Additional documents may be needed before our partner clinics schedule your transfer." },

    // TR
    { lang: 'tr', reply: "Talebinizi koordinasyon ekibimize ileteceğim ve ekibimiz sizinle iletişime geçecek." },
    { lang: 'tr', reply: "Genellikle e-posta veya telefonla iletişim kurarak gerekli belgeler ve konaklama ve ulaşım lojistik planı sunacaktır." },
    { lang: 'tr', reply: "Hizmet sağlayıcılarla iletişim için randevu talebi formu doldurmanız gerekir." },

    // DE
    { lang: 'de', reply: "Wir werden Ihre Anfrage an unser Koordinationsteam weiterleiten. Das Koordinationsteam kontaktiert Sie in Kürze." },
    { lang: 'de', reply: "Zusätzliche Unterlagen werden für unsere Partnerkliniken benötigt für Logistik, Transfers und Reiseplanungen." },

    // RU
    { lang: 'ru', reply: "Я передам ваше обращение координатору. Координаторы свяжутся с вами в ближайшее время." },
    { lang: 'ru', reply: "Наши клиники-партнёры требуют дополнительные сведения/документы потребуются для организации трансфера и логистики." },

    // AR
    { lang: 'ar', reply: "سنقوم بـ إرسال الطلب وتمرير الطلب وسيتواصل معك المنسق من العيادات الشريكة." },
    { lang: 'ar', reply: "يتطلب تحديد حجز موعد استشارة وتوفير النقل الخدمات اللوجستية وتجهيز المستندات المطلوبة." }
  ];

  for (const c of unsafeRegressions) {
    const grounded = isProviderReplyGrounded(c.reply);
    assert(!grounded, `Unsafe regression [${c.lang}] must be rejected: ${c.reply}`);
  }
});

// 2. Unexecuted Forwarding Claim Grounding Tests (Unsafe & Safe)
Deno.test("isProviderReplyGrounded — Unexecuted Forwarding Claim Regressions (Unsafe)", () => {
  const unsafeForwardingCases = [
    { lang: 'en', reply: "I can capture your question and forward it to a human coordinator who can provide details." },
    { lang: 'en', reply: "I will forward your request to a coordinator right away." },
    { lang: 'en', reply: "I've sent your inquiry to our coordinator for further assistance." },
    { lang: 'en', reply: "I'm forwarding your request now to the team." },
    { lang: 'tr', reply: "Talebinizi koordinasyon ekibimize ileteceğim." },
    { lang: 'de', reply: "Wir werden Ihre Anfrage an unser Koordinationsteam weiterleiten." }
  ];

  for (const c of unsafeForwardingCases) {
    const grounded = isProviderReplyGrounded(c.reply);
    assert(!grounded, `Unsafe forwarding claim [${c.lang}] must be rejected: ${c.reply}`);
  }
});

Deno.test("isProviderReplyGrounded — Safe Allowed Coordinator Language", () => {
  const safeCases = [
    { lang: 'en', reply: "I can help summarize your inquiry, collect your contact and language preferences, and request a human coordinator handoff." },
    { lang: 'en', reply: "I can request a human coordinator handoff." },
    { lang: 'en', reply: "I can help you request a human coordinator." },
    { lang: 'en', reply: "I can collect your details for a handoff request." },
    { lang: 'en', reply: "I can prepare an assistive summary for human coordinator review if you wish." },
    { lang: 'tr', reply: "Talebinizi özetlememe ve bir insan koordinatör yönlendirmesi talep etmenize yardımcı olabilirim." },
    { lang: 'de', reply: "Ich kann Ihre Anfrage zusammenfassen und eine Weiterleitung an einen Koordinator anzufragen." },
    { lang: 'ru', reply: "Я могу помочь составить описание запроса и запросить передачу координатору." },
    { lang: 'ar', reply: "يمكنني مساعدتك في تلخيص طلبك وطلب التوصيل بمنسق الخدمة." }
  ];

  for (const c of safeCases) {
    const grounded = isProviderReplyGrounded(c.reply);
    assert(grounded, `Safe coordinator language [${c.lang}] must be accepted: ${c.reply}`);
  }
});

// 3. Executable Provider Failure Path Tests (PF01, PF02, PF03, PF04)
Deno.test("executeProviderCall — PF01: Missing API Key", async () => {
  const res = await executeProviderCall({
    aiApiKey: undefined,
    message: "Test message",
    buildSystemPrompt: fakeBuildSystemPrompt
  });
  assert(!res.success);
  assert(res.statusCode === 503);
  assert(res.errorCode === "AI_PROVIDER_UNAVAILABLE");
  assert(res.errorMessage === "AI provider service is currently unavailable.");
});

Deno.test("executeProviderCall — PF02: Fetch Exception with Sentinel Leak Assertion", async () => {
  const sentinelError = "LARI_INTERNAL_PROVIDER_DETAIL_MUST_NOT_LEAK";
  const mockFetch = (): Promise<Response> => {
    throw new Error(sentinelError);
  };

  const res = await executeProviderCall({
    aiApiKey: "mock-key",
    message: "Test message",
    fetchImpl: mockFetch as unknown as typeof fetch,
    buildSystemPrompt: fakeBuildSystemPrompt
  });
  assert(!res.success);
  assert(res.statusCode === 503);
  assert(res.errorCode === "AI_PROVIDER_UNAVAILABLE");
  assert(!res.errorMessage?.includes(sentinelError), "Sentinel exception detail must not leak");
  assert(res.errorMessage === "AI provider service is currently unavailable.");
});

Deno.test("executeProviderCall — PF03: Provider HTTP Non-2xx (500)", async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  };

  const res = await executeProviderCall({
    aiApiKey: "mock-key",
    message: "Test message",
    fetchImpl: mockFetch as unknown as typeof fetch,
    buildSystemPrompt: fakeBuildSystemPrompt
  });
  assert(!res.success);
  assert(res.statusCode === 503);
  assert(res.errorCode === "AI_PROVIDER_UNAVAILABLE");
  assert(res.errorMessage === "AI provider service is currently unavailable.");
});

Deno.test("executeProviderCall — PF04: Empty Assistant Content", async () => {
  const mockFetch = async (): Promise<Response> => {
    return new Response(JSON.stringify({ choices: [{ message: { content: "   " } }] }), { status: 200 });
  };

  const res = await executeProviderCall({
    aiApiKey: "mock-key",
    message: "Test message",
    fetchImpl: mockFetch as unknown as typeof fetch,
    buildSystemPrompt: fakeBuildSystemPrompt
  });
  assert(!res.success);
  assert(res.statusCode === 503);
  assert(res.errorCode === "AI_PROVIDER_UNAVAILABLE");
  assert(res.errorMessage === "AI provider service is currently unavailable.");
});

// 4. Explicit Allowlisted Provider Selection & Unknown Provider Fail-Closed Tests
Deno.test("resolveHtAiProviderConfig — selects provider-specific key only and rejects unknown provider", () => {
  const bothKeys = {
    GROQ_API_KEY: "groq-only-key",
    OPENAI_API_KEY: "openai-only-key",
  };

  const openaiSelected = resolveHtAiProviderConfig((k) =>
    k === "HT_AI_CHAT_PROVIDER" ? "openai" : bothKeys[k as keyof typeof bothKeys]
  );
  assert(openaiSelected.supported === true);
  assert(openaiSelected.provider === "openai");
  assert(openaiSelected.apiKey === "openai-only-key");

  const groqSelected = resolveHtAiProviderConfig((k) =>
    k === "HT_AI_CHAT_PROVIDER" ? "groq" : bothKeys[k as keyof typeof bothKeys]
  );
  assert(groqSelected.supported === true);
  assert(groqSelected.provider === "groq");
  assert(groqSelected.apiKey === "groq-only-key");

  // Missing OPENAI_API_KEY must NEVER fall back to GROQ_API_KEY
  const missingOpenAi = resolveHtAiProviderConfig((k) =>
    k === "HT_AI_CHAT_PROVIDER" ? "openai" : k === "GROQ_API_KEY" ? "groq-only-key" : undefined
  );
  assert(missingOpenAi.supported === true);
  assert(missingOpenAi.provider === "openai");
  assert(missingOpenAi.apiKey === undefined);

  // Unknown/typo provider fails closed
  const typoProvider = resolveHtAiProviderConfig((k) =>
    k === "HT_AI_CHAT_PROVIDER" ? "grok" : bothKeys[k as keyof typeof bothKeys]
  );
  assert(typoProvider.supported === false);
  assert(typoProvider.apiKey === undefined);
});

Deno.test("executeProviderCall — rejects unknown/typo provider before fetch", async () => {
  let fetchCalled = false;
  const mockFetch = async (): Promise<Response> => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  };

  const res = await executeProviderCall({
    aiApiKey: "some-key",
    aiProvider: "grok",
    message: "Test message",
    fetchImpl: mockFetch as unknown as typeof fetch,
    buildSystemPrompt: fakeBuildSystemPrompt,
  });

  assert(!fetchCalled, "Unknown/typo provider must NEVER invoke fetch");
  assert(!res.success);
  assert(res.statusCode === 503);
  assert(res.errorCode === "AI_PROVIDER_UNAVAILABLE");
});
