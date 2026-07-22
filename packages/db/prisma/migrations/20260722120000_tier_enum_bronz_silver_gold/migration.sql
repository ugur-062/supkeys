-- Faz T — paket kademeleri: STANDARD→STANDART (paketsiz-pasif), PAKET→GOLD;
-- BRONZ/SILVER yeni kademeler. RENAME VALUE satır datasını otomatik taşır;
-- ADD VALUE tx-içi güvenli (yeni değer aynı tx'te kullanılmıyor). Ayrıca
-- Company.tier default'u STANDART'a çekilir (eski default STANDARD rename'le
-- geçersizleşir — atlanırsa yeni INSERT'ler patlar).

ALTER TYPE "CompanyTier" RENAME VALUE 'STANDARD' TO 'STANDART';
ALTER TYPE "CompanyTier" RENAME VALUE 'PAKET' TO 'GOLD';
ALTER TYPE "CompanyTier" ADD VALUE 'BRONZ' AFTER 'STANDART';
ALTER TYPE "CompanyTier" ADD VALUE 'SILVER' AFTER 'BRONZ';

ALTER TABLE "companies" ALTER COLUMN "tier" SET DEFAULT 'STANDART';
