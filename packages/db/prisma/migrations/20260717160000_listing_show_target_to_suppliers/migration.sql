-- CC-1: kalem hedef/istenen birim fiyatının (targetPrice) karşı tarafa
-- gösterilip gösterilmeyeceği — listing seviyesi opt-in bayrak, VARSAYILAN GİZLİ.
-- Açık göstermek ters eksiltmede fiyat çıpalaması yaratır; sahip bilerek bütçe
-- paylaşmak isterse açar. Kolon-add, veri taşıma yok.

ALTER TABLE "listings" ADD COLUMN "showTargetToSuppliers" BOOLEAN NOT NULL DEFAULT false;
