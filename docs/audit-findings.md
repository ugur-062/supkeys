# Rothern — Güvenlik/Hazırlık Denetimi (Tur 3) — BİRLEŞİK RAPOR

**Tarih:** 2026-07-14 · **Yöntem:** 4 salt-okuray teammate (tenancy / authz / flow / integrity), adversarial çapraz-sorgu.
**Odak:** `docs/invariants.md` → "Denetlenmemiş alanlar". Çekirdek authz/tenancy (2 tur denetlenmiş) yeniden denetlenmedi.
**Ayrıntı dosyaları:** `audit-findings-{tenancy,authz,flow,integrity}.md`.

Handshake + SendMessage transport doğrulandı (main↔teammate ACK + halka teammate↔teammate PING/ACK).

---

## Sonuç özeti

Çekirdek para/kazandırma/sipariş/ödeme yolları **kod-yolu izlemesiyle sağlam çıktı** (award/awardByItem atomik guard, orders `transition()` atomik+taraf-guard, `paymentDecision` CAS+FOR UPDATE, `complete()` tam-ödeme kapısı atlanamaz). Hasar merkezde değil, **kenar geçişlerde ve iz/denetlenebilirlikte** yoğunlaştı.

| # | Sev | Bulgu | Dosya:satır | INV | Consensus |
|---|-----|-------|-------------|-----|-----------|
| 1 | **HIGH** | `createNextRound` koşulsuz durum yazımı → AWARDED ilanı yeniden açar, çift sipariş | `company-listings.service.ts:4603` | INV-SM-1 | ✅ flow (tekil) |
| 2 | **HIGH (gap)** | Firma-tarafı para/durum geçişleri audit izi BIRAKMIYOR | listings/orders/approvals/users/connections | INV-AUDIT-1 | ✅ integrity |
| 3 | **MEDIUM** | WS handshake iptal/tazelik kapılarını atlar (tokenVersion/deletedAt/isBlocked) | `realtime.gateway.ts:75-87` | INV-MT-3, INV-SD-1 | ✅ tenancy (sahip) + authz bağımsız kod-yolu teyidi + integrity SD-1 çapraz |
| 4 | **MEDIUM** | admin `GET /admin/companies` list SUPPORT'a `taxNumber` (KYC PII) sızdırıyor | `admin-companies.controller.ts:285` + service `:157/184` | INV-MT-2 (admin istisna) | ✅ authz |
| 5 | **MEDIUM** | `cancel` (ilan) koşulsuz yazım → CANCELLED ilana canlı sipariş asılı kalır | `company-listings.service.ts:5120` | INV-SM-1 | ✅ flow |
| 6 | LOW | Webhook double-wrong-config bypass (denylist NODE_ENV) → imzasız forged EmailEvent | `webhook-signature.guard.ts:36-50` | INV-SM-6 | ✅ integrity |
| 7 | LOW | admin firma notları asimetrik gate (oku/yaz ungated, sil SUPER_ADMIN) | `admin-companies.controller.ts:432-453` | — | ✅ authz |
| 8 | LOW | `users:manage`'li operasyon-rollü kullanıcı diğer YÖNETİCİ'leri düşürebilir (privilege gain YOK) | `company-users.service.ts:371-399` | — | ✅ authz |
| 9 | LOW | Ölü kod `tender-owner.guard.ts` (eski tekil-role modeli, 0 çağrı) | `common/rbac/tender-owner.guard.ts` | — | ✅ integrity |
| 10 | LOW | admin change-password sıkı `@Throttle` taşımıyor (default 100/60s) | `admin-auth.controller.ts:86` | INV-RL-1 (not) | ✅ integrity (INV notu teyit) |
| 11 | LOW | `publishListing` koşulsuz DRAFT→OPEN → çift-yayında çift duyuru | `company-listings.service.ts:1439` | INV-SM-1 | ✅ flow |
| 12 | INFO | `AdminRolesGuard` fail-open (dekoratör yoksa herkes) — #4/#7'nin kök nedeni | `admin-roles.guard.ts:24` | — | ✅ authz |
| 13 | DOC | invariants.md INV-DOC-1 kanıtı YANLIŞ: "yalnız 3 list()" — aslında 6 presign yolu (hepsi kapılı) | invariants.md:75 | INV-DOC-1 | ✅ integrity |

---

## HIGH bulgular

### 1. [HIGH] `createNextRound` koşulsuz durum yazımı → çift sipariş — INV-SM-1
`company-listings.service.ts:4603`. Durum kontrolü tx-DIŞI `findUnique` (`:4454`/`:4475`); tx içindeki yazım koşulsuz `tx.listing.update` (yalnız `id`) — INV-SM-1'in şartı olan `updateMany({where:{id,status:{in:[...]}}})` + count YOK. Kardeş `closeNoAward:5439` doğru deseni kullanıyor; bu istisna.

**Exploit:** İlan `IN_AWARD`, iki teklif B1/B2. Sahip eşzamanlı `award(L,B1)` + `createNextRound(L)`. `award` commit: L→AWARDED, B1→WON, Sipariş **O1**. `createNextRound` stale `IN_AWARD` okur, geçer, B2'yi (artık LOST) yeni tura taşır, L'yi koşulsuz OPEN'a ezer → sahip B2'yi de kazandırır → **O2**. Tek-kazanan akışından iki sipariş. Ayrıca çift-`createNextRound` self-race (round +2) + bekleyen `IN_AWARD_APPROVAL`'ı sessizce OPEN'a ezer.
**Fix:** `:4603`'ü `tx.listing.updateMany({where:{id,status:{in:["OPEN","CLOSED","IN_AWARD","CLOSED_NO_AWARD"]},currentRound:listing.currentRound},data:{...}})` + `count!==1 → throw` (tx rollback); `{increment:1}` yerine sabit `newRound`.

### 2. [HIGH — gap] Firma-tarafı para/durum geçişleri audit izi BIRAKMIYOR — INV-AUDIT-1
`AuditService.log` çağrısı: admin tarafı iyi kaplı (34 çağrı), firma tarafı **SIFIR** (grep teyitli: company-listings/orders/approvals/users/connections). İz bırakmayan işlemler: **award/awardByItem** (Order/parasal taahhüt), sipariş yaşam döngüsü, ödeme confirm/reject, onay kararları, ilan publish/cancel/closeNoAward/startEvaluation/createNextRound, placeBid/eliminate, **firma-içi rol promote/demote + izin override**, bağlantı accept/reject/disconnect.

**Etki:** İç kullanıcı bir kazandırmayı yönlendirir / siparişi iptal eder / rol yükseltirse append-only kayıt kalmaz → dispute/insider incelemesi imkânsız. INV-AUDIT-1 para/durum geçişleri için AÇIK.
**Fix:** `AuditModule`'ü bu 5 servise enjekte et; en azından award/awardByItem, sipariş+ödeme geçişleri, onay kararları, rol değişikliklerine `actorType:"company"`, `tenantId:companyId`, `entityType/entityId` ile `audit.log` (log throw etmez, `audit.service.ts:37`).

---

## MEDIUM bulgular

### 3. [MEDIUM] WS handshake iptal/tazelik kapılarını atlar — INV-MT-3 + INV-SD-1
`realtime.gateway.ts:75-87`. `handleConnection` yalnız `jwt.verifyAsync` + `type==="company"` + `companyId` var mı bakar. REST `company-jwt.strategy.ts:53-102`'nin uyguladığı DB-taze kapılar WS'te YOK: `tokenVersion` (INV-MT-3), `deletedAt`/`isActive` (INV-SD-1), firma `isActive`/`isBlocked`.

**Exploit:** Token süresi dolmadan (a) parola sıfırlanır (tokenVersion++), (b) kullanıcı soft-delete/pasif edilir, veya (c) firma bloklanır → REST 401 döner AMA aktör yeni WS açıp `company:{id}` odasının id-only sinyallerini (`notification.new`/`message.new`/`listing.updated`/`order.updated`) almaya devam eder + ilan/sipariş odalarına subscribe olabilir. **Veri sızıntısı YOK, cross-tenant YOK** (sinyaller id-only, REST çekimi yine reddedilir) — bu bir **iptal-bypass + meta-sinyal**; "parola değiştirerek attacker'ı kilitledim" varsayımı WS'te geçersiz kalır.
**Çapraz-doğrulama:** integrity INV-SD-1 sorgu-filtrelerini temiz buldu (13 dosya); bu bulgu **auth-handshake yolu**, sorgu değil → çelişki yok, **consensus MEDIUM**.
**Fix:** `handleConnection`'da verify sonrası `companyUser.findUnique({include:{company}})` ile aynı kapıyı uygula (`deletedAt`/`isActive`/`company.isActive`/`isBlocked` + `(payload.tv??0)===tokenVersion`); başarısızsa `disconnect`.

### 4. [MEDIUM] admin `list` SUPPORT'a `taxNumber` (KYC PII) sızdırıyor — INV-MT-2 (admin istisna)
`admin-companies.controller.ts:285` (rol dekoratörü YOK) + `admin-companies.service.ts:157/184` (projection `taxNumber:true`). Aynı controller'ın `detail`'i (`:296`) TAM da bu PII'ı gerekçeleyerek `@RequireAdminRole("SUPER_ADMIN","SALES")` ile SUPPORT'a kapatmış; `list` (+ `?q=<vergino>` araması) bunu atlıyor.
**Exploit:** SUPPORT admin `GET /admin/companies?pageSize=100` → her firmanın VKN'i. En-az-yetki sınırı `detail`'de var, `list`'te delinmiş.
**Fix:** `list`'e `@RequireAdminRole("SUPER_ADMIN","SALES")` VEYA projection'dan `taxNumber` çıkar (`globalSearch:985` zaten temiz — aynı hijyen).

### 5. [MEDIUM] `cancel` (ilan) koşulsuz yazım → CANCELLED ilana canlı sipariş — INV-SM-1
`company-listings.service.ts:5120`. Kontrol tx-dışı `if(status!=="OPEN")` (`:5116`); yazım koşulsuz `listing.update`. `award` ile yarışta: `cancel` stale OPEN okur, `award` O1'i oluşturur, `cancel` L'yi CANCELLED'a ezer + "ihale iptal edildi" bildirimi gönderir — ama **O1 siparişi canlı** (PENDING), satıcı işleyebilir. İlan↔sipariş tutarsız + yanıltıcı bildirim.
**Fix:** interactive tx'e geçir, `listing.updateMany({where:{id,status:"OPEN"},data:{...}})` + `count===1`; `closeNoAward:5439` ile simetri.

---

## LOW / INFO / DOC

- **6 [LOW]** `webhook-signature.guard.ts:36-50` — bypass denylist: `nodeEnv = NODE_ENV ?? "development"`. Prod'da NODE_ENV unset + `ALLOW_INSECURE_WEBHOOK=true` + secret yok → imza ATLANIR, saldırgan imzasız `POST /api/webhooks/resend` ile forged event (örn. kurbanın email_id'sini BOUNCED'a çeker). Düşük etki (yalnız e-posta tracking). **Fix:** allowlist — `bypassable = nodeEnv==="development"||nodeEnv==="test"`. (Aynı NODE_ENV-unset deliği `main.ts:45,51` JWT-placeholder kontrolünü de atlatır.)
- **7 [LOW]** `admin-companies.controller.ts:432-453` — `listNotes`/`addNote` ungated (SUPPORT yazıp okuyabilir), `deleteNote`=SUPER_ADMIN → asimetri. **Fix:** oku/yaz'a da `@RequireAdminRole("SUPER_ADMIN","SALES")`.
- **8 [LOW]** `company-users.service.ts:371-399` — owner'ın `users:manage` verdiği operasyon-rollü kullanıcı, ayrıcalıklı-OLmayan role düşürmede katman-3 hedef-koruması tetiklenmediği için başka YÖNETİCİ'yi düşürebilir. Self-promotion bloklu + `assertNotLastAdmin` → **privilege gain YOK**, nuisance. **Fix (ops.):** mevcut admin düşürmeyi de `actorIsAdmin` gerektir.
- **9 [LOW]** `common/rbac/tender-owner.guard.ts` — 0 import/çağrı (spec hariç), `user.role==="COMPANY_ADMIN"` eski tekil-role modeli (2026-06-26 pivotu öncesi). Ölü + yanıltıcı. **Fix:** sil.
- **10 [LOW]** `admin-auth.controller.ts:86` change-password per-route `@Throttle` YOK → default 100/60s (INV-RL-1 notu doğrulandı; setup2fa/disable2fa de aynı boşlukta). **Fix:** `@Throttle({auth:{limit:5,ttl:60_000}})`.
- **11 [LOW]** `company-listings.service.ts:1439` `publishListing` koşulsuz DRAFT→OPEN → eşzamanlı çift-publish `announceListingOpen`'ı iki kez tetikler (çift duyuru). **Fix:** `updateMany({where:{id,status:"DRAFT"}})` + `count===1`; duyuruyu yalnız kazanan çağrı.
- **12 [INFO — kök neden]** `admin-roles.guard.ts:24` fail-open: dekoratör yoksa herkes geçer. #4 ve #7 tam da bunun sonucu — yeni sensitif route'ta sessiz açık riski. **Öneri (kod-dışı):** sensitif controller'lara sınıf-seviyesi güvenli varsayılan + okuma uçlarını bilinçli gevşet.
- **13 [DOC]** `invariants.md:75` — "Presigned-GET yalnız bu üç list()'te üretilir" **olgusal yanlış**: 6 yol var (ilan/teklif/sipariş belge list + **KYC self-view** `company-docs.service.ts:113` + **KYC admin-view** `admin-companies.service.ts:375` + **profil logo** `company-profile.service.ts:103`). Hepsi kapılı, ungated presign YOK — ama kanıt cümlesi 6 yolu kapsayacak şekilde güncellenmeli.

---

## Adversarial olarak ÇÜRÜTÜLEN / kapatılan iddialar

- **Presign storage-key IDOR (tenancy→integrity):** tenancy "presign edilen R2 key'i request'ten mi geliyor?" diye sordu. integrity 6 yolu key-provenance'a göre sınıfladı: **5/6 = saf DB-kaydı key'i** (listing/bid/order-docs `d.key`, KYC self `company.url`, KYC admin `company.docXUrl`) — request hiçbir key taşımıyor, presign edilecek key'i aktör SEÇEMİYOR → "kendi kaydının kapısını geç, başka firmanın key'ini presign et" yapısal olarak imkânsız. **1/6 = request-supplied key ama prefix-kapılı** (`company-profile.resolveUploadedImage`, `key.startsWith(buildTenantProfilePrefix(companyId))` `:98`, prefix companyId gömüyor `storage.service.ts:218-220`, çıktı public logo). Ayrı "download by key/id" endpoint'i YOK (grep teyitli). **CLEAN — (b)-korumasız yol YOK, CRITICAL yok.** Üç teammate hizalandı.
- **WS "authz atlaması mı?" (tenancy→authz):** WS bulgusu bir yetki-yükseltme değil, iptal-bypass — aktör zaten kendi firmasının sinyallerini alıyordu; başka firmaya erişim açılmıyor. Sev MEDIUM'da kaldı.
- **INV-AZ sınıf-tekrarı (authz):** Geçen iki HIGH'ın (listing-manage + award oluşturan-kısıtı) sınıfı **başka yerde tekrarlanMIYOR** — 13/13 ilan metodu üç katmanı da uyguluyor; diğer company-* kaynakları firma-paylaşımlı (katman-3 tasarımca N/A). Doğrulanmış temiz.

## Doğrulanmış TEMİZ (kod-yolu izlendi — "bilinmiyor" değil)
- award/awardByItem/runFullAward/runItemAward atomik status guard → F1 tek sipariş; onAwardApproved idempotent; startEvaluation vs cron closeExpired tek-kazanan.
- orders `transition()` atomik+`assertOrderRole` (INV-SM-3); `complete()`/`receive()` tam-ödeme kapısı atlanamaz (INV-SM-4); `paymentDecision` CAS+FOR UPDATE, `recordPayment` fazla-tahsilat imkânsız (INV-SM-5); revizyon ayrı kayıt, state tek-yönlü; belge adım-kilidi sağlam.
- Realtime: room-join yetkisi doğru (başka firma odasına abone OLUNAMAZ), emit payload'ları id-only, emit'ler doğru firmaya hedefli. İki büyük servisin sorgu yüzeyinde kaçak scope'suz sorgu yok.
- INV-SD-1 soft-delete kaçağı yok (sorgu filtreleri); INV-SM-6 webhook imza+idempotency sağlam; admin rol gating büyük ölçüde doğru (staff/audit/system/inspection/company-users gate'li, rol DB'den taze).

## KALAN KÖR NOKTALAR (bakılamadı / belirsiz — "temiz" DEĞİL)
- **WS token doğal ömrü** (`company-auth.service.ts` imzalama param'ı) — #3'ün etki penceresini belirler; okunmadı.
- `company-listings.service.ts` 5748 satırın tamamı satır-satır değil; sorgu-yüzeyi (131 çağrı) triaj edildi. `addInvitations`/`updateListing`/`deleteListing` **atomikliği** (durum geçişi değil) doğrulanmadı.
- `approvals.requestApproval`/`decide` motorunun iç event teslim semantiği (at-least-once mi) izlenmedi — award idempotency'si runFullAward'ın kendi guard'ına dayandığından çift-fire'da bile güvenli.
- `AuditService` dışı yapısal (Pino) log kapsamı; `storage.service.ts` presign TTL uygunluğu; admin `list.q` contains-filtre ReDoS/injection yüzeyi.
- `.env`/deploy config, git-history, secrets rotasyonu (bu turun kapsamı dışı).
