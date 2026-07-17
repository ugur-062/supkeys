-- Mal Mukabili (CASH_AGAINST_GOODS): alıcı malı TESLİM ALDIKTAN SONRA öder
-- (AFTER_DELIVERY). Türkiye ithalatının en yaygın iki yönteminden biri (peşinle
-- yarışır). Açık hesaptan farkı: mal mukabili belirli bir işlemdir, vade
-- OPSİYONEL girilebilir ve vade takibi çalışır; açık hesap vadesizdir. Vesaik
-- mukabili (CASH_AGAINST_DOCS) ile karıştırılmamalı — o belge karşılığı, teslim
-- ÖNCESİ. Yalnız enum değeri ekler (DDL, veri taşıma yok).

ALTER TYPE "ListingPaymentCategory" ADD VALUE 'MAL_MUKABILI' AFTER 'OPEN_ACCOUNT';
