-- Faz 4 — sipariş belgeleri: fatura belgesi (INVOICE, satıcı) + serbest ek belge
-- kutusu (OTHER, her iki taraf). Yalnız enum değeri ekler (DDL, veri taşıma yok).

ALTER TYPE "CompanyDocType" ADD VALUE 'INVOICE';
ALTER TYPE "CompanyDocType" ADD VALUE 'OTHER';
