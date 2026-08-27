# Denetim 2026-08-28 — Parça 12: Veri Modeli & Göç (SON PARÇA)

Kapsam: `packages/db/prisma/schema.prisma` (1842 satır · **51 model** · 42 enum ·
75 `@@index` · 32 `Decimal` · 15 `Json`), 57 migration klasörü, `docs/rls-plan.md`
+ `migration-safety.md`, ve bunları okuyan/yazan `apps/api/src/**`.

Yöntem: 7 mercek paralel (şema bütünlüğü, indeks stratejisi, migration güvenliği,
veri tipleri, türetilmiş veri/snapshot, çok-kiracılılık/RLS, ölçek); **yedisi de
teslim etti**. HIGH adayları ana oturumda kod/şema okunarak doğrulandı; ham ~17
HIGH tekilleştirmeden sonra **12**'ye indi.

**Ölçüm sınırı — açıkça:** prod DB'ye yalnız Parça 11'deki salt-okuma sorgusu
atıldı; bu turda `EXPLAIN`/`pg_stat_statements`/satır sayımı **yapılmadı**.
Ölçek rakamları analitik tahmindir (kolon sayısı şemadan, satır boyutu DTO
`@MaxLength` tavanlarından, tarama tipi indeks listesinden türetildi) ve her
tahminin dayanağı raporda yazılıdır.

**Genel değerlendirme:** Şema beklenenden **sağlam**. Para tipleri istisnasız
tutarlı (`18,2` para · `18,3` miktar · scale-6 kur; **hiç `Float` yok**),
`Restrict`/`SetNull` seçilen 4 yerin gerekçesi doğru, N+1 üreten bir ilişki
tasarımı yok, snapshot/dondurma kararları isabetli, durum↔damga çiftleri
istisnasız tek `updateMany`'de atomik yazılıyor. Bulguların ağırlık merkezi üç
yerde: **(1) RLS aktivasyonuna hazırlık boşlukları**, **(2) hard-delete'in karşı
taraf verisini götürmesi**, **(3) tavansız `include` ağaçları + sıfır GIN indeksi**.

## DOĞRULANAN — HIGH

### Silme & veri kaybı

| # | Bulgu | Kanıt |
|---|-------|-------|
| 1 | **Siparişsiz firma silmesi KARŞI TARAFIN verisini yok ediyor.** Hard-delete kapısı yalnız `ordersAsBuyer + ordersAsSeller > 0` sayıyor; sipariş FK'ları `Restrict` (doğru) ama iki-taraflı diğer TÜM tablolar `Cascade`. 0 siparişli ama 40 aktif teklifli bir tedarikçi silinince: alıcının ihale dosyasından teklifler + teklif belgeleri (R2 anahtarları dahil) + soru cevapları, karşılıklı mesaj geçmişi, o firmanın BAŞKA firmalara verdiği değerlendirmeler ve hakkında/tarafından açılmış şikâyetler siliniyor. İhalenin rekabet kaydı geriye dönük değişiyor (3 teklifli ihale 2 teklifli görünüyor) | `schema.prisma:1005,529,531,552,628,630,936,938`; `admin-companies.service.ts:2245` |
| 2 | **Üyelik/gelir defteri cascade ile siliniyor.** `CompanyMembershipEvent` kodda "append-only" olarak tanımlı ve gelir raporunun tek kaynağı, ama `onDelete: Cascade`. Paket almış/ödemiş ama sipariş vermemiş firma silinince GRANT/EXTEND kayıtları gider → aylık gelir raporu geriye dönük düşer, "ödedim ama paketim yok" itirazında platformun elinde kayıt kalmaz. Aynısı `company_complaints` (kötü aktör silinince hakkındaki şikâyetler de gider) ve `company_admin_notes` için | `schema.prisma:604,628,630,582` |

### RLS aktivasyonuna hazırlık — "açıldığı gün sessizce ne kırılır"

| # | Bulgu | Kanıt |
|---|-------|-------|
| 3 | **Cron'lar servise delege ettiği anda ana client'a düşüyor.** Scheduler'ların KENDİ sorguları `PrismaBypassService` kullanıyor (desen doğru), ama delege ettikleri `notifyListingClosed`/`notifyListingInvitees`/`announceListingOpen`/`remindPending`/`fallbackInactiveApprovers` ana client'ta. Cron'da ALS store yok → `set_config` yapılmaz → kısıtlı rol altında policy'li tablolar **0 satır** döner. Sonuç: kapanış bildirimi, kapanış hatırlatması, embargo duyurusu, onay hatırlatması ve pasif-onaycı devri **hiç çalışmaz** — hata yok, log yok, sayaç 0, "cron çalıştı" görünür | `listing.scheduler.ts:85,145,250` → `company-listings.service.ts:296,300,649,666`; `approvals.scheduler.ts:56` |
| 4 | **WebSocket hiç tenant bağlamı almıyor.** `TenantContextInterceptor` yalnız `getType() === "http"` dalında çalışıyor; WS handshake/handler'ları ALS kapsamı dışında. Gateway abonelik yetkisini `companyOrder.count`/`companyBlock.count`/`listingBid.count`/`listingInvitation.count` ile kapılıyor — dördü de policy'li. Aktivasyondan sonra hepsi 0 döner → realtime TÜM firmalar için ölür (sızıntı yok, fail-closed; ama sessiz ret, teşhisi zor) | `tenant-context.interceptor.ts:24`; `realtime.gateway.ts:209,245,256,259` |
| 5 | **Public referral opt-out ucu policy'li tabloyu bağlamsız okuyor.** `GET /public/referral-optout?token=…` guard'sız ve pre-context; ana client + bağlam yok → policy false → satır bulunamaz. Aktivasyondan sonra e-postadaki "davet almak istemiyorum" linki **her tıklamada 404** verir ve opt-out kaydı hiç yazılmaz — ETK/İYS yükümlülüğü | `referral-optout.controller.ts:16` → `company-connections.service.ts:367` |
| 6 | **`order_revision_items` policy'siz.** Kardeşi `order_revisions` ve analogu `company_order_items` 2-kat `EXISTS` ile korunuyor, bu tablo ne `ENABLE RLS` ne policy almış — `rls-plan.md` kapsama aldığını yazıyor, migration uygulamamış. Sipariş revizyonu kalem **birim fiyatları** (pazarlık pozisyonu) backstop dışında. Aynı sınıf: `company_kyc_revisions` (plan mühürlendikten 1 gün sonra eklendi, gerekçesiz kapsam dışı — içeriği KYC belgesinin R2 nesne anahtarı: vergi levhası, imza sirküleri, **kimlik ön/arka taraması**) | `schema.prisma:915,1761`; `20260720110000_rls_policy_orders` (yok) |

### Göç güvenliği

| # | Bulgu | Kanıt |
|---|-------|-------|
| 7 | **Dev ve prod AYNI Supabase veritabanı — her migration doğrudan canlıya yazıyor, PITR ise açık değil.** `migration-safety.md`'nin rollback güvencesi tamamen PITR + snapshot'a bağlı; launch-checklist'in dört PITR maddesi de işaretsiz. Aynı zamanda `migration-safety.md`'nin "prod öncesi staging'de gerçek veri kopyasıyla dene" maddesi **yapısal olarak uygulanamaz** çünkü ayrı bir ortam yok. *(Parça 11'de salt-okuma sorgusuyla `.env`'in prod pooler'ını gösterdiğini bizzat doğruladım.)* | `packages/db/.env` → kök `.env`; `docs/launch-checklist.md:52` |
| 8 | **Belgelenmiş dev komutu `prisma migrate dev` ve hedefi canlı DB.** `packages/db/package.json:9` `"migrate": "prisma migrate dev"`, `shadowDatabaseUrl` tanımlı DEĞİL, `.env` prod'u gösteriyor. `migrate dev` drift/başarısız kayıt gördüğünde **hedef veritabanını sıfırlamayı teklif eder**. CLAUDE.md bu komutu şema değişikliğinin standart yolu olarak belgeliyor. Bugün CI drift kapısı yeşil olduğu için risk uykuda; ilk out-of-band SQL'de uyanır | `packages/db/package.json:9`; CLAUDE.md § Geliştirme Notları |

### Türetilmiş veri & tutarlılık

| # | Bulgu | Kanıt |
|---|-------|-------|
| 9 | **Pano "Tasarruf" sekmesi Parça 8'in tek-kaynağını hiç kullanmıyor — üç ekranda üç farklı tasarruf rakamı.** `report-currency.ts` (P8 HIGH'ı ile gelen fail-closed tek baz) **yalnız** `company-reports.service.ts` tarafından import ediliyor. Canlı pano ucu kendi hesabını yapıyor ve beş noktada ayrışıyor: (a) `updatedAt`'i `awardedAt` yerine kullanıyor — dosyanın kendi yorumu `awardedAt (≈updatedAt)` diyerek ikisini eşdeğer sayıyor, değiller; (b) teklifin `exchangeRateSnapshot` damgasını yok sayıp `getRateOnDate` → `FALLBACK_RATES`'e düşüyor (**fail-open**, P8 kuralının tersi); (c) kalem `currency`/`fxToBase` okunmuyor; (d) `awardedQuantity` yok sayılıyor; (e) `AWARDED_PARTIAL` hariç — aynı dosyanın 211. satırı ikisini de sayarken 417. satırı yalnız `WON` filtreliyor. **Parça 8'de tek-kaynağı kurdum ve raporları bağladım, panoyu kaçırdım** | `company-dashboard.service.ts:396-500` vs `company-reports.service.ts:363-510` |
| 10 | **`expectedDeliveryDate` yapısal olarak null — "geciken teslimat" alarmı ve KPI'ı ölü.** 2026-08-02'de accept() tahmini teslim sormayı bıraktı ve değer `_max(CompanyOrderItem.deliveryDate)`'ten türetiliyor; ama aynı değişiklikle teklif tarafı `deliveryDate` → `deliveryTime` merdivenine geçti. Teklif formu, Excel/AI içe aktarma ve AI `request_place_bid` hiçbiri `deliveryDate` göndermiyor → yeni siparişlerin tüm kalemlerinde null → `_max` null. Aksiyon Merkezi'nin **"critical"** seviyeli `overdueDeliveries` satırı ve pano KPI'ı sürekli 0. *(Parça 8'de `paymentWindow` için düzeltilen "madde 17 sonrası ölü satır" ile aynı kök — kardeş satır atlanmış.)* | `schema.prisma:817,996`; `company-orders.service.ts:204-214`; `action-center.service.ts:177-182` |
| 11 | **Tur geçmişi tablosunda para birimi kolonu YOK.** `ListingRoundSnapshot.amount` var, `currency` yok — şemadaki diğer TÜM para satırları birimini taşıyor. Yazım teklifçinin kendi biriminde ham kopyalıyor, okuma birimden habersiz sıralıyor (`orderBy amount asc/desc`). Çok-birimli pazarlıkta (bilinçli destekleniyor) tur geçmişi ekranı ve Excel arşivi **yanlış sıralama** gösteriyor; kazandırma kararı `auctionTryValue` ile doğru yapıldığı için etki gösterim + arşivle sınırlı, ama müzakere geçmişi delil niteliğinde | `schema.prisma:1086-1095`; `company-listings.service.ts:5746,6223`; `company-reports.service.ts:838` |

### Ölçek

| # | Bulgu | Kanıt |
|---|-------|-------|
| 12 | **En yüksek frekanslı sorgu 76 kolonun tamamını çekiyor.** JWT stratejisi HER kimlikli istekte `include: { company: true }` yapıyor, dönüşte 7 alan kullanıyor. Dolu profilli firma satırı (aboutText + 12 foto + 12 sertifika görseli + 6 KYC URL ≈ 3,5-4 KB, DTO tavanında ~20 KB) Postgres'in ~2 KB TOAST eşiğini aştığı için her istekte ek chunk okuması geliyor. Aynı desen 4 kardeş çağrı yerinde. **Tek satırlık düzeltme.** Yanında: **58 migration'da tek bir GIN/trgm/tsvector yok** → tüm dizi (`hasSome`) ve metin (`contains`) aramaları sıralı tarama | `company-jwt.strategy.ts:74`; `grep 'USING GIN\|pg_trgm' migrations/` → **0** |

## DOĞRULANAN — MED (özet)

**Şema bütünlüğü:** "Tek aktif onay akışı" invariantı DB'de yok (kod iki uçta uyguluyor; çift-ACTIVE = `findMatchingFlow` en eskisini seçer → kazandırma onayı sessizce atlanır) — *Parça 8 Dalga B'de kayıtlıydı, mekanizması burada netleşti*; `listings.deliveryAddressId`/`billingAddressId` FK'sız düz String (kardeşi `ListingBid.deliveryAddressId` FK'lı + `SetNull` — asimetri); çapraz-firma bağ kısıtı yok (sipariş `listingId` başka firmanın ilanı olabilir, `listing_bid_items.itemId` başka ilanın kalemi olabilir — kod kapıları doğru, tek savunma katmanı); `company_connections` unique tek yönlü (A→B ve B→A ayrı satır olarak yasal → çift ACTIVE bağlantı, "kes" birini siler).

**RLS:** Tüm policy'ler tek `FOR ALL` + `WITH CHECK = USING` → iki-taraflı tablolarda **satır uydurulabilir** (bir IDOR açığında B, `{inviter: A, invitee: B, ACTIVE}` yazarak A'nın CONNECTIONS görünürlüklü ihalelerini açabilir — backstop, korumak için var olduğu invariantı geçiriyor); bağlamsız sorgu "sessiz boş" üretiyor ve fail-closed alarmı yalnız tek dala kurulu (3, 4, 5 numaralı HIGH'ların ortak kök nedeni); `time_savings_configs`'ta NULL=global satır naif `=` policy'siyle yok olur; `audit_logs.tenantId` yarı-dolu (104 çağrının 63'ü taşıyor; TÜM `admin.company.*` taşımıyor) ve `email_logs`'ta kiracı kolonu **hiç yok**.

**İndeks:** Onay fallback cron'u her dakika iki tabloyu baştan sona tarıyor (`status` önekli indeks yok — *Parça 11'in tespiti burada indeks tarafından doğrulandı*); her dakika koşan iki ilan cron'u tüm açık ilanları tarıyor (tipik sonuç 0 satır); ödeme vadesi cron'u damgalı satırları eleyemediği için saatte bir sipariş tablosunu yürüyor; `CompanyComplaint.complainantCompanyId` indekssiz (kullanıcı-yüzü listenin tek filtresi + CASCADE hedefi); admin denetim izi araması 500k satırda çift tam tarama; **üç sayfalı admin listesinde tie-break yok** → eşit damgalarda satır kayması (*Parça 9'da `admin-companies.list` için düzelttiğim sınıfın kardeşleri*); 6 tam gereksiz indeks (unique'in zaten sağladığı önek) + 2 hiç kullanılmayan.

**Tipler:** `fxToBase` scale-6 yetersiz — güçlü para birimi bazlı tekliflerde 1e-5 göreli hata, 10 M TRY kalemde ≈100 TRY sistematik sapma (bid.amount ve award nöbetçisi aynı damgayı kullandığı için fail-closed kırılmıyor, yani hata sessiz ve kalıcı); ödeme "kalan" eşiği üç KPI'da üç farklı tanım (biri `> 0.01` epsilon'lu, ikisi değil → aynı panoda "ödenmemiş sipariş: 0" ile "açık taahhüt: 0,01 ₺" yan yana); `Listing.decimalPlaces` 0-4 arası seçilebiliyor ama DTO ve kolon 2 hanede kapıyor (4 seçilen pazarlıkta "Hedefe Dağıt" API'nin asla kabul etmeyeceği fiyat üretir); **gün-anlamlı 7 tarih alanı `timestamp` olarak tutuluyor** (`@db.Date` yalnız `rateDate`'te) → negatif UTC ofsetli kullanıcıda gün kayması ve her düzenlemede bir gün daha gerileme; `deletedAt` + `isActive` çift bayrağı geçersiz kombinasyon üretebiliyor (admin `requireMember` `deletedAt`'i süzmüyor → silinmiş kullanıcı "Aktifleştir" ile `isActive=true, deletedAt=T` durumuna geçer ve parola sıfırlama kapısı yalnız bir bayrağa bakar).

**Tutarlılık:** Adres kilidi `CLOSED`/`CLOSED_NO_AWARD`'ı kapsamıyor → yeniden açılan ilan adressiz kalıyor ve sipariş sessizce `deliveryAddress: null` doğuyor; `orderDeliverySnapshot` eksik adreste sessizce `undefined` dönüyor (fail-open); `MessageThread.lastMessageAt` mesajdan ÖNCE ve transaction dışında yazılıyor (mesaj yazımı patlarsa boş thread gelen kutusunun en üstünde görünür + 15-dk sessizlik e-posta heuristiği zehirlenir).

**Ölçek:** İlan detayının sahip dalı tavansız `bids → items + answers` ağacı çekiyor ve **1,5 sn'de bir** poll'lanıyor (500 kalem × 30 teklif senaryosunda ~31k satır / ~4 MB → istek başına 15-20 MB heap); pano analitiği tavansız 5 seviye nested + tarih penceresiz iki sorgu; rapor tavanı (`MAX_REPORT_LISTINGS=500`) yalnız kök seviyeyi sınırlıyor, alt ağaç sınırsız; bildirim fan-out-on-write gövdeyi her alıcıya kopyalıyor (~15M satır / 4,5 GB tahmini); `OR(seller, buyer)` + `orderBy createdAt` sıralamayı karşılayan indeks yok; `email_events` ham webhook payload'ını da saklıyor; `Company`'nin vitrin (12 kolon) + KYC (18 kolon) blokları sıcak satırda — ayrılsa sıcak satır ~800 B'a inip TOAST eşiğinin altında kalır.

**Migration:** Kalıcı veri kaybı 3 migration'da ve **hiçbiri expand→contract'a bölünmemiş** (`merge_closed_into_in_award` eski durumu arşivsiz ezdi, `payment_plan_model` *kabul edilmiş karar*, `drop_order_documents` tek adımda DROP TABLE + DROP TYPE); ham-SQL invariant'ları (4 partial/fonksiyonel unique + 41 policy + rol/grant'ler) **drift kapısına görünmez** (Prisma şeması bunları ifade edemez, `migrate diff --to-schema-datamodel` görmez); `0_init` bir baseline olduğu için prod'da hiç çalışmadı ve hiçbir kapı canlı DB'yi migration zinciriyle karşılaştırmıyor; `connection_unordered_unique` dedup adımı taşımıyor (yeni bir ortama kurulumda zincir durur).

## ÇÜRÜTÜLEN / TEMİZ ÇIKAN

- **Döngüsel cascade** → yok; en derin zincir 4 seviye, tek kendine-referans `categories.parentId` ve o da tek yönlü ağaç.
- **`CompanyOrder` silme koruması** → `Restrict` her iki tarafta, `deleteOrAnonymize`'ın "sipariş varsa anonimleştir" mantığıyla tutarlı ve doğru.
- **Para tipi tutarlılığı** → istisnasız: `18,2` para / `18,3` miktar / scale-6 kur. `18,2` ↔ `18,4` gibi bir drift YOK. Şemada **hiç `Float` yok**. Tek kaynaklar (`roundMoney`, `lineTotal`, `sumLineTotals*`, `sumPaymentsByStatus`) yazma/karar yollarında tutarlı; float sızıntısı yalnız okuma/rapor tarafında.
- **Durum ↔ zaman damgası çiftleri** → incelenen TÜM yazımlar tek `updateMany`'de ve koşullu-atomik; durumu damgadan ayıran bir yol bulunamadı (sipariş `transition()`, ilan award/publish, onay karar/geri alma, teklif submit/eleme, KYC, şikâyet, bağlantı — hepsi).
- **N+1 üreten şema kararı** → yok; tüm sıcak yollarda "N sorgu" yerine "tek `groupBy`/`findMany` + Map" deseni uygulanmış.
- **`bid.amount ≡ Σ kalem`** → S5 nöbetçisi + miktarın her zaman `ListingItem`'dan gelmesi + tx içinde kalem sayısının yeniden doğrulanmasıyla korunuyor.
- **Kur damgası fail-closed zinciri** → `fxToBase` yoksa gönderim reddedilir, `exchangeRateSnapshot` yoksa onay eşiği zorunlu onaya düşer, raporda satır hesap dışı. *(Panonun bunu atlaması ayrı bulgu — HIGH #9.)*
- **Enum sıra/bağımlılık hatası** → yok; `ADD VALUE`'ların hiçbiri değeri aynı migration'da kullanmıyor, `AFTER` sıralaması şemayla birebir.
- **Bypass envanteri** → 15 site, gereksiz-geniş bypass yok; `company-orders`'ın metot-bazlı daraltması doğru desen.
- **Kategori araması** → tablo kiracıyla büyümüyor (UNSPSC'ye bağlı, 13,3k tavan); indekssiz LIKE burada sorun değil.

## DALGA B (LOW/INFO)

`Company.ownerUserId` FK'siz/unique'siz; 12+ durum alanının enum yerine serbest `String`
olması; `password_reset_tokens.companyUserId` nullable FK; idempotency tutarsızlığı
(9 `DROP POLICY` + 10 `ADD VALUE` koruma ifadesiz); `CREATE INDEX CONCURRENTLY`
hiç kullanılmamış ve tek gerekçesi bayat; `ALTER DEFAULT PRIVILEGES` grantor
bağımlılığı; `awardedQuantity` yalnız kalem-bazlı award'da yazılıyor;
`EmailLog.deliveredAt` öncelik sırasından muaf; `SupplierTemplate.memberCompanyIds`
sayacı süzülmüyor; soft-delete'te `authId` kalıyor; `AuditLog.metadata` sınırsız ve
parayı float'a çeviriyor; `MAX_MONEY` çift-duyarlık kuruş sınırının üstünde; `round2`
vs `roundMoney` kuruş farkı; `ApprovalRequest.payload` union eşleşmezse sessiz no-op;
`supplier-discovery`'de `orderBy` yok; offset sayfalama + her sayfada tam `count`;
`company_blocks.reason` engellenene satır-görünür; `auctionRateSnapshot` çift-şekilli
(string|number) legacy köprüsü; `rls-plan.md` sayıları bayat (27 → bugün 26; "13
doğrudan companyId" → bugün 17; `CompanyReview` yanlış grupta).

## DURUM

- Dalga A **UYGULANMADI** — düzeltme ONAYI bekliyor.
- **Aktivasyon-bloklayıcı olarak işaretlenenler (#3, #4, #5, #6):** RLS prod'da
  açılmadan ÖNCE kapatılmalı; bugün hiçbiri canlıda etki üretmiyor (RLS kapalı),
  ama açıldığı gün sessiz işlev kaybı olarak çıkarlar.
- **Tek satırlık, sıfır riskli olanlar:** #12 (JWT `select`), `complainantCompanyId`
  indeksi, üç admin listesinde tie-break.
- **Parça 8/9/11'den devreden ve burada teyit edilenler:** `approval_flows` kısmi
  unique (P8 Dalga B), onay cron'unun indeks eksiği (P11), tie-break sınıfı (P9),
  `report-currency` tek-kaynağının panoya uygulanmamış olması (P8'in eksik kalan yarısı).

---

**Bu, 12 parçalık tam sistem denetiminin son parçasıdır.** Seri özeti ve
kapanış değerlendirmesi için `docs/audit-2026-08-28-ozet.md`.
