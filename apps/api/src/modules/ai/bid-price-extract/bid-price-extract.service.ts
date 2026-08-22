import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import type { BidImportResult } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { BidImportService } from "../../company-listings/import/bid-import.service";
import { parseLocaleNumber } from "../../company-listings/import/listing-item-import.service";
import type { DocRow } from "../../company-listings/import/bid-matching";
import { StorageService } from "../../storage/storage.service";
import { AI_CONFIG, type AiConfig } from "../ai.config";
import { AiService, type AiCallResult } from "../ai.service";
import { routeExtractInput, type RoutedInput } from "../tender-extract/ai-extract-router";
import { isOwnAiExtractKey } from "../tender-extract/ai-extract-keys";
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
const CURRENCIES = new Set(["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY", "RUB"]);

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
        throw new BadRequestException("Geçersiz dosya anahtarı");
      }
    }
    if (dto.fileKeys.length === 0) throw new BadRequestException("En az bir dosya seçin");
    if (dto.fileKeys.length > this.config.maxPages) {
      throw new BadRequestException(`Belge çok uzun (en fazla ${this.config.maxPages} dosya)`);
    }

    // Kalemler+yetki (getOne) ile R2 indirme bağımsız → paralel (uzak DB/R2
    // turları gecikmenin Gemini dışındaki ana kalemi). Yetkisiz ihalede
    // loadListing fırlatır; dosya okuma sonucu kullanılmadan reddedilir.
    const [listing, files] = await Promise.all([
      this.bidImport.loadListing(user, dto.listingId),
      Promise.all(
        dto.fileKeys.map(async (key) => {
          try {
            return { key, buffer: await this.storage.getObject("private", key) };
          } catch {
            throw new BadRequestException("Dosya yüklenmemiş görünüyor — lütfen tekrar deneyin");
          }
        }),
      ),
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
        parsed = { rows };
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

    const rows = sanitizeRows(parsed?.rows);
    const out = await this.bidImport.fromDocRows(listing, rows, {
      pricesIncludeVat: typeof parsed?.pricesIncludeVat === "boolean" ? parsed.pricesIncludeVat : null,
      docCurrency: typeof parsed?.docCurrency === "string" ? parsed.docCurrency : null,
    });
    if (salvaged > 0) {
      out.notices.unshift(
        `AI çıktısı uzunluk tavanına çarptı — ${salvaged} satır kurtarıldı; belgenin devamı okunmamış olabilir (belgeyi bölerek yeniden deneyin)`,
      );
    }
    if (parsed == null) out.notices.unshift("Belge okunamadı — AI geçerli sonuç döndürmedi; şablonu deneyin");
    return { ...out, route: routed.route, downgraded: result.downgraded, warned: result.warned };
  }
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
export function sanitizeRows(raw: unknown): DocRow[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? parseLocaleNumber(v.slice(0, 40)) : null;
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
        currency: cur && (CURRENCIES.has(cur) || cur.length <= 3) ? cur : curRaw,
        deliveryText: str(r.deliveryText, 80),
        hintLineNo:
          typeof r.hintLineNo === "number" && Number.isInteger(r.hintLineNo) && r.hintLineNo > 0
            ? r.hintLineNo
            : null,
      };
    });
}
