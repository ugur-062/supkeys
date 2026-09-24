import { z } from "zod";
import {
  MAX_COMPANY_ACTIVITIES,
  MAX_MONEY,
  MAX_QUANTITY,
  MIN_QUANTITY,
  MONEY_DECIMALS,
  QUANTITY_DECIMALS,
} from "@rothern/shared";
import { closesAtErrorKey } from "./closes-at";
import { maxDecimals } from "../money-input";

/**
 * Şema mesajı çevirmeni — `web.panel.requests` ad alanında çalışır; anahtarlar
 * `formSchema.<ad>` (bu dosya) ve `closesAt.<ad>` (`closes-at.ts`). Bileşende:
 * `const tReq = useTranslations("web.panel.requests")` →
 * `useMemo(() => makeTenderFormSchema((k, v) => tReq(k, v)), [tReq])`.
 * Şema FABRİKADIR (i18n Faz 2): zod mesajı tanım anında değerlenir, dil
 * bilmez → şema kullanıcının diliyle kurulur. Modül düzeyinde Türkçe sabit
 * şema YOK.
 */
export type RequestsTranslate = (key: string, values?: Record<string, string | number>) => string;

const money = (t: RequestsTranslate, schema: z.ZodNumber) =>
  schema
    .max(MAX_MONEY, t("formSchema.amountTooLarge"))
    .refine((n) => maxDecimals(n, MONEY_DECIMALS), t("formSchema.maxTwoDecimals"));

/** İlan başına kalem tavanı — backend CreateListingDto.items ArrayMaxSize ile
 *  birebir. Sınırsız DEĞİL: teklif karşılaştırma matrisi (kalem × teklifçi),
 *  sihirbaz form dizisi ve rapor/PDF üretimi makul bir tavan ister. */
export const MAX_LISTING_ITEMS = 500;

const CURRENCY_VALUES = [
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
] as const;
const TYPE_VALUES = ["RFQ", "ENGLISH_AUCTION"] as const;
const VISIBILITY_VALUES = ["PRIVATE", "CONNECTIONS", "PUBLIC"] as const;
const DELIVERY_TERM_VALUES = [
  "DOMESTIC_DELIVERED",
  "DOMESTIC_PICKUP",
  "DOMESTIC_CARRIER_COLLECT",
  "DOMESTIC_ON_VEHICLE",
  "EXW",
  "FCA",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
  "FAS",
  "FOB",
  "CFR",
  "CIF",
] as const;
// Ödeme planı kategorileri + LC alt tipleri — @rothern/shared ile birebir
// (derivePaymentTiming da oradan gelir; zamanlama artık form alanı DEĞİL).
export const PAYMENT_CATEGORY_VALUES = [
  "ADVANCE",
  "DEFERRED",
  "OPEN_ACCOUNT",
  "MAL_MUKABILI",
  "CHEQUE",
  "SENET",
  "LETTER_OF_CREDIT",
  "CASH_AGAINST_DOCS",
  "CUSTOM",
] as const;
export type PaymentCategoryValue = (typeof PAYMENT_CATEGORY_VALUES)[number];
export const LC_TYPE_VALUES = ["SIGHT", "USANCE"] as const;

export const BID_VISIBILITY_VALUES = [
  "OWN_ONLY",
  "BEST_PRICE",
  "OWN_RANK",
  "BEST_AND_OWN_RANK",
  "ALL",
] as const;
export type BidVisibility = (typeof BID_VISIBILITY_VALUES)[number];

export const ANSWER_TYPE_VALUES = ["TEXT", "NUMBER", "YES_NO", "DATE"] as const;
export type AnswerTypeValue = (typeof ANSWER_TYPE_VALUES)[number];

export const TRANSPORT_MODE_VALUES = [
  "ROAD",
  "SEA",
  "AIR",
  "RAIL",
  "MULTIMODAL",
] as const;
export type TransportMode = (typeof TRANSPORT_MODE_VALUES)[number];

export function makeLogisticsSchema(t: RequestsTranslate) {
  const maxChars = (n: number) => t("formSchema.maxChars", { n });
  return z.object({
    transportMode: z.enum(TRANSPORT_MODE_VALUES).optional(),
    originCity: z.string().max(60, maxChars(60)).optional(),
    originDistrict: z.string().max(60).optional(),
    originAddress: z.string().max(300).optional(),
    destinationCity: z.string().max(60, maxChars(60)).optional(),
    destinationDistrict: z.string().max(60).optional(),
    destinationAddress: z.string().max(300).optional(),
    cargoType: z.string().max(200, maxChars(200)).optional(),
    weightKg: z.number({ invalid_type_error: t("formSchema.invalidValue") }).min(0).optional(),
    volumeM3: z.number({ invalid_type_error: t("formSchema.invalidValue") }).min(0).optional(),
    packageCount: z
      .number({ invalid_type_error: t("formSchema.invalidValue") })
      .int()
      .min(0)
      .optional(),
    vehicleType: z.string().max(120).optional(),
    loadingDate: z.string().optional(),
    deliveryDate: z.string().optional(),
    hazardous: z.boolean().optional(),
    refrigerated: z.boolean().optional(),
    fragile: z.boolean().optional(),
    stackable: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  });
}
export type LogisticsFormData = z.infer<ReturnType<typeof makeLogisticsSchema>>;

export function makeTenderItemQuestionSchema(t: RequestsTranslate) {
  return z.object({
    id: z.string().min(1),
    text: z.string().min(1, t("formSchema.questionTextRequired")).max(500, t("formSchema.maxChars", { n: 500 })),
    answerType: z.enum(ANSWER_TYPE_VALUES),
    required: z.boolean(),
  });
}
export type TenderItemQuestion = z.infer<ReturnType<typeof makeTenderItemQuestionSchema>>;

export function makeTenderItemSchema(t: RequestsTranslate) {
  const maxChars = (n: number) => t("formSchema.maxChars", { n });
  return z.object({
    name: z.string().min(1, t("formSchema.itemNameRequired")).max(200, maxChars(200)),
    description: z.string().max(2000, maxChars(2000)).optional(),
    // F3: backend create-listing.dto ile birebir (@Min 0.001, @Max 1e9, 3 ondalık).
    quantity: z
      .number({ invalid_type_error: t("formSchema.quantityRequired") })
      .min(MIN_QUANTITY, t("formSchema.quantityMin"))
      .max(MAX_QUANTITY, t("formSchema.quantityTooLarge"))
      .refine((n) => maxDecimals(n, QUANTITY_DECIMALS), t("formSchema.maxThreeDecimals")),
    unit: z.string().min(1, t("formSchema.unitRequired")).max(20, maxChars(20)),
    /** Faz 1: kanonik birim kodu; "listede yok" seçilirse null kalır. */
    unitCode: z.string().nullable().optional(),
    /**
     * Katalogdan eklenen ürünün görselleri (ilk = kapak). Sihirbazda yükleme
     * alanı YOK — kapak ürün kaydından otomatik gelir; serbest kalemde boş.
     */
    images: z.array(z.string().max(500)).max(8).optional(),
    // ── Faz 3: kalem detayları (hepsi opsiyonel, katlanır panelde) ──────────
    brand: z.string().max(100, maxChars(100)).optional(),
    mpn: z.string().max(100, maxChars(100)).optional(),
    /** Muadil/eşdeğer teklif kabul edilir mi (varsayılan: evet). */
    alternativeAllowed: z.boolean().optional(),
    specification: z.string().max(5000, maxChars(5000)).optional(),
    warrantyMonths: z
      .number()
      .int(t("formSchema.integerRequired"))
      .min(0)
      .max(600, t("formSchema.warrantyMax"))
      .optional(),
    hsCode: z.string().max(20, maxChars(20)).optional(),
    materialCode: z.string().max(50, maxChars(50)).optional(),
    requiredByDate: z.string().optional(),
    targetUnitPrice: money(
      t,
      z.number({ invalid_type_error: t("formSchema.invalidPrice") }).min(0),
    ).optional(),
    customQuestion: z.string().max(500, maxChars(500)).optional(),
    questions: z.array(makeTenderItemQuestionSchema(t)).max(20).optional(),
  });
}

function makeBaseTenderSchema(t: RequestsTranslate) {
  const maxChars = (n: number) => t("formSchema.maxChars", { n });
  return z.object({
    // Adım 1
    categoryIds: z
      .array(z.string().min(1))
      .min(1, t("formSchema.categoryMin"))
      .max(3, t("formSchema.categoryMax")),
    /**
     * ARANAN TEDARİKÇİ TİPİ — isteğe bağlı. Boş dizi "fark etmez" demektir ve
     * sıralamayı hiç etkilemez; dolu olduğunda uyan firmalar duyuruda ve açık
     * talepler listesinde öne alınır (eleme YOK — backend gerekçesi şemada).
     */
    preferredActivities: z
      .array(z.string().min(1))
      .max(MAX_COMPANY_ACTIVITIES, t("formSchema.activitiesMax", { n: MAX_COMPANY_ACTIVITIES })),
    title: z
      .string()
      .min(3, t("formSchema.titleMin"))
      .max(200, maxChars(200)),
    description: z.string().max(5000, maxChars(5000)).optional(),
    keywords: z
      .array(z.string().min(1).max(50, maxChars(50)))
      .max(10, t("formSchema.keywordsMax")),
    type: z.enum(TYPE_VALUES),
    // Görünürlük ülkeleri (ISO kodları). BOŞ = tüm ülkeler (2026-09-21;
    // yurtiçi/uluslararası kapsamı kalktı — yurtiçi = [firma ülkesi]).
    targetCountries: z.array(z.string()),
    // Teslimat / fatura adresi (CompanyAddress id) — opsiyonel.
    // Teslimat adresi OPSİYONEL (W2): hizmet/lojistik ihalede fiziksel adres
    // anlamsız; backend zaten @IsOptional — frontend backend'den katı olmamalı.
    deliveryAddressId: z.string().optional(),
    billingAddressId: z.string().optional(),
    // Fatura adresi = teslimat adresi tiki (varsayılan işaretli). Kaldırılırsa
    // billingAddressId zorunlu olur (refine aşağıda).
    billingSameAsDelivery: z.boolean(),
    visibility: z.enum(VISIBILITY_VALUES),
    isLogistics: z.boolean(),
    logistics: makeLogisticsSchema(t).optional(),
    isSealedBid: z.boolean(),
    requireAllItems: z.boolean(),
    requireBidDocument: z.boolean(),
    // CC-1: kalem hedef/istenen fiyatını karşı tarafa göster (opt-in, varsayılan false).
    showTargetToSuppliers: z.boolean(),
    primaryCurrency: z.enum(CURRENCY_VALUES),
    allowedCurrencies: z
      .array(z.enum(CURRENCY_VALUES))
      .min(1, t("formSchema.currencyMin"))
      .max(8, t("formSchema.currencyMax")),
    // Teslim şekli ZORUNLU (2026-07-11 ürün kararı) — zorunluluk aşağıdaki
    // refine'da (tip opsiyonel kalır ki form boş başlayabilsin). "— Seçiniz —"
    // option'ının "" değeri undefined'a çevrilir; yoksa zod İngilizce
    // "Invalid enum value" basıyordu.
    deliveryTerm: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.enum(DELIVERY_TERM_VALUES).optional(),
    ),
    // Ödeme planı — zamanlama SORULMAZ, kategoriden türetilir (Faz 2).
    paymentCategory: z.enum(PAYMENT_CATEGORY_VALUES),
    // Yalnız Peşin: peşin yüzdesi (%100 = tam peşin; %<100 yalnız yurtiçi).
    advancePercent: z
      .number({ invalid_type_error: t("formSchema.invalidPercent") })
      .int()
      .min(1, t("formSchema.percentRange"))
      .max(100, t("formSchema.percentRange"))
      .optional(),
    // Tek "vade günü" alanı: Vadeli/Çek vadesi, LC-Usance vadesi, kısmi peşinde
    // kalanın vadesi (opsiyonel).
    paymentDays: z
      .number({ invalid_type_error: t("formSchema.invalidDays") })
      .int()
      .min(1)
      .max(365)
      .optional(),
    lcType: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      z.enum(LC_TYPE_VALUES).optional(),
    ),
    lcConfirmed: z.boolean(),
    paymentNote: z.string().max(1000, maxChars(1000)).optional(),
    // Peşin ödemede satıcıdan teminat mektubu istensin mi? (opsiyonel — sistem
    // önerir/işaretler; kullanıcı kaldırabilir. Diğer kategorilerde anlamsız.)
    requireGuaranteeLetter: z.boolean(),
    termsAndConditions: z.string().max(10000).optional(),
    // Kapanış zorunlu — superRefine'da (gelecekte + en fazla 2 yıl).
    bidsCloseAt: z.string(),
    bidsOpenAt: z.string().optional(),

    // İngiliz Usulü açık eksiltme (minimum pay kaldırıldı 2026-07-13)
    bidVisibility: z.enum(BID_VISIBILITY_VALUES),
    decimalPlaces: z
      .number({ invalid_type_error: t("formSchema.invalidDecimalPlaces") })
      .int()
      .min(0)
      .max(4),
    autoExtendOnLateBid: z.boolean(),
    autoExtendThresholdMin: z
      .number({ invalid_type_error: t("formSchema.invalidValue") })
      .int()
      .min(1)
      .max(30)
      .optional(),
    autoExtendByMinutes: z
      .number({ invalid_type_error: t("formSchema.invalidValue") })
      .int()
      .min(1)
      .max(30)
      .optional(),

    // Adım 2
    items: z
      .array(makeTenderItemSchema(t))
      .min(1, t("formSchema.itemsMin"))
      .max(MAX_LISTING_ITEMS, t("formSchema.itemsMax", { n: MAX_LISTING_ITEMS })),

    // Adım 3
    invitedSupplierIds: z.array(z.string()).max(50, t("formSchema.invitedMax")),
  });
}

/** Talep formu şeması — kullanıcının diliyle kurulur (bkz. `RequestsTranslate`). */
export function makeTenderFormSchema(t: RequestsTranslate) {
  return (
    makeBaseTenderSchema(t)
      // Teslim şekli zorunlu (tip opsiyonel — form boş başlar, yayında bu kural).
      .refine((d) => !!d.deliveryTerm, {
        message: t("formSchema.deliveryTermRequired"),
        path: ["deliveryTerm"],
      })
      .refine(
        // Fatura adresi: "teslimatla aynı" tiki kaldırıldıysa seçim zorunlu.
        (d) => d.billingSameAsDelivery || !!d.billingAddressId,
        { message: t("formSchema.billingAddressRequired"), path: ["billingAddressId"] },
      )
      .refine(
        (d) =>
          d.paymentCategory !== "DEFERRED" &&
          d.paymentCategory !== "CHEQUE" &&
          d.paymentCategory !== "SENET"
            ? true
            : typeof d.paymentDays === "number" && d.paymentDays > 0,
        { message: t("formSchema.paymentDaysRequired"), path: ["paymentDays"] },
      )
      // 2026-09-21: ödeme şekli ve kısmi peşin ülkeye göre KISITLANMAZ (backend
      // buildPaymentPlan aynası — kapılar oradan da kalktı).
      .refine(
        (d) => d.paymentCategory !== "LETTER_OF_CREDIT" || !!d.lcType,
        { message: t("formSchema.lcTypeRequired"), path: ["lcType"] },
      )
      .refine(
        (d) =>
          d.paymentCategory !== "LETTER_OF_CREDIT" ||
          d.lcType !== "USANCE" ||
          (typeof d.paymentDays === "number" && d.paymentDays > 0),
        {
          message: t("formSchema.lcUsanceDaysRequired"),
          path: ["paymentDays"],
        },
      )
      .refine(
        (d) => d.paymentCategory !== "CUSTOM" || !!d.paymentNote?.trim(),
        {
          message: t("formSchema.paymentNoteRequired"),
          path: ["paymentNote"],
        },
      )
      // F2: kapanış gelecekte + en fazla 2 yıl (backend birebir) — tek kaynak helper.
      .superRefine((d, ctx) => {
        if (!d.bidsCloseAt) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t("formSchema.closesAtRequired"),
            path: ["bidsCloseAt"],
          });
          return;
        }
        const err = closesAtErrorKey(d.bidsCloseAt);
        if (err)
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t(`closesAt.${err}`),
            path: ["bidsCloseAt"],
          });
      })
      .refine(
        (d) => {
          if (!d.bidsOpenAt || !d.bidsCloseAt) return true;
          const open = new Date(d.bidsOpenAt).getTime();
          const close = new Date(d.bidsCloseAt).getTime();
          return Number.isFinite(open) && open < close;
        },
        { message: t("formSchema.opensBeforeCloses"), path: ["bidsOpenAt"] },
      )
      .refine((d) => !d.isLogistics || !!d.logistics?.originCity?.trim(), {
        message: t("formSchema.originCityRequired"),
        path: ["logistics", "originCity"],
      })
      .refine((d) => !d.isLogistics || !!d.logistics?.destinationCity?.trim(), {
        message: t("formSchema.destinationCityRequired"),
        path: ["logistics", "destinationCity"],
      })
      .refine((d) => !d.isLogistics || !!d.logistics?.cargoType?.trim(), {
        message: t("formSchema.cargoTypeRequired"),
        path: ["logistics", "cargoType"],
      })
  );
}

export type TenderFormData = z.infer<ReturnType<typeof makeTenderFormSchema>>;

export const STEP_FIELDS: Record<1 | 2 | 3 | 4, (keyof TenderFormData)[]> = {
  // Faz 1 — yalnızca tür + kapsam
  1: ["type", "targetCountries"],
  // Faz 2 — kalemler
  2: ["items"],
  // Faz 3 — genel bilgi: kategori ("AI ile bul" girdisi = 2. adımın kalemleri),
  // kurallar, teslimat, ödeme, zamanlama; lojistik kategori seçiminden türer.
  3: [
    "categoryIds",
    "preferredActivities",
    "title",
    "description",
    "keywords",
    "isLogistics",
    "logistics",
    "isSealedBid",
    "requireAllItems",
    "requireBidDocument",
    "primaryCurrency",
    "allowedCurrencies",
    "deliveryTerm",
    "deliveryAddressId",
    "billingAddressId",
    "billingSameAsDelivery",
    "paymentCategory",
    "advancePercent",
    "paymentDays",
    "lcType",
    "lcConfirmed",
    "paymentNote",
    "termsAndConditions",
    "bidsCloseAt",
    "bidsOpenAt",
    "bidVisibility",
    "decimalPlaces",
    "autoExtendOnLateBid",
    "autoExtendThresholdMin",
    "autoExtendByMinutes",
  ],
  4: ["invitedSupplierIds"],
};

/**
 * Yerel "şimdi" — DateTimeInput/datetime-local değeri (YYYY-MM-DDTHH:mm).
 * Açılış tarihi varsayılanı: form açıldığı an (kullanıcı isteği 2026-08-02 —
 * alan boş gelmesin, o anki zaman yazılı gelsin). Geçmişte kalması sorun
 * değil: backend geçmiş açılışı "açılmış" sayar (embargo yalnız gelecekte).
 */
export function nowLocalDateTimeValue(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export const DEFAULT_FORM_VALUES: TenderFormData = {
  categoryIds: [],
  preferredActivities: [],
  title: "",
  description: "",
  keywords: [],
  type: "RFQ",
  targetCountries: [],
  deliveryAddressId: "",
  billingAddressId: undefined,
  billingSameAsDelivery: true,
  visibility: "PRIVATE",
  isLogistics: false,
  logistics: {
    transportMode: undefined,
    originCity: "",
    originDistrict: "",
    originAddress: "",
    destinationCity: "",
    destinationDistrict: "",
    destinationAddress: "",
    cargoType: "",
    weightKg: undefined,
    volumeM3: undefined,
    packageCount: undefined,
    vehicleType: "",
    loadingDate: "",
    deliveryDate: "",
    hazardous: false,
    refrigerated: false,
    fragile: false,
    stackable: false,
    notes: "",
  },
  isSealedBid: true,
  requireAllItems: false,
  requireBidDocument: false,
  showTargetToSuppliers: false,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  deliveryTerm: undefined,
  paymentCategory: "OPEN_ACCOUNT",
  advancePercent: undefined,
  paymentDays: undefined,
  lcType: undefined,
  lcConfirmed: false,
  paymentNote: "",
  requireGuaranteeLetter: false,
  termsAndConditions: "",
  bidsCloseAt: "",
  bidsOpenAt: "",
  bidVisibility: "OWN_RANK",
  decimalPlaces: 2,
  autoExtendOnLateBid: true,
  autoExtendThresholdMin: 2,
  autoExtendByMinutes: 2,
  items: [
    {
      name: "",
      description: "",
      quantity: 1,
      unit: "adet",
      unitCode: "PCE",
      alternativeAllowed: true,
      materialCode: "",
      requiredByDate: "",
      targetUnitPrice: undefined,
      customQuestion: "",
      questions: [],
    },
  ],
  invitedSupplierIds: [],
};
