import { z } from "zod";

const CURRENCY_VALUES = ["TRY", "USD", "EUR"] as const;
const TYPE_VALUES = ["RFQ", "ENGLISH_AUCTION"] as const;
const DELIVERY_TERM_VALUES = [
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

export const tenderItemSchema = z.object({
  name: z
    .string()
    .min(1, "Kalem adı zorunlu")
    .max(200, "Maksimum 200 karakter"),
  description: z.string().max(2000, "Maksimum 2000 karakter").optional(),
  quantity: z
    .number({ invalid_type_error: "Miktar girilmeli" })
    .min(0.0001, "Miktar 0'dan büyük olmalı"),
  unit: z
    .string()
    .min(1, "Birim zorunlu")
    .max(20, "Maksimum 20 karakter"),
  materialCode: z.string().max(50, "Maksimum 50 karakter").optional(),
  requiredByDate: z.string().optional(),
  targetUnitPrice: z
    .number({ invalid_type_error: "Geçersiz fiyat" })
    .min(0)
    .optional(),
  customQuestion: z.string().max(500, "Maksimum 500 karakter").optional(),
});

export const tenderAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1),
  mimeType: z.string().min(1).max(120),
  fileUrl: z.string().min(1),
});

const baseTenderSchema = z.object({
  // Adım 1
  title: z
    .string()
    .min(3, "İhale adı en az 3 karakter olmalı")
    .max(200, "Maksimum 200 karakter"),
  description: z.string().max(5000, "Maksimum 5000 karakter").optional(),
  type: z.enum(TYPE_VALUES),
  isSealedBid: z.boolean(),
  requireAllItems: z.boolean(),
  requireBidDocument: z.boolean(),
  primaryCurrency: z.enum(CURRENCY_VALUES),
  allowedCurrencies: z
    .array(z.enum(CURRENCY_VALUES))
    .min(1, "En az 1 para birimi seçmelisin")
    .max(3),
  decimalPlaces: z.number().int().min(0).max(4),
  deliveryTerm: z.enum(DELIVERY_TERM_VALUES).optional(),
  deliveryAddress: z.string().max(1000).optional(),
  paymentTerm: z.enum(PAYMENT_TERM_VALUES),
  paymentDays: z
    .number({ invalid_type_error: "Geçersiz gün sayısı" })
    .int()
    .min(1)
    .max(365)
    .optional(),
  termsAndConditions: z.string().max(10000).optional(),
  internalNotes: z.string().max(5000).optional(),
  bidsCloseAt: z.string().min(1, "Kapanış tarihi seçmelisin"),
  bidsOpenAt: z.string().optional(),
  attachments: z.array(tenderAttachmentSchema).max(10).optional(),

  // Adım 2
  items: z
    .array(tenderItemSchema)
    .min(1, "En az 1 kalem eklemelisin")
    .max(100, "Maksimum 100 kalem"),

  // Adım 3
  invitedSupplierIds: z.array(z.string()).max(50, "Maksimum 50 tedarikçi"),
});

export const tenderFormSchema = baseTenderSchema
  .refine((d) => d.allowedCurrencies.includes(d.primaryCurrency), {
    message: "Ana para birimi izin verilenler arasında olmalı",
    path: ["primaryCurrency"],
  })
  .refine(
    (d) =>
      d.paymentTerm === "CASH" ||
      (typeof d.paymentDays === "number" && d.paymentDays > 0),
    {
      message: "Vadeli ödeme için gün sayısı zorunlu",
      path: ["paymentDays"],
    },
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
    {
      message: "Açılış tarihi kapanıştan önce olmalı",
      path: ["bidsOpenAt"],
    },
  );

export type TenderFormData = z.infer<typeof tenderFormSchema>;

export const STEP_FIELDS: Record<1 | 2 | 3, (keyof TenderFormData)[]> = {
  1: [
    "title",
    "description",
    "type",
    "isSealedBid",
    "requireAllItems",
    "requireBidDocument",
    "primaryCurrency",
    "allowedCurrencies",
    "decimalPlaces",
    "deliveryTerm",
    "deliveryAddress",
    "paymentTerm",
    "paymentDays",
    "termsAndConditions",
    "internalNotes",
    "bidsCloseAt",
    "bidsOpenAt",
    "attachments",
  ],
  2: ["items"],
  3: ["invitedSupplierIds"],
};

export const DEFAULT_FORM_VALUES: TenderFormData = {
  title: "",
  description: "",
  type: "RFQ",
  isSealedBid: true,
  requireAllItems: false,
  requireBidDocument: false,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  decimalPlaces: 2,
  deliveryTerm: undefined,
  deliveryAddress: "",
  paymentTerm: "CASH",
  paymentDays: undefined,
  termsAndConditions: "",
  internalNotes: "",
  bidsCloseAt: "",
  bidsOpenAt: "",
  attachments: [],
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
    },
  ],
  invitedSupplierIds: [],
};
