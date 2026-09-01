# Plan — Kategori Derinliği ve Eşleşme Kalitesi

> **Durum:** TASLAK — onay bekliyor, kod yazılmadı.
> Talep: "kategoriler çok az, özellikle endüstriyelde; parça parça daha
> detaylı olmalı ki talepler doğru firmaların karşısına çıksın."

---

## 1. Ölçüm: taksonomi DERİN, veri SIĞ

Canlı veritabanından (2026-09-01, salt okuma):

| Seviye | Toplam | **Aktif** |
|--------|-------:|----------:|
| L1 Segment | 58 | **38** |
| L2 Family | 458 | **297** |
| L3 Class | 2.153 | **1.254** |
| L4 Commodity | 10.754 | **6.598** |

**Yani 8.000'den fazla aktif kategori var.** Kategori sayısı sorun değil.

Sorun kullanımda:

| Ölçü | Değer |
|------|------:|
| Firma başına ana kategori | **1,35** |
| Firma başına **alt kategori** | **0,00** |
| Talep başına kategori | **1,05** |

**Hiçbir firma alt kategori seçmemiş — çünkü seçemiyor.**

### Kök neden

1. **Firma kategorisi segmente KİLİTLİ.** `company-profile.service.ts:265,269`
   `validateIds(..., { exactLevel: 1 })` — firma yalnız L1 seçebiliyor.
   Arayüzde de `segment-only-picker.tsx` var, adı bunu söylüyor.
2. **`sellerSubCategoryIds` / `buyerSubCategoryIds` şemada VAR ve eşleşmede
   KULLANILIYOR** (`hasSome: subCandidates`) ama **dolduran hiçbir uç/UI yok**
   → alan sürekli boş, eşleşmenin yarısı ölü.
3. Sonuç: eşleşme fiilen **38 kovaya** düşüyor. "Hidrolik hortum" talebi, o
   segmenti işaretleyen HERKESE gidiyor.

> Kullanıcının "kategoriler çok az" algısı buradan geliyor: profilinde
> gerçekten 38 seçenek görüyor. Oysa katalogda 8.000 var; ulaşamıyor.

**Sonuç: yeni kategori EKLEMEK sorunu çözmez.** Var olan derinliği
kullanılabilir kılmak çözer.

---

## 2. Faz 1 — Firma kategorilerini derinleştir · **asıl darboğaz**

- `exactLevel: 1` kilidini kaldır → firma **L1 (geniş ilgi) + L3/L4
  (uzmanlık)** seçebilsin.
- İki alanın anlamını netleştir:
  - `categoryIds` = **ilgi alanı** (segment) — "bu alanla ilgileniyorum"
  - `subCategoryIds` = **uzmanlık** (L3/L4) — "bunu gerçekten yapıyorum"
- Profil UI: segment seç → altında "Neyi tam olarak yapıyorsunuz?" ile
  spesifik sınıf/emtia ekle. Mevcut `category-selector-modal` deseni hazır.
- Tavan: firma başına ~50 alt kategori (sınırsız olursa herkes her şeyi
  işaretler ve eşleşme yine anlamını yitirir).

**Tek başına etkisi:** eşleşme uzayı 38 → ~8.000 kovaya çıkar.

---

## 3. Faz 2 — Eşleşmeyi SKORLU yap

Bugün düz OR: `hasSome(segments) OR hasSome(subs)` → eşleşti/eşleşmedi.
İki kusuru var: (a) segment eşleşmesi ile emtia eşleşmesi aynı ağırlıkta,
(b) sıralama yok.

Önerilen skor:

| Eşleşme | Ağırlık | Anlamı |
|---------|--------:|--------|
| L4 emtia tam | 100 | "Tam bunu yapıyorum" |
| L3 sınıf | 70 | "Bu sınıfta çalışıyorum" |
| Aynı L2 ailesi | 30 | Komşu iş |
| Yalnız L1 segment | 10 | Uzak ilgi |

**Bildirim eşiği skora bağlanır:** yüksek skor → anlık bildirim; düşük skor →
haftalık özet ya da hiç. Bugün segment eşleşmesi herkese bildirim gönderiyor;
gürültü kullanıcıyı bildirimleri kapatmaya itiyor ve o noktada ürün sessizce
işlevini yitiriyor.

Aynı skor tedarikçi keşfinde (`supplier-discovery`) de kullanılır — orada
şu an ham `hasSome` var.

---

## 4. Faz 3 — KALEM bazlı kategori · en yüksek getirili fikir

Talep bugün **1,05 kategori** taşıyor; ama gerçek bir talep karma olur:
*"500 m çelik boru + 3 elektrik panosu + 200 KKD"*. Tek kategori bunu
temsil edemez, dolayısıyla ya çelikçilere ya panocılara ulaşır — ikisine
birden değil.

Çözüm: **kalem seviyesinde kategori.** Altyapı ZATEN VAR —
`CompanyItem.categoryId` kalem kataloğuyla birlikte eklendi (2026-09-01).
Yapılacak:

1. `ListingItem.categoryId` ekle (katalogdan kopyalanır, elle de seçilebilir)
2. Eşleşme talebin kategorilerinin **birleşimi** üzerinden yürüsün
3. Bildirim metni kalem-farkında olsun: *"Talebin 3 kaleminden 2'si sizin
   uzmanlık alanınızda"* — tedarikçi neden çağrıldığını anlar

Bu, kalem kataloğu yatırımının karşılığını doğrudan veriyor: kullanıcı
kalemi bir kez kategorize eder, sonraki her talepte eşleşme bedavaya gelir.

---

## 5. Faz 4 — Endüstriyel kürasyon (süreç, tek seferlik iş değil)

UNSPSC endüstriyel kalemlerde Türkçe jargonu zayıf tutar ("telfer",
"caraskal", "sıkma rakor", "flanşlı vana"). Altyapı zaten var:

- `categories-custom.tsv` — platform-özel x99 aralığı (bugün **36 aktif**)
- `category-keywords.tsv` — eşanlamlı jargon, `searchText`'e katlanıyor
- Sonuçsuz aramalar **loglanıyor** ("Kategori araması sonuçsuz")

Eksik olan: **geri besleme döngüsünün kapanması.** Öneri:

1. Sonuçsuz aramayı log yerine **tabloya** yaz (`category_search_miss`:
   sorgu, firma, tarih, sayı)
2. Kullanıcıya kayıt anında çıkış ver: *"Aradığınızı bulamadınız mı?
   Bize yazın"* → aynı tabloya not
3. Admin ekranında **sıklığa göre sıralı** liste → kürasyon kuyruğu
4. Haftalık: en sık ıskalananlara ya eşanlamlı ekle ya x99 kategorisi aç

Böylece "hangi endüstriyel kategoriler eksik" sorusu **tahminle değil
veriyle** yanıtlanır. Bugün kimsenin okumadığı log satırlarında duruyor.

---

## 6. Sıra ve etki

```
Faz 1  Firma alt kategorileri      ← darboğaz; tek başına 38 → 8.000 kova
Faz 2  Skorlu eşleşme + bildirim eşiği
Faz 3  Kalem bazlı kategori        ← katalog yatırımının karşılığı
Faz 4  Kürasyon döngüsü            ← sürekli süreç
```

Faz 1 tek başına ship edilebilir ve en büyük sıçramayı verir.

## 7. Riskler

| Risk | Karşılık |
|------|----------|
| Firma her şeyi işaretler → eşleşme yine anlamsızlaşır | Alt kategori tavanı + skorda "çok geniş profil" cezası |
| Derin seçim onboarding'i uzatır | Onboarding'de ZORUNLU DEĞİL; segment yeterli, uzmanlık sonradan profilden |
| Mevcut firmaların alt kategorisi boş → skor düşük kalır | Geçiş: alt kategorisi olmayan firma segment skoruyla eşleşmeye devam eder (bugünkü davranış) |
| Kategori ağacı ~180 KB | Segment ucu zaten ayrıldı (perf turu); derin seçim modal içinde lazy |

## 8. Açık sorular

1. Firma başına alt kategori tavanı kaç olsun? (önerim 50)
2. Bildirim eşiği: L3 ve üstü mü anlık, L2/L1 haftalık özet mi?
3. Kalem kategorisi zorunlu mu olsun, opsiyonel mi? (önerim opsiyonel —
   zorunlu tutmak kalem girişini yavaşlatır)
