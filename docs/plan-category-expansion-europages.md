# Kategori Derinleştirme — Europages Ölçeğine Plan

> Durum: **UYGULANDI (2026-09-01).** Altı fazın tamamı bitti; sonuçlar en altta.
> Ölçümler canlı DB üzerinden.

## 1. Europages gerçekte nasıl kurulu

Herkese açık kaynaklardan doğrulanan yapı:

| Katman | Europages |
|---|---|
| Sektör | **26** |
| Başlık (heading) | **4.500** |
| Anahtar kelime | **90.000+** |
| Dil | 26 |
| Firma | ~3 milyon / 34 ülke |

**En önemli tespit:** 90.000 rakamı *kategori* değil, **anahtar kelime**. Yani
Europages'te de taksonomi 4.500 başlıkta duruyor; 90.000 kelime bu başlıklara
bağlanmış arama karşılıkları (başlık başına ~20 kelime). Bizim `Category.keywords`
kolonumuz **tam olarak bu katman** — mimari zaten aynı:

```
searchText = fold(nameTr + " " + keywords)      # seed-categories.ts / apply-category-keywords.ts
```

## 2. Bizim gerçek durumumuz (ölçüldü)

| | Europages | Biz | |
|---|---|---|---|
| Sektör / segment | 26 | **38** | ~eşit |
| Başlık (L2+L3) | 4.500 | **1.551** | 2.9x az |
| Seçilebilir düğüm (L3+L4) | — | **7.852** | sayıca yeterli |
| **Anahtar kelime** | **90.000** | **194** | **464x az** |
| Kelimeli kategori | — | 28 / 8.149 | %0,3 |

### Bulgu A — Asıl açık kelime katmanı, kategori sayısı değil

7.852 seçilebilir düğümümüz var; Europages'in 4.500 başlığından *fazla*. Sorun
sayı değil **kelime hazinesi**: kullanıcı "paslanmaz sac" yazıyor, kategori adı
"Paslanmaz çelik yassı mamul" — **kategori var, kelime yok**, arama boş dönüyor.
Yeni kategori eklemek bu aramayı çözmez.

### Bulgu B — Derinlik dağılımı TERS

| Segment | Başlık | Yaprak |
|---|---|---|
| 41 Laboratuvar ve Ölçüm | 114 | **1.702** |
| 43 Bilgi Teknolojisi | 54 | 708 |
| 72 İnşaat Hizmetleri | 61 | 433 |
| 25 Ticari Araçlar | 76 | 317 |
| 30 İnşaat Malzemeleri | 86 | 246 |
| **23 İmalat Makineleri** | 88 | **47** |
| **12 Kimyasallar** | 50 | **27** |
| **31 İmalat Bileşenleri ve Sarf** | **76** | **8** |

Kaynak `unspsc.tsv`'nin kendisi kısmî bir çıkarım: segment 31'de yalnız 8 L4
satırı var (gerçek UNSPSC'de yüzlerce). Yani taksonomi **laboratuvar ve BT'de
derin, imalatta sığ** — kullanıcının işaret ettiği yerde tam olarak.

## 3. Ne yapıyoruz

Değerden/eforu bölerek altı faz. Faz 1 ve 2 ikisi birlikte açığın %90'ını kapatır.

### Faz 1 — Tokenli arama *(küçük, hemen)*
Bugün arama tek parça: `searchText contains "paslanmaz sac"`. Kelime sırası
tutmazsa 0 sonuç. Sorguyu kelimelere bölüp AND'lemek, hiç yeni veri eklemeden
recall'ü ciddi artırır ve Faz 2'nin değerini çarpar.
`category.service.ts:243` — tek dosya.

### Faz 2 — Anahtar kelime katmanı: 194 → ~55.000 *(asıl kaldıraç)*
- 8.149 aktif düğüm × ~7 Türkçe eşanlamlı/jargon.
- **Offline üretim**, runtime AI değil: `packages/db/prisma/scripts/gen-category-keywords.ts`
  → Gemini Flash, 40'lık gruplar, ~204 istek → **~$0.90 tek seferlik**. Firma AI
  bütçesine dokunmaz.
- Çıktı `category-keywords.tsv`'ye yazılır → **repo'da versiyonlu, diff'lenebilir**
  → canlıya `apply-category-keywords` ile (reseed gerekmez).
- **Risk düşük ve sınırlı:** `searchText` kod tabanında YALNIZ kategori aramasında
  kullanılıyor (doğrulandı) — eşleştirmede, bildirimde, yetkide değil. Hatalı
  kelime aramayı bozar, veriyi/yönlendirmeyi **asla** bozmaz.
- Kalite kapısı: segment başına 20 satır elle örneklem + sonuçsuz-arama logu
  düzeltme döngüsü (Faz 6).

### Faz 3 — Endüstriyel başlık derinliği: x99 katmanı 182 → ~1.200 satır
Europages tarzı başlık = **alıcı dilinde ürün adı** ("Paslanmaz çelik borular",
"Hidrolik pompalar", "CNC işleme hizmeti") — UNSPSC'nin soyut sınıfı değil.
Bu yüzden UNSPSC tam listesini çekmek **yanlış hamle**; bugün 64 satır eklediğimiz
`categories-custom.tsv` x99 aralığını büyütüyoruz.
Hedef segmentler (ölçülen açıklar): **31, 23, 12, 11, 40, 26, 27** — ~15 alt-sektör
× ~60 yaprak.
Kısıt (bugün öğrenildi): **segment başına tek x99 family**; taşma boş class
slotlarına yazılır.

### Faz 4 — Faaliyet tipi *(Europages'in ikinci ekseni — bizde HİÇ yok)*
Europages her firmayı iki eksende listeler: kategori **ve** faaliyet tipi.
Bizde `CompanyType` yalnız hukuki biçim (A.Ş./Ltd.). Eklenecek:
**Üretici / Distribütör-Bayi / Hizmet sağlayıcı / İthalatçı-İhracatçı / Fason imalat**.
"Paslanmaz boru" arayan alıcı için üreticiyle bayiyi ayırmak, kategoriyi
derinleştirmekten daha çok işe yarar.

### Faz 5 — Firma alt kategorileri
`company-profile.service.ts:265` → `exactLevel: 1` kaldırılır (firma yalnız
segment seçebiliyor: "İmalat Makineleri" gibi 88 başlıklık bir kova). L3'e
inilir, tavan **50** (algoritma bozulmasın diye). Onboarding + Profilim UI.

### Faz 6 — Kürasyon döngüsü
Sonuçsuz aramalar bugün yalnız API logunda ("Kategori araması sonuçsuz").
Tabloya alınır → admin kuyruğu → kelime/başlık kararı → TSV. Katalogun kendi
kendini besleyen kısmı budur; Faz 2'nin AI çıktısını da bu düzeltir.

## 4. Neden rakip veritabanını kopyalamıyoruz
Europages'in başlık ağacı sui generis veritabanı hakkı kapsamında ve rakip
konumdayız. Ayrıca işe de yaramaz: Türk sanayi jargonu (`dkp`, `hrp`, `abkant`,
`caraskal`, `inox`) bir Avrupa dizininin Türkçe çevirisinden çıkmaz. Ölçek
hedefini alıyoruz, veriyi kendi kaynaklarımızdan üretiyoruz.

## 5. Sıra ve onay
Faz 1 → 2 → 3 tek blok halinde yapılabilir (hepsi arama/katalog).
Faz 4 → 5 şema + UI dokunuşu, ayrı blok.
Faz 6 en son (diğerlerinin çıktısını besler).

**Canlıda bekleyen (operatör):** bugünkü 48 kategori + 83 kelime satırı henüz
canlı değil — `seed-categories` + `apply-category-keywords` koşulmalı.


---

## 6. Sonuç (2026-09-01, uygulandıktan sonra)

| | ÖNCE | SONRA |
|---|---|---|
| aktif kategori | 8.187 | **10.991** |
| anahtar kelime | 194 | **48.259** |
| sözlüklü kategori | 28 | **8.178** |
| endüstriyel yaprak (segment 31+23+12) | 82 | **1.382** |
| 12 gerçekçi endüstriyel sorgudan sonuç veren | 1 | **11** |

Altı fazın hepsi yapıldı:
1. Tokenli arama — `tokenizeQuery` (shared), TR bağlaçları elenir
2. Kelime katmanı — 8.103 satır, offline üretim, toplam **$1.04**
3. Endüstriyel derinlik — 2.740 yaprak, alıcı dilinde, 12 segment
4. Faaliyet tipi — `CompanyActivity` ekseni (kayıt + ayarlar + profil)
5. Firma alt kategorileri — `buyer/sellerSubCategoryIds` ucu açıldı
6. Kürasyon döngüsü — `category_search_misses` + admin paneli

**Ölçümün değiştirdiği şey:** başlangıçtaki varsayım "kategori sayısı az"dı.
Ölçünce seçilebilir düğüm sayımızın (7.852) Europages'in 4.500 başlığından
zaten fazla olduğu, asıl açığın **kelime hazinesi** (464x) ve **dağılım**
(laboratuvar 1.702 yaprak / imalat bileşenleri 8) olduğu çıktı. Plan buna göre
kuruldu; yeni sınıf uydurmak yerine var olan sınıfların altı dolduruldu.
