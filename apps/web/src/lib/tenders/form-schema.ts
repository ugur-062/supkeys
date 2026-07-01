import { z } from "zod";

const CURRENCY_VALUES = [
  "TRY",
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
] as const;
const TYPE_VALUES = ["RFQ", "ENGLISH_AUCTION"] as const;
const VISIBILITY_VALUES = ["PRIVATE", "PUBLIC"] as const;
const DELIVERY_TERM_VALUES = [
  "DOMESTIC_DELIVERED",
  "DOMESTIC_PICKUP",
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
const PAYMENT_TERM_VALUES = ["CASH", "DEFERRED"] as const;
const PAYMENT_TIMING_VALUES = ["BEFORE_DELIVERY", "AFTER_DELIVERY"] as const;

export const BID_VISIBILITY_VALUES = [
  "OWN_ONLY",
  "BEST_PRICE",
  "OWN_RANK",
  "BEST_AND_OWN_RANK",
  "ALL",
] as const;
export type BidVisibility = (typeof BID_VISIBILITY_VALUES)[number];

export const DECREMENT_TYPE_VALUES = ["AMOUNT", "PERCENT"] as const;
export type DecrementType = (typeof DECREMENT_TYPE_VALUES)[number];

export const DECREMENT_BASIS_VALUES = ["OWN_LAST_BID", "BEST_BID"] as const;
export type DecrementBasis = (typeof DECREMENT_BASIS_VALUES)[number];

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

export const logisticsSchema = z.object({
  transportMode: z.enum(TRANSPORT_MODE_VALUES).optional(),
  originCity: z.string().max(60, "Maksimum 60 karakter").optional(),
  originDistrict: z.string().max(60).optional(),
  originAddress: z.string().max(300).optional(),
  destinationCity: z.string().max(60, "Maksimum 60 karakter").optional(),
  destinationDistrict: z.string().max(60).optional(),
  destinationAddress: z.string().max(300).optional(),
  cargoType: z.string().max(200, "Maksimum 200 karakter").optional(),
  weightKg: z.number({ invalid_type_error: "Geçersiz değer" }).min(0).optional(),
  volumeM3: z.number({ invalid_type_error: "Geçersiz değer" }).min(0).optional(),
  packageCount: z
    .number({ invalid_type_error: "Geçersiz değer" })
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
export type LogisticsFormData = z.infer<typeof logisticsSchema>;

export const tenderItemQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1, "Soru metni zorunlu").max(500, "Maksimum 500 karakter"),
  answerType: z.enum(ANSWER_TYPE_VALUES),
  required: z.boolean(),
});
export type TenderItemQuestion = z.infer<typeof tenderItemQuestionSchema>;

export const tenderItemSchema = z.object({
  name: z.string().min(1, "Kalem adı zorunlu").max(200, "Maksimum 200 karakter"),
  description: z.string().max(2000, "Maksimum 2000 karakter").optional(),
  quantity: z
    .number({ invalid_type_error: "Miktar girilmeli" })
    .min(0.0001, "Miktar 0'dan büyük olmalı"),
  unit: z.string().min(1, "Birim zorunlu").max(20, "Maksimum 20 karakter"),
  materialCode: z.string().max(50, "Maksimum 50 karakter").optional(),
  requiredByDate: z.string().optional(),
  targetUnitPrice: z
    .number({ invalid_type_error: "Geçersiz fiyat" })
    .min(0)
    .optional(),
  customQuestion: z.string().max(500, "Maksimum 500 karakter").optional(),
  questions: z.array(tenderItemQuestionSchema).max(20).optional(),
});

const baseTenderSchema = z.object({
  // Adım 1
  categoryIds: z
    .array(z.string().min(1))
    .min(1, "En az 1 kategori seçmelisiniz")
    .max(10, "En fazla 10 kategori seçebilirsiniz"),
  title: z
    .string()
    .min(3, "İhale adı en az 3 karakter olmalı")
    .max(200, "Maksimum 200 karakter"),
  description: z.string().max(5000, "Maksimum 5000 karakter").optional(),
  keywords: z
    .array(z.string().min(1).max(50, "Maksimum 50 karakter"))
    .max(10, "En fazla 10 anahtar kelime"),
  type: z.enum(TYPE_VALUES),
  isInternational: z.boolean(),
  // Sınır ötesi hedef ülkeler (ISO kodları). Boş = tüm yabancı ülkeler.
  targetCountries: z.array(z.string()),
  // Teslimat / fatura adresi (CompanyAddress id) — opsiyonel.
  deliveryAddressId: z.string().optional(),
  billingAddressId: z.string().optional(),
  visibility: z.enum(VISIBILITY_VALUES),
  isLogistics: z.boolean(),
  logistics: logisticsSchema.optional(),
  isSealedBid: z.boolean(),
  requireAllItems: z.boolean(),
  requireBidDocument: z.boolean(),
  primaryCurrency: z.enum(CURRENCY_VALUES),
  allowedCurrencies: z
    .array(z.enum(CURRENCY_VALUES))
    .min(1, "En az 1 para birimi zorunludur")
    .max(8, "En fazla 8 para birimi seçebilirsiniz"),
  deliveryTerm: z.enum(DELIVERY_TERM_VALUES).optional(),
  paymentTerm: z.enum(PAYMENT_TERM_VALUES),
  paymentDays: z
    .number({ invalid_type_error: "Geçersiz gün sayısı" })
    .int()
    .min(1)
    .max(365)
    .optional(),
  paymentTiming: z.enum(PAYMENT_TIMING_VALUES),
  termsAndConditions: z.string().max(10000).optional(),
  internalNotes: z.string().max(5000).optional(),
  bidsCloseAt: z.string().min(1, "Kapanış tarihi seçmelisin"),
  bidsOpenAt: z.string().optional(),

  // İngiliz Usulü açık eksiltme
  bidVisibility: z.enum(BID_VISIBILITY_VALUES),
  priceDecrementType: z.enum(DECREMENT_TYPE_VALUES).optional(),
  priceDecrementValue: z
    .number({ invalid_type_error: "Geçersiz değer" })
    .min(0)
    .optional(),
  priceDecrementBasis: z.enum(DECREMENT_BASIS_VALUES).optional(),
  decimalPlaces: z
    .number({ invalid_type_error: "Geçersiz ondalık basamak" })
    .int()
    .min(0)
    .max(4),
  autoExtendOnLateBid: z.boolean(),
  autoExtendThresholdMin: z
    .number({ invalid_type_error: "Geçersiz değer" })
    .int()
    .min(1)
    .max(30)
    .optional(),
  autoExtendByMinutes: z
    .number({ invalid_type_error: "Geçersiz değer" })
    .int()
    .min(1)
    .max(30)
    .optional(),

  // Adım 2
  items: z
    .array(tenderItemSchema)
    .min(1, "En az 1 kalem eklemelisin")
    .max(100, "Maksimum 100 kalem"),

  // Adım 3
  invitedSupplierIds: z.array(z.string()).max(50, "Maksimum 50 tedarikçi"),
});

export const tenderFormSchema = baseTenderSchema
  .refine(
    (d) =>
      d.paymentTerm === "CASH" ||
      (typeof d.paymentDays === "number" && d.paymentDays > 0),
    { message: "Vadeli ödeme için gün sayısı zorunlu", path: ["paymentDays"] },
  )
  .refine(
    (d) => {
      const t = new Date(d.bidsCloseAt).getTime();
      return Number.isFinite(t) && t > Date.now();
    },
    { message: "Kapanış tarihi gelecekte olmalı", path: ["bidsCloseAt"] },
  )
  .refine(
    (d) => {
      if (!d.bidsOpenAt) return true;
      const open = new Date(d.bidsOpenAt).getTime();
      const close = new Date(d.bidsCloseAt).getTime();
      return Number.isFinite(open) && open < close;
    },
    { message: "Açılış tarihi kapanıştan önce olmalı", path: ["bidsOpenAt"] },
  )
  .refine((d) => !d.isLogistics || !!d.logistics?.originCity?.trim(), {
    message: "Çıkış ili zorunlu",
    path: ["logistics", "originCity"],
  })
  .refine((d) => !d.isLogistics || !!d.logistics?.destinationCity?.trim(), {
    message: "Varış ili zorunlu",
    path: ["logistics", "destinationCity"],
  })
  .refine((d) => !d.isLogistics || !!d.logistics?.cargoType?.trim(), {
    message: "Kargo cinsi zorunlu",
    path: ["logistics", "cargoType"],
  });

export type TenderFormData = z.infer<typeof tenderFormSchema>;

export const STEP_FIELDS: Record<1 | 2 | 3 | 4, (keyof TenderFormData)[]> = {
  // Faz 1 — yalnızca tür + kapsam
  1: ["type", "isInternational", "targetCountries"],
  // Faz 2 — genel bilgi, kategori, kurallar, teslimat, ödeme, zamanlama
  2: [
    "categoryIds",
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
    "paymentTerm",
    "paymentDays",
    "termsAndConditions",
    "internalNotes",
    "bidsCloseAt",
    "bidsOpenAt",
    "bidVisibility",
    "priceDecrementType",
    "priceDecrementValue",
    "priceDecrementBasis",
    "decimalPlaces",
    "autoExtendOnLateBid",
    "autoExtendThresholdMin",
    "autoExtendByMinutes",
  ],
  3: ["items"],
  4: ["invitedSupplierIds"],
};

export const DEFAULT_FORM_VALUES: TenderFormData = {
  categoryIds: [],
  title: "",
  description: "",
  keywords: [],
  type: "RFQ",
  isInternational: false,
  targetCountries: [],
  deliveryAddressId: undefined,
  billingAddressId: undefined,
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
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  deliveryTerm: undefined,
  paymentTerm: "CASH",
  paymentDays: undefined,
  paymentTiming: "AFTER_DELIVERY",
  termsAndConditions: "",
  internalNotes: "",
  bidsCloseAt: "",
  bidsOpenAt: "",
  bidVisibility: "OWN_ONLY",
  priceDecrementType: undefined,
  priceDecrementValue: undefined,
  priceDecrementBasis: undefined,
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
      materialCode: "",
      requiredByDate: "",
      targetUnitPrice: undefined,
      customQuestion: "",
      questions: [],
    },
  ],
  invitedSupplierIds: [],
};
