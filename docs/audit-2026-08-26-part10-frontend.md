# Denetim 2026-08-26 — Parça 10: Web / Admin Ön Yüz

Kapsam: `apps/web` (76 sayfa; en büyükleri `ilan/[id]` 2134, `teklif-ver` 2005,
`wizard/step-1-info` 1838, `home-page` 1475 satır) + `apps/admin` (18 sayfa),
ilgili API uçlarıyla birlikte.

Yöntem: 7 mercek paralel (auth/oturum, UI↔API paritesi, istemci durumu &
önbellek, form & doğrulama, ön yüz güvenliği, a11y/UX, performans & ölçek) →
**yedisi de teslim etti** (Parça 9'daki teslim sorunu tekrarlanmadı) → ham
bulgular tekilleştirildi → HIGH/MED adayları ana oturumda **kod okuyarak ve
gerektiğinde çalıştırarak** çürütme turundan geçirildi. Toplam ~12 ham HIGH →
**7 doğrulanmış HIGH**; 8 aday düşürüldü/daraltıldı.

## DOĞRULANAN — HIGH

| # | Bulgu | Kanıt |
|---|-------|-------|
| 1 | **`MoneyInput` ondalık ayracını yok sayıyor — para sessizce bozuluyor.** `parseMoneyDisplay` noktayı KOŞULSUZ binlik ayracı sayıyor (`display.replace(/\./g, "")`). **Ölçüldü** (fonksiyon çalıştırılarak): yazarak `1500.50` → API'ye **150050** (×100, ekranda `150.050`); **yapıştırarak `1,234.56` → API'ye `1.23`** (÷1000, ekranda `1,23` — makul göründüğü için gözle yakalanamıyor); yapıştırarak `1234.56` → `123456`. Ağırlaştırıcı: CLAUDE.md kural 6 — gönderilmiş teklif geri çekilemez; yanlış fiyatın tek çıkışı alıcının elemesi. Kullanıldığı yerler: teklif birim fiyatı ve tek tutar, ihale taban/hemen-al fiyatı, kalem modalı, ödeme bildirimi | `components/ui/money-input.tsx:20-27,43` |
| 2 | **SALES admini, SUPER_ADMIN'e kilitli "firma askıya alma"yı şikayet ucundan yapıyor — ve geri alamıyor.** `POST /admin/companies/:id/suspend` = `SUPER_ADMIN`; ama `POST .../complaints/:id/resolve` = `SUPER_ADMIN + SALES` ve gövdesindeki `suspend: true` bayrağı servis içinde firmayı doğrudan `isBlocked` yapıyor. UI düğmeyi yanlış anahtarla kapılıyor (`resolveComplaint`, `suspend` değil). `unsuspend` `SUPER_ADMIN`-only olduğu için **tek yönlü yıkıcı yetki**. Mevcut drift nöbetçisi yakalamıyor: yalnız handler dekoratörlerini karşılaştırıyor, gövdedeki yan-etki bayrağını görmüyor. **NOT: Parça 9 Dalga B'de tam bu dala `critical` audit + bildirim eklendi, yetki açığı fark edilmeden** | `admin-companies.controller.ts:389-397` vs `:537-545`; `admin-companies.service.ts` resolveComplaint suspend dalı; `apps/admin/src/lib/admin-permissions.ts:41,55`; `sikayetler/page.tsx:65,225-242` |
| 3 | **Backend'in alan-bazlı TR doğrulama hataları HİÇBİR ekranda gösterilmiyor.** `ValidationPipe` `{ message:"Doğrulama hatası", errors:{ "items.0.quantity":"…" } }` döndürüyor; üç interceptor'ın yorumu "component `extractFieldErrors` ile inline gösterir" diyor ama **`extractFieldErrors` diye bir fonksiyon repoda yok** (grep: yalnız o üç yorum satırı). `extractErrorMessage` sabit `message`'ı okuyor. Sonuç: 40 alanlık sihirbazda tek toast — "Doğrulama hatası", hangi alan belirsiz, hiçbir alan kırmızıya dönmüyor. Bu bulgu diğer pek çok drift'in **yükselticisi**: aşağıdaki her şema uyuşmazlığı kullanıcıya "Doğrulama hatası" olarak çıkıyor | `apps/api/src/main.ts:175-199`; `apps/web/src/lib/api.ts:77-79`; `lib/company-auth/api.ts:99-102`; `lib/tenders/error.ts:5-11` |
| 4 | **Aksiyon Merkezi hata anında YEŞİL "Bekleyen bir işiniz yok" basıyor.** Yalnız `isLoading` dallanıyor (satır 72), `isError` hiç okunmuyor; istek 500 dönünce `data` undefined → boş dizi → yeşil onay ikonu. Kullanıcı onay bekleyen ihaleyi, kapanmak üzere olan teklifi, geciken siparişi göremiyor ve süre kaçıyor | `components/dashboard/action-center.tsx:71-78,105-109` |
| 5 | **"Ödemeyi Aldım" tek tıkla, onaysız ve geri alınamaz** — 28×28 px, `aria-label`'sız, yalnız `title`'lı bir tik. `runDecision` doğrudan mutasyonu çağırıyor; backend `paymentDecision` atomik CAS ile CONFIRMED yazıyor ve dönüş yolu YOK. Aynı karttaki "Reddet" ise diyalogdan geçiyor — asimetri | `components/orders/order-payments-card.tsx:142-154,327-337` |
| 6 | **Kazandırma onay metni geri alınamazlığı söylemiyor.** `confirm({ description: '"X" kazandırılsın mı? Sipariş oluşacak.' })` — `destructive` yok, "GERİ ALINAMAZ" yok, diğer tekliflerin LOST olacağı yok. Aynı işlemin **asistan yolu** doğru uyarıyor ("Bu işlem GERİ ALINAMAZ: diğer teklifler kaybeder, sipariş oluşturulur"). Un-award bilinçli olarak yok (CLAUDE.md §7), yani yanlış tık kalıcı | `ilan/[id]/page.tsx:286-291,492-497` vs `ai/assistant/assistant-actions.service.ts:380-390` |
| 7 | **Kalemler adımında her tuş vuruşu TÜM kalem satırlarını yeniden çiziyor.** `useWatch({ name:"items" })` ad-öneki aboneliği kuruyor → `items.7.quantity` değişimi `items` izleyicisini tetikliyor → `fields.map` ile tüm `ItemRow`'lar yeniden. `currentItems` render'da **hiç kullanılmıyor** (tek tüketicisi `applyImported` callback'i, `getValues` ile karşılanabilir). Repoda `React.memo` **hiç yok** (0 eşleşme) → bailout imkânsız. 100 kalemde ~5.000 element/tuş; tavan `MAX_LISTING_ITEMS = 500` | `wizard/step-2-items.tsx:53` (kullanım yalnız `:72`) |

## DOĞRULANAN — MED (özet)

**Auth / oturum**
- Oturum token'ı **JSON gövdesinde** dönüyor: `AuthCookieInterceptor` cookie'yi yazıp `return body` diyor, token'ı gövdeden silmiyor → CLAUDE.md'nin "token JS'ten OKUNMAZ" invaryantı kırık (ön yüz saklamıyor, ama yanıtı okuyan her JS görüyor). Tek satırlık düzeltme.
- **Önceki kullanıcının kimlik snapshot'ı kalıyor:** `remember` bayrağı depolama hedefini değiştiriyor; `clear()` yalnız o anki depoya null yazıyor. İki depoyu birden temizleyen `removeItem`'ın tek çağıranı `persist.clearStorage()` ve o **hiç çağrılmıyor** (grep: 0). Ortak bilgisayarda A'nın adı/e-postası/rolleri localStorage'da kalıyor ve bayrak dönünce ekrana boyanıyor.
- **`/me` oturum boyunca hiç tazelenmiyor** (focus refetch kapalı, interval yok, WS dokunmuyor) → rol/tier değişimi tam sayfa yenilemeye kadar yansımıyor; `PremiumOnly` fail-open olduğu için tier düşen kullanıcı ekranı açık tutuyor.
- Depolama erişilemezse (çerez engelli tarayıcı) `onRehydrateStorage` hata dalında `setHydrated()` çağrılmıyor → panel **kalıcı boş ekran**, login'e bile atmıyor. Aynı kök neden SSR'da hydration uyuşmazlığı üretiyor (*kod okundu, canlı doğrulanmadı*).
- Depolama yazımı patlarsa **başarılı giriş "Giriş başarısız" görünüyor** (`setAuth` login formunun `try` bloğunda).
- `?next=` makinesi **ölü kod** — `safeNextPath` doğrulayıcısı hazır ama hiçbir yönlendirme `next=` üretmiyor (grep: 0); oturum düşünce hedef sayfa kayboluyor.

**UI↔API paritesi**
- `admin/sistem`'de SUPER_ADMIN'e özel üç yıkıcı form (manuel kur, suppression aklama, zaman-tasarrufu parametreleri) **her admin rolüne gösteriliyor**; üçü de rol matrisinde hiç yok → drift nöbetçisi kapsamı dışında.
- **Raporlardaki "Kurucu/Yönetici gözetim muafiyeti" yalnız API'de yaşıyor** — `ReportsRoleGate` eski kuralda; işlem-rolsüz Kurucu API'den 200 alırken arayüzde duvara çarpıyor (özellik erişilemez).
- **Teklif detay sayfasında kazandır/ele** ne `canManage` kapısı ne `awardPreview` adımı taşıyor → (a) ilanı açmayan kullanıcıya yıkıcı buton gösteriliyor (API 403 veriyor), (b) onay akışına düşen kazandırmada **başlatıcı notu hiç sorulmuyor**, onaycılara bağlam gitmiyor.
- Adres defteri kartı `managerOnly` ile kapılı ama `addresses:manage` bilinçli olarak SA/ST'ye de veriliyor → operatör sihirbazda "Ayarlar → Adresler'den ekleyin" uyarısı alıyor, Ayarlar'da kart yok; URL'yi elle yazınca sayfa tam yetkiyle açılıyor.

**Durum / önbellek**
- **Sihirbazda çift gönderim:** `await form.trigger()` çalışırken `create.isPending` henüz false → buton etkin. "Taslak Kaydet" her zaman, "İhaleyi Yayınla" ise onay diyaloğu atlanmışsa açık. Uç idempotent değil → **iki ayrı ihale/taslak**.
- **Koltuk sayacı hiçbir kullanıcı/davet mutasyonunda tazelenmiyor** → koltuk dolduğunda UI hâlâ davet ettiriyor (API reddediyor), boşaldığında ise kilitli gösteriyor.
- **Pano hiçbir mutasyonla tazelenmiyor** (repoda `"company-dashboard"` invalidasyonu 0) → yayınlanan ihale/kazandırma/teslim alma 5 dakikaya kadar panoda görünmüyor.
- **Admin KPI'ları** (`admin-company-stats`) doğrulama/KYC/tier aksiyonlarında bayat kalıyor (kardeş `useResolveComplaint` doğru yapıyor — konvansiyon var, bu beş yol atlanmış).
- Ödeme kaydı/kararı yalnız sipariş **detayını** tazeliyor, listedeki rozet/KPI eski kalıyor.

**Form / doğrulama** (drift tablosunun tamamı mercek raporunda)
- **"Peşin" ödemede peşin oranı zorunlu değil** (zod'da refine yok, Label'da `required` yok, placeholder "100" yanıltıyor) ama DTO `@ValidateIf(ADVANCE) @IsInt @Min(1)` istiyor → yurtiçi peşin ihale **yayınlanamıyor**, üstelik #3 yüzünden nedeni söylenmiyor.
- **Şablon SATIS→ALIM sızıntısı:** `noCloseDate` bayrağı ALIM'a taşınıyor, kullanıcının girdiği kapanış tarihi `mapToInput`'ta atılıyor → "kapanış tarihi zorunlu" 400'ü, çözümsüz döngü.
- **"Taslak Kaydet" tam şemayı doğruluyor** — backend `asDraft` ile tarih/zorunluluk kontrollerini atlıyor, ön yüz atlamıyor → yarım kalan iş kaydedilemiyor (taslağın varlık sebebi).
- Kalemsiz ilanda taslak kaydetme boş tutarı **`amount: 0`** olarak gönderiyor (`Number("")`), DTO `@Min(0.01)` reddediyor.
- Onay akışı bütçe eşiği ham `type="number"` → geçersiz girişte tarayıcı boş string veriyor, bu da **"her tutarda onay gerekir"** anlamına geliyor (kullanıcı yazdığını sanıyor).
- Parola politikası üç formda çatallı: kayıt 10 karakter + özel karakter, şifre değiştirme/sıfırlama 8 karakter + özel karakter yok → kayıt kapısı iki yoldan devre dışı.
- Tarih-only alanlar (`items[].requiredByDate`) UTC gece yarısına yazılıyor, gösterim yerel → negatif UTC ofsetli kullanıcıda gün kayıyor ve **her düzenlemede bir gün daha geriliyor**.
- Davetli tavanı FE 50 / BE 200; teklif geçerlilik üst sınırı (365) ve kalem sorusu cevap uzunluğu (500) ön yüzde hiç yok; onboarding/adres/hesap ayarlarında 13 alanda uzunluk kapısı yok.
- `translateValidatorMessage` ondalık sınırları yutuyor (`(\d+)` regex'i) → "0.001'den küçük olamaz" mesajı "0 veya daha büyük olmalı"ya dönüyor (#3 düzeltilince ortaya çıkacak).

**a11y / UX**
- Liste ekranlarının 7+'sında hata yutulup **"kayıt yok"** gösteriliyor (doğru desen `ErrorState` repoda var, iki yerde kullanılıyor); admin panosu hata anında **"0"** ve "şikayet yok" basıyor.
- Radyo grupları isimsiz: `ui/Label` `htmlFor` almıyor ve kontrolü sarmıyor, `FormRadioGroup` `aria-label`/`aria-describedby` bağlamıyor → ekran okuyucu ne grubun adını ne hata metnini duyuyor (`ui/Input`/`Textarea` bunu doğru yapıyor, sapma yalnız radyo/SelectMenu'de).
- Asistan slide-over'ının erişilebilir adı yok (`DialogTitle` yok) ve yanıtlar `aria-live` ile duyurulmuyor.
- Onay diyaloğu **yıkıcı butona odaklanıyor** (`autoFocus` koşulsuz) — ~15 yıkıcı çağrının tamamının kapısı.
- Davet iptali, admin "Şifre Sıfırla" ve "Paketi Kaldır" onaysız/adsız; daraltılmış sol menü yalnız fareyle açılıyor.
- Sihirbaz "eksik alan var" deyip hatalı adıma/alana götürmüyor.
- `EmptyState` ikon kutusu (`bg-zinc-50`) sayfa zeminiyle **aynı renk** — 02614823 kontrast taraması admin ikizini düzeltmiş, web kopyası `brand-50` grep'ine takılmadığı için atlanmış.

**Performans / ölçek**
- İlan detayı **tüm teklif+kalem gövdesini** 10 sn'de bir (açık artırma finalinde 1,5 sn'de bir) baştan çekiyor; sunucu sahip dalı sayfalamasız. 30 teklif × 100 kalem ≈ 0,75-1 MB/istek → ~360 MB/saat/sekme (*tahmin, ölçülmedi*).
- `ilan/[id]/page.tsx`'te **0 `useMemo`** (2134 satır) + repoda **0 `React.memo`** → her poll ~10.000 düğümlük ağacı baştan hesaplıyor.
- Teklif ver ekranı tek `itemState` sözlüğü + satır içi JSX → her fiyat tuşunda ~4.500 element.
- `LiveToasts` sorgu önbelleğini baypas edip ham axios kullanıyor → tek mesaj sinyali ~5 GET.
- **Kategori modalı koşulsuz render ediliyor** (`isOpen` yalnız Dialog'u kapatıyor) ve `useCategoryTree`'de `enabled` yok → sihirbazın Genel Bilgi adımına giren herkes ~180 KB'lık `/categories/all`'ı indiriyor. **Tek satırlık düzeltme.**
- `recharts` (~90-110 KB) giriş sonrası ilk ekranın paketinde statik import; `AssistantPanel` (880 satır) Silver altı kullanıcılara da iniyor.
- Bağlantılar ekranı mount'ta 7 paralel GET + sayfalamasız 200 kart; dizin araması debounce'suz (repoda 300 ms'lik `SearchInput` tek-kaynağı var, kullanılmıyor); "Satın Al" listesi 500 satırlık gövdeyi 15 sn'de bir çekiyor ve sayfalamayı yalnız istemcide yapıyor.
- Mesajlaşmada WS'e ek olarak 5/5/15 sn'lik üç poll paralel çalışıyor (~28 istek/dk/sekme).

**Güvenlik**
- Admin KYC **iframe önizlemesi CSP tarafından bloklu** (admin CSP'sinde `frame-src` yok → `default-src 'self'`) → "Önizle" düğmesi hiç çalışamayan ölü bir kontrol. *Daraltma: Parça 9 #7'nin "Görüntüle" (yeni sekme) yolu ÇALIŞIYOR — üst-seviye gezinme `frame-src`'a tabi değil; belge artık diske inmiyor. Ayrıca KYC belgeleri presigned R2 endpoint'inde, `cdn.rothern.com` değil, yani `.rothern.com` çerez kardeşi değil.*
- `connect-src`'te prod'da `http:` ve `img-src https:` genişliği → CSP'nin sızdırma-kanalını-kapatma işlevi yok.
- Sertifika görselleri `safeExternalUrl`'süz `href`'e giriyor (backend kapısı grandfather uyguladığı için legacy satır riski); bildirim `ctaUrl` normalizasyonunun üç kopyası protokol-göreli/şema biçimlerini elemiyor; `?from=` kontrolü login'deki denetleyiciden gevşek.
- Web'de HSTS başlığı yok (Vercel basıyor; Coolify/Docker hedefinde karşılığı yok); admin'de `robots.ts` yok.

## ÇÜRÜTÜLEN / DARALTILAN

- **"Parça 9 #7 düzeltmesi ön yüzde etkisiz"** → DARALTILDI: yeni sekme yolu çalışıyor, yalnız sayfa-içi iframe bloklu (ve zaten Parça 5'ten beri blokluydu — regresyon değil).
- **"`force-dynamic` eksik → nonce alamayan sayfa"** → ÇÜRÜTÜLDÜ: root layout'ta tanımlı, tüm ağaca iniyor. (`firma/[slug]`'daki `revalidate = 300` ölü konfigürasyon — INFO.)
- **JSON-LD enjeksiyonu** → ÇÜRÜTÜLDÜ: `serializeJsonLd` `<`/`>`/`&`/U+2028/U+2029 kaçırıyor, sözleşme testi var.
- **Çıkışta cache sızıntısı** → ÇÜRÜTÜLDÜ: `queryClient.clear()` çağrılıyor. (Girişte çağrılmıyor — savunma derinliği eksiği, LOW.)
- **CSRF baypası** → ÇÜRÜTÜLDÜ: ham `fetch` kullanımlarının tamamı R2 presigned PUT (harici host, cookie taşımıyor) ya da SSR public GET.
- **Depolamada token/sır** → ÇÜRÜTÜLDÜ: envanter çıkarıldı, hepsi UI tercihi + `user`/`company` snapshot'ı.
- **`maskSupplierNames` kardeşi (Parça 8) ön yüzde** → ÇÜRÜTÜLDÜ: filtre/portal/sayfa taşıyan tüm sorgular parametreyi anahtara koyuyor.
- **İyimser güncelleme rollback'i** → KONU DIŞI: repoda `onMutate` hiç yok (0 eşleşme), sınıf yapısal olarak temiz.
- **Catalyst `<Label>` `Field` dışında** tuzağı → İHLAL YOK (20 dosyada kontrol edildi).
- **`legalName` paritesi** → ARTIK AÇIK DEĞİL: `LOCKED_KYC` serviste uygulanıyor; bilinen-açıklar listesinden düşürülebilir.
- **Duyuru "PAKET/STANDARD" segmenti** (Parça 9'dan devam) → ölü kod, teyit edildi.

## DALGA B (LOW/INFO)

Mercek raporlarındaki LOW/INFO maddeleri: `prefers-reduced-motion`, SEN/SİZ dil
tutarsızlığı (15 dize), iki tarih biçimi ve **üç ayrı para birimi sembol tablosu**
(CHF/AED çelişkili), `<th scope>` eksikleri, sekme ARIA'sı (4 elle yazılmış
tablist), sihirbaz `aria-current`, bağlantı geri çekme/iptal onayları, admin
robots.txt, HSTS, `?from=` sınır kontrolü, sertifika `href`'i, `ctaUrl` tek-kaynak,
girişte `queryClient.clear()`, `useAdminMe` store senkronu, ölü kod
(`useMyListings`, `useInbox`, `format-currency.ts`), sunucu tavanlarının sessiz
kesmesi (`truncated` sözleşmesi yalnız kategori aramasında var), `next/image` +
galeri thumbnail'ı, AI görsel yüklemede istemci küçültmesi, admin CSV'nin 20
ardışık isteği.

## DURUM

- **Dalga A UYGULANDI (2026-08-26, `be514eea` + `67f79598`): 7 HIGH + parite +
  önbellek + sihirbaz.** Testler: API 144 suite / 1256 test, web 352, admin 79.
- Uygulananlar: HIGH #1-#7; token'ın yanıt gövdesinden çıkarılması; kategori
  modalının koşullu render'ı; sihirbaz gönderim kilidi + hatalı adıma atlama +
  taslakta asgari doğrulama; parite B2 (admin/sistem 3 aksiyon → UI kapısı +
  matris + drift nöbetçisi), B3 (raporlarda gözetim muafiyeti), B4 (teklif
  detayında `canManage`), B5 (adres kartı `addresses:manage`); altı önbellek
  invalidasyonu (koltuk/pano/admin KPI/ödeme listesi/AI aksiyonu/onay→sipariş).
- Yeni sözleşmeler: `money-input.test.ts` (14) — fonksiyonun İLK testi;
  `audit-part10-dalga-a.spec.ts` (3) — `suspend` bayrağının SUPER_ADMIN kapısı
  (drift nöbetçisi gövde-bayrağını göremez, bu yüzden servis testi şart);
  drift nöbetçisine 4 yeni aksiyon; `reports-role-gate.test.tsx` +2 vaka.
- **DAVRANIŞ DEĞİŞİKLİĞİ:** `reports-role-gate` spec'i eski kuralı sabitliyordu
  (işlem rolsüz Kurucu rapor göremez); backend 2026-07-27'de gözetim muafiyeti
  eklemişti → spec güncel kurala göre yeniden yazıldı.

### Dalga A'da UYGULANMAYAN (bilinçli)

- `segment-only-picker` dış `useRoots()` çağrısı (onboarding/profil) hâlâ tüm
  kategori ağacını (~180 KB) çekiyor — düzeltmesi "yalnız segmentler" için ayrı
  bir uç ya da etiketleri seçili id'lerden türetmeyi gerektiriyor → Dalga B.
- Performansın kalan HIGH/MED'leri (ilan detayı tam-gövde poll'u, sıfır
  memoizasyon + N×M tablo, `teklif-ver` `itemState` monoliti, `LiveToasts` çift
  çekim katmanı, bağlantılar 7-sorgu yelpazesi, debounce'suz dizin araması,
  recharts/AssistantPanel statik import) → yapısal iş, ayrı tur.
- Form drift'lerinin çoğu (peşin oranı refine'ı, şablon `noCloseDate` sızıntısı,
  parola politikası tek-kaynağı, tarih-only UTC kayması, eksik `maxLength`'ler,
  `translateValidatorMessage` ondalık regex'i) → #3 sayesinde artık kullanıcıya
  GÖRÜNÜR hale geldi; tek tek kapatılması Dalga B.
- a11y bulguları (radyo grubu adlandırması, asistan `DialogTitle`/`aria-live`,
  onay diyaloğunun yıkıcı butona odaklanması, `EmptyState` kontrastı, liste
  hata durumları) → Dalga B.
- Parça 9'dan devreden: **B12** (audit_logs DB seviyesinde append-only) hâlâ
  karar bekliyor.
