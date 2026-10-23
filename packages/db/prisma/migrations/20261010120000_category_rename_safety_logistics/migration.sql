-- Sahip kararlari: 78 "Lojistik" (2026-10-09) ve 46 "Is Guvenligi ve Yangin
-- Ekipmanlari" (2026-10-10). SALT DML, sema degismez; idempotent (ayni degerleri
-- yeniden yazar).
--
-- Neden migration: kategori adlari tohum dosyalarindan (packages/db/src/seeds)
-- operator betikleriyle yazilir (apply-category-translations / -names-i18n /
-- -keywords). Bu surum 46 segmentini yeniden GORUNUR yapiyor ve 77'yi gizliyor;
-- betikler kosulana dek 46 eski adiyla (kolluk / law enforcement), 78 eski
-- adiyla gorunurdu. Adlar gorunurluk degisikligiyle AYNI anda (API acilisindaki
-- migrate deploy) yerine otursun diye uc satir burada da yazilir. 81141601 (yaprak)
-- "Lojistik" adini 78 ile paylasmasin diye ayni anda ayristirilir.
--
-- Degerler betiklerin yazdigiyla BIREBIR aynidir (ayni tohum dosyalari +
-- categorySearchText; yerel veritabaninda betikler kosulduktan sonra okunan
-- satirlardan uretildi): betikler sonradan kosulunca bu satirlarda degisiklik
-- olmaz. Kategori tablosu bos olan veritabaninda (CI, yeni kurulum; tabloyu
-- seed-categories doldurur ve ayni adlari yazar) hicbir satira dokunmaz.

UPDATE "categories"
SET "nameTr" = 'İş Güvenliği ve Yangın Ekipmanları',
    "nameEn" = 'Workplace Safety and Fire Equipment',
    "nameRu" = 'Средства охраны труда и противопожарное оборудование',
    "keywords" = 'iş güvenliği isg iş sağlığı ve güvenliği kişisel koruyucu donanım kkd koruyucu ekipman emniyet yangın yangın söndürme yangın güvenliği güvenlik sistemleri workplace safety occupational safety ppe personal protective equipment fire protection fire safety security охрана труда сиз средства индивидуальной защиты пожарная безопасность',
    "searchText" = 'is guvenligi ve yangin ekipmanlari is guvenligi isg is sagligi ve guvenligi kisisel koruyucu donanim kkd koruyucu ekipman emniyet yangin yangin sondurme yangin guvenligi guvenlik sistemleri workplace safety occupational safety ppe personal protective equipment fire protection fire safety security охрана труда сиз средства индивидуальнои защиты пожарная безопасность workplace safety and fire equipment средства охраны труда и противопожарное оборудование'
WHERE "code" = '46000000';

UPDATE "categories"
SET "nameTr" = 'Lojistik',
    "nameEn" = 'Logistics',
    "nameRu" = 'Логистика',
    "keywords" = 'taşıma taşımacılık nakliye nakliyat sevkiyat depolama antrepo kargo kurye posta gümrükleme transportation transport shipping freight storage warehousing mail services перевозки транспорт доставка хранение склад почта услуги транспорта хранения почты Taşıma, Depolama ve Posta Hizmetleri',
    "searchText" = 'lojistik tasima tasimacilik nakliye nakliyat sevkiyat depolama antrepo kargo kurye posta gumrukleme transportation transport shipping freight storage warehousing mail services перевозки транспорт доставка хранение склад почта услуги транспорта хранения почты tasima, depolama ve posta hizmetleri logistics логистика'
WHERE "code" = '78000000';

UPDATE "categories"
SET "nameTr" = 'Lojistik yönetimi',
    "nameEn" = 'Logistics management',
    "nameRu" = 'Управление логистикой',
    "keywords" = 'nakliye yönetimi rota optimizasyonu depo lojistiği sevkiyat planlama Lojistik',
    "searchText" = 'lojistik yonetimi nakliye yonetimi rota optimizasyonu depo lojistigi sevkiyat planlama lojistik logistics management управление логистикои'
WHERE "code" = '81141601';
