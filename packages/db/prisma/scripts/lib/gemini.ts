/**
 * Tohumlama scriptleri için minimal Gemini istemcisi.
 *
 * NEDEN AYRI: `gen-category-keywords.ts` ve `gen-category-leaves.ts` aynı çağrı
 * kabuğunu (şemalı JSON + uyarlama merdiveni + model yedeklemesi) kullanıyor.
 * apps/api'deki `GeminiProvider` çok daha zengin (bütçe, audit, function
 * calling) ama `@google/genai` bağımlılığı orada; onu @rothern/db'ye taşımak
 * yalnız bu iki script için yeni paket eklemek olurdu. Düz `fetch` (Node 22)
 * yeterli — bu araçlar ÇEVRİMDIŞI, tek seferlik ve çalışma zamanına girmiyor.
 *
 * ÇALIŞMA ZAMANI DEĞİL: buradaki çağrılar firma AI bütçesine (AiService)
 * dokunmaz, AiUsage satırı yazmaz. Maliyet çağıran scriptte raporlanır.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Model merdiveni. Sıra kalite → ucuzluk; bir model kalıcı 5xx verirse (Google
 * tarafında aşırı yük) sıradakine geçilir ve ÇALIŞAN model hatırlanır, her grup
 * için baştan denenmez.
 *
 * 2026-09-01 ölçümü: `gemini-flash-latest` 503, `gemini-3.5-flash` ve
 * `gemini-flash-lite-latest` 200, `gemini-2.5-flash` bu anahtarda 404.
 * Alias'lar zamanla kayar; liste bu yüzden merdiven, sabit değil.
 */
export const MODEL_LADDER = [
  "gemini-3.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
];

/** ai.config.ts ile aynı sınıf-bazlı fiyatlar (USD / milyon token). */
const PRICES: Record<string, { in: number; out: number }> = {
  "gemini-3.5-flash": { in: 0.3, out: 2.5 },
  "gemini-flash-latest": { in: 0.3, out: 2.5 },
  "gemini-flash-lite-latest": { in: 0.1, out: 0.4 },
};

export function priceOf(model: string) {
  return PRICES[model] ?? { in: 0.3, out: 2.5 };
}

/**
 * GEMINI_API_KEY'i ortamdan ya da .env'den okur.
 * `dotenv` @rothern/db bağımlılığı DEĞİL; tek anahtar için elle okumak yeni
 * paket eklemekten iyi. packages/db/.env → kök .env symlink'i.
 */
export function readGeminiKey(fromDir: string): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const p of [
    path.resolve(fromDir, "../../.env"),
    path.resolve(fromDir, "../../../../.env"),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const m = /^\s*GEMINI_API_KEY\s*=\s*(.*)\s*$/.exec(line);
      if (m?.[1]) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  throw new Error(
    "GEMINI_API_KEY bulunamadı (.env). Üretim scripti anahtarsız çalışamaz.",
  );
}

export interface GenResult<T> {
  data: T;
  model: string;
  inTok: number;
  outTok: number;
}

/**
 * Şemalı JSON üretimi. Sırayla:
 *  · 400 → `thinkingConfig`'i sök, tekrar dene (bazı alias'lar tanımıyor —
 *    gemini.provider.ts'te aynı uyarlama merdiveni var).
 *  · 5xx/429 → üstel bekleyişle 3 kez tekrar, sonra SIRADAKİ MODELE geç.
 *  · Tüm modeller tükenirse fırlat; çağıran grubu atlar, koşu devam eder.
 */
export async function generateJson<T>(opts: {
  apiKey: string;
  prompt: string;
  schema: object;
  temperature?: number;
  maxOutputTokens?: number;
  /** Önceki grupta çalışan model — merdivende oradan başlanır. */
  preferModel?: string;
}): Promise<GenResult<T>> {
  const ladder = opts.preferModel
    ? [opts.preferModel, ...MODEL_LADDER.filter((m) => m !== opts.preferModel)]
    : MODEL_LADDER;

  let lastErr = "";
  for (const model of ladder) {
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 8192,
        responseMimeType: "application/json",
        responseSchema: opts.schema,
        // Sözlük/ad üretimi akıl yürütme değil hatırlama işi; düşünme token'ı
        // maxOutputTokens'tan yer yer ve çıktıyı kırpar.
        thinkingConfig: { thinkingLevel: "LOW" },
      },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    let stripped = false;
    let backoffMs = 3000;

    for (let attempt = 0; attempt < 5; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": opts.apiKey,
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        // Ağ hatası — bekle ve tekrar dene.
        lastErr = `${model}: ${(e as Error).message}`;
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 45_000);
        continue;
      }

      if (res.status === 400 && !stripped) {
        delete (body.generationConfig as Record<string, unknown>).thinkingConfig;
        stripped = true;
        continue;
      }
      if (res.status === 404) {
        // Model bu anahtarda yok — beklemeden sıradakine geç.
        lastErr = `${model}: 404`;
        break;
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = `${model}: ${res.status}`;
        await new Promise((r) => setTimeout(r, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 45_000);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) {
        lastErr = `${model}: boş yanıt`;
        continue;
      }
      return {
        data: JSON.parse(text) as T,
        model,
        inTok: json.usageMetadata?.promptTokenCount ?? 0,
        outTok: json.usageMetadata?.candidatesTokenCount ?? 0,
      };
    }
  }
  throw new Error(`Tüm modeller başarısız (son: ${lastErr})`);
}
