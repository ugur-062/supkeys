# Plan — Ülke Bazlı Kayıt ve Belge Profilleri

> **Durum:** TASLAK — onay bekliyor, kod yazılmadı.
> Talep: kayıt yalnız belirli ülkelere açık olsun (Türkiye, Kıbrıs, Rusya,
> Çin, "Stan" ülkeleri, BAE, Afrika, AB); istenen belgeler ülkeye özel olsun.

---

## 1. Bugün ne var

| Katman | Durum |
|--------|-------|
| Ülke listesi | `@rothern/shared` `data/countries.ts` — **98 ülke**, düz liste, gruplama YOK, kısıtlama YOK |
| Belge kümesi | **İKİLİ**: TR → 6 belge · yabancı → 3 belge (`tradeRegistry, taxPlate, idFront`) |
| Belge saklama | `Company` üzerinde **6 SABİT KOLON** (`docTaxPlateUrl`, `docTradeRegistryUrl`, …) — 7. belge istenemez |
| Revizyon | `company_kyc_revisions.kind` **serbest String** → esnek (asıl fırsat burada) |
| Vergi no | TR strict VKN/TCKN · diğerleri **gevşek** tek kural |
| Kayıt kapısı | Ülke kısıtı YOK — 98 ülkeden herkes kayıt olabiliyor |

**Kapsama boşluğu:** AB'nin 27'si listede **var**. Afrika'nın 54'ünden
**yalnız 11'i** var (DZ, AO, EG, ET, GH, KE, MA, NG, ZA, TN, +1). "Afrika"
istendiyse 43 ülke eklenecek.

---

## 2. ÖNCE KARAR GEREKTİRENLER (kod yazmadan)

### 2.1 Kıbrıs — hangisi? ⚠️

İki ayrı ülke ve **tamamen farklı belge/vergi sistemi**:

| | KKTC | Kıbrıs Cumhuriyeti |
|---|---|---|
| Tanınma | Yalnız Türkiye | BM üyesi, **AB üyesi** |
| ISO kodu | Yok (resmî) | `CY` |
| Vergi | KKTC vergi dairesi | **AB KDV** (`CY` + 8 hane + harf) → **VIES ile ücretsiz doğrulanır** |
| Sicil | KKTC Şirketler Mukayyitliği | Registrar of Companies, **HE** numarası |

Listede bugün yalnız `CY` (= Kıbrıs Cumhuriyeti) var. KKTC istendiyse ISO
kodu olmadığı için özel bir kod gerekir (`XN` gibi kullanıcı-tanımlı) ve
adres/vergi doğrulaması ayrı yazılır.

**Karar: hangisi, yoksa ikisi de mi?**

### 2.2 Yaptırım ve yüksek riskli ülkeler ⚠️ **HUKUKİ**

Bu bir **ödeme alan** platform ve sanal POS başvurusu sürüyor (PayTR).
Ülke kapısı yalnız bir ürün kararı değil, uyum kararı:

- **Rusya:** AB/ABD/BK kapsamlı yaptırım rejimi altında. Platformda AB'li
  firmalar da olacaksa (AB grubu isteniyor), aynı pazar yerinde AB↔RU
  eşleşmesi doğabilir. Ödeme sağlayıcısının kendi uyum yükümlülüğü ayrıca var.
- **Afrika (54 ülke):** FATF gri/kara liste ülkeleri içeriyor; liste dönemsel
  değişiyor. "Tüm Afrika" demek bunları da kapsamak demek.
- **Stan ülkeleri:** Orta Asya beşlisi (KZ, UZ, TM, KG, TJ) ile Afganistan
  ayrı değerlendirilmeli — sonuncusu ağır yaptırım altında.

**Ben bu kararı veremem ve vermemeliyim.** Yapabileceğim: ülke kapısını
**yapılandırılabilir** kurmak ve "yüksek riskli" işaretli ülkeleri
otomatik-onaydan çıkarıp **zorunlu manuel admin incelemesine** düşürmek.
Hangi ülkenin hangi kovaya gireceği senin/hukuk danışmanının kararı.

**Karar: yaptırım listesi kimden gelecek, hangi ülkeler kapalı olacak?**

### 2.3 "Stan ülkeleri" kimler?

Orta Asya beşlisi: **KZ, UZ, TM, KG, TJ**. Ek olarak `-stan` ile biten
**AF** (Afganistan) ve **PK** (Pakistan) var ama bunlar farklı bağlam.
**Karar: beşli mi, yoksa AF/PK de mi?**

### 2.4 "Afrika" — 54'ü de mi?

54 ülkenin belge sistemi çok heterojen; tek bir "Afrika profili" yazmak
gerçekçi değil. Üç seçenek:
1. **Tümü**, tek "genel yabancı" profiliyle (sicil + vergi + kimlik) — en az iş
2. **Öncelikli alt küme** (ör. NG, ZA, EG, KE, MA, GH, TZ, ET, CI, DZ) için
   özel profil, kalanı genel profil
3. Yalnız alt küme açık, kalanı **kapalı**

**Önerim: 2.** Ticaret hacminin yoğunlaştığı ülkelere özel profil, kalanına
genel profil — kimseyi kapatmadan doğruluk kazanılır.

---

## 3. Tasarım

### 3.1 Ülke grupları (`@rothern/shared`)

```ts
export type CountryGroup =
  | "TR" | "EU" | "CY_TRNC" | "RU" | "CN" | "CENTRAL_ASIA"
  | "GULF" | "AFRICA" | "OTHER";

export interface CountryProfile {
  code: string;
  group: CountryGroup;
  /** Kayıt açık mı — kapalıysa kayıt formunda seçilemez. */
  registrationOpen: boolean;
  /** true → otomatik onay YOK, her kayıt manuel admin incelemesine düşer. */
  enhancedDueDiligence: boolean;
  /** Bu ülkede ZORUNLU belge türleri (DocKind). */
  requiredDocs: DocKind[];
  /** Vergi/sicil no doğrulayıcı anahtarı ("TR_VKN", "EU_VAT", "RU_INN"…). */
  taxIdRule: string;
  /** AB KDV numarası VIES ile doğrulanabilir mi. */
  viesSupported: boolean;
}
```

Tek kaynak: `packages/shared/src/data/country-profiles.ts`. Kayıt formu,
onboarding doğrulaması, belge kapısı ve admin ekranı **hep buradan** okur.

### 3.2 Belge modeli — 6 sabit kolondan esnek kümeye

Bugünkü 6 kolon, ülkeye özel belge istemek için **yetmez** (BAE'de Trade
License + Establishment Card + TRN + Emirates ID = 4 farklı belge; Rusya'da
EGRUL özeti + INN + KPP + direktör atama kararı).

`company_kyc_revisions.kind` zaten **serbest String** — model esnekliği orada
hazır. Plan:

1. **Yeni `CompanyDocument` tablosu** (kind serbest, companyId + status +
   reason + key), `company_kyc_revisions`'ın kardeşi. RLS policy'si AYNI
   migration'da.
2. 6 kolon **KALIR ve yazılmaya devam eder** (expand→contract) — okuma yolu
   `belgeler tablosu ?? eski kolon`. TR akışı hiç bozulmaz.
3. Yeni ülkeler doğrudan yeni tabloyu kullanır.
4. Kolonların düşürülmesi AYRI karar (bu planın kapsamı dışında).

### 3.3 Ülke bazlı belge profilleri (taslak — DOĞRULANMALI)

> ⚠️ Aşağıdaki liste genel ticaret bilgisine dayanır, **hukuki danışmanlık
> değildir**. Uygulamadan önce her ülke için mali müşavir/hukuk teyidi
> alınmalı; belge adları ve zorunluluklar mevzuatla değişir.

| Grup | Zorunlu belgeler (taslak) | Kimlik no | Oto-doğrulama |
|------|---------------------------|-----------|---------------|
| **TR** | Vergi levhası · Ticaret sicil gazetesi · İmza sirküleri · Faaliyet belgesi · Kimlik ön/arka | VKN(10)/TCKN(11) | — (mevcut strict) |
| **AB (27)** | Ticaret sicil kaydı · KDV belgesi · Yetkili kimlik/pasaport | AB KDV no | ✅ **VIES** (ücretsiz, resmî) |
| **Kıbrıs (RoC)** | Certificate of Incorporation (HE no) · KDV belgesi · Yetkili kimlik | HE + AB KDV | ✅ VIES |
| **Rusya** | ЕГРЮЛ özeti · ИНН · Direktör atama kararı · Yetkili kimlik | ИНН(10/12), ОГРН(13) | ❌ manuel |
| **Çin** | 营业执照 (Business License) · Yasal temsilci kimliği | Birleşik Sosyal Kredi Kodu (18) | ❌ manuel |
| **Orta Asya** | Devlet tescil belgesi · Vergi no belgesi · Yetkili kimlik | KZ БИН(12), UZ ИНН(9)… | ❌ manuel |
| **BAE** | **Trade License** (zorunlu) · MOA/Establishment Card · TRN (KDV'liyse) · Emirates ID/pasaport | TRN(15) | ❌ manuel |
| **Afrika (öncelikli)** | Sicil belgesi · Vergi no belgesi · Yetkili kimlik | ülkeye göre | ❌ manuel |
| **Afrika (diğer)** | Genel yabancı profili (3 belge) | gevşek | ❌ manuel |

### 3.4 Vergi/sicil no doğrulaması

Bugün tek bir "gevşek yabancı" kuralı var. Yerine `taxIdRule` anahtarlı
doğrulayıcı tablosu:

- `TR_VKN` — mevcut strict (10/11 hane + algoritma)
- `EU_VAT` — ülke öneki + biçim; **VIES ile canlı doğrulama**
- `RU_INN` — 10 (tüzel) / 12 (gerçek) hane + kontrol basamağı
- `CN_USCC` — 18 karakter, kontrol karakteri hesaplanabilir
- `AE_TRN` — 15 hane
- `KZ_BIN` — 12 hane
- `GENERIC` — gevşek (bugünkü davranış)

**Fail-open değil fail-informative:** biçim tutmuyorsa kayıt ENGELLENMEZ ama
`enhancedDueDiligence` işaretlenip admin kuyruğuna düşer. Yanlış biçim
yüzünden gerçek bir firmayı kapıda tutmak, elle incelemekten pahalıdır.

### 3.5 VIES — AB için tek yüksek getirili otomasyon

AB KDV numarası **ücretsiz ve resmî** bir servisle doğrulanabilir (VIES SOAP/
REST). Kazanç: 27 ülke + Kıbrıs için firma adı ve KDV geçerliliği anında
teyit; admin kuyruğu bu grup için neredeyse boşalır.

Zaten backlog'da (`CLAUDE.md` → "KALAN: (b) VIES"). Bu plan onu AB grubunun
**ön koşulu** yapıyor.

Dikkat: VIES servisi zaman zaman ülke bazında kapanır → **fail-closed
DEĞİL**: doğrulanamayan kayıt reddedilmez, manuel kuyruğa düşer.

---

## 4. Kayıt formu — kullanıcı deneyimi

1. **Ülke seçimi öne alınır** (bugün form ortasında). Seçilen ülkeye göre
   sonraki alanlar ve belge listesi değişir.
2. Kapalı ülke seçilirse: liste dışı bırakılır + "şu an bu ülkeden kayıt
   alınmıyor" açıklaması ve bilgilendirme talebi bağlantısı.
3. Belge adları **ülkenin kendi dilindeki resmî adıyla** gösterilir
   (parantez içinde Türkçe): "Trade License (Ticaret Ruhsatı)",
   "营业执照 (İş Ruhsatı)". Kullanıcı hangi belgeyi arayacağını bilir.
4. `enhancedDueDiligence` ülkelerinde kayıt sonunda dürüst mesaj:
   "Başvurunuz manuel incelemeye alınacak, ~X iş günü."

---

## 5. Sıra

```
Faz 1  Ülke profili altyapısı (gruplar + kapı + registrationOpen)
         └── kayıt formu ülkeye göre dallanır, kapalı ülke seçilemez
Faz 2  Esnek belge modeli (CompanyDocument + RLS) — expand
         └── 6 kolon korunur, yeni ülkeler yeni tabloyu kullanır
Faz 3  Ülke profilleri + belge listeleri + taxIdRule doğrulayıcıları
Faz 4  VIES (AB + Kıbrıs) — otomatik doğrulama
Faz 5  Eksik 43 Afrika ülkesi + öncelikli alt küme profilleri
```

Faz 1 tek başına ship edilebilir (kapı + gruplama), gerisi üstüne biner.

---

## 6. Riskler

| Risk | Karşılık |
|------|----------|
| **Yaptırım/uyum** | Ülke kapısı yapılandırılabilir; "yüksek riskli" → zorunlu manuel inceleme. Liste kararı KULLANICIDA/hukukta |
| Belge adları mevzuatla değişir | Profiller tek dosyada, kod değişmeden güncellenir |
| 6 kolon → esnek model geçişi | expand→contract; TR akışı hiç bozulmaz |
| VIES kesintisi | Fail-closed DEĞİL → manuel kuyruk |
| Mevcut yabancı kayıtlar | `registrationOpen=false` YALNIZ yeni kayda uygulanır; mevcut firmalar etkilenmez (aksi hâlde çalışan hesap kilitlenir) |
| KYC belgesi artışı → R2 | **Bağımlılık:** object-lock politikası hâlâ açık (`pending-operator-tasks.md` §6) |

---

## 7. Başlamadan önce senin kararların

1. **Kıbrıs:** KKTC mi, Kıbrıs Cumhuriyeti mi, ikisi de mi?
2. **Yaptırım:** Rusya ve yüksek riskli ülkelerde tutum ne? Liste kimden gelecek?
3. **"Stan":** Orta Asya beşlisi mi, Afganistan/Pakistan dahil mi?
4. **Afrika:** 54'ü de mi, öncelikli alt küme mi, yoksa yalnız alt küme mi?
5. **Kapalı ülkeler:** Listede hiç görünmesin mi, yoksa "yakında" olarak
   görünüp bilgilendirme mi toplasın?
6. Belge listeleri için **mali müşavir/hukuk teyidi** kimden alınacak?
