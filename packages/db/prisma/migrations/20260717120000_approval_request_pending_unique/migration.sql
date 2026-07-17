-- X-CF-3: ilan başına aynı tipte TEK bekleyen onay isteği — DB seviyesinde zorla.
-- Servis (requestApproval) zaten findFirst ile ön-kontrol yapıyordu; ama iki
-- eşzamanlı kazandırma (~round-trip penceresi) ikisi de findFirst'i boş görüp
-- iki PENDING istek üretebiliyordu → biri onaylanıp sipariş oluştuktan sonra
-- diğerinin reddi ilanı geri açarak ÇİFT-SİPARİŞ riski. Kısmi unique index bu
-- yarışı atomik kapatır (uygulama katmanı P2002'yi ConflictException'a çevirir).
--
-- Partial unique: Prisma şemasında ifade edilemez (filtered index desteklenmez),
-- bu yüzden yalnızca migration SQL'de yaşar (bilinen 0_init drift deseni).
-- Dev DB ölçümü (migration-safety dedup kuralı): TOTAL_PENDING=0, DUP_GROUPS=0 →
-- mevcut mükerrer yok, düz CREATE güvenli (dedup adımı gerekmez). Tablo küçük →
-- kilit endişesi yok; prod büyük olsaydı CONCURRENTLY gerekirdi.
CREATE UNIQUE INDEX "approval_requests_listingId_type_pending_key"
  ON "approval_requests"("listingId", "type")
  WHERE "status" = 'PENDING';
