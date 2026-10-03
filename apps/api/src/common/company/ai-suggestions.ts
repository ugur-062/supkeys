import type { Prisma } from "@rothern/db";

/**
 * "AI tedarikçi önerisi bekleyen talep" — TEK TANIM (arayüz testi O-035).
 *
 * Bitmiş, kapatılmamış (dismiss edilmemiş) yayın / ikinci tur keşfi ve henüz
 * davet edilmemiş (SUGGESTED) en az bir aday. İki okuyucu ayrışmasın:
 *   · `ActionCenterService.satinalma` → "AI, N talebiniz için tedarikçi buldu"
 *     satırının sayısı,
 *   · `CompanyListingsService.listTenders` → Taleplerim `aiSuggestionsPending`
 *     alanı (satırın hedefi `?status=OPEN&ai=1`).
 * Talebin OPEN olması koşulu çağıranda (liste durum süzgeciyle uygular).
 */
export const PENDING_AI_SUGGESTION_RUN_WHERE: Prisma.SupplierDiscoveryRunWhereInput = {
  state: "DONE",
  dismissedAt: null,
  trigger: { in: ["PUBLISH", "SECOND_ROUND"] },
  candidates: { some: { status: "SUGGESTED" } },
};
