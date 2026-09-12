# Yedekten dönüş provası (runbook)

> Yedek, **geri yüklenene kadar** yedek değildir. Supabase'de PITR açık olabilir
> ama hiç denenmemiş bir kurtarma yolu, olay anında öğrenilecek bir yoldur.
> Bu prova ayda bir, 20 dakikada yapılır ve sonucu aşağıdaki tabloya yazılır.

## Ön koşullar

- Supabase planı **Pro** (Point-in-Time Recovery yalnız Pro'da).
- Elde `.env.prod.local` (canlı bağlantı) ve `.env.staging`.
- Prova **CANLI PROJEYE DOKUNMAZ**: ayrı bir "restore hedefi" projesine ya da
  branch'e dönülür.

## Adımlar

1. **Kanıt topla (öncesi).** Canlıda bilinen bir sayımı not et:
   ```bash
   # firma, kullanıcı, talep, sipariş sayıları
   psql "$PROD_DIRECT_URL" -c "select
     (select count(*) from companies) firma,
     (select count(*) from company_users) kullanici,
     (select count(*) from listings) talep,
     (select count(*) from company_orders) siparis;"
   ```
2. **Zaman damgası seç.** Supabase panel → Database → Backups → Point in Time.
   Şu andan 1 saat öncesini seç (gerçek olayda: bozulmadan hemen öncesi).
3. **Yeni projeye geri yükle.** "Restore to new project" ile `rothern-restore-<tarih>`
   projesine dön. (Aynı projeye dönmek CANLIYI geri sarar — provada ASLA.)
4. **Doğrula.** Yeni projenin bağlantı dizesiyle aynı sayımları çalıştır;
   1. adımdaki değerlerle karşılaştır. Fark yalnız son 1 saatin verisi kadar
      olmalı.
5. **Uygulamayı bağla (isteğe bağlı ama önerilir).** Staging API'sini geçici
   olarak restore projesine yönlendir (`DATABASE_URL`/`DIRECT_URL`), giriş yap,
   bir talep aç. Amaç: şema + veri + Auth birlikte çalışıyor mu?
   **Auth kullanıcıları ayrı taşınır** — `auth.users` PITR ile gelir, ama
   restore projesinin API anahtarları FARKLIDIR; env'leri güncellemeden giriş
   çalışmaz. Provanın en sık takıldığı yer burasıdır.
6. **Temizle.** Restore projesini SİL (ücret işlemesin), staging env'ini geri al.

## Kurtarma hedefleri

| Ölçüt | Hedef | Not |
|---|---|---|
| RPO (kabul edilen veri kaybı) | ≤ 5 dk | PITR ile teoride saniyeler |
| RTO (ayağa kalkma süresi) | ≤ 2 saat | yeni proje + env güncelleme + DNS yok |

## Prova kaydı

| Tarih | Yapan | PITR hedefi | Sonuç | Süre | Not |
|---|---|---|---|---|---|
| — | — | — | henüz yapılmadı | — | ilk prova Supabase Pro'ya geçince |

## Bilinen tuzaklar

- **Sadece veritabanı yetmez:** R2'deki görseller/belgeler ayrı yaşar. Bucket
  sürüm/replikasyon ayarını da kontrol et; DB geri döner ama görseller silinmişse
  ürün sayfaları boş kalır.
- **Migration durumu:** restore edilen şema, o andaki migration'larla uyumludur.
  Geri dönülen an ile bugünkü kod arasında migration varsa `migrate deploy`
  gerekir; `migrate dev` ASLA (sıfırlar).
- **Cron'lar:** restore projesine bağlanan bir API örneği zamanlanmış işleri de
  koşar (e-posta gönderir!). Provada `RESEND_API_KEY`'i boş bırak.
