-- KVKK ile anonimlestirilmis firmalarin urun artiklari (arayuz testi D-216,
-- yeniden dogrulama). SALT DML, sema degismez.
--
-- Anonimlestirme (AdminCompaniesService.deleteOrAnonymize) artik firmanin
-- urunlerini vitrinden ceker ve onay kuyrugundan dusurur. Bu kuraldan ONCE
-- anonimlesmis firmalarin (companies."isActive" = false; bu bayragi yalniz
-- anonimlestirme false yapar) urunleri PENDING (onaylanabilir) ve
-- APPROVED + isPublic = true kaldi. Ayni yazim burada geriye donuk uygulanir.
-- Satirlar SILINMEZ (siparis/bilgi talebi gecmisi urune bakabilir).
-- Idempotent: yalniz henuz temizlenmemis satirlara dokunur.
UPDATE "company_items" AS i
SET "isPublic" = false,
    "isActive" = false,
    "reviewStatus" = 'DRAFT',
    "submittedAt" = NULL,
    "updatedAt" = now()
FROM "companies" AS c
WHERE c."id" = i."companyId"
  AND c."isActive" = false
  AND (
    i."isPublic" = true
    OR i."isActive" = true
    OR i."reviewStatus" <> 'DRAFT'
    OR i."submittedAt" IS NOT NULL
  );
