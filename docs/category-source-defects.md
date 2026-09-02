# Ariba kategori kaynağındaki kusurlar ve düzeltmeleri

**Tarih:** 2026-09-02 · **Kapsam:** L1 + L2 + L3 + çekirdek L4 (15.231 yaprak)

Kategori kataloğu Ariba'nın Türkçe dışa aktarımından geliyor ve kaynak dosya
(`packages/db/src/seeds/ariba-categories.tsv`) **değiştirilmiyor**. Aşağıdaki
kusurlar `category-translations.curated.tsv` katmanında düzeltildi; o dosyanın
3. sütunu kaynağın **kusurlu hâlini** taşıdığı için her satır diff'lenebilir:
Ariba düzeltilmiş bir dışa aktarım gönderdiğinde satır kendiliğinden farkı
gösterir.

> Neden kaynağa dokunulmuyor: `import-ariba-csv.ts` her koşumda TSV'yi
> CSV'lerden yeniden üretir. Kaynağa yazılan bir düzeltme ilk yeniden içe
> aktarmada sessizce kaybolurdu.

---

## 1. Yanlış element sembolü (4)

Sembol, adı geçen elementin değil BAŞKA bir elementin sembolüydü.

| Kod | Kaynak | Düzeltme | Not |
|-----|--------|----------|-----|
| `12141707` | Kadmiyum **Ca** | Kadmiyum **Cd** | Ca = kalsiyum |
| `12141742` | Teknetyum **Te** | Teknetyum **Tc** | Te = tellür |
| `12141802` | Fransiyum **Fm** | Fransiyum **Fr** | Fm = fermiyum |
| `12141757` | Ununnilyum **Uum** | Ununnilyum **Uun** | IUPAC geçici sembolü |

## 2. Yazım hatası (17)

| Kod | Kaynak | Düzeltme |
|-----|--------|----------|
| `11101623` | **Zikronyum** cevheri | **Zirkonyum** cevheri |
| `25173900` | **Eletrikli** aksamlar | **Elektrikli** aksamlar |
| `40151534` | **Kryojenik** pompalar | **Kriyojenik** pompalar |
| `41112602` | **Atomatik** swab test kitleri | **Otomatik** swab test kitleri |
| `42291602` | Cerrahi **civata** … **pin** … | Cerrahi **cıvata** … **pim** … |
| `42294204` | Mikro veya **hassa** veya plastik … | Mikro veya **hassas** veya plastik … |
| `60104600` | Mekanik **fiziyi** materyalleri | Mekanik **fizik** materyalleri |
| `60106400` | **Elektronim** eğitimi malzemeleri ve ekipmanları | **Elektronik** … |
| `60106402` | **Elektronim** eğitimi malzemeleri | **Elektronik** … |
| `60122009` | … el işi **akseuarları** | … el işi **aksesuarları** |
| `60122402` | Vitray yapım aletleri ve **akseuarları** | … **aksesuarları** |
| `60124402` | **Aluminyum** şekillendirme folyosu | **Alüminyum** … |
| `60124403` | **Aluminyum** tel | **Alüminyum** tel |
| `60131100` | Pirinç müzik **entrümanları** | Pirinç müzik **enstrümanları** |
| `60141200` | Aktif oyun ekipmanı ve **aksesurları** | … **aksesuarları** |
| `60141400` | Dramatik oyun ekipmanı ve **aksesurları** | … **aksesuarları** |
| `78102202` | Posta kutusu **hzimetleri** | Posta kutusu **hizmetleri** |

## 3. Yanlış içerik (1)

| Kod | Kaynak | Düzeltme |
|-----|--------|----------|
| `60122008` | **irmak** | **Çıkrık** |

Üst kategorisi "Dikiş ve iğne işi ve dokuma ekipmanı", kardeşleri el dokuma
tezgahı / masa tezgahı / yer tezgahı / dantel işleme. UNSPSC 60122008 =
*Spinning wheels*. "irmak" her iki Ariba dışa aktarımında da aynen böyle
yazıyor — yani Ariba'nın kendi çeviri hatası.

## 4. Farklı dallarda ÇAKIŞAN ad (36 kod)

En tehlikeli sınıf: alıcı bir dalı, tedarikçi öbür dalı seçer ve
`deriveCategoryMatchCandidates` alakasız iki ürünü eşleştirir. Ayrım her
zaman **veriden** türetildi (üst kategori ya da çocuk listesi), uydurulmadı.

| Kod | Kaynak | Düzeltme | Ayrımın dayanağı |
|-----|--------|----------|------------------|
| `27112807` | Aynalar | **Torna aynaları** | üst: alet ataşmanları (≠ endüstriyel optik) |
| `31171500` | Yataklar | **Rulmanlar ve yataklar** | çocukları: bilyalı/radyal/makaralı yatak (≠ mobilya yatağı) |
| `12171500` | Boyalar | **Boyarmaddeler** | çocukları: ftalein/rosanilin boyalar (dye) ≠ sanat boyası |
| `11151600` | İpler | **Tekstil iplikleri** | çocukları: pamuk/ipek ipliği (≠ halat) |
| `31151500` | İpler | **Halatlar ve ipler** | çocukları: tel halat, kenevir ip |
| `55121500` | Etiketler | **Asma etiketler** | çocukları: bagaj/anahtar/fiyat etiketi (tag) |
| `55121600` | Etiketler | **Yapışkan etiketler** | çocukları: kendinden yapışkanlı, adres, çıkartma (label) |
| `23241800` | Metal delme makineleri | **Metal delme tezgahları** | çocukları: matkap tezgahı, radyal matkap |
| `23241900` | Metal delme makineleri | **Metal delik büyütme ve broşlama makineleri** | çocukları: broşlama, tığlama, delik büyütme |
| `84131700` | Emeklilik fonları | **Kurumsal emeklilik fonları** | çocukları: işveren/sendika yönetimli |
| `84131800` | Emeklilik fonları | **Bireysel emeklilik fonları** | çocukları: kendi kendine yönetilen |
| `56112100` | Koltuklar | **Oturma birimleri** | ticari/endüstriyel mobilya dalı |
| `27111721` | Manivelalar | **Anahtar manivelaları** | üst: anahtarlar ve sürücüler |
| `22101507` | Tokmaklar | **Zemin sıkıştırma tokmakları** | üst: kazı makineleri |
| `30161801` | Dolaplar | **Ahşap dolaplar** | üst: marangoz işi |
| `40161602` | Hava filtreleri | **Hava arıtma filtreleri** | üst: arındırma |
| `49161703` | Diskler | **Atletizm diskleri** | üst: parkur sporları |
| `21101513` | Diskler | **Tarım diskleri** | üst: toprak hazırlama makineleri |
| `23281500` | Kaplama makineleri | **Metal kaplama makineleri** | üst: metal işlem makineleri |
| `23151502` | Kaplama makineleri | **Plastik kaplama makineleri** | üst: kauçuk ve plastik işleme |
| `44122114` | Vidalar | **Kırtasiye vidaları** | üst: masa sabitleme malzemeleri |
| `22101709` | Kancalar | **İş makinesi kancaları** | üst: iş makinesi bileşenleri |
| `60103907` | Su bitkileri | **Su bitkisi örnekleri** | üst: korunmuş örnekler (eğitim) |
| `60121001` | Boyalar | **Sanat boyaları** | üst: sanat |
| `23101508` | Kesme makineleri | **Ağaç, taş ve seramik kesme makineleri** | üst kategorisinden |
| `45101901` | Bantlama makineleri | **Baskı bantlama makineleri** | üst: baskı laboratuvarı |
| `26101412` | Motor tamir kiti | **Elektrik motoru tamir kiti** | üst: motor/jeneratör bileşenleri |
| `44121618` | Makaslar | **Ofis makasları** | üst: masa malzemeleri |
| `48102109` | Plastik folyo | **Streç film** | üst: gıda depolama ve işleme |
| `31191513` | Cam boncuk | **Cam bilya aşındırıcı** | üst: aşındırıcılar |
| `44121622` | Nemlendiriciler | **Zarf nemlendiriciler** | üst: masa malzemeleri |
| `60104707` | Manometreler | **Eğitim manometreleri** | üst: enerji ve güç fiziği materyalleri |
| `46171607` | Ziller | **Çanlar** | üst: gözetleme ve tespit (≠ vurmalı çalgı zili) |
| `56101703` | Masalar | **Çalışma masaları** | üst: büro mobilyaları |
| `71161105` | Kuyu perforasyon hizmetleri | **Üretim kuyusu perforasyon hizmetleri** | üst: üretim mühendisliği |
| `70111600` | Çiçekli bitkiler | **Çiçekli bitki yetiştirme hizmetleri** | üst: bahçecilik (hizmet dalı) |

### Segment 85 — aynı ailede tekrar eden 15 sınıf

`8582xxxx` ailesinde aynı ad üç ayrı sınıfta geçiyordu. Ayrım **çocuk
düğümlerden** okundu: `Measurement of …` (ölçüm) · `Monitoring of …` (izleme) ·
`Measurement of … pacemaker/stimulator/defibrillator` (cihaz ölçümü). Adların
sonuna bu ek getirildi — ör. `85821100` "(ölçüm)", `85823400` "(izleme)",
`85823500` "(cihaz ölçümü)".

Ayrıca nükleer tıp ↔ radyoterapi ve görüntüleme ↔ nükleer tıp dallarında aynı
anatomi adını taşıyan 12 sınıfa dal eki verildi (`Gözler (nükleer tıp)` /
`Gözler (radyoterapi)` gibi).

---

## Düzeltilemeyen (bilinçli bırakıldı)

Kaynakta **aynı ailede, aynı ad, ayırt edici veri yok** — çocuğu da yok:

| Kod çifti | Ad |
|-----------|-----|
| `26111907` / `26111910` | Hidrolik kavramalar |
| `53131605` / `53131629` | Makyaj kitleri |
| `55121720` / `55121729` | Amblemler |

Bunlara ayrım uydurmak, olmayan bir bilgiyi varmış gibi göstermek olurdu.
Ariba yeni bir dışa aktarım gönderirse ilk bakılacak yer burası.

Ata–torun tekrarları (ör. `54000000` "Takılar" / `54100000` "Takılar")
düzeltilmedi: eşleştirme üst seviyeleri zaten türettiği için bölünme riski yok.
