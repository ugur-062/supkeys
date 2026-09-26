-- KAYIT TÜM ÜLKELERE AÇILDI (2026-09-27, kullanıcı: "tüm ülkeler kayıt olabilsin,
-- Amerika hariç"). Tamamen EKLEMELİ — veri taşıma yok, mevcut satırlar aynen:
--   · hukuki yapı "Diğer" (GmbH, LLC, ООО…) + yerel yapı adı
--   · IBAN kullanmayan ülkelerin banka bilgisi: hesap no + SWIFT/BIC + banka adı
--     (doğrulama `companies`, Banka Hesapları `company_bank_accounts`, sipariş
--     anı kaydı `company_orders`); banka hesabında IBAN artık isteğe bağlı
--   · adres defterinde eyalet/bölge
-- ADD VALUE aynı işlemde KULLANILMIYOR (PG kısıtı) → güvenli.

-- AlterEnum
ALTER TYPE "CompanyType" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankSwiftBic" TEXT,
ADD COLUMN     "legalFormLocal" TEXT;

-- AlterTable
ALTER TABLE "company_addresses" ADD COLUMN     "stateRegion" TEXT;

-- AlterTable
ALTER TABLE "company_bank_accounts" ADD COLUMN     "accountNumber" TEXT,
ADD COLUMN     "bankCountry" TEXT,
ADD COLUMN     "swiftBic" TEXT,
ALTER COLUMN "iban" DROP NOT NULL;

-- AlterTable
ALTER TABLE "company_orders" ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "bankSwiftBic" TEXT;
