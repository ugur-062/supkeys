import { CompanyRole } from "@rothern/db";
import {
  BUYING_TIER,
  SEAT_LIMITS,
  countSeats,
  effectivePermissions,
  permissionsForRoles,
  tierAtLeast,
} from "@rothern/shared";
import type { PrismaService } from "../prisma/prisma.service";
import { effectiveTier } from "./effective-tier";

/**
 * SATINALMA KOLTUĞUNU KURUCUYA AÇ — kademe GOLD'a çıktığında.
 *
 * NEDEN VAR (2026-09-14, kullanıcı kararı): kayıt ekranı "Bu hesapla ne
 * yapacaksınız?" diye soruyor ve iki koltuk da işaretli geliyordu. Satınalma
 * koltuğu ücretsiz pakette İŞE YARAMAZ (talep açmak `BUYING_TIER` = GOLD
 * ister) ama koltuk sayımına GİRER: kurucu tek başına STANDART'ın 2
 * koltuğunun ikisini de dolduruyor, firma ilk çalışanını davet edemiyordu —
 * ve bunu söyleyen tek satır yoktu.
 *
 * Artık kurucu satış koltuğuyla doğuyor; satınalma koltuğu tam da
 * kullanılabilir olduğu anda, burada açılıyor.
 *
 * FAIL-SAFE: kademe GOLD değilse hiçbir şey yapmaz; koltuk zaten varsa
 * dokunmaz. Koltuk limiti DOLUYSA da sessizce vazgeçer — paket yükseltmesini
 * bir koltuk hesabı yüzünden patlatmak yanlış olurdu; kurucu koltuğu
 * Ayarlar › Kullanıcılar'dan boşaltıp kendine verebilir. (GOLD'da limit 6;
 * bu ancak üç kişinin de çift koltuk tuttuğu firmada olur.)
 */
export async function ensureOwnerBuySeat(
  prisma: PrismaService,
  companyId: string,
): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tier: true, membershipEndAt: true, ownerUserId: true },
  });
  if (!company?.ownerUserId) return;
  if (!tierAtLeast(effectiveTier(company.tier, company.membershipEndAt), BUYING_TIER)) {
    return;
  }

  const owner = await prisma.companyUser.findUnique({
    where: { id: company.ownerUserId },
    select: { id: true, roles: true, permissions: true, isActive: true, deletedAt: true },
  });
  if (!owner || !owner.isActive || owner.deletedAt) return;

  const roles = owner.roles ?? [];
  if (roles.includes(CompanyRole.SATIN_ALMACI)) return;

  // Koltuk sığıyor mu — sığmıyorsa sessizce vazgeç (yükseltme akışı sürsün).
  const limit = SEAT_LIMITS[effectiveTier(company.tier, company.membershipEndAt)];
  if (limit != null) {
    const herkes = await prisma.companyUser.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: { id: true, roles: true, permissions: true },
    });
    const kullanilan = countSeats(
      herkes.map((u) => ({
        isOwner: u.id === owner.id,
        permissions: u.permissions,
        roles: u.roles,
      })),
    ).total;
    if (kullanilan + 1 > limit) return;
  }

  const yeniRoller = [...roles, CompanyRole.SATIN_ALMACI];
  // İzin listesi DOĞRULUK KAYNAĞI (`CompanyUser.permissions`), roller etiket.
  // Kurucunun elle kısıtladığı izinleri EZMEMEK için mevcut liste korunur ve
  // üstüne yalnız satınalma setinin eksikleri eklenir.
  const mevcut = effectivePermissions({
    isOwner: true,
    permissions: owner.permissions,
    roles,
  });
  const eklenecek = permissionsForRoles([CompanyRole.SATIN_ALMACI]);
  const birlesik = [...new Set([...mevcut, ...eklenecek])];

  await prisma.companyUser.update({
    where: { id: owner.id },
    data: { roles: yeniRoller, permissions: birlesik },
  });
}
