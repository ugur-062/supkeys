-- Admin siparis iptali (admin_order_cancelled) bildirimlerinin portal + CTA
-- backfill'i (arayuz testi kapanis, api-1 NEW-2; 20261002160000 admin_listing_*
-- backfill'iyle ayni aile). SALT DML, sema degismez.
--
-- Servis satiri artik taraf portaliyla (alici 'satinalma', satici 'satis') ve
-- siparise giden CTA ile ("Siparisi Gor" -> /company/siparis/<id>) yaziyor.
-- Onceki satirlar portal NULL + genel "Rothern'e Git" -> /company kaldigi icin
-- alicinin metni Satis suzgecinde rozetsiz gorunuyordu.
--
-- Siparis eslemesi: govdedeki siparis NUMARASI (parametre; dilden bagimsiz)
-- + bildirimin firmasi siparisin alicisi ya da saticisi. Yalniz TEK siparisle
-- eslesen satirlar guncellenir; numarasiz/belirsiz satirlar portal-notr kalir.
-- CTA yalniz hala VARSAYILAN (dilin "Rothern'e Git" metni + panel kok adresi)
-- ise siparis detayina cevrilir; adres alicinin dil bicimini korur
-- (tr /company/siparis/<id>, en /en/company/order/<id>, ru /ru/kompaniya/zakaz/<id>).
-- Idempotent: yalniz portal IS NULL satirlara dokunur.
WITH matched AS (
  SELECT
    n."id",
    MIN(o."id") AS "orderId",
    BOOL_AND(o."buyerCompanyId" = n."companyId") AS "isBuyer"
  FROM "notifications" n
  JOIN "company_orders" o
    ON o."number" IS NOT NULL
   AND o."number" <> ''
   AND STRPOS(n."body", o."number") > 0
   AND n."companyId" IN (o."buyerCompanyId", o."sellerCompanyId")
  WHERE n."type" = 'admin_order_cancelled'
    AND n."portal" IS NULL
  GROUP BY n."id"
  HAVING COUNT(*) = 1
),
target AS (
  SELECT
    m."id",
    m."orderId",
    m."isBuyer",
    CASE
      WHEN n."ctaLabel" = 'Перейти в Rothern' AND n."ctaUrl" ~ '/ru/kompaniya$'
        THEN REGEXP_REPLACE(n."ctaUrl", '/kompaniya$', '/kompaniya/zakaz/' || m."orderId")
      WHEN n."ctaLabel" = 'Go to Rothern' AND n."ctaUrl" ~ '/en/company$'
        THEN REGEXP_REPLACE(n."ctaUrl", '/company$', '/company/order/' || m."orderId")
      WHEN n."ctaLabel" = 'Rothern''e Git' AND n."ctaUrl" ~ '/company$'
        AND n."ctaUrl" !~ '/(en|ru)/company$'
        THEN REGEXP_REPLACE(n."ctaUrl", '/company$', '/company/siparis/' || m."orderId")
    END AS "newCtaUrl",
    CASE n."ctaLabel"
      WHEN 'Перейти в Rothern' THEN 'Открыть заказ'
      WHEN 'Go to Rothern' THEN 'View order'
      WHEN 'Rothern''e Git' THEN 'Siparişi Gör'
    END AS "newCtaLabel"
  FROM matched m
  JOIN "notifications" n ON n."id" = m."id"
)
UPDATE "notifications" n
SET
  "portal" = CASE WHEN t."isBuyer" THEN 'satinalma' ELSE 'satis' END,
  "ctaUrl" = COALESCE(t."newCtaUrl", n."ctaUrl"),
  "ctaLabel" = CASE WHEN t."newCtaUrl" IS NOT NULL THEN t."newCtaLabel" ELSE n."ctaLabel" END
FROM target t
WHERE n."id" = t."id";
