# Ariba kataloğunda çakışan kodlar ve katalog farkı

Üretim: `import-ariba-csv.ts` — bu dosya ELLE düzenlenmez.

| Kaynak | Dosya |
| --- | --- |
| Firma kategori seçimi (tam) | `ariba-tum-kategoriler-hiyerarsik.csv` |
| Talep/ilan kategorisi (discovery) | `ariba-discovery-tum-kategoriler-hiyerarsik.csv` |

## Katalog farkı

İki dışa aktarım **yalnız L4 yaprakta** ayrışır — L1/L2/L3 kod ve ad olarak
birebir aynıdır. Bu yüzden tek tabloda, kod başına tek satır + `inDiscovery`
bayrağıyla tutuluyorlar.

- Tam katalog: **158018** kategori (L1:58 · L2:558 · L3:7966 · L4:149436)
- Discovery alt kümesi: **158005**
- Yalnız tam katalogda: **13** yaprak (talep/ilan açarken seçilemez, firma beyan edebilir)

| Kod | Seviye | Ad |
| --- | --- | --- |
| `24112008` | L4 | Plastik Kasalar |
| `50192604` | L4 | Taze veya Dondurulmuş Hazır Pizza |
| `71161414` | L4 | Boru Hattı İnşaat ve Montaj Hizmetleri |
| `73141716` | L4 | Nakış Hizmetleri |
| `73181025` | L4 | Dişli Azdırma Hizmetleri |
| `76101504` | L4 | Depo Temizleme Hizmetleri |
| `76111802` | L4 | Uçak-Helikopter Temizliği |
| `80121612` | L4 | Sigorta Hukuk Hizmetleri |
| `81161602` | L4 | Çevrimiçi Sohbet Hizmeti |
| `82101509` | L4 | Marka/Logo Tasarım Hizmetleri |
| `90121504` | L4 | Havayolu Ulaşım Rezervasyon Hizmetleri |
| `90121505` | L4 | Kara Toplu Ulaşım Rezervasyon Hizmetleri |
| `90121506` | L4 | Demiryolu Ulaşım Rezervasyon Hizmetleri |

## Çakışan kodlar

Kaynakta aynı 8 haneli kodu paylaşan farklı adlar var. Bunlar çeviri
**değil**: Ariba TR zaten dolu bir UNSPSC koduna özel kategori yazmış
(`53131639` = *Urinary incontinence pad* / *Dil temizleyici*). `Category.id =
kod` tekil olduğu için biri düşmek zorunda.

**Kural: ortak kodlarda discovery'nin adı kazanır.** Kazanan ad iki katalogda
da aynı olmalı — aksi hâlde alıcı bir ürünü, tedarikçi bambaşka bir ürünü
beyan eder ve eşleştirme aynı kod üzerinden ikisini sessizce çiftler.

Düşen ad kaybolmuyor: `keywords` sütununa yazılıyor, `searchText`'e katlanıyor.
Yani **arama düşen adı yine bulur**, yalnız etiket olarak görünmez.

Toplam 31 ad düştü.

| Kod | Kalan ad | Düşen ad (aramada bulunur) | Kaynak satır |
| --- | --- | --- | --- |
| `11111811` | Haydite | Kaolin | 8411 |
| `25191705` | Engine piston and rod scale | Taşıt Yıkama Ekipmanı | 13112 |
| `26111609` | Gas turbine generator | Güneş Panelleri | 13562 |
| `30102317` | Composite profiles | Cam Elyafı Profiller | 14728 |
| `30111505` | Ready mix concrete | Hazır Beton | 14842 |
| `30141514` | Expanded polystyrene EPS insulation | Vakumlu izolasyon | 14960 |
| `30171515` | Inspection door | Garaj Kapıları | 15131 |
| `31162907` | Extending clamp | Boru Kelepçeleri | 16810 |
| `39112605` | Solar powered lighting system, | Soya Mumu | 19210 |
| `39121117` | Buss bar | Elektrik Direkleri | 19278 |
| `41111740` | Automated optical inspection system | Radyografik Muayene Sistemleri | 21658 |
| `43211723` | Electronic voting or vote-counting equipment | Tepme yakalayıcı | 28000 |
| `43231515` | Mailing and shipping software | Risk Yönetimi Yazılımı | 28326 |
| `43232314` | Business intelligence and data analysis software | Kurumsal Arama Yazılımı | 28376 |
| `43232613` | Manufacturing execution system MES software | Çevre Sağlık ve Güvenliği Yazılımı | 28411 |
| `53131639` | Urinary incontinence pad | Dil temizleyici | 74542 |
| `56131604` | Paint color center component | Alışveriş Sepetleri | 75097 |
| `70141608` | Aerial crop survey | Uçakla Kimyasal Püskürtme Hizmetleri | 76965 |
| `73181024` | Machining service | Sac Hizmetleri | 78588 |
| `73181107` | Zinc alloy barrel plating service | Püskürtme Boya Hizmetleri | 78597 |
| `80101509` | Government affairs and community relations consultation service | İş Devamlılığı Planlama ve Danışmanlık Hizmetleri | 79202 |
| `80111717` | Employee physical screening service | Psikometrik Test Hizmetleri | 79287 |
| `80141515` | Subscription market research | Mobil telefon tabanlı piyasa araştırması | 79380 |
| `80141623` | Merchandising service | Sosyal Medya Hizmetleri | 79406 |
| `81101606` | Marine engineering | Pompa veya Vana Onarım Hizmetleri | 79580 |
| `81101706` | Laboratory equipment maintenance | Elektronik Ekipman Bakım Onarım Hizmetleri | 79587 |
| `81102302` | Space engineering service | Uçak Bakım Onarım Hizmetleri | 79615 |
| `81111511` | System or application programming management service | Mobil Uygulama Geliştirme | 79696 |
| `81112011` | Database management software publishing | Veri/Belge Şifreleme Hizmetleri | 79757 |
| `81112012` | ANS and ATM software maintenance/development services | Veri İhlal Hizmetleri | 79759 |
| `86101717` | Marketing professional training service | Sosyal Beceri Eğitim Hizmetleri | 156938 |
