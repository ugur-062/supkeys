# Authz Reviewer — Bulgular

Kapsam: (A) Admin realm rol granülaritesi, (B) INV-AZ sınıf-tekrarı avı (üç katman: firma / rol / kaynak-sahipliği).
Zemin: `docs/invariants.md` Bölüm 3–4. Salt-okuma denetim; kod değiştirilmedi.

Handshake: sent→flow-reviewer (2 deneme; ilk denemede peer henüz spawn olmamıştı, 2. denemede teslim edildi); received←(bekleniyor).

---

## ÖZET

- **Admin rol gating büyük ölçüde sağlam.** Yıkıcı/PII aksiyonlar rol dekoratörüyle kapılı; `AdminRolesGuard` dekoratör yoksa fail-OPEN (herkes) davranıyor — bu tasarım okuma uçları için kasıtlı ama bir PII sızıntısına ve bir ungated-write'a yol açmış.
- **INV-AZ sınıf-tekrarı YOK.** Tüm 13 ilan yönetim/kazandırma metodu üç katmanı da uyguluyor (`assertListingManageRole`/`ownerOpenListing`). Diğer company-* kaynakları (banka/adres/şablon/doc/bağlantı) firma-paylaşımlı model — katman 3 tasarımca uygulanmaz, ihlal değil.
- 1 MED (admin list PII sızıntısı), 2 LOW, 1 INFO.

---

## A) ADMIN REALM ROL GRANÜLARİTESİ

### [MED] admin `GET /admin/companies` (list) SUPPORT'a `taxNumber` sızdırıyor — `detail` gate'iyle çelişik
`modules/admin-companies/admin-companies.controller.ts:285-288` (`list`, rol dekoratörü YOK)
`modules/admin-companies/admin-companies.service.ts:153-196` (projection `taxNumber: true`, `:157`/`:184`)

Senaryo: `SUPPORT` rollü bir admin `GET /admin/companies?pageSize=100` (veya `?q=<vergino>`) atar. Yanıt her firma için `taxNumber` (VKN/vergi no) + `stateRegion`/`city` döndürür. Aynı controller'daki `detail` (`:296-302`) TAM da bu KYC PII'ı (yorum: "vergi/sicil/imza/kimlik") gerekçe göstererek `@RequireAdminRole("SUPER_ADMIN","SALES")` ile SUPPORT'a kapatılmış. Yani en-az-yetki sınırı `detail`'de kuruluyor ama `list` (+ `list.q` taxNumber araması) üzerinden atlanıyor.

- Katman analizi (admin realm INV-MT-2 istisnası → izolasyon `@RequireAdminRole` ile): rol kapısı `list`'te EKSİK.
- INV: INV-MT-2 (admin istisna maddesi — "izolasyon `@RequireAdminRole` ile sağlanır") + kod/yorum çelişkisi (`detail` yorumu vs `list` davranışı).
- Minimal düzeltme: ya `list` metoduna `@RequireAdminRole("SUPER_ADMIN","SALES")` ekle, ya da `list` projection'ından `taxNumber`'ı çıkar (SUPPORT'un firma arama/kuyruk görünümü için ad/rothernId/ülke/durum yeterli). `globalSearch` (`:985-992`) zaten taxNumber taşımıyor — aynı hijyeni `list`'e uygula.

### [LOW] admin firma notları: okuma+yazma SUPPORT'a açık; silme SUPER_ADMIN — asimetrik gate
`modules/admin-companies/admin-companies.controller.ts:432-444` (`listNotes` + `addNote`, rol dekoratörü YOK) vs `:446-453` (`deleteNote` = `SUPER_ADMIN`)

Senaryo: `SUPPORT` rollü admin `POST /admin/companies/:id/notes` ile herhangi bir firmaya dahili not ekleyebilir ve `GET .../notes` ile mevcut dahili notları (firma hakkında hassas idari yorum içerebilir) okuyabilir; ama silemez. `deleteNote`'un SUPER_ADMIN'e kapatılması notların hassas sayıldığını gösteriyor → okuma/yazmanın SUPPORT'a açık olması tutarsız. Not: `detail` SUPPORT'a kapalıyken firmaya bağlı notların okunabilmesi de aynı çelişki ekseninde.

- Katman: rol kapısı `addNote`/`listNotes`'ta EKSİK (firma kapısı `companyId` param'la, admin realm cross-tenant olduğundan N/A).
- INV: — (doğrudan bir INV değil; least-privilege + gate simetrisi).
- Minimal düzeltme: `listNotes`+`addNote`'a `@RequireAdminRole("SUPER_ADMIN","SALES")` (destek personeli dahili notları yönetmemeli). Düşük etki çünkü append-only + audit'li, PII değil.

### [INFO] `AdminRolesGuard` fail-open tasarımı — yeni sensitif route eklerken sessiz açık risk
`modules/admin-auth/guards/admin-roles.guard.ts:24` (`if (!required || required.length === 0) return true;`)

Metadata yoksa guard herkesi (SUPPORT dahil) geçirir. Bu okuma uçları için kasıtlı (yorum), ama yukarıdaki MED/LOW tam da bunun sonucu: bir sensitif route'a dekoratör koymayı unutmak = tüm admin rollerine açık. Sistemik gözlem — kural ihlali değil. Öneri (kod-dışı): sensitif controller'lara sınıf-seviyesi güvenli varsayılan (`@RequireAdminRole("SUPER_ADMIN","SALES")`) + okuma uçlarında bilinçli gevşetme, ya da salt-okuma uçlarını ayrı controller'a ayır.

### Doğrulanmış TEMİZ (admin realm)
- `admin-staff.controller.ts` — TÜM controller sınıf-seviyesi `@RequireAdminRole("SUPER_ADMIN")` (`:60-61`): staff list/create/setRole/setActive/resetPassword hepsi SUPER_ADMIN. ✓
- `admin-audit.controller.ts:15` — audit okuma `SUPER_ADMIN,SALES`; SUPPORT dışlanmış (yorumla bilinçli least-privilege). ✓
- `admin-system.controller.ts` — `status`/`suppressions` (okuma) ungated; `refresh-rates`=`SUPER_ADMIN,SALES` (`:113`), `rates/manual`=`SUPER_ADMIN` (`:135`, para yolu), `suppressions/clear`=`SUPER_ADMIN` (`:231`). ✓
- `admin-companies.controller.ts` yıkıcı aksiyonlar: `suspend`/`unsuspend`/`tier`/`export`/`deleteCompany`/`announce`=`SUPER_ADMIN`; `verify`/`reject`/`review`/`profile`/`notify`/`extendMembership`/`resolveComplaint`=`SUPER_ADMIN,SALES`; `detail`=`SUPER_ADMIN,SALES` (KYC PII). ✓
- `admin-company-users.controller.ts` — okuma+zararsız kurtarma (`password-reset`/`resend-verification`/`drop-sessions`) SUPPORT dahil (yorumla bilinçli, reset e-postası kullanıcının kendi adresine gider = ele geçirme yok); `active`/`email`/`addUser` (yazan)=`SUPER_ADMIN,SALES`. ✓
- `admin-inspection.controller.ts` — okuma (listing/order/connection) SUPPORT dahil; müdahale (close/extend/reopen/cancel/revoke)=`SUPER_ADMIN,SALES` (yorumla bilinçli). ✓
- `modules/email/admin-email-logs.controller.ts` (kapsam dışıydı ama admin-guard'lı) — list/findOne okuma ungated; `resend` (dış e-posta)=`SUPER_ADMIN,SALES` (`:39`, yorumda "eskiden gate yoktu" regresyon notu). ✓
- `admin-jwt.strategy.ts:37-51` — rol her istekte DB'den taze okunur (`platformAdmin.findUnique` + `isActive` kontrolü); JWT payload'ındaki `role` kullanılmıyor → INV-MT-3 muadili admin realm'de sağlanıyor. ✓

---

## B) INV-AZ SINIF-TEKRARI AVI (üç katman)

### Ana sonuç: İLAN yönetim/kazandırma — 13/13 metod üç katmanı da uyguluyor (TEMİZ)
`services/company-listings.service.ts` — gate: `assertListingManageRole` (`:5483-5502`) = katman 2 (`buy/sell:listing:manage`, ilan `type`'ından türetilir) + katman 3 (`createdById === user.userId || user.isOwner`). Firma kapısı (katman 1) her metodun kendi `findUnique`+`companyId` kontrolünde.

Metod → gate eşlemesi (hepsi doğrulandı):
`updateListing`(1123→1142) · `deleteListing`(1368→1382) · `publishListing`(1397→1414) · `award`(3612→3648) · `awardByItem`(3961→3998) · `createNextRound`(4448→4474) · `addInvitations`(4863→4886) · `eliminate`(5010→5030) · `cancel`(5096→5115) · `startEvaluation`(5221→5235) · `changeClosingTime`(5314→`ownerOpenListing`:5319) · `updateInternalNotes`(5388→5405) · `closeNoAward`(5414→5432).

Geçen iki HIGH'ın (ilan yönetim + award/awardByItem) SINIFI için başka tekrar YOK — award ikilisi de artık gate'li (`:3648`, `:3998`).

Bidder-side (katman 3 tasarımca uygulanmaz, doğru): `placeBid`(2636), `buyNow`(3331), `extendBidValidity`(4772, INV-AZ-4). `buyNow` party-scope doğrulandı: `listing.companyId === user.companyId` reddi (`:3374`), blok/görünürlük/davet/ülke kapıları (`:3379-3400`). ✓

### Diğer company-* kaynakları — firma-paylaşımlı model (katman 3 N/A, ihlal DEĞİL)
Her biri katman 1 (companyId scope) + katman 2 (rol izni) uyguluyor; katman 3 (per-user sahiplik) BU kaynaklar için tasarım gereği yok — banka hesabı/adres/şablon bir kişiye değil FİRMAYA aittir, yetkili herkes yönetir. "Birinin oluşturduğunu aynı firmadan başka yetkili değiştirebilir" = beklenen davranış (INV-AZ-1 yalnız ilan aksiyonlarını kapsar).

| Kaynak | Katman 1 (companyId) | Katman 2 (rol) | Katman 3 | Karar |
|---|---|---|---|---|
| `company-bank-accounts` | `requireOwn` (`:90-99`) | `billing:manage` (owner-only) | N/A | TEMİZ |
| `company-addresses` | `requireOwn` + `deleteMany{id,companyId}` TOCTOU kapatma (`:112-113`) | `company:manage` | N/A | TEMİZ |
| `company-listing-templates` | `findUnique`+companyId (`:54-58`) | `templates:manage` + PaidTier | N/A | TEMİZ |
| `company-supplier-templates` | `findFirst{id,companyId}` (`:105/128`) | `templates:manage` + PaidTier | N/A | TEMİZ |
| `company-question-templates` | `findUnique`+companyId (`:73-77`) | `templates:manage` + PaidTier | N/A | TEMİZ |
| `company-reports` | `companyId` scope + `type` izni (`assertTypeAllowed`) | `buy:bid:review`/`sell:listing:manage` | N/A (salt-okuma) | TEMİZ |
| `company-docs` (KYC) | `companyId` scope | `company:manage` (presign gate) | N/A | TEMİZ (INV-DOC-1) |
| `company-reviews` | order party türetme (`:35-39`) | — (firma aksiyonu) | party=order'dan | TEMİZ (spoofing yok) |
| `company-complaints` | `listMine` scope | `connections:manage` | N/A | TEMİZ |
| `company-connections` | `companyId` scope (INV-INV-1) | `connections:manage` | N/A | TEMİZ |
| `company-users` | `requireMember{id,companyId}` (`:609-616`) | `users:manage` | özel: owner/last-admin/escalation guard'ları | TEMİZ (aşağı bkz.) |

### `company-users` — escalation guard'ları sağlam, 1 LOW quirk
`company-users.service.ts`: `assertCanGrantRoles` (`:624-643`) self-promotion'ı engeller (non-admin YONETICI/ONAYLAYICI atayamaz, SAHIP yalnız owner devreder); owner koruması (`setActive:464`, `remove:545`, `updatePermissions:506`); `assertNotLastAdmin` (`:715-737`) + `lockedAdminTx` FOR UPDATE (`:700-708`) atomik son-yönetici garantisi. Owner-only izin override'ı yalnız owner yapar (`:496`). Güçlü.

### [LOW] Owner'ın `users:manage` verdiği operasyon-rollü kullanıcı, diğer yöneticileri DÜŞÜREBİLİR (privilege gain YOK)
`company-users.service.ts:371-399` (`updateRoles`) + `:454-485` (`setActive`)

Senaryo: Owner, bir `SATIN_ALMACI`'ya `users:manage` override verir (olağandışı ama mümkün). Bu kullanıcı `assertCanGrantRoles`'u yalnızca ayrıcalıklı-rol atamada tetikler; başka bir `YONETICI`'yi `[SATIN_ALMACI]`'ya DÜŞÜRMEK `grantsPrivileged=false` olduğundan geçer (hedef son-admin değilse). Kendini yükseltemez (self-promotion bloklu) ve `assertNotLastAdmin` en az bir admin bırakır → aktör hiçbir zaman kontrolü ele geçirmez; etki yalnızca diğer adminleri nuisance düşürme. Privilege escalation DEĞİL, bu yüzden LOW.

- Katman: katman 2 var (users:manage), katman 3 (hedef-koruması) ayrıcalıklı-olmayan role düşürmede uygulanmıyor.
- INV: — (INV-AZ ilan kapsamlı; bu üye-yönetimi. Escalation invariant'ı ihlal edilmiyor.)
- Minimal düzeltme (opsiyonel): mevcut admin'i (YONETICI/ONAYLAYICI) düşürmeyi de `actorIsAdmin` gerektirir hale getir — non-admin users:manage holder yalnız operasyon rollerini yönetsin.

---

## ÇAPRAZ-REFERANS (tenancy-reviewer'ın bulgusu — authz açısından teyit)

### [MED] WS handshake revocation/freshness bypass — authz gap (sahibi: tenancy-reviewer)
`modules/realtime/realtime.gateway.ts:76-83` (`handleConnection`)

WS handshake JWT'yi yalnız imza + `type==="company"` + `companyId` var mı diye doğrular, sonra `company:${payload.companyId}` odasına DOĞRUDAN katar. REST `company-jwt.strategy.ts`'in uyguladığı tazelik/iptal kontrollerinin HİÇBİRİ çalışmaz: `tokenVersion` (tv), `user.deletedAt`, `user.isActive`, `company.isActive`, `company.isBlocked`.

Authz görüşüm: EVET, authz gap — iki invariant'ı kırıyor:
- **INV-MT-3** iptal garantisi: tokenVersion revocation mekanizması; WS bunu yok sayıyor → parola-rotasyonlu/logout edilmiş token canlı kanalı sürdürür. Ayrıca `companyId` payload'dan alınıyor (REST'te DB'den türetiliyor) — imzalı olduğu için forge edilemez ama bayat olabilir + tazelik atlanıyor.
- **INV-SD-1**: soft-delete edilmiş CompanyUser "bildirim" iş akışına giremez; canlı WS sinyalleri bir bildirim yüzeyi → `deletedAt` kontrolü yok = ihlal.

Hafifletici faktör (severity'i sınırlar): sinyaller id-only "changed" (içerik yok) + company-scoped (`onSubscribe` K1 oda-üyeliği DB'den doğrulanıyor `:100-106`, cross-tenant DEĞİL). Sinyal bir poll-tetikleyici; iptal edilmiş principal REST'ten içeriği ÇEKEMEZ (orada strateji yeniden reddeder). Net etki: "bir şey değişti" varlık/timing oracle'ı, veri içeriği değil. Bu yüzden MED, HIGH değil.

Minimal düzeltme: `handleConnection` oda'ya katılmadan önce `company-jwt.strategy`'nin tazelik yolunu çağırsın (kullanıcıyı yükle; tv/deletedAt/isActive/company.isActive/isBlocked kontrol et) ve `companyId`'yi payload yerine taze kayıttan türetsin. Sahibi tenancy-reviewer — ben yalnız invariant eşlemesini teyit ediyorum.

---

## KALAN KÖR NOKTALAR
- Realtime (`/rt`) event payload'larının tenant sınırı — tenancy-reviewer'ın alanı; authz açısından bakmadım.
- `company-listings.service.ts` ~5600 satırın yalnız gate call-site'ları + buyNow/gate helper'ları okundu; getOne owner/non-owner dallarının FIELD sızıntısı (INV-BID-1) invariant'ta kanıtlı kabul edildi, yeniden satır-satır doğrulanmadı.
- `company-orders` party gate'leri (INV-SM-3) flow-reviewer kapsamı; authz olarak açmadım.
- Admin `list.q` ve arama uçlarının ReDoS/injection yüzeyi (contains filtreleri) — authz dışı, bakılmadı.
</content>
</invoke>
