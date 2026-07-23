/**
 * Sipariş aksiyon buton kapısı — backend `assertOrderRole` ile BİREBİR (F7
 * sınıfı): aksiyon, tarafın İŞLEM rolünü ister — satıcı yanı Satışçı, alıcı
 * yanı Satın Almacı. Etiket-only (Kurucu/Yönetici) sayfayı SALT-OKUNUR görür
 * (Faz R gözetim kararı): veri görünür, buton görünmez. İzinsize buton
 * gösterip 403 yedirmek yerine UI aynı kapıyı uygular.
 */
export function canActOnOrder(
  side: "seller" | "buyer",
  roles: readonly string[] | undefined,
): boolean {
  return (roles ?? []).includes(
    side === "seller" ? "SATISCI" : "SATIN_ALMACI",
  );
}
