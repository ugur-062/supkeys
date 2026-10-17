import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { isCurrencyCode, type BidImportResult } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { BidImportService } from "../../company-listings/import/bid-import.service";
import type { DocRow } from "../../company-listings/import/bid-matching";
import { StorageService } from "../../storage/storage.service";
import { AI_CONFIG, type AiConfig } from "../ai.config";
import { parseSeparatedNumber } from "../ai-text";
import { AiService, type AiCallResult } from "../ai.service";
import { routeExtractInput, type RoutedInput } from "../tender-extract/ai-extract-router";
import { isOwnAiExtractKey } from "../tender-extract/ai-extract-keys";
import { downloadAiInputs } from "../tender-extract/download-ai-inputs";
import {
  BID_PRICE_RESPONSE_SCHEMA,
  BID_PRICE_SYSTEM_PROMPT,
  buildBidPricePrompt,
} from "./bid-price-extract.prompts";

/**
 * "Belgeden Fiyatla (AI)" (Faz 2, 2026-08-22). Akış: ihale kalemleri (getOne,
 * yetki/görünürlük aynen) → belge (PDF/foto/Excel; tender-extract router) →
 * model SATIRLARI okur (fiyat uyduramaz) → sanitize → EŞLEŞTİRME KODDA
 * (BidImportService.fromDocRows) → önizleme. Teklif YAZILMAZ. Feature
 * "bid_price_extract" — AI-0 bütçe/tavan/Silver+ kapıları callAi'de.
 */

const MAX_DOC_ROWS = 300;

@Injectable()
export class BidPriceExtractService {
  private readonly logger = new Logger(BidPriceExtractService.name);

  constructor(
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly bidImport: BidImportService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
  ) {}

  async extract(
    user: AuthenticatedCompanyUser,
    dto: { listingId: string; fileKeys: string[] },
  ): Promise<BidImportResult> {
    this.ai.assertAiAccess(user);
    for (const key of dto.fileKeys) {
      if (!isOwnAiExtractKey(key, user.companyId)) {
        throw new BadRequestException(i18nMessage("api.ai.gecersizDosyaAnahtari"));
      }
    }
    if (dto.fileKeys.length === 0) throw new BadRequestException(i18nMessage("api.ai.enAzBirDosyaSecin"));
    if (dto.fileKeys.length > this.config.maxPages) {
      throw new BadRequestException(i18nMessage("api.ai.belgeCokUzunEnFazlaDosya", { maxPages: this.config.maxPages }));
    }

    // Kalemler+yetki (getOne) ile R2 indirme bağımsız → paralel (uzak DB/R2
    // turları gecikmenin Gemini dışındaki ana kalemi). Yetkisiz ihalede
    // loadListing fırlatır; dosya okuma sonucu kullanılmadan reddedilir.
    // Denetim 2026-08-24 Parça 6 (HIGH): indirmeden ÖNCE HEAD ile boyut
    // doğrulaması + toplam bayt tavanı + SERİ indirme (tek-kaynak yardımcı).
    const [listing, files] = await Promise.all([
      this.bidImport.loadListing(user, dto.listingId),
      downloadAiInputs(this.storage, dto.fileKeys),
    ]);
    const routed: RoutedInput = await routeExtractInput(files, this.config.maxPages);

    const callOptions = {
      feature: "bid_price_extract",
      prompt: buildBidPricePrompt({ items: listing.items, documentText: routed.documentText }),
      system: BID_PRICE_SYSTEM_PROMPT,
      vision: routed.route !== "text",
      parts: routed.parts,
      responseSchema: BID_PRICE_RESPONSE_SCHEMA as unknown as object,
      // Gecikme/boş-yanıt: şema-kısıtlı satır okuma için "low" yeterli (bkz. AiCallOptions.thinkingLevel).
      thinkingLevel: "low" as const,
      extraInputTokenEstimate: routed.extraInputTokenEstimate,
      metadata: {
        route: routed.route,
        pages: routed.pages,
        listingId: listing.id,
        itemCount: listing.items.length,
      },
    };
    let result: AiCallResult = await this.ai.callAi(user, callOptions);
    let parsed = tryParse(result.text);
    let salvaged = 0;
    if (parsed == null && result.finishReason === "MAX_TOKENS") {
      // Çıktı tavana çarptı (uzun belge ya da dejenere tekrar) — kesik JSON'dan
      // TAMAMLANMIŞ satırları kurtar; premium retry'a (10+ sn, 4× maliyet) gitme.
      const rows = salvageRows(result.text);
      if (rows.length > 0) {
        parsed = { ...salvageHeader(result.text), rows };
        salvaged = rows.length;
        this.logger.warn(
          `bid_price_extract: MAX_TOKENS — kesik çıktıdan ${rows.length} satır kurtarıldı (outTok=${result.outputTokens ?? "?"})`,
        );
      }
    }
    if (parsed == null) {
      this.logger.warn(
        `bid_price_extract: JSON parse edilemedi — premium retry (finish=${result.finishReason ?? "?"} outTok=${result.outputTokens ?? "?"} len=${result.text.length} head="${result.text.slice(0, 120).replace(/\s+/g, " ")}")`,
      );
      result = await this.ai.callAi(user, {
        ...callOptions,
        premiumRetry: true,
        metadata: { ...callOptions.metadata, retry: true },
      });
      parsed = tryParse(result.text);
    }

    const rows = sanitizeRows(
      parsed?.rows,
      typeof parsed?.docLanguage === "string" ? parsed.docLanguage : null,
    );
    const out = await this.bidImport.fromDocRows(listing, rows, {
      pricesIncludeVat: typeof parsed?.pricesIncludeVat === "boolean" ? parsed.pricesIncludeVat : null,
      docCurrency: typeof parsed?.docCurrency === "string" ? parsed.docCurrency : null,
      crossLanguage: declaredCrossLanguage(parsed?.docLanguage, parsed?.itemsLanguage),
    });
    // Uyarılar istek dilinde (önizleme bandında olduğu gibi basılır).
    if (salvaged > 0) out.notices.unshift(tApi("api.ai.bidPriceSalvaged", { n: salvaged }));
    if (parsed == null) out.notices.unshift(tApi("api.ai.bidPriceUnreadable"));
    return { ...out, route: routed.route, downgraded: result.downgraded, warned: result.warned };
  }
}

/**
 * Model belge ile kalem listesinin dilini ayrı söyler; ikisi de geçerli ve
 * farklıysa diller arası (ipucu eşiği gevşer — `bid-matching`). Birinin
 * eksikliği "aynı dil" sayılır; yazı farkını eşleştirme motoru ayrıca yakalar.
 */
export function declaredCrossLanguage(doc: unknown, items: unknown): boolean {
  const code = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().slice(0, 2) : "");
  const a = code(doc);
  const b = code(items);
  return /^[a-z]{2}$/.test(a) && /^[a-z]{2}$/.test(b) && a !== b;
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const p: unknown = JSON.parse(text);
    return p != null && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Kesik (MAX_TOKENS) JSON'dan belge ustbilgisini (docLanguage, docCurrency,
 * itemsLanguage, pricesIncludeVat) okur. Sema bunlari rows'tan once yazdirir;
 * yalniz `rows` dizisinden ONCEKI kisma bakilir (satir metnine gomulu bir
 * "docLanguage" dizgisi ustbilgi sayilmaz). docLanguage olmadan EN "1,500"
 * binlik okunamiyordu (derin denetim MU-08).
 */
export function salvageHeader(text: string): Record<string, unknown> {
  const rowsAt = text.search(/"rows"\s*:\s*\[/);
  const head = rowsAt === -1 ? text : text.slice(0, rowsAt);
  const out: Record<string, unknown> = {};
  for (const key of ["docLanguage", "docCurrency", "itemsLanguage"]) {
    const m = new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]{1,16})"`).exec(head);
    if (m) out[key] = m[1];
  }
  const vat = /"pricesIncludeVat"\s*:\s*(true|false)/.exec(head);
  if (vat) out.pricesIncludeVat = vat[1] === "true";
  return out;
}

/**
 * Kesik (MAX_TOKENS) JSON'dan tamamlanmış `rows[]` nesnelerini çıkarır:
 * "rows": [ … başlangıcından itibaren küme-parantez derinliğiyle tarar, kapanan
 * her üst-düzey nesneyi JSON.parse eder; parse edilemeyen (yarım) son nesne
 * atılır. Dizge içindeki parantezler dikkate alınır.
 */
export function salvageRows(text: string): Record<string, unknown>[] {
  const start = text.search(/"rows"\s*:\s*\[/);
  if (start === -1) return [];
  let i = text.indexOf("[", start) + 1;
  const out: Record<string, unknown>[] = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;
  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        try {
          const o: unknown = JSON.parse(text.slice(objStart, i + 1));
          if (o && typeof o === "object" && !Array.isArray(o)) out.push(o as Record<string, unknown>);
        } catch {
          /* yarım nesne — atla */
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return out;
}

/** AI çıktısı → DocRow[] (şema dışı/uydurma değerler düşer; tavanlar). Sayılar STRING gelir (şema). */
/**
 * MODEL çıktısındaki sayıyı okur (Excel/CSV hücresi DEĞİL).
 *
 * Sözleşme: binlik ayracı yok, ondalık NOKTA. Bu yüzden "1.875" = 1,875 —
 * `parseLocaleNumber`'ın TR sezgisiyle 1875 DEĞİL. Sözleşme dışı çıktı
 * (model belgedekini aynen kopyalar) `parseSeparatedNumber` ile okunur: iki
 * ayraç birlikte gelirse SONDAKİ ondalıktır ("1.234,56" TR, "1,500.50" EN —
 * eskiden hep TR sayılıp 1.5005 okunuyordu, 1000x düşük fiyat); tekrarlı
 * gruplar binliktir ("1,500,000"). Tek virgül + tam 3 hane ("1,500") yalnız
 * belge dili virgülü binlik kullanan bir dilse (EN/CJK…) binlik okunur,
 * aksi hâlde sözleşmedeki TR ondalık ("1500,50" gibi) sayılır.
 */
const COMMA_THOUSANDS_LANGS = new Set(["en", "zh", "ja", "ko", "th", "he", "hi"]);

export function parseModelNumber(raw: string, docLanguage?: string | null): number | null {
  const lang = typeof docLanguage === "string" ? docLanguage.trim().toLowerCase().slice(0, 2) : "";
  return parseSeparatedNumber(raw, { commaThousands: COMMA_THOUSANDS_LANGS.has(lang) });
}

export function sanitizeRows(raw: unknown, docLanguage?: string | null): DocRow[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number | null => {
    // MODEL ÇIKTISI sözleşmesi (bid-price-extract.prompts.ts): binlik ayracı
    // YASAK, ondalık ayırıcı NOKTA, 3 ondalığa kadar. Excel/CSV hücreleri için
    // yazılmış TR sezgisi (`parseLocaleNumber`: "tam 3 hane = binlik") buraya
    // uygulanınca "1.875" → 1875 oluyordu, yani 1000× fiyat (denetim 2026-08-24
    // Parça 6). Sözleşme dışı ayraçlar `parseModelNumber` kuralıyla okunur.
    const n =
      typeof v === "number"
        ? v
        : typeof v === "string"
          ? parseModelNumber(v.slice(0, 40), docLanguage)
          : null;
    return n != null && Number.isFinite(n) && n >= 0 && n < 1e15 ? n : null;
  };
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  return raw
    .slice(0, MAX_DOC_ROWS)
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .filter((r) => typeof r.text === "string" && r.text.trim() !== "")
    .map((r) => {
      const curRaw = str(r.currency, 8);
      const cur = curRaw ? curRaw.toUpperCase() : null;
      return {
        text: str(r.text, 300)!,
        code: str(r.code, 50),
        unitPrice: num(r.unitPrice),
        totalPrice: num(r.totalPrice),
        quantity: num(r.quantity),
        unit: str(r.unit, 20),
        // Sembol/TL gibi değerler normalizeCurrency'de çözülür; burada ham bırak.
        currency: cur && (isCurrencyCode(cur) || cur.length <= 3) ? cur : curRaw,
        deliveryText: str(r.deliveryText, 80),
        hintLineNo:
          typeof r.hintLineNo === "number" && Number.isInteger(r.hintLineNo) && r.hintLineNo > 0
            ? r.hintLineNo
            : null,
      };
    });
}
