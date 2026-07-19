import { Prisma } from "@rothern/db";

/**
 * Yüklenmiş ödeme dizisi üzerinden statü-filtreli Decimal toplam — TEK KAYNAK
 * (S3/S4 drift önleme). getOne gösterimi (CONFIRMED + AWAITING kovaları) ve
 * recordPayment cap kontrolü (AWAITING+CONFIRMED "committed") aynı birikimi
 * tekrarlıyordu; ikisi de bunu çağırır.
 *
 * DİKKAT — bu SAF dizi-reducer'ı, `confirmedPaymentSum` (servis) AYRI bilinçli:
 * o bir Prisma `aggregate` sorgusudur (karar kapıları için, FOR UPDATE kilidi
 * altında; tüm diziyi belleğe çekmez). Bu helper yalnız `include: { payments }`
 * ile ZATEN yüklenmiş dizide kullanılır — round-trip eklemez.
 * INV-MONEY-1: tam Decimal birikim (float sapması yok).
 */
export function sumPaymentsByStatus(
  payments: readonly { status: string; amount: Prisma.Decimal }[],
  statuses: readonly string[],
): Prisma.Decimal {
  return payments.reduce(
    (sum, p) => (statuses.includes(p.status) ? sum.plus(p.amount) : sum),
    new Prisma.Decimal(0),
  );
}
