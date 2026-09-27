import { i18nMessage } from "../../../common/i18n/http-i18n";
import { BadRequestException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import {
  CURRENCY_CODES,
  foldSearchText,
  isCompanyActivity,
  isCurrencyCode,
  isValidCountryCode,
  stemPrefix,
  tokenizeQuery,
  type AiSearchIntentResult,
  type AiSearchPortal,
  type AiSearchRelaxed,
  type AiTenderExtractResult,
} from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { PrismaBypassService, PrismaService } from "../../../common/prisma/prisma.service";
import { productIndexWhere } from "../../../common/company/product-index";
import { categoryName } from "../../../common/company/category-name";
import { geoIndex, type GeoCityRow } from "../../../common/geo/geo-index";
import { resolveCompanyCurrency } from "../../../common/currency/fx-rates";
import { currentLocale } from "../../../common/i18n/locale-context";
import { tApi } from "../../../common/i18n/i18n.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { AiService, type AiCallResult } from "../ai.service";
import { resolveCategoryHints, type ResolvedCategory } from "../category-hint-resolver";
import { canonicalUnitName } from "../tender-extract/ai-draft-sanitizer";
import { lowerCaseWords } from "../ai-text";
import {
  SEARCH_INTENT_RESPONSE_SCHEMA,
  buildSearchIntentPrompt,
  searchIntentSystemPrompt,
} from "./search-intent.prompts";

export const SEARCH_INTENT_MAX_TEXT = 500;

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
    /** RLS: ürün sayımı ÇAPRAZ firma okur (gevşetme "0 sonuç" kontrolü) → bypass. */
    @Optional() private readonly bypass?: PrismaBypassService,
  ) {}

  async interpret(
    user: AuthenticatedCompanyUser,
    dto: { text: string; portal: AiSearchPortal },
  ): Promise<AiSearchIntentResult> {
    this.ai.assertAiAccess(user);
    const text = (dto.text ?? "").replace(/\s+/g, " ").trim();
    if (text.length < 3) throw new BadRequestException(i18nMessage("api.ai.neAradiginiziBirkacKelimeyleYazin"));
    if (text.length > SEARCH_INTENT_MAX_TEXT) {
      throw new BadRequestException(i18nMessage("api.ai.enFazlaKarakter", { SEARCHINTENTMAXTEXT: SEARCH_INTENT_MAX_TEXT }));
    }
    const portal: AiSearchPortal = dto.portal === "satis" ? "satis" : "satinalma";
    const locale = currentLocale();

    const callOptions = {
      feature: "search_intent",
      prompt: buildSearchIntentPrompt(text, portal),
      system: searchIntentSystemPrompt(locale, CURRENCY_CODES),
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
      throw new ServiceUnavailableException(i18nMessage("api.ai.aramaYorumlanamadiTekrarDeneyin"));
    }

    const s = sanitizeIntent(parsed, text);
    const resolved = s.categoryHint
      ? await resolveCategoryHints(this.prisma, [s.categoryHint], { discoveryOnly: portal === "satinalma" })
      : new Map<string, ResolvedCategory>();
    const category = s.categoryHint ? (resolved.get(s.categoryHint) ?? null) : null;
    const place = resolvePlace(s.city, s.country);

    // Taslak, GEVŞETMEDEN ÖNCEKİ çözümle kurulur: kategori ürün listesinde
    // sonuç vermese de talep için doğru öneri olabilir (kullanıcı formda görür).
    const draft =
      portal === "satinalma" && (s.itemName || s.query)
        ? buildDraft(text, s, category, result, locale)
        : null;

    // Fiyat tavanının birimi: model söylediyse o, yoksa ürün dizininin panel
    // varsayılanı (firma ülkesinin para birimi — web `para` yazmazsa sunucu
    // da onu çözer; sayım ile liste aynı birimde kıyaslar).
    const priceCurrency = resolveCompanyCurrency(s.currency, user.country ?? null);

    // GEVŞETME: süzgeçlerin tamamı 0 sonuç veriyorsa en az güvenilenden
    // başlayarak kaldır — AI araması "hiçbir şey bulunamadı" ile bitmesin.
    // Şehir anahtarı iki portalda da dünya şehir listesinin kalıcı adresi
    // (`?sehir=bursa,de-munich`); ülke ürün dizininde SATICININ, açık
    // taleplerde ALICININ ülkesi (`?ulke=`).
    const filters: Filters = {
      query: s.query,
      category,
      city: place.city?.slug ?? null,
      country: place.country,
      verifiedOnly: s.verifiedOnly,
      activity: s.activity,
      priceMax: s.priceMax,
      priceCurrency,
      quantity: s.quantity,
    };
    const out =
      portal === "satinalma"
        ? await this.relaxProducts(user, filters)
        : await this.relaxRequests(user, filters, place.unresolvedCity ? s.city : null);
    const { applied } = out;
    // Metinde şehir geçti ama dünya şehir listesinde (satışta: eşlenmemiş
    // alıcı şehirlerinde de) bulunamadı: süzgeç uygulanamaz (uygulansaydı 0
    // sonuç verirdi) — bant "şehir kaldırıldı" der.
    const relaxed: AiSearchRelaxed[] =
      place.unresolvedCity && !out.rawCity && !out.relaxed.includes("city") ? ["city", ...out.relaxed] : out.relaxed;

    return {
      portal,
      summary: s.summary,
      query: applied.query,
      category: applied.category ? { id: applied.category.id, name: categoryName(applied.category, locale) } : null,
      categoryHint: s.categoryHint,
      city: applied.city,
      cityName: applied.city ? (place.city ? geoIndex().label(place.city, locale) : applied.city) : null,
      country: applied.country,
      verifiedOnly: applied.verifiedOnly,
      activity: applied.activity,
      priceMax: applied.priceMax,
      // Tavan uygulandıysa KIYASLANAN birim (web `?para=` yazar, çip basar).
      currency: applied.priceMax != null ? priceCurrency : s.currency,
      quantity: applied.quantity,
      unit: s.unit,
      keywords: s.keywords,
      relaxed,
      relaxedCategoryName: relaxed.includes("category") && category ? categoryName(category, locale) : null,
      draft,
      downgraded: result.downgraded,
      warned: result.warned,
    };
  }

  /** Ürün dizini: sayım gerçek süzgeç motorundan (`productIndexWhere`) — liste ile aynı kural. */
  private async relaxProducts(user: AuthenticatedCompanyUser, f: Filters) {
    const count = (x: Filters) =>
      (this.bypass ?? this.prisma).companyItem.count({
        where: productIndexWhere(
          {
            q: x.query ?? undefined,
            category: x.category?.id,
            city: x.city ?? undefined,
            country: x.country ?? undefined,
            activity: x.activity ?? undefined,
            verified: x.verifiedOnly || undefined,
            priceMax: x.priceMax ?? undefined,
            currency: x.priceMax != null ? x.priceCurrency : undefined,
            moqMax: x.quantity != null ? Math.max(1, Math.trunc(x.quantity)) : undefined,
          },
          [{ companyId: { not: user.companyId } }],
        ),
      });
    const r = await relax(f, PRODUCT_RELAX_ORDER, count);
    return { ...r, rawCity: null as string | null };
  }

  /**
   * Açık talepler: satıcının görebildiği açık talepler (liste ile AYNI kaynak)
   * üzerinde sayım — web süzgeciyle AYNI kural (`request-facets` `passes`):
   * şehir anahtarı alıcının dünya şehir kaydının kalıcı adresi (eşlenmemiş
   * şehirde ham metin; ham metin eski bağlantılar için de eşleşir), ülke
   * alıcının ülkesi.
   *
   * `unmatchedCity`: model şehri dünya listesinde bulunamadı — alıcısı
   * eşlenmemiş (serbest metin) şehirde olan satırlarda aynı ad aranır;
   * bulunursa süzgeç o HAM metinle kurulur (web de ham metinle eşler).
   */
  private async relaxRequests(user: AuthenticatedCompanyUser, f: Filters, unmatchedCity: string | null) {
    if (!this.listings) return { applied: f, relaxed: [] as AiSearchRelaxed[], rawCity: null as string | null };
    const rows = await this.listings.sellerTenders(user, "ALIM", { openOnly: true });
    const hay = rows.map((r) => ({
      seg: r.categories.map((c) => c.code.slice(0, 2)),
      cityKey: r.ownerCitySlug || r.ownerCity || null,
      cityText: r.ownerCity ?? null,
      country: r.ownerCountry ?? null,
      text: foldSearchText(
        [r.title, r.number ?? "", r.owner?.name ?? "", ...(r.itemNames ?? []), ...r.categories.map((c) => c.name)].join(" "),
      ),
    }));
    let rawCity: string | null = null;
    if (!f.city && unmatchedCity) {
      const want = foldSearchText(unmatchedCity);
      rawCity =
        hay.find((h) => h.cityText && h.cityKey === h.cityText && foldSearchText(h.cityText) === want)?.cityText ?? null;
    }
    const start: Filters = rawCity ? { ...f, city: rawCity } : f;
    const count = async (x: Filters) => {
      // Web listesiyle AYNI kural: kelimeler AND, ek toleranslı (`stemPrefix`).
      const ts = x.query ? tokenizeQuery(x.query).map((t) => stemPrefix(foldSearchText(t))) : [];
      const seg = x.category?.id.slice(0, 2);
      return hay.filter(
        (h) =>
          ts.every((t) => h.text.includes(t)) &&
          (!seg || h.seg.includes(seg)) &&
          (!x.city || h.cityKey === x.city || h.cityText === x.city) &&
          (!x.country || h.country === x.country),
      ).length;
    };
    const r = await relax(start, REQUEST_RELAX_ORDER, count);
    return { ...r, rawCity };
  }
}

/**
 * Modelin şehir/ülke yazımı → dünya şehir listesi kaydı. Ülke verildiyse şehir
 * O ÜLKEDE aranır (aynı adlı şehirler: "Batumi" GE); verilmediyse herhangi
 * dildeki tam ad (en kalabalık kayıt, Türkiye illeri önce). Ülke koduyla
 * birlikte geçersiz kod düşer; şehirden ülke TÜRETİLMEZ — şehir süzgeci zaten
 * ülkeyi daraltır, ülke yalnız şehir gevşetilince kalan yedek süzgeçtir.
 */
export function resolvePlace(
  city: string | null,
  country: string | null,
): { city: GeoCityRow | null; country: string | null; unresolvedCity: boolean } {
  const cc = country && isValidCountryCode(country) ? country : null;
  if (!city) return { city: null, country: cc, unresolvedCity: false };
  const idx = geoIndex();
  const row = cc ? idx.byId(idx.resolveText(cc, city)) : idx.resolveParam(city);
  return { city: row, country: cc, unresolvedCity: row == null };
}

interface Filters {
  query: string | null;
  category: ResolvedCategory | null;
  /**
   * Şehir süzgecinin URL anahtarı (`?sehir=`): dünya şehir listesinin kalıcı
   * adresi; satışta eşlenmemiş alıcı şehrinde ham metin.
   */
  city: string | null;
  /** Ürün dizininde satıcının, açık taleplerde alıcının ülkesi (ISO, `?ulke=`). */
  country: string | null;
  verifiedOnly: boolean;
  activity: string | null;
  priceMax: number | null;
  /** `priceMax`ın birimi — dizin kurla TRY tabanına çevirip kıyaslar. */
  priceCurrency: string;
  quantity: number | null;
}

/**
 * En az güvenilenden en çok güvenilene: kategori (ipucu çözümü) → tavanlar →
 * nitelikler → şehir → ülke (şehir kalkınca ülke yedek süzgeç olarak kalır)
 * → EN SON arama kelimeleri (kısaltılır, tümden kalkmaz).
 */
const PRODUCT_RELAX_ORDER: AiSearchRelaxed[] = ["category", "priceMax", "quantity", "activity", "verifiedOnly", "city", "country", "query"];
const REQUEST_RELAX_ORDER: AiSearchRelaxed[] = ["category", "city", "country", "query"];

const queryTokens = (q: string | null) => (q ? tokenizeQuery(q) : []);

const isSet = (f: Filters, k: AiSearchRelaxed) =>
  k === "verifiedOnly" ? f.verifiedOnly : k === "query" ? queryTokens(f.query).length > 1 : f[k] != null;

function without(f: Filters, k: AiSearchRelaxed): Filters {
  return k === "verifiedOnly" ? { ...f, verifiedOnly: false } : { ...f, [k]: null };
}

/**
 * Arama kelimeleri "BİRİ HARİÇ" denenerek kısaltılır: n kelimeden en çok
 * sonuç veren (n-1)'lik alt küme seçilir, gerekirse tekrar — tek kelime
 * kalana dek. Sondan kırpmak yanlış kelimeyi düşürebilirdi ("elektrik panosu
 * kompanzasyon"da anahtar kelime ortadaki).
 */
async function shrinkQuery(f: Filters, count: (x: Filters) => Promise<number>): Promise<{ f: Filters; n: number }> {
  let tokens = queryTokens(f.query);
  let cur = f;
  let n = 0;
  while (tokens.length > 1) {
    let best: { tokens: string[]; n: number } | null = null;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const cand = tokens.filter((_, j) => j !== i);
      const c = await count({ ...cur, query: cand.join(" ") });
      if (!best || c > best.n) best = { tokens: cand, n: c };
    }
    tokens = best!.tokens;
    cur = { ...cur, query: tokens.join(" ") };
    n = best!.n;
    if (n > 0) break;
  }
  return { f: cur, n };
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
    if (k === "query") {
      const r = await shrinkQuery(cur, count);
      cur = r.f;
      n = r.n;
      relaxed.push("query");
      continue;
    }
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
  country: string | null;
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

/** Eski istemin sabit öneki — bant artık kendi başlığını basıyor. */
const LEGACY_SUMMARY_PREFIX = /^anlad[ıi]ğ[ıi]m\s*:\s*/i;

export function sanitizeIntent(raw: Record<string, unknown>, text: string): SanitizedIntent {
  const cat = str(raw.categoryHint, 80);
  const cur = str(raw.currency, 3)?.toUpperCase() ?? null;
  const cc = str(raw.country, 2)?.toUpperCase() ?? null;
  const act = str(raw.activity, 40);
  const kw = Array.isArray(raw.keywords)
    ? [...new Set(raw.keywords.filter((k): k is string => typeof k === "string").map((k) => lowerCaseWords(k.trim()).slice(0, 40)).filter(Boolean))].slice(0, 8)
    : [];
  const summary = str(raw.summary, 200)?.replace(LEGACY_SUMMARY_PREFIX, "").trim() || null;
  return {
    // Yedek özet arayüz dilinde; kullanıcının metni aynen tırnak içinde.
    summary: summary ?? tApi("api.ai.searchSummaryFallback", { text: text.slice(0, 120) }),
    title: str(raw.title, 80),
    query: str(raw.query, 120),
    itemName: str(raw.itemName, 120),
    // Kod gibi görünen ipucu düşer — kodu sistem bulur.
    categoryHint: cat && !/^\d{4,}$/.test(cat) ? cat : null,
    city: str(raw.city, 60),
    country: cc && isValidCountryCode(cc) ? cc : null,
    verifiedOnly: raw.verifiedOnly === true,
    activity: act && isCompanyActivity(act) ? act : null,
    priceMax: parseModelNumber(raw.priceMax, 1e12),
    currency: isCurrencyCode(cur) ? cur : null,
    quantity: parseModelNumber(raw.quantity, 1e9),
    // Birim: tanınan birim (kod "PCE", "pcs", "adet"…) formun sakladığı
    // Türkçe ada ("adet") — web `useUnitLabel` okuyucunun dilinde basar;
    // tanınmayan serbest metin olduğu gibi (tender-extract sanitizer ile aynı).
    unit: canonicalUnitName(str(raw.unit, 20)),
    keywords: kw,
  };
}

function buildDraft(
  text: string,
  s: SanitizedIntent,
  category: ResolvedCategory | null,
  result: AiCallResult,
  locale: Locale,
): AiTenderExtractResult {
  const itemName = (s.itemName ?? s.query) as string;
  return {
    draft: {
      title: s.title ?? tApi("api.ai.searchDraftTitle", { item: itemName }, locale).slice(0, 80),
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
