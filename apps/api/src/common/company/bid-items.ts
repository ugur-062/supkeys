import { Prisma } from "@rothern/db";

/**
 * "Fiyatlı kalem" = `unitPrice > 0` — TEK KAYNAK (S1 drift önleme). Kapalı-zarf
 * kapsam/sıralama tarafı (owner currentBest + public bestTotal), monotonluk
 * kıyası ve AWARDED_PARTIAL damgası HEP aynı tanımı kullanmalı; aksi halde
 * 0-fiyatlı satır içeren "tam" bir teklif bir yolda tam, diğerinde kısmi
 * sayılır (eskiden filtresiz `_count._all` → tam kazanan yanlışlıkla
 * AWARDED_PARTIAL damgalanıyordu).
 *
 * Prisma `where` fragment olarak paylaşılır (JS predicate değil) — her
 * `listingBidItem` sorgusuna spread edilir: `where: { ...PRICED_ITEM_WHERE }`
 * veya başka koşullarla birlikte `where: { bidId: {...}, ...PRICED_ITEM_WHERE }`.
 */
export const PRICED_ITEM_WHERE = {
  unitPrice: { gt: 0 },
} as const satisfies Prisma.ListingBidItemWhereInput;
