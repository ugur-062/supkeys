import type { PAID_TIER_OPTIONS } from "@/lib/terms";

type PaidTier = (typeof PAID_TIER_OPTIONS)[number];

/**
 * Paket tanımlamanın sonuçlarını onaydan ÖNCE söyleyen uyarılar (arayüz testi
 * D-191): Gold → Silver düşürme alım tarafını kapatır; doğrulanmamış firmaya
 * verilen paketin süresi bugünden işler ama doğrulama isteyen işlemler kapalı
 * kalır. Firmalar listesindeki satır menüsü de aynı metni kullanır.
 */
export function tierGrantWarnings(
  current: { tier: string; verification: string },
  next: PaidTier,
): string[] {
  const out: string[] = [];
  if (current.tier === "GOLD" && next === "SILVER") {
    out.push(
      "Paket düşürülüyor (Gold → Silver): alım tarafı kapanır — talep açma, Satın Almacı rolü ve alım analitiği. Mevcut talepler görüntülenip kapatılabilir; düzenleme, süre uzatma ve yeni tedarikçi daveti Gold ister.",
    );
  }
  if (current.verification !== "VERIFIED") {
    out.push(
      "Firma doğrulanmamış: paket tanımlanır ve süresi bugünden işler, ancak talep yayımlama, teklif verme ve kazandırma firma doğrulanana dek kapalı kalır.",
    );
  }
  return out;
}

/**
 * Paket kaldırma onayı (arayüz testi O-046/D-191): firmalar listesindeki satır
 * menüsü ile Üyelik sekmesi AYNI sonuç metnini gösterir. `remaining` kalan
 * süre cümlesidir (boş olabilir).
 */
export function revokeNotice(remaining = ""): string {
  return `Firma Standart pakete düşer, paketli özellikleri hemen kapanır.${remaining} Firmaya "paketiniz sonlandırıldı" e-postası gider.`;
}

/** Kalan süre cümlesi — bitiş gelecekteyse. */
export function remainingSentence(
  tier: string,
  membershipEndAt: string | null,
  formatDate: (iso: string) => string,
  now = Date.now(),
): string {
  if (tier === "STANDART" || !membershipEndAt) return "";
  const days = Math.ceil((new Date(membershipEndAt).getTime() - now) / 86_400_000);
  if (days <= 0) return "";
  return ` Kalan süre (${days} gün, ${formatDate(membershipEndAt)} bitişli) silinir.`;
}
