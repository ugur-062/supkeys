/**
 * Yetki tablosu geçişi (2026-09-05, Faz 1) — kişi başına AÇIK izin listesi.
 *
 * Her aktif/pasif (silinmemiş) firma kullanıcısı için:
 *   permissions = normalize( hazırSet(roles) + override.added − override.removed )
 * Eski anahtarlar (`buy:listing:create`, `buy:bid:review`) yenisine eşlenir,
 * ölü satış-ilanı anahtarları düşer (LEGACY_PERMISSION_MAP). Roller ETİKET
 * olarak listeden yeniden türetilir (rolesFromPermissions) — böylece etiket
 * ile liste ilk günden tutarlı.
 *
 * Bekleyen davetlerde `permissions` boşsa rol hazır seti yazılır.
 *
 * İdempotent: listesi zaten dolu satıra DOKUNMAZ (yeniden koşum kullanıcı
 * düzenlemesini ezmez). `--force` verilirse dolu satırlar da yeniden hesaplanır
 * (yalnız geçiş anında, tek sefer).
 *
 * Çalıştırma (migration'dan SONRA, API push'undan ÖNCE):
 *   pnpm --filter @rothern/db backfill-user-permissions
 */
import { PrismaClient } from "@prisma/client";
import {
  normalizePermissions,
  permissionsForRoles,
  rolesFromPermissions,
} from "@rothern/shared";

const prisma = new PrismaClient();
const force = process.argv.includes("--force");

async function main() {
  const users = await prisma.companyUser.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      roles: true,
      permissions: true,
      company: { select: { ownerUserId: true } },
    },
  });
  let written = 0;
  let skipped = 0;
  let relabeled = 0;
  for (const u of users) {
    if (u.permissions.length > 0 && !force) {
      skipped++;
      continue;
    }
    // Override kolonu 2026-09-06'da düştü (Faz 4); geriye kalan tek kaynak rol seti.
    const permissions = normalizePermissions(permissionsForRoles(u.roles));
    const isOwner = u.company.ownerUserId === u.id;
    const roles = rolesFromPermissions(permissions, isOwner);
    const sameRoles =
      roles.length === u.roles.length && roles.every((r) => u.roles.includes(r));
    await prisma.companyUser.update({
      where: { id: u.id },
      data: { permissions, ...(sameRoles ? {} : { roles }) },
    });
    written++;
    if (!sameRoles) {
      relabeled++;
      console.log(
        `   ~ ${u.email}: roller [${u.roles.join(", ")}] → [${roles.join(", ")}]`,
      );
    }
  }

  const invites = await prisma.companyUserInvitation.findMany({
    where: { status: "PENDING", permissions: { isEmpty: true } },
    select: { id: true, roles: true },
  });
  for (const inv of invites) {
    await prisma.companyUserInvitation.update({
      where: { id: inv.id },
      data: { permissions: permissionsForRoles(inv.roles) },
    });
  }

  console.log(
    `\n✅ ${written} kullanıcı yazıldı (${skipped} zaten dolu, ${relabeled} etiket düzeltildi), ${invites.length} bekleyen davet dolduruldu`,
  );
}

main()
  .catch((e) => {
    console.error("❌ Hata:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
