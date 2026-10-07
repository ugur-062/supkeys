/**
 * Sağlayıcı hatası → temizlenmiş sebep kodu (canlı öncesi sağlamlaştırma,
 * 2026-10-07). Staging'deki 502'ler teşhis edilemiyordu: kullanım kaydında
 * yalnız `provider_error` vardı. Sebep kodu HTTP durumunu ve Google hata
 * durumunu taşır; serbest metin ve sır ASLA taşımaz.
 */
const mockGenerateContent = jest.fn();

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  ThinkingLevel: { MINIMAL: "MINIMAL", LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
}));

import { GeminiProvider } from "../../src/modules/ai/providers/gemini.provider";
import { AiProviderError } from "../../src/modules/ai/providers/ai-provider.interface";
import {
  PROVIDER_REASON_MAX_LENGTH,
  providerFailureReason,
  sanitizeProviderReason,
} from "../../src/modules/ai/providers/ai-provider-reason";

// Parçalı yazım: sır tarayıcısı (gitleaks) sahte anahtarı gerçek sanmasın.
const SECRET_KEY = ["AIza", "SyD-FAKE-fixture-key-0123456789abcdef"].join("");

/** @google/genai ApiError biçimi: message = JSON gövde, status = HTTP durumu. */
function apiError(status: number, body: object): Error {
  const e = new Error(JSON.stringify(body)) as Error & { status: number };
  e.name = "ApiError";
  e.status = status;
  return e;
}

describe("providerFailureReason", () => {
  it("staging vakası: AI Studio veri merkezi IP'sini reddeder → 400 FAILED_PRECONDITION + ipucu", () => {
    const err = apiError(400, {
      error: { code: 400, message: "User location is not supported for the API use.", status: "FAILED_PRECONDITION" },
    });
    expect(providerFailureReason(err)).toBe("http_400:FAILED_PRECONDITION:location_not_supported");
  });

  it("geçersiz anahtar: ayrıntı sebebi (API_KEY_INVALID) alınır, ANAHTAR alınmaz", () => {
    const err = apiError(400, {
      error: {
        code: 400,
        message: `API key not valid. Please pass a valid API key. key=${SECRET_KEY}`,
        status: "INVALID_ARGUMENT",
        details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID", domain: "googleapis.com" }],
      },
    });
    const reason = providerFailureReason(err);
    expect(reason).toBe("http_400:INVALID_ARGUMENT:API_KEY_INVALID");
    expect(reason).not.toContain("AIza");
  });

  it("Vertex yetki / API kapalı / model yok / kota", () => {
    expect(
      providerFailureReason(
        apiError(403, {
          error: { code: 403, message: "Permission 'aiplatform.endpoints.predict' denied on resource", status: "PERMISSION_DENIED" },
        }),
      ),
    ).toBe("http_403:PERMISSION_DENIED");
    expect(
      providerFailureReason(
        apiError(403, {
          error: {
            code: 403,
            message: "Vertex AI API has not been used in project 123456 before or it is disabled.",
            status: "PERMISSION_DENIED",
            details: [{ reason: "SERVICE_DISABLED" }],
          },
        }),
      ),
    ).toBe("http_403:PERMISSION_DENIED:SERVICE_DISABLED:api_disabled");
    expect(
      providerFailureReason(
        apiError(404, {
          error: { code: 404, message: "Publisher Model `gemini-flash-latest` not found.", status: "NOT_FOUND" },
        }),
      ),
    ).toBe("http_404:NOT_FOUND:model_not_found");
    expect(
      providerFailureReason(
        apiError(429, { error: { code: 429, message: "Quota exceeded for metric", status: "RESOURCE_EXHAUSTED" } }),
      ),
    ).toBe("http_429:RESOURCE_EXHAUSTED:quota");
  });

  it("akış biçimi (`got status: 503. {...}`) ve durum alanı olmayan hata", () => {
    const err = new Error(
      'got status: 503 . {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
    );
    expect(providerFailureReason(err)).toBe("http_503:UNAVAILABLE:overloaded");
  });

  it("service account reddi (google-auth-library) ve ağ hatası", () => {
    expect(providerFailureReason(new Error("invalid_grant: Invalid JWT Signature."))).toBe("oauth_invalid_grant");
    const net = new TypeError("fetch failed") as TypeError & { cause?: unknown };
    net.cause = { code: "ENOTFOUND", hostname: "generativelanguage.googleapis.com" };
    expect(providerFailureReason(net)).toBe("net_ENOTFOUND:fetch_failed");
  });

  it("tanınmayan / boş / Error olmayan → 'unknown' (fırlatmaz)", () => {
    expect(providerFailureReason(new Error("bir şeyler ters gitti"))).toBe("unknown");
    expect(providerFailureReason(undefined)).toBe("unknown");
    expect(providerFailureReason(null)).toBe("unknown");
    expect(providerFailureReason({})).toBe("unknown");
  });

  it("SIZINTI YOK: serbest metin, anahtar, e-posta, proje kimliği çıktıya girmez; biçim ve uzunluk sabit", () => {
    const hostile = apiError(400, {
      error: {
        code: 400,
        message: `Bearer ya29.SECRET-token key=${SECRET_KEY} kullanici@firma.com proje=rothern-prod-123 "status":"${"X".repeat(200)}"`,
        status: "INVALID_ARGUMENT",
        details: [{ reason: `${SECRET_KEY}` }, { reason: "lowercase_secret_value" }],
      },
    });
    const reason = providerFailureReason(hostile);
    expect(reason).toBe("http_400:INVALID_ARGUMENT");
    expect(reason).toMatch(/^[A-Za-z0-9_:]+$/);
    expect(reason.length).toBeLessThanOrEqual(PROVIDER_REASON_MAX_LENGTH);
  });

  it("geçersiz status alanı (aralık dışı / sayı değil) yok sayılır", () => {
    const e = new Error("x") as Error & { status: unknown };
    e.status = 99999;
    expect(providerFailureReason(e)).toBe("unknown");
    e.status = "400; DROP";
    expect(providerFailureReason(e)).toBe("unknown");
  });
});

describe("sanitizeProviderReason", () => {
  it("izinli karakterler dışını atar, kırpar; boş → undefined", () => {
    expect(sanitizeProviderReason("http_400:FAILED_PRECONDITION")).toBe("http_400:FAILED_PRECONDITION");
    expect(sanitizeProviderReason("http_400 <script>'; DROP--")).toBe("http_400scriptDROP");
    expect(sanitizeProviderReason("a".repeat(500))).toHaveLength(PROVIDER_REASON_MAX_LENGTH);
    expect(sanitizeProviderReason("")).toBeUndefined();
    expect(sanitizeProviderReason("  ")).toBeUndefined();
    expect(sanitizeProviderReason(undefined)).toBeUndefined();
    expect(sanitizeProviderReason(null)).toBeUndefined();
  });
});

describe("GeminiProvider — hata sebebi AiProviderError.reason'a taşınır", () => {
  beforeEach(() => mockGenerateContent.mockReset());

  it("kalıcı 400 (yedek model de reddeder) → reason = http_400:FAILED_PRECONDITION:location_not_supported", async () => {
    const provider = new GeminiProvider({ apiKey: "test-anahtar-fixture-uzun" });
    mockGenerateContent.mockRejectedValue(
      apiError(400, {
        error: { code: 400, message: "User location is not supported for the API use.", status: "FAILED_PRECONDITION" },
      }),
    );
    const err = await provider
      .complete({ model: "gemini-flash-latest", prompt: "test", maxOutputTokens: 64, timeoutMs: 5_000 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("provider_error");
    expect((err as AiProviderError).reason).toBe("http_400:FAILED_PRECONDITION:location_not_supported");
  });

  it("403 → reason = http_403:PERMISSION_DENIED (retry yok)", async () => {
    const provider = new GeminiProvider({ apiKey: "test-anahtar-fixture-uzun" });
    mockGenerateContent.mockRejectedValue(
      apiError(403, { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } }),
    );
    const err = await provider
      .complete({ model: "gemini-pro-latest", prompt: "test", maxOutputTokens: 64, timeoutMs: 5_000 })
      .catch((e: unknown) => e);
    expect((err as AiProviderError).reason).toBe("http_403:PERMISSION_DENIED");
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});
