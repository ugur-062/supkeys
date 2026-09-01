-- Sonuçsuz kategori aramaları (Faz 6 — kürasyon döngüsü).
--
-- GÜVENLİK (docs/migration-safety.md): tamamen eklemeli — YENİ tablo, mevcut
-- hiçbir tabloya/kolona dokunmuyor. Boş tabloya index → kilit yok.
-- Geri alma: tablo düşürülür, başka hiçbir şey etkilenmez.

CREATE TABLE "category_search_misses" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "rawQuery" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedNote" TEXT,

    CONSTRAINT "category_search_misses_pkey" PRIMARY KEY ("id")
);

-- Katlanmış sorgu tekil: "Abkant" / "abkant" / "ABKANT" tek satırda toplanır.
CREATE UNIQUE INDEX "category_search_misses_query_key"
  ON "category_search_misses"("query");

-- Kürasyon kuyruğu: çözülmemişler, en çok arananlar önce.
CREATE INDEX "category_search_misses_resolvedAt_count_idx"
  ON "category_search_misses"("resolvedAt", "count");
