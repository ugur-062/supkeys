-- i18n Faz 4: kategori adının EN/RU karşılığı (eklemeli, NULL = çeviri yok → Türkçeye düşer).
ALTER TABLE "categories" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "categories" ADD COLUMN "nameRu" TEXT;
