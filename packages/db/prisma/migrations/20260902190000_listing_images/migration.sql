-- İLAN GÖRSELLERİ (Faz 3b).
--
-- Güvenlik (docs/migration-safety.md): iki ADD COLUMN; `coverImageUrl`
-- nullable (DEFAULT yok → tablo taranmaz), `images` sabit boş dizi DEFAULT'lu
-- → PG 11+ katalog güncellemesi, kilit anlık. Geri alma: DROP COLUMN.
--
-- Görsel KALEME ait, ilana değil: çok kalemli bir ilanda her kalem farklı bir
-- şeydir ("12 kalem makine tasfiyesi") ve tek görsel hepsini temsil edemez.
-- İlan kapağı sahibi seçmezse ilk kalemin ilk görselinden TÜRETİLİR.
--
-- Zorunluluk ASİMETRİK ve serviste: SATIS'ta kapak istenir, ALIM'da istenmez.
-- Alıcı henüz sahip olmadığı 40 kalemi fotoğraflayamaz; zorunlu tutmak o
-- talebi hiç yayımlanamaz hâle getirirdi.

ALTER TABLE "listings"      ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "listing_items" ADD COLUMN "images" TEXT[] DEFAULT ARRAY[]::TEXT[];
