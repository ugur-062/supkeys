import type { PrismaClient } from "@rothern/db";

/**
 * Paketi düşen (STANDART'a inen) firmanın GİDEN bekleyen davetleri — üyelik
 * cron'u ve admin paket geri alma AYNI kuralı uygular.
 *
 * Kayıtsız adrese (referral) davet SİLİNMEZ, iptal edilir (yayın denetimi
 * 2026-09-28 Bölüm 13, B5-4'ün eşi): satır silinince talep davetleri
 * (`external_listing_invites`, cascade) ve onlarla birlikte adres başına 7 gün
 * freni / 90 günde 3 e-posta duraklaması ve "bu adrese daha önce yazıldı"
 * geçmişi de siliniyordu; firma yeniden paket alınca aynı adreslere hemen
 * yeniden yazabiliyordu. Kuyrukta bekleyen talep davetleri de iptal edilir
 * (STANDART dış davet gönderemez). Kayıtlı firmaya bağlantı daveti ayrı yol.
 */
export function cancelOutgoingReferralInvites(
  prisma: Pick<PrismaClient, "companyReferralInvite" | "externalListingInvite">,
  companyIds: string[],
) {
  return [
    prisma.companyReferralInvite.updateMany({
      where: { inviterCompanyId: { in: companyIds }, status: "PENDING" },
      data: { status: "CANCELLED" },
    }),
    prisma.externalListingInvite.updateMany({
      where: { inviterCompanyId: { in: companyIds }, state: "QUEUED" },
      data: { state: "CANCELLED", cancelReason: "INVITER_DOWNGRADED" },
    }),
  ] as const;
}
