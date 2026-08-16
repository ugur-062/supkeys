/**
 * Gemini kapasite fallback'i: flash sınıfı 503 "high demand" ile retry'ları
 * tüketince aynı istek bir kez flash-lite ile denenir; pro'ya yedek yok,
 * geçici olmayan hata anında düşer (fallback tetiklenmez).
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

const TRANSIENT_503 = () =>
  new Error(
    'got status: 503 . {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
  );

const OK_RESPONSE = {
  text: "merhaba",
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
};

function makeRequest(model: string) {
  return {
    model,
    prompt: "test",
    maxOutputTokens: 128,
    timeoutMs: 5_000,
  };
}

describe("GeminiProvider model fallback", () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    provider = new GeminiProvider({ apiKey: "test-anahtar-fixture-uzun" });
  });

  it("flash 503'te retry'lar tükenince flash-lite'a düşer ve yanıt döner", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(TRANSIENT_503())
      .mockRejectedValueOnce(TRANSIENT_503())
      .mockRejectedValueOnce(TRANSIENT_503())
      .mockResolvedValueOnce(OK_RESPONSE);

    const result = await provider.complete(makeRequest("gemini-flash-latest"));

    expect(result.text).toBe("merhaba");
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
    const models = mockGenerateContent.mock.calls.map((c) => c[0].model);
    expect(models).toEqual([
      "gemini-flash-latest",
      "gemini-flash-latest",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
    ]);
  }, 15_000);

  it("flash-lite da 503 verirse kendi retry bütçesi sonunda hata fırlatır (tek fallback)", async () => {
    mockGenerateContent.mockRejectedValue(TRANSIENT_503());

    await expect(
      provider.complete(makeRequest("gemini-flash-latest")),
    ).rejects.toBeInstanceOf(AiProviderError);
    // 3 flash + 3 flash-lite — flash-lite'tan başka modele zincirlenmez.
    expect(mockGenerateContent).toHaveBeenCalledTimes(6);
    const models = new Set(mockGenerateContent.mock.calls.map((c) => c[0].model));
    expect(models).toEqual(
      new Set(["gemini-flash-latest", "gemini-flash-lite-latest"]),
    );
  }, 20_000);

  it("pro modelde fallback yok — retry'lar tükenince hata fırlatır", async () => {
    mockGenerateContent.mockRejectedValue(TRANSIENT_503());

    await expect(
      provider.complete(makeRequest("gemini-pro-latest")),
    ).rejects.toBeInstanceOf(AiProviderError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    for (const call of mockGenerateContent.mock.calls) {
      expect(call[0].model).toBe("gemini-pro-latest");
    }
  }, 15_000);

  it("geçici olmayan hata (500) anında düşer — retry da fallback da tetiklenmez", async () => {
    mockGenerateContent.mockRejectedValue(
      new Error('got status: 500 . {"error":{"code":500,"status":"INTERNAL"}}'),
    );

    await expect(
      provider.complete(makeRequest("gemini-flash-latest")),
    ).rejects.toBeInstanceOf(AiProviderError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });
});

const BAD_REQUEST_400 = () =>
  new Error(
    'got status: 400 . {"error":{"code":400,"message":"Invalid JSON payload received. Unknown name \\"thinking_level\\"","status":"INVALID_ARGUMENT"}}',
  );

describe("GeminiProvider 400 uyarlama merdiveni", () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    provider = new GeminiProvider({ apiKey: "test-anahtar-fixture-uzun" });
  });

  it("thinking'li istek 400 alırsa aynı model thinking'siz yeniden denenir", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(BAD_REQUEST_400())
      .mockResolvedValueOnce(OK_RESPONSE);

    const result = await provider.complete({
      ...makeRequest("gemini-flash-latest"),
      thinkingLevel: "low" as const,
    });

    expect(result.text).toBe("merhaba");
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockGenerateContent.mock.calls[0]![0].model).toBe("gemini-flash-latest");
    expect(mockGenerateContent.mock.calls[0]![0].config.thinkingConfig).toBeDefined();
    expect(mockGenerateContent.mock.calls[1]![0].model).toBe("gemini-flash-latest");
    expect(mockGenerateContent.mock.calls[1]![0].config.thinkingConfig).toBeUndefined();
  });

  it("thinking söküldükten sonra da 400 sürerse yedek modele geçilir", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(BAD_REQUEST_400())
      .mockRejectedValueOnce(BAD_REQUEST_400())
      .mockResolvedValueOnce(OK_RESPONSE);

    const result = await provider.complete({
      ...makeRequest("gemini-flash-latest"),
      thinkingLevel: "low" as const,
    });

    expect(result.text).toBe("merhaba");
    const models = mockGenerateContent.mock.calls.map((c) => c[0].model);
    expect(models).toEqual([
      "gemini-flash-latest",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
    ]);
  });

  it("thinking'siz istek 400 alırsa doğrudan yedek model denenir", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(BAD_REQUEST_400())
      .mockResolvedValueOnce(OK_RESPONSE);

    const result = await provider.complete(makeRequest("gemini-flash-latest"));

    expect(result.text).toBe("merhaba");
    const models = mockGenerateContent.mock.calls.map((c) => c[0].model);
    expect(models).toEqual(["gemini-flash-latest", "gemini-flash-lite-latest"]);
  });

  it("merdiven tükenince (thinking sök + yedek model) hata fırlatılır", async () => {
    mockGenerateContent.mockRejectedValue(BAD_REQUEST_400());

    await expect(
      provider.complete({
        ...makeRequest("gemini-flash-latest"),
        thinkingLevel: "low" as const,
      }),
    ).rejects.toBeInstanceOf(AiProviderError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });
});
