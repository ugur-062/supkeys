# R2 İki-Bucket Ayrımı — Kurulum Runbook'u

**Neden:** R2'da public erişim **bucket seviyesindedir**. Tek bucket'ta hem
profil görselleri (kalıcı-public olmalı) hem KYC/teklif/satın alma talebi/sipariş belgeleri
(private olmalı) durursa, custom domain bağlanınca key'i bilen herkes hassas
belgeyi **imzasız** çeker — presigned TTL etkisiz kalır (key URL'in path'inde).
Çözüm: iki ayrı bucket. Bkz. `docs/invariants.md` **INV-STORAGE-1**.

- **PRIVATE bucket** (`R2_PRIVATE_BUCKET`, mevcut `rothern-prod`) → KYC (`company-docs/`),
  satın alma talebi (`listing-docs/`), teklif (`listing-bids/`), sipariş (`company-orders/`).
  Public access **KAPALI**, custom domain **YOK**, yalnız presigned.
- **PUBLIC bucket** (`R2_PUBLIC_BUCKET`, yeni `rothern-public`) → yalnız profil
  görselleri (`{env}/tenant-profile/`). Public access + custom domain (cdn.rothern.com).

> **Veri taşıma YOK** (onaylı karar): taşınacak canlı veri yok. Mevcut
> `tenant-profile/*` nesneleri private bucket'ta bırakılır, sonra temizlenir.
> Yeni profil görselleri doğrudan public bucket'a yazılır.

---

## ⚠️ En kritik kural: API token'ı deploy'dan ÖNCE genişlet

`StorageService.onModuleInit` **her iki bucket'a** `HeadBucketCommand` atar. API
token yeni PUBLIC bucket'a **yetkisizse HeadBucket fail → app BOOT ETMEZ**
(fail-closed, kasıtlı). Bu yüzden **sıra**: önce Cloudflare'de bucket + token
izni, **sonra** kod deploy. Token izni eksikken deploy edilirse API çökük kalır.

---

## Cloudflare panelinde yapılacaklar (sırayla)

1. **Yeni PUBLIC bucket oluştur** — ör. `rothern-public`.
2. **Object versioning AÇ** — hem `rothern-public` hem `rothern-prod` (silinen
   belge/görsel kurtarılabilsin; PITR dosyaları kapsamıyor).
3. **API token iznini GENİŞLET** — mevcut R2 token'ı **her iki bucket'ı** (Object
   Read & Write) + `PutBucketCors` kapsasın. **Bu adım kod deploy'undan ÖNCE
   bitmeli** (yoksa boot fail — yukarıdaki uyarı).
4. **Custom domain** `cdn.rothern.com` → **PUBLIC bucket'a** bağla (public access
   yalnız burada). Private bucket'a ASLA custom domain / public bağlama.
5. **PRIVATE bucket** (`rothern-prod`): public access **KAPALI**, r2.dev dev URL
   **KAPALI**, custom domain **YOK**.
6. **CORS**: kod (`ensureCorsPolicy`) her iki bucket'a `CORS_ORIGINS` + `*.vercel.app`
   için `PUT/GET/HEAD` yazar (idempotent, her boot). Panelden elle set gereksiz;
   token'ın `PutBucketCors` izni olması yeterli.

---

## Env değişkenleri

| Env | Değer | Not |
|---|---|---|
| `R2_PRIVATE_BUCKET` | `rothern-prod` | Zorunlu. Yoksa legacy `R2_BUCKET`'e düşer (fail-closed: private) |
| `R2_PUBLIC_BUCKET` | `rothern-public` | Yoksa private ile aynı bucket (legacy tek-bucket davranışı) |
| `R2_PUBLIC_BASE_URL` | `https://cdn.rothern.com` | PUBLIC bucket custom domain. Boşsa görseller presigned'a düşer |

`.env.example`, `.env.production.example`, `render.yaml` güncellendi.

---

## Deploy sırası + kırılma/rollback

| # | Adım | Kırılma riski | Rollback |
|---|---|---|---|
| 1 | Public bucket oluştur + versioning (2 bucket) | Yok | Bucket'ı sil |
| 2 | **API token'ı iki bucket'a genişlet** | Yok | Token'ı geri al |
| 3 | Domain `cdn.rothern.com` → public bucket; private public-access KAPALI | Domain yanlış bucket'a → hassas ifşa | Domain'i geri al |
| 4 | Env set (`R2_PRIVATE_BUCKET`+`R2_PUBLIC_BUCKET`) + kod deploy | Token adım 2'de eksikse **boot fail** | Deploy revert (legacy `R2_BUCKET` fallback → all-private, güvenli) |
| 5 | **Doğrula:** profil görseli cdn'den açılıyor; KYC/teklif presigned query'si atılınca private bucket'ta 403/404 | — | — |
| 6 | Private bucket'taki eski `tenant-profile/*` nesnelerini temizle | Erken silme → eski logo referansları kırılır (canlı veri yoksa önemsiz) | Versioning'den restore |

**Sıra kuralı:** token (2) → domain (3) → deploy (4). Token deploy'dan sonra
genişletilirse API boot etmez.

---

## Kod tarafı (uygulandı)

- `StorageService`: tek `S3Client`, iki bucket adı; her PUT/GET/delete/checkExists
  açık `BucketKind` ("public"|"private") alır. `classifyKey` tek kaynak;
  `assertKeyBucket` yanlış-bucket'ı runtime'da fırlatır. `getPublicUrl`/
  `resolveImageUrl` yalnız public-sınıf anahtara URL üretir (INV-STORAGE-1).
- 11 çağrı noktası açık bucket'la güncellendi; ölü `buildSupplierProfileKey`/
  `buildSupplierCertificateKey` (0 çağrı) silindi.
- Regresyon: `test/unit/storage.service.spec.ts` (8 test).
