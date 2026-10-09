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
 *
 * 2026-10-08: yayın sonrası tur bulduğunu KENDİSİ davet eder ve her adaya
 * sonucunu yazar — yeni tur SUGGESTED aday BIRAKMAZ. Bu tanım artık yalnız
 * eski akıştan kalan (alıcının onayını bekleyen) turları eşler.
 */
export const PENDING_AI_SUGGESTION_RUN_WHERE: Prisma.SupplierDiscoveryRunWhereInput = {
  state: "DONE",
  dismissedAt: null,
  trigger: { in: ["PUBLISH", "SECOND_ROUND"] },
  candidates: { some: { status: "SUGGESTED" } },
};

/**
 * Turun `error` değerleri: tur ARAMADAN düştü çünkü talep o an buna izin
 * vermiyordu — alıcı talebi özele çevirmiş ya da otomatik arama kutusunu
 * kapatmıştı (`DiscoveryRunsService.runOnce`). Model çağrılmadı, kimse davet
 * edilmedi.
 */
export const RUN_ERROR_PRIVATE_LISTING = "private_listing";
export const RUN_ERROR_DISCOVERY_OFF = "discovery_off";
export const SWITCHED_OFF_RUN_ERRORS: string[] = [RUN_ERROR_PRIVATE_LISTING, RUN_ERROR_DISCOVERY_OFF];

/**
 * "TALEBİN OTOMATİK TURU VAR" — TEK TANIM (2026-10-09, ikinci gözden geçirme
 * A-3). Yayın / ikinci tur satırı; alıcının ayarı yüzünden ARAMADAN düşen tur
 * (`SWITCHED_OFF_RUN_ERRORS`) SAYILMAZ.
 *
 * Eskiden her satır sayılıyordu: alıcı kutuyu bir an kapatıp yeniden açınca
 * (ya da talebi özele çevirip geri alınca) o arada `discovery_off` ile düşen
 * tur "yayın turu zaten var" diye okunuyor, yeni tur hiç yazılmıyordu — talep
 * "otomatik arama açık" görünüyor, kimse aranmıyordu. Dört okuyucu aynı tanımı
 * kullanır: `CompanyListingsService.enqueueDiscoveryRun` ("tur var mı") ve
 * `holdForDiscovery` (beklenen tur), `DiscoveryRunsService.catchUpPublishRuns`
 * ve `scheduleSecondRounds` (talep başına en fazla iki otomatik tur).
 *
 * `error` nullable → koşul NOT ile değil açık OR ile yazılır (NULL satır
 * NOT'tan da elenirdi, LU-18).
 */
export const COUNTED_AUTO_RUN_WHERE: Prisma.SupplierDiscoveryRunWhereInput = {
  trigger: { in: ["PUBLISH", "SECOND_ROUND"] },
  OR: [{ state: { not: "FAILED" } }, { error: null }, { error: { notIn: SWITCHED_OFF_RUN_ERRORS } }],
};

/** `COUNTED_AUTO_RUN_WHERE`in bellekteki karşılığı (aynı kural). */
export function isCountedAutoRun(run: { trigger: string; state: string; error: string | null }): boolean {
  if (run.trigger !== "PUBLISH" && run.trigger !== "SECOND_ROUND") return false;
  return run.state !== "FAILED" || run.error === null || !SWITCHED_OFF_RUN_ERRORS.includes(run.error);
}
