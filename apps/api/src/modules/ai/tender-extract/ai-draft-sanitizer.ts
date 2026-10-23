import {
  CURRENCY_CODES,
  MAX_LISTING_HORIZON_MS,
  MAX_MONEY,
  MAX_QUANTITY,
  MIN_QUANTITY,
  getUnit,
  normalizeUnit,
  visibleCategoryIds,
  type AiFieldFlag,
  type AiMissingField,
  type AiTenderDraft,
  type AiTenderDraftItem,
} from "@rothern/shared";
import { DEFAULT_TIME_ZONE, zonedTimeToUtc } from "../../../common/time/country-time-zone";
import type { AiExtractRoute } from "./ai-extract-router";

/**
 * Faz AI-1 — AI çıktısı ELLE GİRİLMİŞ GİBİ aynı tek-kaynak kurallardan geçer
 * (shared limits + DTO enum'ları). Ayrı doğrulama yolu YOK: geçmeyen değer
 * null'a düşer + `validation_failed` flag — backend DTO'sunun reddedeceği değer
 * forma asla yazılmaz (sessiz 400 kapalı). Wizard'ın zodResolver'ı ikinci
 * güvence.
 *
 * Model kandırılsa bile (prompt injection) yalnız buradaki şema alanları,
 * buradaki sınırlar içinde geçer — son savunma hattı budur.
 */

// DTO/zod ile birebir enum listeleri (create-listing.dto.ts / form-schema.ts).
// Para birimi tek kaynak `@rothern/shared` `CURRENCY_CODES` (Prisma enum'la birebir).
const CURRENCIES = new Set<string>(CURRENCY_CODES);
const DELIVERY_TERMS = new Set([
  "DOMESTIC_DELIVERED", "DOMESTIC_PICKUP", "DOMESTIC_CARRIER_COLLECT",
  "DOMESTIC_ON_VEHICLE", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP",
  "FAS", "FOB", "CFR", "CIF",
]);
const PAYMENT_CATEGORIES = new Set([
  "ADVANCE", "DEFERRED", "OPEN_ACCOUNT", "MAL_MUKABILI", "CHEQUE", "SENET",
  "LETTER_OF_CREDIT", "CASH_AGAINST_DOCS", "CUSTOM",
]);

/** Vision yolunda VARSAYILAN işaretli kritik alanlar — en sık yanlış okunanlar;
 *  yanlışsa teklifler kıyaslanamaz hale gelir. */
const VISION_CRITICAL_ITEM_FIELDS = ["quantity", "unit", "requiredByDate"] as const;
const VISION_CRITICAL_TOP_FIELDS = ["bidsCloseAt", "primaryCurrency"] as const;

/** lowConfidencePaths beyaz-liste deseni — modelin uydurduğu yollar elenmesin diye. */
const KNOWN_PATH_RE =
  /^(title|description|primaryCurrency|deliveryTerm|paymentCategory|paymentDays|advancePercent|bidsCloseAt|keywords|isInternational|termsAndConditions|items\.\d+\.(name|description|quantity|unit|materialCode|requiredByDate|targetUnitPrice))$/;

/**
 * Model birimi → formun sakladığı biçim (2026-09-27): tanınan birim — kod
 * ("PCE"), İngilizce ("pcs") ya da Türkçe ("Adet") — katalogdaki Türkçe ada
 * ("adet") iner; web `useUnitLabel` onu okuyucunun dilinde basar ("pcs",
 * "шт."). Tanınmayan serbest metin olduğu gibi kalır (kullanıcı formda görür).
 * İstem birimi kodla ister: Almanca/Rusça belgeden "Stück"/"шт" gelse de
 * kalem tek biçimde saklansın.
 */
export function canonicalUnitName(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  const code = normalizeUnit(t);
  return code ? (getUnit(code)?.nameTr ?? t) : t;
}

export interface SanitizedDraft {
  draft: AiTenderDraft;
  flags: AiFieldFlag[];
  missingRequired: AiMissingField[];
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAIVE_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** Saat verilmeyen kapanis gunu: urun saat diliminde gun sonu (23:59). */
export const DATE_ONLY_CLOSE_HOUR = 23;
export const DATE_ONLY_CLOSE_MINUTE = 59;

/**
 * Kapanis ani — urun saat dilimi (Europe/Istanbul) duvar saatiyle okunur
 * (derin denetim MU-07). Eskiden `new Date(v)` kullaniliyordu: istemin
 * istedigi "YYYY-MM-DD" UTC gece yarisina (TR 03:00) donusup talep soylenen
 * gunun basinda kapaniyordu; ofsetsiz "2026-10-05T14:00" de sunucunun (UTC)
 * saatiyle okunup 3 saat kayiyordu. Kural:
 *  - yalniz gun → o gunun 23:59'u (Istanbul),
 *  - ofsetsiz tarih-saat → Istanbul duvar saati,
 *  - ofsetli / `Z` ISO → oldugu gibi.
 * Gecersizse `null`.
 */
export function parseClosingInstant(raw: string): Date | null {
  const v = raw.trim();
  const dateOnly = DATE_ONLY_RE.exec(v);
  const naive = dateOnly ? null : NAIVE_DATETIME_RE.exec(v);
  const m = dateOnly ?? naive;
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const h = dateOnly ? DATE_ONLY_CLOSE_HOUR : Number(m[4]);
    const mi = dateOnly ? DATE_ONLY_CLOSE_MINUTE : Number(m[5]);
    const s = dateOnly ? 0 : Number(m[6] ?? 0);
    // Takvim disi deger (2026-02-31, 25:00) Date.UTC'de sessizce tasar — reddet.
    const probe = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
    if (
      probe.getUTCFullYear() !== y ||
      probe.getUTCMonth() !== mo - 1 ||
      probe.getUTCDate() !== d ||
      probe.getUTCHours() !== h ||
      probe.getUTCMinutes() !== mi
    ) {
      return null;
    }
    const out = zonedTimeToUtc(y, mo, d, h, mi, DEFAULT_TIME_ZONE);
    return new Date(out.getTime() + s * 1000);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export function sanitizeAiDraft(
  raw: unknown,
  route: AiExtractRoute | "refine",
): SanitizedDraft {
  const flags: AiFieldFlag[] = [];
  const r = (raw ?? {}) as Record<string, unknown>;
  const flag = (path: string, reason: AiFieldFlag["reason"]) => {
    if (!flags.some((f) => f.path === path && f.reason === reason)) {
      flags.push({ path, reason });
    }
  };

  const str = (
    v: unknown,
    path: string,
    opts: { min?: number; max: number; truncate?: boolean },
  ): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t === "") return null;
    if (opts.min != null && t.length < opts.min) {
      flag(path, "validation_failed");
      return null;
    }
    if (t.length > opts.max) {
      if (opts.truncate) return t.slice(0, opts.max);
      flag(path, "validation_failed");
      return null;
    }
    return t;
  };

  const num = (
    v: unknown,
    path: string,
    opts: { min: number; max: number; decimals: number; int?: boolean },
  ): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const n = opts.int ? Math.round(v) : round(v, opts.decimals);
    if (n < opts.min || n > opts.max) {
      flag(path, "validation_failed");
      return null;
    }
    return n;
  };

  const enumVal = (v: unknown, path: string, allowed: Set<string>): string | null => {
    if (typeof v !== "string" || v.trim() === "") return null;
    const t = v.trim().toUpperCase();
    if (!allowed.has(t)) {
      flag(path, "validation_failed");
      return null;
    }
    return t;
  };

  const isoDate = (
    v: unknown,
    path: string,
    opts: { future?: boolean; maxHorizonMs?: number; appWallClock?: boolean },
  ): string | null => {
    if (typeof v !== "string" || v.trim() === "") return null;
    const d = opts.appWallClock ? parseClosingInstant(v) : new Date(v.trim());
    if (!d || Number.isNaN(d.getTime())) {
      flag(path, "validation_failed");
      return null;
    }
    const now = Date.now();
    if (opts.future && d.getTime() <= now) {
      flag(path, "validation_failed");
      return null;
    }
    if (opts.maxHorizonMs != null && d.getTime() > now + opts.maxHorizonMs) {
      flag(path, "validation_failed");
      return null;
    }
    return d.toISOString();
  };

  // Kalemler
  const rawItems = Array.isArray(r.items) ? r.items : [];
  const items: AiTenderDraftItem[] = rawItems.slice(0, 500).map((ri, i) => {
    const it = (ri ?? {}) as Record<string, unknown>;
    const p = (f: string) => `items.${i}.${f}`;
    return {
      name: str(it.name, p("name"), { min: 1, max: 200 }),
      description: str(it.description, p("description"), { max: 2000, truncate: true }),
      quantity: num(it.quantity, p("quantity"), {
        min: MIN_QUANTITY,
        max: MAX_QUANTITY,
        decimals: 3,
      }),
      unit: canonicalUnitName(str(it.unit, p("unit"), { min: 1, max: 20 })),
      materialCode: str(it.materialCode, p("materialCode"), { max: 50 }),
      requiredByDate: isoDate(it.requiredByDate, p("requiredByDate"), {}),
      targetUnitPrice: num(it.targetUnitPrice, p("targetUnitPrice"), {
        min: 0.01,
        max: MAX_MONEY,
        decimals: 2,
      }),
    };
  });

  const draft: AiTenderDraft = {
    title: str(r.title, "title", { min: 3, max: 200 }),
    description: str(r.description, "description", { max: 5000, truncate: true }),
    primaryCurrency: enumVal(r.primaryCurrency, "primaryCurrency", CURRENCIES),
    deliveryTerm: enumVal(r.deliveryTerm, "deliveryTerm", DELIVERY_TERMS),
    paymentCategory: enumVal(r.paymentCategory, "paymentCategory", PAYMENT_CATEGORIES),
    paymentDays: num(r.paymentDays, "paymentDays", { min: 1, max: 365, decimals: 0, int: true }),
    advancePercent: num(r.advancePercent, "advancePercent", { min: 1, max: 100, decimals: 0, int: true }),
    bidsCloseAt: isoDate(r.bidsCloseAt, "bidsCloseAt", {
      future: true,
      appWallClock: true,
      maxHorizonMs: MAX_LISTING_HORIZON_MS,
    }),
    keywords: (Array.isArray(r.keywords) ? r.keywords : [])
      .filter((k): k is string => typeof k === "string" && k.trim() !== "")
      .map((k) => k.trim().slice(0, 50))
      .slice(0, 10),
    isInternational: typeof r.isInternational === "boolean" ? r.isInternational : null,
    termsAndConditions: str(r.termsAndConditions, "termsAndConditions", {
      max: 10_000,
      truncate: true,
    }),
    items,
    pricesIncludeVat: typeof r.pricesIncludeVat === "boolean" ? r.pricesIncludeVat : null,
    pageSummaries: (Array.isArray(r.pageSummaries) ? r.pageSummaries : [])
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.slice(0, 500))
      .slice(0, 50),
    // Backend'in DB'ye karşı doğruladığı öneri — revive/refine döngülerinde
    // kaybolmasın diye taşınır; model bu alanı üretMEZ (üretse de yalnız
    // string id biçimi geçer, servis DB'de yeniden doğrular).
    // Gizli segmentteki kod TAŞINMAZ (2026-10-09): segment gizlenmeden önce
    // önerilmiş kod eski oturumdan / istemcideki taslaktan geri gelirdi — onay
    // kartı ve form gizli kategoriyi gösterir, yayın 400 alırdı. Boşalan liste
    // "kategori eksik" sayılır ve kalemlerden yeniden önerilir (öneri servisi
    // yalnız görünür segmentlerden seçer).
    suggestedCategoryIds: visibleCategoryIds(
      (Array.isArray(r.suggestedCategoryIds) ? r.suggestedCategoryIds : [])
        .filter((c): c is string => typeof c === "string" && c.trim() !== "")
        .map((c) => c.trim().slice(0, 64)),
    ).slice(0, 10),
    // Kaynak işareti: belge yolları her zaman belgeden; "refine" (oturumdan
    // revive, istemci/model taslağı) gelen değeri korur — model argümanındaki
    // değeri çağıran önceki taslakla ezer (assistant propose_tender_draft).
    fromDocument: route === "refine" ? r.fromDocument === true : true,
  };

  // Model güven bildirimi (beyaz-liste süzgeçli).
  for (const p of Array.isArray(r.lowConfidencePaths) ? r.lowConfidencePaths : []) {
    if (typeof p === "string" && KNOWN_PATH_RE.test(p)) flag(p, "low_confidence");
  }

  // Vision yolu: kritik alanlar KOŞULSUZ işaretli (model güveninden bağımsız).
  if (route === "pdf_vision" || route === "image_vision") {
    for (const f of VISION_CRITICAL_TOP_FIELDS) flag(f, "vision_critical");
    items.forEach((_, i) => {
      for (const f of VISION_CRITICAL_ITEM_FIELDS) flag(`items.${i}.${f}`, "vision_critical");
    });
  }

  // KDV: formda alan yok — fiyatlar KDV hariç olmalı; belge dahil gösteriyorsa uyar.
  if (draft.pricesIncludeVat === true) flag("prices", "vat_warning");

  // Eksik ZORUNLU alanlar (AI sorar; opsiyoneller boş bırakılır — kullanıcı yorulmaz).
  const missingRequired: AiMissingField[] = [];
  if (!draft.title) missingRequired.push("title");
  const usableItems = items.filter((i) => i.name);
  if (usableItems.length === 0) missingRequired.push("items");
  else {
    if (usableItems.some((i) => i.quantity == null)) missingRequired.push("quantities");
    if (usableItems.some((i) => !i.unit)) missingRequired.push("units");
  }
  if (!draft.deliveryTerm) missingRequired.push("deliveryTerm");
  if (!draft.bidsCloseAt) missingRequired.push("bidsCloseAt");
  // Kategori: AI önerisi varsa formda ön-dolu gelir (kullanıcı kontrol eder);
  // yoksa kullanıcının seçmesi gereken zorunlu alan olarak bildirilir.
  if (draft.suggestedCategoryIds.length === 0) {
    missingRequired.push("category");
  }

  return { draft, flags, missingRequired };
}
