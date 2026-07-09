-- H3: company_orders.currency TEXT → "Currency" enum. Mevcut değerler award'da
-- bid.currency'den (Currency) yazıldığı için geçerli; USING ile cast edilir.
-- Default'u kaldır → tip değiştir → default'u enum olarak geri koy.
ALTER TABLE "company_orders" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "company_orders" ALTER COLUMN "currency" TYPE "Currency" USING "currency"::"Currency";
ALTER TABLE "company_orders" ALTER COLUMN "currency" SET DEFAULT 'TRY';
