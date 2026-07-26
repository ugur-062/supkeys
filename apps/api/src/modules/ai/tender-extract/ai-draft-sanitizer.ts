import {
  MAX_LISTING_HORIZON_MS,
  MAX_MONEY,
  MAX_QUANTITY,
  MIN_QUANTITY,
  type AiFieldFlag,
  type AiTenderDraft,
  type AiTenderDraftItem,
} from "@rothern/shared";
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
const CURRENCIES = new Set([
  "TRY", "USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY", "RUB",
]);
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

export interface SanitizedDraft {
  draft: AiTenderDraft;
  flags: AiFieldFlag[];
  missingRequired: string[];
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
    opts: { future?: boolean; maxHorizonMs?: number },
  ): string | null => {
    if (typeof v !== "string" || v.trim() === "") return null;
    const d = new Date(v.trim());
    if (Number.isNaN(d.getTime())) {
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
      unit: str(it.unit, p("unit"), { min: 1, max: 20 }),
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
    suggestedCategoryIds: (Array.isArray(r.suggestedCategoryIds)
      ? r.suggestedCategoryIds
      : []
    )
      .filter((c): c is string => typeof c === "string" && c.trim() !== "")
      .map((c) => c.trim().slice(0, 64))
      .slice(0, 10),
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
  const missingRequired: string[] = [];
  if (!draft.title) missingRequired.push("İhale başlığı");
  const usableItems = items.filter((i) => i.name);
  if (usableItems.length === 0) missingRequired.push("En az bir kalem");
  else {
    if (usableItems.some((i) => i.quantity == null)) missingRequired.push("Kalem miktarları");
    if (usableItems.some((i) => !i.unit)) missingRequired.push("Kalem birimleri");
  }
  if (!draft.deliveryTerm) missingRequired.push("Teslim şekli");
  if (!draft.bidsCloseAt) missingRequired.push("Teklif kapanış tarihi");
  // Kategori: AI önerisi varsa formda ön-dolu gelir (kullanıcı kontrol eder);
  // yoksa kullanıcının seçmesi gereken zorunlu alan olarak bildirilir.
  if (draft.suggestedCategoryIds.length === 0) {
    missingRequired.push("Kategori seçimi (platformdan)");
  }

  return { draft, flags, missingRequired };
}
