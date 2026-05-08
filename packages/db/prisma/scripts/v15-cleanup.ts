import { PrismaClient } from "@prisma/client";

/**
 * V1.5 data hygiene cleanup script.
 *
 * Çalıştırma:
 *   pnpm --filter @supkeys/db v15-cleanup
 *
 * Yaptıkları:
 *   1. PENDING_TENANT_APPROVAL kayıtlarını ACTIVE'e çevirir (defansif —
 *      D.2.B sonrası bu hale gelmemiş bir kayıt varsa).
 *   2. expiresAt geçmiş PENDING UserInvitation'ları EXPIRED'a çevirir.
 *   3. 30+ gün önceki FAILED EmailLog sayısını raporlar (silmez).
 */

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  console.log("V1.5 data hygiene cleanup başlatılıyor…\n");

  // 1. PENDING_TENANT_APPROVAL → ACTIVE
  const stalePending = await prisma.supplierTenantRelation.updateMany({
    where: { status: "PENDING_TENANT_APPROVAL" },
    data: { status: "ACTIVE" },
  });
  console.log(
    `✓ ${stalePending.count} PENDING_TENANT_APPROVAL → ACTIVE`,
  );

  // 2. Süresi geçmiş PENDING UserInvitation'lar → EXPIRED
  const now = new Date();
  const expiredInvites = await prisma.userInvitation.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED" },
  });
  console.log(
    `✓ ${expiredInvites.count} expired UserInvitation(s) marked EXPIRED`,
  );

  // 3. 30+ gün önceki FAILED EmailLog'lar (info — silinmiyor)
  const cutoff = new Date(Date.now() - 30 * DAY_MS);
  const oldFailed = await prisma.emailLog.count({
    where: {
      status: "FAILED",
      queuedAt: { lt: cutoff },
    },
  });
  console.log(
    `ℹ ${oldFailed} FAILED EmailLog (30+ gün) — silinmedi, raporlama amaçlı`,
  );

  console.log("\n✓ V1.5 cleanup tamamlandı.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
