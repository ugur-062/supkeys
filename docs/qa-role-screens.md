# Rol × ekran matrisi (staging, otomatik)

`pnpm --filter @rothern/web e2e:staging e2e/staging-role-screens.spec.ts`

✅ sayfa açıldı · 🔒 yetki uyarısı (PermissionGate) · ⛔ portal kapısı · 💳 paket kapısı (Gold).

| Sayfa | alıcı · kurucu | alıcı · yönetici | alıcı · satın almacı | alıcı · satışçı | alıcı · onaylayıcı | alıcı · görüntüleyici | tedarikçi · satışçı | ücretsiz · kurucu |
|---|---|---|---|---|---|---|---|---|
| `/company/satinalma` | ✅ | ✅ | ✅ | ⛔ portal | ⛔ portal | ✅ | ⛔ portal | 💳 paket |
| `/company/satinalma/taleplerim` | ✅ | ✅ | ✅ | ⛔ portal | ⛔ portal | ✅ | ⛔ portal | 💳 paket |
| `/company/satinalma/taleplerim/yeni` | ✅ | 🔒 yetki | ✅ | ⛔ portal | ⛔ portal | 🔒 yetki | ⛔ portal | 💳 paket |
| `/company/satinalma/siparisler` | ✅ | ✅ | ✅ | ⛔ portal | ⛔ portal | ✅ | ⛔ portal | 💳 paket |
| `/company/satinalma/tedarikcilerim` | ✅ | ✅ | ✅ | ⛔ portal | ⛔ portal | ✅ | ⛔ portal | 💳 paket |
| `/company/satinalma/bilgi-taleplerim` | ✅ | ✅ | ✅ | ⛔ portal | ⛔ portal | ✅ | ⛔ portal | 💳 paket |
| `/company/satinalma/urunler` | ✅ | ✅ | ✅ | ⛔ portal | ⛔ portal | ✅ | ⛔ portal | 💳 paket |
| `/company/satis` | ✅ | ✅ | ⛔ portal | ✅ | ⛔ portal | ✅ | ✅ | ✅ |
| `/company/satis/urunlerim` | ✅ | ✅ | ⛔ portal | ✅ | ⛔ portal | ✅ | ✅ | ✅ |
| `/company/satis/bilgi-talepleri` | ✅ | ✅ | ⛔ portal | ✅ | ⛔ portal | ✅ | ✅ | ✅ |
| `/company/satis/musterilerim` | ✅ | ✅ | ⛔ portal | ✅ | ⛔ portal | ✅ | ✅ | ✅ |
| `/company/satis/tekliflerim` | ✅ | ✅ | ⛔ portal | ✅ | ⛔ portal | ✅ | ✅ | ✅ |
| `/company/onaylar` | ✅ | ✅ | 🔒 yetki | 🔒 yetki | ✅ | 🔒 yetki | 🔒 yetki | ✅ |
| `/company/mesajlar` | ✅ | ✅ | ✅ | ✅ | 🔒 yetki | ✅ | ✅ | ✅ |
| `/company/ayarlar` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/company/ayarlar/firma` | ✅ | ✅ | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | ✅ |
| `/company/ayarlar/kullanicilar` | ✅ | ✅ | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | ✅ |
| `/company/ayarlar/adresler` | ✅ | ✅ | ✅ | ✅ | 🔒 yetki | 🔒 yetki | ✅ | ✅ |
| `/company/ayarlar/banka-hesaplari` | ✅ | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | ✅ |
| `/company/ayarlar/dogrulama` | ✅ | ✅ | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | ✅ |
| `/company/ayarlar/aktivite` | ✅ | ✅ | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 🔒 yetki | 💳 paket |
| `/company/sirketim` | ✅ | ✅ | ✅ | ✅ | 🔒 yetki | ✅ | ✅ | ✅ |
| `/company/sirketim/ziyaretciler` | ✅ | ✅ | 🔒 yetki | ✅ | 🔒 yetki | 🔒 yetki | ✅ | ✅ |
