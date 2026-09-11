# QA bulgu listesi (staging/canlı)

| # | Parça | Bulgu | Durum |
|---|---|---|---|
| 1 | 1 · Ziyaretçi/SEO | seo:audit canlı: /nasil-calisir ve 6 sözleşme sayfası og:image yok (kök kart alt segmentlere miras geçmiyor); sözleşmelerde JSON-LD yok; kategori (86) ve ürün (83) başlıkları 75'i aşıyor; "Hakkında"sız firmada açıklama 30 karakter | düzeltildi (main), canlıda doğrulanacak |
| 2 | 1 · e2e | public-products-filters "Şehir" grubunu arıyordu; grup 2026-09-07'de "Konum" oldu | test güncellendi |
| 3 | 1 · seo:audit aracı | Next 15 akışlı metadata head dışında geliyor → "title yok" yanlış alarmı | betik tüm belgeyi tarar |
| 4 | 3 · Teklif formu | Gönderim onay penceresi "yalnızca geri çekilebilir" diyordu; ürün kuralı: gönderilmiş teklif geri çekilemez, eleme sonrası yeni versiyon | düzeltildi (main) |
| 5 | 6 · Admin firma reddi | `POST admin/companies/:id/reject` gövdesiz 201 dönüyordu (arayüz ≥3 karakter gerekçe istiyor; gerekçe firmaya e-postayla gider) | düzeltildi (main, staging bf13d66 ile e2e doğruladı: gövdesiz istek 400) |
| 6 | 5 · Rol kapıları | `ApprovalsGate` (Onaylar) `PermissionGate` ile aynı görünüyor ama `role="status"` taşımıyordu → ekran okuyucu kapıyı duyurmuyor, otomatik denetim de göremiyor | düzeltildi (main) |
| 7 | Kayıt | E-posta doğrulama kodu tuzsuz `sha256` ile saklanıyor; 10^6 uzay saniyeden kısa sürede geri çevriliyor (testte oracle olarak kullanıldı). Kod kısa ömürlü ve denemesi sınırlı olduğu için risk DÜŞÜK, ama veritabanı sızarsa kod anlamsızlaşır | açık — kayıt altına alındı, HMAC + tuz önerilir |
