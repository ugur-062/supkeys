-- V2-4.1 — Şirket-bazlı doğrudan mesajlaşma için yeni context değeri.
-- Thread uniqueness (tenantId, supplierId, context, contextRefId) garanti olduğu için
-- DIRECT, ORDER/TENDER thread'leriyle çakışmaz.
ALTER TYPE "MessageContext" ADD VALUE IF NOT EXISTS 'DIRECT';
