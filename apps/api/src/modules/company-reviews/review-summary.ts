import type { Prisma } from "@rothern/db";
import type { ReviewPartner, ReviewSummary } from "@rothern/shared";

/**
 * Değerlendirme özeti — TEK yardımcı (public profil + platform-içi firma
 * detayı + reviews/company ucu aynı fonksiyonu çağırır; üç ayrı türetme
 * olmasın). Saf: satırları alır, özet döner.
 *
 *  - Firma bazında grupla (reviewerCompanyId); ortak ortalaması = satır
 *    ortalaması; GENEL = ortak ortalamalarının ortalaması (her ortak bir oy).
 *  - Ad: `revealNames` VE ortağın en son değerlendirmesinde showName=true ise
 *    firma adı; aksi null ("Doğrulanmış alıcı/tedarikçi" web'de rolle yazılır).
 *    Herkese açık uç revealNames=false verir → ad ASLA sızmaz.
 *  - Rol siparişten: değerlendiren = siparişin alıcısıysa "buyer", değilse "seller".
 */

/** Satır seçimi — çağıranlar aynı select'i kullanır (drift olmasın). */
export const REVIEW_SUMMARY_SELECT = {
  rating: true,
  comment: true,
  createdAt: true,
  showName: true,
  reviewerCompanyId: true,
  reviewer: { select: { name: true } },
  order: { select: { buyerCompanyId: true } },
} satisfies Prisma.CompanyReviewSelect;

export type ReviewSummaryRow = Prisma.CompanyReviewGetPayload<{
  select: typeof REVIEW_SUMMARY_SELECT;
}>;

/** Özet için satır tavanı — profil başına (çok eski kayıtlar özeti değiştirmez). */
export const REVIEW_SUMMARY_TAKE = 500;
const MAX_COMMENTS_PER_PARTNER = 5;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildReviewSummary(
  rows: ReviewSummaryRow[],
  opts: { revealNames: boolean },
): ReviewSummary {
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  const groups = new Map<string, ReviewSummaryRow[]>();
  for (const r of rows) {
    const k = r.rating as 1 | 2 | 3 | 4 | 5;
    if (distribution[k] !== undefined) distribution[k]++;
    const list = groups.get(r.reviewerCompanyId) ?? [];
    list.push(r);
    groups.set(r.reviewerCompanyId, list);
  }

  const partners: ReviewPartner[] = [];
  for (const list of groups.values()) {
    // En yeni önce (çağıran zaten desc verir; yine de garanti et).
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = list[0]!;
    const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
    partners.push({
      name: opts.revealNames && latest.showName ? latest.reviewer.name : null,
      // RLS aktivasyon hazırlığı (denetim 2026-08-23 Parça 4): `order` ilişkisi
      // ÇAPRAZ-firma bir satırdır — RLS açıldığında policy bunu gizleyip null
      // döndürebilir ve `latest.order.buyerCompanyId` TypeError (500) atardı.
      // Rol bilinmiyorsa null (UI "Doğrulanmış ortak" der), sayfa çökmez.
      // KALICI çözüm (Dalga B): CompanyReview'a reviewerRole kolonu.
      role: latest.order
        ? latest.order.buyerCompanyId === latest.reviewerCompanyId
          ? "buyer"
          : "seller"
        : null,
      avg: round1(avg),
      count: list.length,
      lastAt: latest.createdAt.toISOString(),
      comments: list
        .filter((r) => r.comment && r.comment.trim() !== "")
        .slice(0, MAX_COMMENTS_PER_PARTNER)
        .map((r) => ({
          rating: r.rating,
          comment: r.comment!.trim(),
          createdAt: r.createdAt.toISOString(),
        })),
    });
  }
  partners.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const avg =
    partners.length === 0
      ? 0
      : round1(partners.reduce((s, p) => s + p.avg, 0) / partners.length);

  return { avg, firms: partners.length, orders: rows.length, distribution, partners };
}
