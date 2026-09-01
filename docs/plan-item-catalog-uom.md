# Plan — Kalem Kataloğu, Ölçü Birimleri ve Kalem Detayları

> **Durum:** ✅ **ÜÇ FAZ DA UYGULANDI** (2026-09-01).
> Faz 1 birim kataloğu · Faz 2 kalem kataloğu · Faz 3 kalem detayları +
> muadil simetrisi + kalem-bazlı belge. Aşağıdaki metin planın kendisidir;
> uygulamadaki sapmalar bölüm sonlarında not edildi.
> Talep: kalem eklemeye detay alanları gelsin; ölçü birimleri serbest metin
> yerine **seçilebilir** olsun; kalemler **kaydedilip sonra hızlıca yeniden
> eklenebilsin** ("SAP'deki gibi").

---

## 1. Bugün ne var, sorun ne

| Alan | Bugün | Sorun |
|------|-------|-------|
| `ListingItem.unit` | **serbest `String`**, arayüzde düz `<Input placeholder="adet">` | "adet/Adet/ADET/ad/pcs" ayrı değerler. Raporda gruplanamaz, Excel'de eşleşmez, teklif karşılaştırması birim tutarlılığını doğrulayamaz |
| Kalem alanları | `name, description, quantity, unit, materialCode, requiredByDate, targetPrice, minUnitPrice, buyNowUnitPrice` | Marka/MPN, teknik şartname, muadil kabulü, garanti, kalem-bazlı çizim YOK |
| Yeniden kullanım | YOK — her ihalede kalemler sıfırdan yazılıyor | Aynı 30 kalemi her ay elle girmek; yazım farkları geçmiş kıyasını bozuyor |
| Var olan altyapı | `ListingTemplate` (tüm sihirbaz snapshot'ı), `ListingQuestionTemplate`, `SupplierTemplate` + `/satinalma/sablonlar` hub'ı | Şablon = TÜM ihale. "Şu 5 kalemi al" yolu yok |

**Ölçek notu:** `unit` alanı stack'te ~243 yerde geçiyor (sihirbaz → DTO →
`ListingItem` → teklif şablonu → sipariş snapshot'ı → PDF/Excel/rapor).
Bu yüzden birim işi **expand→contract** ile yapılmalı, tek seferde değil.

---

## 2. SAP'den ne alınmalı, ne alınmamalı

**Alınacak**
- *Material Master* → firma-içi **Kalem Kataloğu** (`CompanyItem`): kod, ad,
  temel ölçü birimi, kategori, varsayılan miktar/hedef fiyat.
- *Unit of Measure (T006)* → **kodlu birim listesi**: kod + TR ad + sembol +
  **boyut** (adet/kütle/uzunluk/alan/hacim/zaman) + anlamlı ondalık sayısı.
- *Material Group* → zaten var: **UNSPSC kategorileri** (13.305 satır, L1-L4).
  Kalem kartı kategoriye bağlanır, yeni bir taksonomi ÜRETİLMEZ.
- *PO Text / Long Text* → kalemde ayrı **teknik şartname** alanı.

**Alınmayacak (bilinçli)**
- Malzeme-başına alternatif birim çevrim matrisi (SAP `MARM`). Bunun yerine
  **boyut içinde global çevrim** (kg↔ton, m↔cm) yeterli; kalem başına özel
  çevrim gerçek bir talep gelene kadar yazılmaz.
- Plant / değerleme / muhasebe görünümleri — bu ürün muhasebe değil.
- Malzeme numarası zorunluluğu — KOBİ kullanıcısı stok kodu tutmuyor olabilir;
  kod **opsiyonel** kalır.

---

## 3. Faz 1 — Ölçü Birimi Kataloğu

**Neden önce bu:** kalem kataloğu birime dayanıyor. Ters sırada yaparsak
katalog serbest metin birimle dolar ve sonra iki kez göç etmek gerekir.

### 3.1 Tek kaynak: `@rothern/shared` `units.ts`

```ts
export type UnitDimension =
  | "COUNT" | "MASS" | "LENGTH" | "AREA" | "VOLUME" | "TIME" | "OTHER";

export interface UnitDef {
  code: string;        // kanonik: "PCE", "KG", "M", "M2", "M3", "LTR", "TON", "HR"
  nameTr: string;      // "adet", "kilogram"
  symbol: string;      // "ad", "kg", "m²"
  dimension: UnitDimension;
  decimals: number;    // adet=0, kg=3, m=2 → miktar doğrulaması buradan
  toBase?: number;     // boyut içi çevrim (ton→kg = 1000)
  aliases: string[];   // "ad", "pcs", "piece", "adet" → PCE (TR-katlanmış)
}
```

- Başlangıç listesi ~40 birim (TR B2B'de gerçekten kullanılanlar: adet, kg,
  ton, gram, m, cm, mm, m², m³, litre, paket, koli, kutu, rulo, set, takım,
  çift, saat, gün, ay, kişi-gün, sefer, palet, top, metretül…).
- **Alias eşleme** `foldSearchText` ile (mevcut TR-katlama helper'ı) —
  'İ'/aksan sorunu zaten çözülmüş, aynı yol kullanılır.
- `decimals` alanı gerçek bir doğrulama kazandırır: **2,5 adet reddedilir**,
  2,5 kg kabul edilir. Bugün böyle bir kontrol yok.

### 3.2 Şema (expand→contract, 3 adım)

1. **Expand:** `ListingItem.unitCode String?` + `CompanyOrderItem.unitCode
   String?` eklenir. Eski `unit` (serbest metin) **kalır ve yazılmaya devam
   eder** — gösterim ondan okunur.
2. **Backfill:** tek seferlik script eski `unit` metinlerini alias tablosuyla
   koda çevirir; eşleşmeyenler `unitCode = null` kalır ve raporlanır
   (canlıda 42 ilan var — el ile denetlenebilir bir hacim).
3. **Contract:** yazımlar `unitCode`'a geçtikten ve okuma yolları
   `unitCode ?? unit`'e bağlandıktan **sonra**, ayrı bir sürümde `unit`
   düşürülür. Bu adım bu planın kapsamı DIŞINDA — ayrıca kararlaştırılır.

> `unit` alanı sipariş snapshot'ında da var (`CompanyOrderItem`). Snapshot
> **dondurulmuş veri**: geçmiş siparişlerin birimi değiştirilmez, yalnız yeni
> kayıtlar koda yazar.

### 3.3 Arayüz

- Yeni `UnitSelect` bileşeni: aranabilir açılır liste, **en sık kullanılan 8
  birim üstte sabit** (firma bazında son kullanımlardan türetilir), altında
  boyuta göre gruplanmış tam liste.
- "Listede yok" → serbest metin kaçış yolu KORUNUR (`unitCode=null`,
  `unit=<metin>`) ve kullanıcıya "bu birim raporlarda gruplanamaz" uyarısı
  verilir. Kullanıcıyı kilitlemek yerine maliyeti görünür kılıyoruz.
- Excel içe aktarma: `unit` sütunu alias tablosundan geçer; eşleşmeyen satır
  **hata değil uyarı** üretir (mevcut önizleme deseni: satır-hata listesi).

### 3.4 Dokunulan yerler
`shared/units.ts` (yeni) · `create-listing.dto` · `item-import.ts` +
`bid-import.ts` (sütun sözleşmesi) · AI `tender-extract` sanitizer'ı
(model birim uyduruyor → koda eşlenmeli) · sihirbaz adım 2 · teklif ver
ekranı · sipariş PDF/Excel · raporlar.

---

## 4. Faz 2 — Kalem Kataloğu (`CompanyItem`)

### 4.1 Model

```prisma
model CompanyItem {
  id          String   @id @default(cuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  code        String?  // firma-içi stok kodu (opsiyonel)
  name        String
  description String?
  specification String? // uzun teknik metin (SAP long text karşılığı)
  unitCode    String
  categoryId  String?  // UNSPSC L3+ — mevcut taksonomi
  brand       String?
  mpn         String?  // üretici parça numarası
  targetPrice Decimal? @db.Decimal(18, 2)
  tags        String[] @default([])
  isActive    Boolean  @default(true)
  usageCount  Int      @default(0) // "en çok kullanılan" sıralaması için
  lastUsedAt  DateTime?
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @default(now()) @updatedAt

  @@unique([companyId, code])            // kod verildiyse firma içinde tekil
  @@index([companyId, isActive])
  @@index([companyId, categoryId])
  @@map("company_items")
}
```

**RLS:** yeni kiracı tablosu → `company_items_rls` policy'si AYNI migration'da
yazılır (`current_setting('app.current_company_id') = "companyId"`). Denetimde
"plan mühürlendikten sonra eklenen tablo policy'siz kaldı" hatası iki kez
tekrarladı; bu sefer baştan.

### 4.2 Akışlar

**Katalogdan ihaleye (asıl talep)**
- Sihirbaz adım 2'ye **"Katalogdan Ekle"** düğmesi.
- Açılan modal kategori seçici deseninin aynısı (arama + çoklu seçim); her
  satırda miktar girişi. "Ekle" → N kalem tek seferde forma basılır.
- Sıralama: `lastUsedAt` + `usageCount` → gerçekten sık kullanılan üstte.

**İhaleden kataloğa (ters yön, en az onun kadar önemli)**
- İhale kaydedildikten sonra **"Bu kalemleri kataloğa kaydet"**; kod/ad
  eşleşenler atlanır, yenileri eklenir. Katalog böyle **kendiliğinden**
  dolar — kullanıcıdan önce katalog kurmasını istemek benimsemeyi öldürür.

**Excel ile katalog**
- Mevcut kalem şablonuyla aynı sözleşme üzerinden katalog içe/dışa aktarma.
- İçe aktarmada `materialCode` katalogla eşleşirse ad/birim/kategori
  **otomatik dolar** → yazım farkları kaynağında kurur.

**Yönetim ekranı**
- `/company/satinalma/sablonlar` hub'ına **dördüncü kart: "Kalem Kataloğu"**.
  Üç şablon türü zaten orada; ayrı bir menü açmıyoruz (sol menü sadeleştirme
  kararına sadık kalınır — 8 düz satır, akordeon yok).

---

## 5. Faz 3 — Kalem Detay Alanları

`ListingItem`'a eklenecekler (hepsi opsiyonel, hepsi kataloğa da yansır):

| Alan | Neden |
|------|-------|
| `brand` / `mpn` | "Şu markanın şu parçası" — teklif kıyasının temeli |
| `alternativeAllowed` (bool) | **Muadil/eşdeğer teklif kabul edilir mi** — klasik satınalma alanı, teklif kapsamını belirler |
| `specification` (uzun metin) | `description` kısa özet kalır; teknik şartname ayrı |
| `warrantyMonths` | Garanti süresi kıyaslanabilir olur |
| `hsCode` (GTİP) | Yalnız uluslararası ilanlarda görünür (98 ülke destekleniyor) |
| `documentKeys` | **Kalem-bazlı teknik resim/çizim** — bugün belgeler yalnız ilan seviyesinde |

### 5.1 Teklif tarafı simetrisi (kritik)

`alternativeAllowed` tek başına yarım kalır. Tedarikçi muadil teklif
edebiliyorsa, **ne teklif ettiğini söyleyebilmeli**:

`ListingBidItem` → `offeredBrand`, `offeredMpn`, `isAlternative` (bool).

Bunlar olmadan alıcı, gelen üç teklifin aynı ürüne mi farklı ürünlere mi ait
olduğunu göremez ve karşılaştırma yanıltıcı olur. Faz 3'ün **ayrılmaz**
parçası; ayrı sürüme bırakılmamalı.

---

## 6. Sıra, bağımlılık, risk

```
Faz 1 (birim)  ──►  Faz 2 (katalog)  ──►  Faz 3 (detaylar)
     │                                        │
     └── bağımsız ship edilebilir             └── teklif simetrisi AYNI sürümde
```

| Risk | Karşılık |
|------|----------|
| `unit` 243 yerde — tek seferde değişim kırar | expand→contract; `unit` bir sürüm boyunca yazılmaya devam eder |
| Sipariş snapshot'ı geçmiş veri | Snapshot dondurulmuş; yalnız yeni kayıt koda yazar |
| Kalem-bazlı belge → R2 nesne sayısı artar | Kullanıcı kararıyla YİNE DE eklendi. Hafifletme: belge AYRI tabloya değil `listing_documents.itemId`'ye bağlandı (yetki/R2 doğrulama/imza/denetim/tavan tek yerde kalır); kalem başına 10 belge tavanı; ilan düzenlemesinde silinen kalemlerin R2 anahtarları commit SONRASI en-iyi-çaba siliniyor. **Bucket object-lock hâlâ açık** (`pending-operator-tasks.md` §6) — DeleteObject reddedilirse temizlik loglanır ama çalışmaz |
| Yeni kiracı tablosu policy'siz kalabilir | RLS policy'si tablo migration'ıyla AYNI dosyada |
| AI çıkarımı serbest birim üretiyor | Sanitizer alias tablosundan geçirir; eşleşmezse `unitCode=null` + bayrak (mevcut `AiFlagsBanner` deseni) |
| Katalog boş başlarsa kullanılmaz | Ters yön ("ihaleden kataloğa") Faz 2'nin **ilk** parçası olarak yazılır |

## 7. Kapsam dışı (bilinçli)

- Malzeme-başına alternatif birim çevrimi (SAP `MARM`)
- Katalogda revizyon/versiyon geçmişi
- Firmalar arası katalog paylaşımı
- `unit` kolonunun DÜŞÜRÜLMESİ (ayrı karar)
- Stok/envanter takibi — bu bir e-ihale platformu, ERP değil

## 8. Açık sorular (başlamadan önce senin kararın)

1. **Birim listesi kapalı mı olsun?** Önerim: hayır — serbest metin kaçışı
   uyarıyla kalsın. Kapalı liste veri kalitesini artırır ama "listede yok"
   durumunda kullanıcı ihale açamaz hale gelir.
2. **Katalog kalemi silinince** geçmiş ilanlara ne olur? Önerim: `isActive`
   ile pasifleştirme; ilan kalemi zaten kopya (snapshot), bağ kurmuyoruz.
3. **Katalog kalemi ile ilan kalemi arasında FK olsun mu?** Önerim: **hayır**
   — kopyalama. FK, katalog düzenlemesinin yayınlanmış ihaleyi geriye dönük
   değiştirmesine yol açar (denetimde tam da bu sınıf hatayı kovaladık).
4. **Faz 3'teki `hsCode`** yalnız uluslararası ilanlarda mı görünsün?
5. Faz 1 tek başına ship edilsin mi, yoksa Faz 1+2 birlikte mi?
