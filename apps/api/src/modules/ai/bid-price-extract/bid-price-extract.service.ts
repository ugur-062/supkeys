import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import type { BidImportResult } from "@rothern/shared";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { BidImportService } from "../../company-listings/import/bid-import.service";
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

    // Kalemler + yetki ÖNCE (yetkisiz/kalemsiz ihale için dosya işlemeyiz).
    const listing = await this.bidImport.loadListing(user, dto.listingId);

    const files = await Promise.all(
      dto.fileKeys.map(async (key) => {
        try {
          return { key, buffer: await this.storage.getObject("private", key) };
        } catch {
          throw new BadRequestException("Dosya yüklenmemiş görünüyor — lütfen tekrar deneyin");
        }
      }),
    );
    const routed: RoutedInput = await routeExtractInput(files, this.config.maxPages);

    const callOptions = {
      feature: "bid_price_extract",
      prompt: buildBidPricePrompt({ items: listing.items, documentText: routed.documentText }),
      system: BID_PRICE_SYSTEM_PROMPT,
      vision: routed.route !== "text",
      parts: routed.parts,
      responseSchema: BID_PRICE_RESPONSE_SCHEMA as unknown as object,
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
    if (parsed == null) {
      this.logger.warn("bid_price_extract: JSON parse edilemedi — premium retry");
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

/** AI çıktısı → DocRow[] (şema dışı/uydurma değerler düşer; tavanlar). */
export function sanitizeRows(raw: unknown): DocRow[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e15 ? v : null;
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
