-- i18n Faz 4b: nitelik etiketi ve seçeneklerinin EN/RU karşılığı (eklemeli; boş = çeviri yok → Türkçeye düşer).
ALTER TABLE "category_attributes" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "category_attributes" ADD COLUMN "nameRu" TEXT;
ALTER TABLE "category_attributes" ADD COLUMN "optionsEn" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "category_attributes" ADD COLUMN "optionsRu" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
