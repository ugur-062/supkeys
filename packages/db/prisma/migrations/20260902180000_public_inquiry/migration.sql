-- MİSAFİR BİLGİ TALEBİ (Faz 1) — hesabı olmayan ziyaretçinin ürün sayfasından
-- gönderdiği talep + satıcının yanıtı.
--
-- Güvenlik (docs/migration-safety.md): iki YENİ tablo, mevcut hiçbir tabloya
-- dokunulmuyor; kilit yok, veri riski yok. Geri alma: DROP TABLE.
--
-- Akışın üç aşaması üç ayrı damgada:
--   oluşturuldu → satıcıya HİÇBİR ŞEY gitmez
--   verifiedAt  → ziyaretçi e-postasını doğruladı, TALEP İLETİLİR
--   claimedAt   → ziyaretçi aynı e-postayla kaydoldu, yanıtı okuyabilir
--
-- Doğrulama kapısı spam'i YAPISAL olarak kapatıyor: sahte adres satıcıya
-- maliyet çıkarmıyor çünkü doğrulanmadan iletim yok.

CREATE TABLE "public_inquiries" (
  "id"               TEXT NOT NULL,
  "companyId"        TEXT NOT NULL,
  "productId"        TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "companyName"      TEXT,
  -- Satıcıya GÖSTERİLMEZ: gösterilseydi doğrudan yazıp platformu atlardı.
  "phone"            TEXT,
  "message"          TEXT NOT NULL,
  "quantity"         TEXT,
  "tokenHash"        TEXT NOT NULL,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "verifiedAt"       TIMESTAMP(3),
  "claimedCompanyId" TEXT,
  "claimedAt"        TIMESTAMP(3),
  -- Kötüye kullanım incelemesi için; yanıtta ASLA dönmez.
  "createdIp"        TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_inquiry_replies" (
  "id"         TEXT NOT NULL,
  "inquiryId"  TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  -- "yanıt geldi" bildirimi idempotency damgası.
  "notifiedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_inquiry_replies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_inquiries_tokenHash_key" ON "public_inquiries"("tokenHash");
-- Satıcı panelinde "gelen talepler": yalnız doğrulanmışlar, yeni önce.
CREATE INDEX "public_inquiries_companyId_verifiedAt_idx" ON "public_inquiries"("companyId", "verifiedAt");
-- Kayıt sırasında e-postayla eşleşen bekleyen talepleri bulmak için.
CREATE INDEX "public_inquiries_email_idx" ON "public_inquiries"("email");
CREATE INDEX "public_inquiries_productId_idx" ON "public_inquiries"("productId");
CREATE INDEX "public_inquiry_replies_inquiryId_idx" ON "public_inquiry_replies"("inquiryId");

ALTER TABLE "public_inquiries"
  ADD CONSTRAINT "public_inquiries_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_inquiries"
  ADD CONSTRAINT "public_inquiries_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "company_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public_inquiry_replies"
  ADD CONSTRAINT "public_inquiry_replies_inquiryId_fkey"
  FOREIGN KEY ("inquiryId") REFERENCES "public_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
