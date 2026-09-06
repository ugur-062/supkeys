import { tierAtLeast } from "@rothern/shared";
import { effectiveTier } from "./effective-tier";

/**
 * "GEÇERLİ bağlantı" TEK KAYNAK (denetim 2026-08-24 Parça 7).
 *
 * Bağlantı yalnız `status: ACTIVE` olduğu için değil, onu KURAN (davet eden)
 * taraf paketli kaldığı sürece geçerlidir — ADMIN kaynaklı bağlantılar hariç
 * (platform kararı, hep açık). Sebep: ödemeyi bırakınca kendi başlattığın
 * bağlantılar düşer; bir kez premium olup bol davet atarak kalıcı "bedava
 * ihale penceresi" kurulamaz. Tier EFEKTİF okunur (INV-TIER-1) — süre-dolma
 * penceresinde bayat PAKET bağlantıyı cron'u beklemeden canlı tutmasın.
 *
 * Neden ayrı dosya: bu kural `company-listings.connectedCompanyIds` içinde
 * gömülüydü; ilan BELGESİ servisi ve WS ağ geçidi ham `ACTIVE` sayıyordu →
 * ilan detayı 404 verirken şartname indirilebiliyordu (kardeş-yol driftı).
 */
export interface ConnectionRowForValidity {
  origin: string | null;
  inviter: { tier: string; membershipEndAt: Date | null } | null;
}

export function isConnectionValid(row: ConnectionRowForValidity): boolean {
  if (row.origin === "ADMIN") return true;
  if (!row.inviter) return false;
  return tierAtLeast(
    effectiveTier(
      row.inviter.tier as never,
      row.inviter.membershipEndAt,
    ) as never,
    "SILVER",
  );
}

/**
 * İki firma arasında GEÇERLİ (yukarıdaki kurala uyan) aktif bağlantı var mı.
 * Ham `count()` yerine bunu kullanın — kural tek yerde değişsin.
 */
export async function hasValidConnection(
  db: {
    companyConnection: {
      findMany: (args: unknown) => Promise<
        {
          origin: string | null;
          inviter: { tier: string; membershipEndAt: Date | null } | null;
        }[]
      >;
    };
  },
  companyAId: string,
  companyBId: string,
): Promise<boolean> {
  const rows = await db.companyConnection.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { inviterCompanyId: companyAId, inviteeCompanyId: companyBId },
        { inviterCompanyId: companyBId, inviteeCompanyId: companyAId },
      ],
    },
    select: {
      origin: true,
      inviter: { select: { tier: true, membershipEndAt: true } },
    },
  });
  return rows.some(isConnectionValid);
}
