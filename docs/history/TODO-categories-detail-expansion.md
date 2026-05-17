# TODO: Kategori Alt Dal Detaylandırma (KOBİ inşaat/elektrik/iskele)

## Durum

Kullanıcı 16 Mayıs 2026'da kategori cleanup PR'ında "alt kategorilerde
detaylandırmayı artır" talep etti. UNSPSC standart kapsamı KOBİ inşaat /
elektrik pano / iskele için zayıf — bu dikeylerde yeni Class ve Commodity
satırları eklenmeli.

## Mevcut durum (cleanup sonrası)

### İnşaat ve Yapı Malzemeleri (segment 30) — 11 family

- Kalıcı yapılar
- Kapılar, pencereler ve cam
- Prefabrik yapılar
- Sıhhi tesisat armatürleri
- Yapısal bileşenler ve temel şekiller
- Yapısal bina ürünleri
- Yapısal malzemeler
- Yollar ve peyzaj
- İnşaat ve bakım destek ekipmanları
- İzolasyon
- İç dekorasyon malzemeleri

**Eksik:** İskele sistemleri (cephe / iç / asma / mobil kuleler / dirsek-boru-klemens),
betonarme kalıp, çelik konstrüksiyon profilleri (UNSPSC bunları farklı yerlerde
dağıtmış), yangın güvenliği malzemeleri.

### Elektrik ve Aydınlatma (segment 39) — sadece 4 family

- Aydınlatma armatürleri ve aksesuarları
- Elektrik ekipmanları, bileşenleri ve sarf malzemeleri
- Elektrik kablo yönetim cihazları, aksesuarları ve sarf malzemeleri
- Lambalar, ampuller ve lamba bileşenleri

**Eksik:** Pano üretimi için ayrı bir family yok. KOBİ elektrik pano üreticisi
için bu en önemli kategori — alt dallar gerek.

### İnşaat Makineleri (segment 22) — 4 satır

Çok zayıf. KOBİ inşaatçısı için makina/ekipman listesi geniş olmalı.

## Önerilen yeni alt dallar (ek seed)

### 1) İskele sistemleri (İnşaat ve Yapı Malzemeleri altında)

Önerilen yeni Class + Commodity'ler:
- **Class:** İskele sistemleri ve aksesuarları
  - Commodity: Cephe iskelesi (modüler)
  - Commodity: İç iskele / kalıp iskelesi
  - Commodity: Asma iskele
  - Commodity: Mobil iskele kuleleri
  - Commodity: İskele dirseği, boru ve klemens
  - Commodity: İskele platform tahtası / kalas
  - Commodity: Güvenlik ağı, kenar koruma
  - Commodity: Çelik kalıp, panel kalıp

### 2) Elektrik pano (Elektrik ve Aydınlatma altında)

Önerilen yeni Family + Class + Commodity'ler:
- **Family:** Pano ve dağıtım sistemleri
  - **Class:** Pano gövdeleri
    - Commodity: AG (alçak gerilim) pano gövdesi
    - Commodity: OG (orta gerilim) pano gövdesi
    - Commodity: MCC pano gövdesi
    - Commodity: Sayaç pano gövdesi
    - Commodity: Outdoor pano (IP65+)
  - **Class:** Şalt ve koruma elemanları
    - Commodity: Kompakt güç şalteri (MCCB)
    - Commodity: Mini şalter (MCB)
    - Commodity: Kaçak akım rölesi
    - Commodity: Kontaktör
    - Commodity: Termik röle
    - Commodity: Faz koruma rölesi
  - **Class:** Otomasyon ve kontrol
    - Commodity: PLC modülü
    - Commodity: HMI panel
    - Commodity: Servo / step motor sürücü
    - Commodity: Frekans inverter
    - Commodity: Zaman rölesi, sayıcı
  - **Class:** Kompanzasyon
    - Commodity: Reaktif güç kompanzasyon rölesi
    - Commodity: Şönt kapasitör
    - Commodity: Harmonik filtre
  - **Class:** Ölçü ve izleme
    - Commodity: Akım transformatörü (AT)
    - Commodity: Gerilim transformatörü (GT)
    - Commodity: Multimetre / enerji analizörü panosu

### 3) İnşaat Makineleri detaylandırma

- Beton santral ekipmanları
- Mini ekskavatör / kompakt ekipman
- Mobil vinç tipleri (kule, kamyon, paletli)
- Asfalt ve yol işleri makineleri

## Uygulama planı

1. Yeni satırları `packages/db/src/seeds/categories-custom.txt` formatında yaz
   (UNSPSC kodları kullan veya custom 99xxxxxx prefix).
2. `seed-categories.ts`'i bu ek dosyayı da yüklenecek şekilde güncelle, **veya**
   ayrı bir `seed-custom-categories.ts` script yaz.
3. Idempotent — tekrar koşunca duplicate insert yapmasın (code unique).
4. Cleanup script'i bu yeni satırları gizli listeye ALMAYACAK (default aktif).
5. Frontend test: yeni kategorileri segment expand'de gör.

## Domain doğrulaması gerek

KOBİ tedarikçi vs. ihaleci geri bildirimi olmadan körü körüne alt dal
eklemek yanıltıcı olabilir. Bu liste **başlangıç önerisi** — gerçek
kullanıcı testi sonrası rafine edilmeli.

## Referans

- Mevcut UNSPSC seed: `packages/db/src/seeds/categories.txt` (1618 satır)
- Cleanup script: `packages/db/prisma/scripts/cleanup-categories.ts`
