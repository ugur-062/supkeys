-- Peşin (CASH) işte teminat mektubu kuralının uygulanabilmesi için sipariş
-- belge tipi: satıcı, siparişi onaylamadan önce yükler (accept guard'ı).
ALTER TYPE "CompanyDocType" ADD VALUE IF NOT EXISTS 'TEMINAT';
