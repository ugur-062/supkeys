/**
 * Yıl bazlı sıralı ihale & sipariş numarası üreteci.
 *
 * Format:
 *   - Tender: SUPK-YYYY-NNNN  (örn. SUPK-2026-0001)
 *   - Order:  ORD-YYYY-NNNN   (örn. ORD-2026-0001)
 *
 * Sıralama: aynı yıl içinde son numaradan +1.
 *
 * NOT: Yarış koşulu (race) — concurrent create durumunda iki tender aynı
 * numarayı alabilir; DB'deki @unique constraint bunu yakalar. Pratikte
 * tedarikçi yöneticisi ihale oluşturma trafiği düşük olduğu için Postgres
 * advisory lock yerine "DB unique violation → retry" yolu yeterli (servis
 * tarafında ele alınır).
 */
type PrismaLike = {
  tender: {
    findFirst: (args: {
      where: { tenderNumber: { startsWith: string } };
      orderBy: { tenderNumber: "desc" };
      select: { tenderNumber: true };
    }) => Promise<{ tenderNumber: string } | null>;
  };
  order: {
    findFirst: (args: {
      where: { orderNumber: { startsWith: string } };
      orderBy: { orderNumber: "desc" };
      select: { orderNumber: true };
    }) => Promise<{ orderNumber: string } | null>;
  };
};

function nextSeq(lastNumber: string | null): number {
  if (!lastNumber) return 1;
  const match = lastNumber.match(/-(\d+)$/);
  if (!match) return 1;
  return parseInt(match[1]!, 10) + 1;
}

function formatNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export async function generateTenderNumber(
  prisma: PrismaLike,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const last = await prisma.tender.findFirst({
    where: { tenderNumber: { startsWith: `SUPK-${year}-` } },
    orderBy: { tenderNumber: "desc" },
    select: { tenderNumber: true },
  });
  return formatNumber("SUPK", year, nextSeq(last?.tenderNumber ?? null));
}

export async function generateOrderNumber(
  prisma: PrismaLike,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: `ORD-${year}-` } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return formatNumber("ORD", year, nextSeq(last?.orderNumber ?? null));
}
