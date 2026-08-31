-- Denetim 2026-08-28 Parça 12 #11 + indeks eksiği.
--
-- GÜVENLİK NOTU (docs/migration-safety.md): bu migration TAMAMEN EKLEMELİ.
--   · İki ADD COLUMN: biri nullable (varsayılansız), biri sabit varsayılanlı.
--     PostgreSQL 11+ sabit varsayılanlı ADD COLUMN'u tablo yeniden yazımı
--     OLMADAN yapar (katalogda saklanan varsayılan) → kilit süresi sabit,
--     satır sayısından bağımsız.
--   · Bir CREATE INDEX: `company_complaints` küçük bir tablo (moderasyon
--     kuyruğu), yazım trafiği yok denecek kadar az → düz CREATE INDEX'in kısa
--     ACCESS EXCLUSIVE kilidi kabul edilebilir. CONCURRENTLY kullanılmadı
--     çünkü Prisma migration'ları transaction içinde koşar ve CONCURRENTLY
--     transaction içinde çalışmaz.
--   · Veri kaybı YOK, sütun/tablo düşürülmüyor, geri alma = iki DROP COLUMN +
--     bir DROP INDEX.
--
-- Geriye dönük veri: mevcut damgalarda `currency` TRY'ye, `amountTry` null'a
-- düşer. amountTry null olan satırlarda okuma tarafı ham `amount`'a geri
-- düşer (tek-birimli pazarlıkta doğru davranış); çok-birimli ESKİ turlar için
-- geriye dönük çevrim YAPILMIYOR — açılış damgası tur bazında saklanmadığı
-- için uydurma kur üretmek yerine olduğu gibi bırakıldı.

ALTER TABLE "listing_round_snapshots"
  ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'TRY';

ALTER TABLE "listing_round_snapshots"
  ADD COLUMN "amountTry" DECIMAL(18,2);

CREATE INDEX "company_complaints_complainantCompanyId_idx"
  ON "company_complaints"("complainantCompanyId");
