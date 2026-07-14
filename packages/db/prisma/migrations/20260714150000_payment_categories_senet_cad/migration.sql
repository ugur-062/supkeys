-- Ödeme yöntemi tamamlama: SENET (yurtiçi kıymetli evrak, çek yanına) +
-- CASH_AGAINST_DOCS (vesaik mukabili — dış ticaretin standart yöntemi, akreditif
-- ile açık hesap arasında). Yalnız enum değeri ekler (DDL, veri taşıma yok).

ALTER TYPE "ListingPaymentCategory" ADD VALUE 'SENET' AFTER 'CHEQUE';
ALTER TYPE "ListingPaymentCategory" ADD VALUE 'CASH_AGAINST_DOCS' AFTER 'LETTER_OF_CREDIT';
