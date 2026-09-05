import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import {
  PRODUCT_IMPORT_MAX_ROWS,
  foldSearchText,
  tokenizeQuery,
  type ProductImportResult,
  type ProductImportRow,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { StorageService } from "../../storage/storage.service";
import { AI_CONFIG, type AiConfig } from "../ai.config";
import { AiService, type AiCallResult } from "../ai.service";
import { resolveCategoryHints } from "../category-hint-resolver";
import {
  parseModelNumber,
  salvageRows,
} from "../bid-price-extract/bid-price-extract.service";
import { isOwnAiExtractKey } from "../tender-extract/ai-extract-keys";
import { downloadAiInputs } from "../tender-extract/download-ai-inputs";
import { routeExtractInput, type RoutedInput } from "../tender-extract/ai-extract-router";
import {
  PRODUCT_EXTRACT_RESPONSE_SCHEMA,
  PRODUCT_EXTRACT_SYSTEM_PROMPT,
  buildProductExtractPrompt,
} from "./product-extract.prompts";

/**
 * "Katalogdan ürün ekle (AI)" (Faz 4). Kullanıcının YÜKLEDİĞİ katalog
 * (PDF/fotoğraf/serbest tablo) → ürün satırları → ÖNİZLEME.
 *
 * ── EXCEL YOLUYLA AYNI SÖZLEŞME ───────────────────────────────────────────
 * Çıktı `ProductImportResult` — deterministik Excel yolunun ta kendisi. Aynı
 * önizleme tablosu, aynı `commit` ucu, aynı DTO doğrulaması. İki ayrı yazma
 * yolu olsaydı biri diğerinin kuralını kaçırırdı; AI yalnız SATIRLARI üretir,
 * yazmayı kullanıcının onayı yapar.
 *
 * ── MODEL KOD ÜRETMEZ ─────────────────────────────────────────────────────
 * Kategori: model Türkçe ürün tipi yazar (`categoryHint`), kodu BURASI
 * katalogda arayarak bulur. Katalogda karşılığı yoksa alan boş kalır ve satır
 * uyarı taşır — uydurulmuş bir koda bağlanmaz. Tam katalog aranır (firma
 * vitrini discovery alt kümesine tabi değil, bkz. category-selection.helper).
 */

/** Model çıktısından okunacak en fazla ürün (önizleme + şablon tavanı ile aynı). */
const MAX_PRODUCTS = PRODUCT_IMPORT_MAX_ROWS;
/** Katalogda aranacak en fazla FARKLI kategori ifadesi (tek toplu sorgu). */
/** Toplu adaylık sorgusunun tavanı. */

const CURRENCIES = new Set(["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY", "RUB"]);
const PRICE_MODES = new Set(["FIXED", "TIERED", "ON_REQUEST"]);

interface RawProduct {
  name: string;
  code: string | null;
  description: string | null;
  categoryHint: string | null;
  brand: string | null;
  mpn: string | null;
  unit: string | null;
  keywords: string[];
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  price: number | null;
  currency: string | null;
  moq: number | null;
}

@Injectable()
export class ProductExtractService {
  private readonly logger = new Logger(ProductExtractService.name);

  constructor(
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
  ) {}

  async extract(
    user: AuthenticatedCompanyUser,
    dto: { fileKeys: string[] },
  ): Promise<ProductImportResult> {
    this.ai.assertAiAccess(user);
    if (dto.fileKeys.length === 0) throw new BadRequestException("En az bir dosya seçin");
    if (dto.fileKeys.length > this.config.maxPages) {
      throw new BadRequestException(`Çok fazla dosya (en fazla ${this.config.maxPages})`);
    }
    for (const key of dto.fileKeys) {
      if (!isOwnAiExtractKey(key, user.companyId)) {
        throw new BadRequestException("Geçersiz dosya anahtarı");
      }
    }

    const files = await downloadAiInputs(this.storage, dto.fileKeys);
    const routed: RoutedInput = await routeExtractInput(files, this.config.maxPages);

    const callOptions = {
      feature: "product_extract",
      prompt: buildProductExtractPrompt(routed.documentText),
      system: PRODUCT_EXTRACT_SYSTEM_PROMPT,
      vision: routed.route !== "text",
      parts: routed.parts,
      responseSchema: PRODUCT_EXTRACT_RESPONSE_SCHEMA as unknown as object,
      thinkingLevel: "low" as const,
      extraInputTokenEstimate: routed.extraInputTokenEstimate,
      metadata: { route: routed.route, pages: routed.pages },
    };

    let result: AiCallResult = await this.ai.callAi(user, callOptions);
    let parsed = tryParse(result.text);
    const notices: string[] = [];
    let salvaged = 0;

    if (parsed == null && result.finishReason === "MAX_TOKENS") {
      // Uzun katalog çıktı tavanına çarptı — kesik JSON'dan tamamlanmış
      // ürünleri kurtar; 4× maliyetli premium retry'a gitme.
      const rows = salvageProducts(result.text);
      if (rows.length > 0) {
        parsed = { products: rows };
        salvaged = rows.length;
      }
    }
    if (parsed == null) {
      this.logger.warn(
        `product_extract: JSON parse edilemedi — premium retry (finish=${result.finishReason ?? "?"} len=${result.text.length})`,
      );
      result = await this.ai.callAi(user, {
        ...callOptions,
        premiumRetry: true,
        metadata: { ...callOptions.metadata, retry: true },
      });
      parsed = tryParse(result.text);
    }

    const raw = sanitizeProducts(parsed?.products);
    const returned = Array.isArray(parsed?.products) ? parsed.products.length : 0;
    if (returned > MAX_PRODUCTS) {
      // Sessiz kırpma YOK — Excel yolundaki kuralın aynısı.
      notices.push(
        `${MAX_PRODUCTS} ürün sınırı aşıldı — ${returned - MAX_PRODUCTS} ürün alınmadı; kataloğu bölerek yükleyin.`,
      );
    }
    if (raw.length === 0) {
      throw new BadRequestException(
        "Belgede ürün bulunamadı — katalog sayfalarını içeren bir dosya yükleyin ya da Excel şablonunu kullanın",
      );
    }
    if (salvaged > 0) {
      notices.push(
        `Katalog uzunluk tavanına çarptı — ${salvaged} ürün okundu; belgenin devamı okunmamış olabilir (dosyayı bölerek yeniden deneyin)`,
      );
    }

    const resolved = await resolveCategoryHints(this.prisma, raw.map((p) => p.categoryHint));
    let unresolved = 0;
    const rows: ProductImportRow[] = raw.map((p, i) => {
      const issues: string[] = [];
      const hit = p.categoryHint ? resolved.get(p.categoryHint) : undefined;
      if (p.categoryHint && !hit) unresolved += 1;
      if (hit) {
        // Tahmin GÖRÜNÜR olmalı: yanlış kategori sessizce yazılmasın, kullanıcı
        // önizlemede görüp değiştirsin.
        issues.push(`Kategori tahmini: ${hit.nameTr} — kontrol edin`);
      } else {
        issues.push("Kategori bulunamadı — panelden seçin");
      }
      if (p.priceMode === "FIXED" && p.price == null) {
        issues.push("Fiyat okunamadı — \"Teklif isteyin\" varsayıldı");
      }
      const mode = p.priceMode === "FIXED" && p.price == null ? "ON_REQUEST" : p.priceMode;
      return {
        // Belgede Excel satırı yok — sıra numarası kullanıcıya konum verir.
        rowNumber: i + 1,
        name: p.name,
        code: p.code,
        description: p.description,
        categoryId: hit?.id ?? null,
        unit: p.unit ?? "adet",
        brand: p.brand,
        mpn: p.mpn,
        keywords: p.keywords,
        priceMode: mode,
        price: mode === "FIXED" ? p.price : null,
        currency: p.currency,
        moq: p.moq,
        issues,
      };
    });

    if (unresolved > 0) {
      notices.push(
        `${unresolved} üründe kategori katalogda bulunamadı — yayımlamadan önce panelden seçmeniz gerekir`,
      );
    }
    notices.push(
      "Ürünler TASLAK olarak eklenir; görsel eklemeden vitrine çıkmaz (katalog dosyasındaki görseller aktarılmaz).",
    );
    return { rows, notices };
  }
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const p: unknown = JSON.parse(text);
    return p != null && typeof p === "object" && !Array.isArray(p)
      ? (p as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Kesik (MAX_TOKENS) çıktıdan tamamlanmış ürün nesnelerini kurtarır. */
export function salvageProducts(text: string): Record<string, unknown>[] {
  // `salvageRows` "rows" anahtarını arar; şema anahtarımız "products".
  return salvageRows(text.replace(/"products"\s*:/, '"rows":'));
}

/** AI çıktısı → güvenli ürün satırları (şema dışı değerler düşer, tavanlar uygulanır). */
export function sanitizeProducts(raw: unknown): RawProduct[] {
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, max: number): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const num = (v: unknown): number | null => {
    const n =
      typeof v === "number" ? v : typeof v === "string" ? parseModelNumber(v.slice(0, 40)) : null;
    return n != null && Number.isFinite(n) && n >= 0 && n < 1e15 ? n : null;
  };
  return raw
    .slice(0, MAX_PRODUCTS)
    .map((r) => (r ?? {}) as Record<string, unknown>)
    .map((r) => {
      const name = str(r.name, 200);
      if (!name) return null;
      const modeRaw = str(r.priceMode, 20)?.toUpperCase() ?? "";
      const mode = PRICE_MODES.has(modeRaw)
        ? (modeRaw as RawProduct["priceMode"])
        : "ON_REQUEST";
      const curRaw = str(r.currency, 8)?.toUpperCase() ?? null;
      const keywords = Array.isArray(r.keywords)
        ? r.keywords
            .map((k) => str(k, 60))
            .filter((k): k is string => !!k)
            .map((k) => k.toLocaleLowerCase("tr"))
            .slice(0, 8)
        : [];
      return {
        name,
        code: str(r.code, 50),
        description: str(r.description, 5000),
        // Kod GİBİ görünen ipucu reddedilir: model şemayı delip kod yazmışsa
        // katalogda aranmamalı (uydurma kodun sızacağı tek delik burası).
        categoryHint: (() => {
          const h = str(r.categoryHint, 80);
          return h && !/^\d{4,}$/.test(h.replace(/\s/g, "")) ? h : null;
        })(),
        brand: str(r.brand, 100),
        mpn: str(r.mpn, 100),
        unit: str(r.unit, 20),
        keywords,
        priceMode: mode,
        price: mode === "FIXED" ? num(r.price) : null,
        currency: curRaw && CURRENCIES.has(curRaw) ? curRaw : null,
        moq: num(r.moq),
      } satisfies RawProduct;
    })
    .filter((p): p is RawProduct => p !== null);
}
