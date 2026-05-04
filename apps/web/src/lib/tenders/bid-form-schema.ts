import { z } from "zod";

const CURRENCY_VALUES = ["TRY", "USD", "EUR"] as const;

export const bidFormItemSchema = z.object({
  tenderItemId: z.string().min(1),
  // null = bu kaleme teklif yok; sayı = teklif var
  unitPrice: z
    .number({ invalid_type_error: "Geçersiz fiyat" })
    .min(0, "Fiyat 0'dan büyük veya eşit olmalı")
    .nullable(),
  customAnswer: z.string().max(2000).optional(),
});

export const bidFormAttachmentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1),
  mimeType: z.string().min(1).max(120),
  fileUrl: z.string().min(1),
});

export const bidFormSchema = z
  .object({
    currency: z.enum(CURRENCY_VALUES, {
      errorMap: () => ({ message: "Para birimi seçmelisiniz" }),
    }),
    notes: z.string().max(2000).optional(),
    items: z.array(bidFormItemSchema).min(1),
    attachments: z.array(bidFormAttachmentSchema).max(10).optional(),
  })
  .refine((d) => d.items.some((i) => i.unitPrice != null && i.unitPrice >= 0), {
    message: "En az 1 kaleme fiyat girilmelidir",
    path: ["items"],
  });

export type BidFormValues = z.infer<typeof bidFormSchema>;
