import { ForbiddenException } from "@nestjs/common";

/**
 * Creator-based ACL for tender ve order action'ları.
 *
 * Bir BUYER ekibin diğer BUYER'larının ihalesine karışamaz — sadece
 * görüntüleyebilir. COMPANY_ADMIN her zaman override yetkisine sahiptir.
 * Sipariş action'ları için tender.createdById üzerinden uygulanır
 * (siparişin "sahibi" siparişi yaratan ihalenin sahibidir).
 *
 * Read endpoint'lerinde kullanılmaz; tenant-scope yeterli.
 *
 * @throws ForbiddenException — kullanıcı ne sahip ne de admin
 */
export function assertCanActOnTender(
  tender: { createdById: string },
  user: { id: string; role: string },
): void {
  if (user.role === "COMPANY_ADMIN") return;
  if (tender.createdById === user.id) return;
  throw new ForbiddenException(
    "Bu işlemi yapma yetkiniz yok — ihale farklı bir kullanıcı tarafından yürütülüyor",
  );
}
