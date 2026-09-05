import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import {
  foldSearchText,
  isCompanyActivity,
  tokenizeQuery,
  type AiSearchIntentResult,
  type AiSearchPortal,
  type AiSearchRelaxed,
  type AiTenderExtractResult,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { productIndexWhere } from "../../../common/company/product-index";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { AiService, type AiCallResult } from "../ai.service";
import { resolveCategoryHints } from "../category-hint-resolver";
import {
  SEARCH_INTENT_RESPONSE_SCHEMA,
  SEARCH_INTENT_SYSTEM_PROMPT,
  buildSearchIntentPrompt,
} from "./search-intent.prompts";

export const SEARCH_INTENT_MAX_TEXT = 500;
const CURRENCIES = new Set(["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY", "RUB"]);

/**
 * AI ARAMA — doğal dil → süzgeç. Model sonuç vermez, süzgeç verir; liste
 * mevcut motordan (ürün dizini / açık talepler) gelir. Yazma YOK; taslak
 * (satınalma) yalnız sihirbaza taşınır, kullanıcı yayımlar.
 */
@Injectable()
export class SearchIntentService {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    /** Satış: açık talep sayımı için (gevşetme). Test rig'inde olmayabilir. */
    @Optional() private readonly listings?: CompanyListingsService,
  ) {}

  async interpret(
    user: AuthenticatedCompanyUser,
    dto: { text: string; portal: AiSearchPortal },
  ): Promise<AiSearchIntentResult> {
    this.ai.assertAiAccess(user);
    const text = (dto.text ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 3) throw new BadRequestException("Ne aradığınızı birkaç kelimeyle yazın.");
    if (text.length > SEARCH_INTENT_MAX_TEXT) {
      throw new BadRequestException(`En fazla ${SEARCH_INTENT_MAX_TEXT} karakter.`);
    }
    const portal: AiSearchPortal = dto.portal === "satis" ? "satis" : "satinalma";

    const callOptions = {
      feature: "search_intent",
      prompt: buildSearchIntentPrompt(text, portal),
      system: SEARCH_INTENT_SYSTEM_PROMPT,
      responseSchema: SEARCH_INTENT_RESPONSE_SCHEMA as unknown as object,
      thinkingLevel: "low" as const,
      metadata: { portal, chars: text.length },
    };
    let result: AiCallResult = await this.ai.callAi(user, callOptions);
    let parsed = tryParse(result.text);
    if (parsed == null) {
      // Kısa prompt — bir kez premium adayıyla dene, sonra dürüstçe vazgeç.
      result = await this.ai.callAi(user, {
        ...callOptions,
        premiumRetry: true,
        metadata: { ...callOptions.metadata, retry: true },
      });
      parsed = tryParse(result.text);
    }
    if (parsed == null) {
      throw new ServiceUnavailableException("Arama yorumlanamadı — tekrar deneyin.");
    }

    const s = sanitizeIntent(parsed, text);
    const [resolved, city] = await Promise.all([
      s.categoryHint
        ? resolveCategoryHints(this.prisma, [s.categoryHint], { discoveryOnly: portal === "satinalma" })
        : Promise.resolve(new Map<string, { id: string; nameTr: string }>()),
      s.city ? this.canonicalCity(s.city) : Promise.resolve(null),
    ]);
    const category = s.categoryHint ? (resolved.get(s.categoryHint) ?? null) : null;

    // Taslak, GEVŞETMEDEN ÖNCEKİ çözümle kurulur: kategori ürün listesinde
    // sonuç vermese de talep için doğru öneri olabilir (kullanıcı formda görür).
    const draft =
      portal === "satinalma" && (s.itemName || s.query)
        ? buildDraft(text, s, category, result)
        : null;

    // GEVŞETME: süzgeçlerin tamamı 0 sonuç veriyorsa en az güvenilenden
    // başlayarak kaldır — AI araması "hiçbir şey bulunamadı" ile bitmesin.
    const filters: Filters = {
      query: s.query,
      category,
      city,
      verifiedOnly: s.verifiedOnly,
      activity: s.activity,
      priceMax: s.priceMax,
      quantity: s.quantity,
    };
    const { applied, relaxed } =
      portal === "satinalma"
        ? await this.relaxProducts(user, filters)
        : await this.relaxRequests(user, filters);

    return {
      portal,
      summary: s.summary,
      query: applied.query,
      category: applied.category,
      categoryHint: s.categoryHint,
      city: applied.city,
      verifiedOnly: applied.verifiedOnly,
      activity: applied.activity,
      priceMax: applied.priceMax,
      currency: s.currency,
      quantity: applied.quantity,
      unit: s.unit,
      keywords: s.keywords,
      relaxed,
      relaxedCategoryName: relaxed.includes("category") ? (category?.nameTr ?? null) : null,
      draft,
      downgraded: result.downgraded,
      warned: result.warned,
    };
  }

  /** Modelin yazdığı il → veritabanındaki yazım ("istanbul" → "İstanbul"); yoksa olduğu gibi. */
  private async canonicalCity(raw: string): Promise<string> {
    const rows = await this.prisma.company.findMany({
      where: { city: { not: null } },
      select: { city: true },
      distinct: ["city"],
      take: 500,
    });
    const want = foldSearchText(raw);
    const hit = rows.map((r) => r.city).find((c) => c && foldSearchText(c) === want);
    return hit ?? raw;
  }

  /** Ürün dizini: sayım gerçek süzgeç motorundan (`productIndexWhere`) — liste ile aynı kural. */
  private async relaxProducts(user: AuthenticatedCompanyUser, f: Filters) {
    const count = (x: Filters) =>
      this.prisma.companyItem.count({
        where: productIndexWhere(
          {
            q: x.query ?? undefined,
            category: x.category?.id,
            city: x.city ?? undefined,
            activity: x.activity ?? undefined,
            verified: x.verifiedOnly || undefined,
            priceMax: x.priceMax ?? undefined,
            moqMax: x.quantity != null ? Math.max(1, Math.trunc(x.quantity)) : undefined,
          },
          [{ companyId: { not: user.companyId } }],
        ),
      });
    return relax(f, PRODUCT_RELAX_ORDER, count);
  }

  /** Açık talepler: satıcının görebildiği açık talepler (liste ile AYNI kaynak) üzerinde sayım. */
  private async relaxRequests(user: AuthenticatedCompanyUser, f: Filters) {
    if (!this.listings) return { applied: f, relaxed: [] as AiSearchRelaxed[] };
    const rows = await this.listings.sellerTenders(user, "ALIM", { openOnly: true });
    const hay = rows.map((r) => ({
      seg: r.categories.map((c) => c.code.slice(0, 2)),
      city: r.ownerCity ?? null,
      text: foldSearchText(
        [r.title, r.number ?? "", r.owner?.name ?? "", ...(r.itemNames ?? []), ...r.categories.map((c) => c.name)].join(" "),
      ),
    }));
    const count = async (x: Filters) => {
      const ts = x.query ? tokenizeQuery(x.query).map((t) => foldSearchText(t)) : [];
      const seg = x.category?.id.slice(0, 2);
      const city = x.city ? foldSearchText(x.city) : null;
      return hay.filter(
        (h) =>
          ts.every((t) => h.text.includes(t)) &&
          (!seg || h.seg.includes(seg)) &&
          (!city || (h.city != null && foldSearchText(h.city) === city)),
      ).length;
    };
    return relax(f, REQUEST_RELAX_ORDER, count);
  }
}

interface Filters {
  query: string | null;
  category: { id: string; nameTr: string } | null;
  city: string | null;
  verifiedOnly: boolean;
  activity: string | null;
  priceMax: number | null;
  quantity: number | null;
}

/** En az güvenilenden en çok güvenilene: kategori (ipucu çözümü) → tavanlar → nitelikler → şehir. */
const PRODUCT_RELAX_ORDER: AiSearchRelaxed[] = ["category", "priceMax", "quantity", "activity", "verifiedOnly", "city"];
const REQUEST_RELAX_ORDER: AiSearchRelaxed[] = ["category", "city"];

const isSet = (f: Filters, k: AiSearchRelaxed) =>
  k === "verifiedOnly" ? f.verifiedOnly : f[k] != null;

function without(f: Filters, k: AiSearchRelaxed): Filters {
  return k === "verifiedOnly" ? { ...f, verifiedOnly: false } : { ...f, [k]: null };
}

async function relax(
  f: Filters,
  order: AiSearchRelaxed[],
  count: (x: Filters) => Promise<number>,
): Promise<{ applied: Filters; relaxed: AiSearchRelaxed[] }> {
  const relaxed: AiSearchRelaxed[] = [];
  let cur = f;
  if (!order.some((k) => isSet(cur, k))) return { applied: cur, relaxed };
  let n = await count(cur);
  for (const k of order) {
    if (n > 0) break;
    if (!isSet(cur, k)) continue;
    cur = without(cur, k);
    relaxed.push(k);
    n = await count(cur);
  }
  return { applied: cur, relaxed };
}


interface SanitizedIntent {
  summary: string;
  title: string | null;
  query: string | null;
  itemName: string | null;
  categoryHint: string | null;
  city: string | null;
  verifiedOnly: boolean;
  activity: string | null;
  priceMax: number | null;
  currency: string | null;
  quantity: number | null;
  unit: string | null;
  keywords: string[];
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** "1.500,50" → 1500.5 · "1500,5" → 1500.5 · "1500.5" → 1500.5 · "12 adet" → 12. */
export function parseModelNumber(v: unknown, max: number): number | null {
  if (v == null) return null;
  let t = String(v).trim().replace(/\s/g, "");
  // Eksi işaretli değer "uydurulmuş" sayılır — tavan/adet negatif olamaz.
  if (t.startsWith("-")) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/[^0-9.]/g, "");
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > max) return null;
  return Math.round(n * 1000) / 1000;
}

export function sanitizeIntent(raw: Record<string, unknown>, text: string): SanitizedIntent {
  const cat = str(raw.categoryHint, 80);
  const cur = str(raw.currency, 3)?.toUpperCase() ?? null;
  const act = str(raw.activity, 40);
  const kw = Array.isArray(raw.keywords)
    ? [...new Set(raw.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim().toLocaleLowerCase("tr-TR").slice(0, 40)).filter(Boolean))].slice(0, 8)
    : [];
  const unitRaw = str(raw.unit, 20);
  return {
    summary: str(raw.summary, 200) ?? `Anladığım: ${text.slice(0, 120)}`,
    title: str(raw.title, 80),
    query: str(raw.query, 120),
    itemName: str(raw.itemName, 120),
    // Kod gibi görünen ipucu düşer — kodu sistem bulur.
    categoryHint: cat && !/^\d{4,}$/.test(cat) ? cat : null,
    city: str(raw.city, 40),
    verifiedOnly: raw.verifiedOnly === true,
    activity: act && isCompanyActivity(act) ? act : null,
    priceMax: parseModelNumber(raw.priceMax, 1e12),
    currency: cur && CURRENCIES.has(cur) ? cur : null,
    quantity: parseModelNumber(raw.quantity, 1e9),
    // Birim insan etiketi olarak kalır ("adet") — sihirbaz taslak kalemini
    // etiketle okur (tender-extract sanitizer ile aynı), kodu formda çözer.
    unit: unitRaw ? unitRaw.toLocaleLowerCase("tr-TR") : null,
    keywords: kw,
  };
}

function buildDraft(
  text: string,
  s: SanitizedIntent,
  category: { id: string; nameTr: string } | null,
  result: AiCallResult,
): AiTenderExtractResult {
  const itemName = (s.itemName ?? s.query) as string;
  return {
    draft: {
      title: s.title ?? `${itemName} alımı`.slice(0, 80),
      description: text.slice(0, 2000),
      primaryCurrency: s.currency,
      deliveryTerm: null,
      paymentCategory: null,
      paymentDays: null,
      advancePercent: null,
      bidsCloseAt: null,
      keywords: s.keywords,
      isInternational: null,
      termsAndConditions: null,
      items: [
        {
          name: itemName,
          description: null,
          quantity: s.quantity,
          unit: s.unit ?? "adet",
          materialCode: null,
          requiredByDate: null,
          targetUnitPrice: null,
        },
      ],
      pricesIncludeVat: null,
      pageSummaries: [],
      suggestedCategoryIds: category ? [category.id] : [],
    },
    flags: [],
    missingRequired: [],
    route: "text",
    downgraded: result.downgraded,
    warned: result.warned,
  };
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const p: unknown = JSON.parse(text);
    return p != null && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
