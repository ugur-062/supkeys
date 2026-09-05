import { userHasPermission, type PermissionSubject } from "@/lib/company/permissions";

/**
 * Sipariş aksiyon buton kapısı — backend `assertOrderRole` ile BİREBİR (F7
 * sınıfı): aksiyon, tarafın İŞLEM iznini ister — satıcı yanı "Satış siparişi
 * işlemleri", alıcı yanı "Alım siparişi işlemleri". Etiket-only (Kurucu/
 * Yönetici) ve görüntüleyici sayfayı SALT-OKUNUR görür: veri görünür, buton
 * görünmez. İzinsize buton gösterip 403 yedirmek yerine UI aynı kapıyı uygular.
 */
export function canActOnOrder(
  side: "seller" | "buyer",
  user: PermissionSubject | null | undefined,
): boolean {
  return userHasPermission(
    user,
    side === "seller" ? "sell:order:manage" : "buy:order:manage",
  );
}
