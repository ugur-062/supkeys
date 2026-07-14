# Tenancy Denetim Bulguları (tenancy-reviewer)

Handshake: sent→authz-reviewer; received←(bekleniyor; ilk denemede peer henüz spawn olmamıştı, 2. denemede ulaşıldı)

Kapsam: INV-MT (MT-1..5) ihlalleri YENİ yüzeylerde — realtime gateway/servis, realtime emit çağıran servisler, scheduler/cron işleyicileri, ve iki büyük servisin (company-listings ~5748 st., company-orders ~1600 st.) INV kanıt-satırları dışında kalan Prisma sorguları. Çekirdek authz/tenancy iki tur denetlendi, tekrarlanmadı.

Genel sonuç: **Tenant sınırı bu yüzeylerde SAĞLAM.** Realtime emit'leri id-only (veri taşımaz), odalar companyId ile kapılı, subscribe DB'den ilişki doğruluyor. İki büyük servis merkezi guard'lardan (`assertListingManageRole`/`ownerOpenListing` ve `loadParticipant`/`list`/`getOne`) geçiyor. **1 gerçek bulgu** (WS handshake tazelik/iptal atlaması) + doğrulanmış olumlu gözlemler.

---

## BULGULAR

### [MEDIUM] · realtime.gateway.ts:75-87 · WS handshake, REST'in uyguladığı iptal/tazelik kontrollerini ATLAR

`handleConnection` bir token'ı YALNIZCA `jwt.verifyAsync` + `payload.type === "company"` + `payload.companyId` var mı diye kabul eder. REST tarafı `company-jwt.strategy.ts:53-102` (`validate`) ise aynı token için DB'den taze okuyup şunları uygular ve WS'te HİÇBİRİ yok:
- `tokenVersion` / `payload.tv` eşleşmesi (INV-MT-3, `company-jwt.strategy.ts:74`) — parola değişince artan oturum-iptali.
- `user.deletedAt` / `user.isActive` (INV-SD-1, `company-jwt.strategy.ts:66`).
- `user.company.isActive` / `user.company.isBlocked` (`company-jwt.strategy.ts:69`).

Somut exploit senaryosu: Bir kullanıcının WS token'ı henüz süresi dolmamışken (a) parolası sıfırlanır (tokenVersion++), veya (b) firma yöneticisi kullanıcıyı soft-delete/pasif eder, veya (c) admin firmayı `isBlocked` yapar. Üç durumda da REST istekleri 401 döner, AMA aktör hâlâ yeni bir WS bağlantısı açabilir. Bağlanınca otomatik `company:{companyId}` odasına girer ve o firmaya ait `notification.new` / `message.new` / `listing.updated` / `order.updated` sinyallerini (id-only) almaya devam eder; ayrıca `subscribe` ile firmanın ilan/sipariş odalarına katılabilir (subscribe kapısı companyId-ilişkisine bakar, kullanıcının üyelik durumuna değil — `realtime.gateway.ts:128-157`).

İhlal edilen INV: **INV-MT-3** (JWT iptali `tokenVersion` ile — WS'te uygulanmıyor) + **INV-SD-1** (`deletedAt` kullanıcı bildirim iş akışına giremez — WS bildirim sinyali alıyor). Ayrıca bloklu/pasif firma emniyet supabının WS'te delinmesi.

Etki sınırı (abartmamak için): Sinyaller **id-only**, gerçek veri İÇERMEZ; herhangi bir REST veri çekimi yine strategy'den geçip reddedilir → **veri sızıntısı YOK, cross-tenant YOK**. Sızan şey "bir şey değişti" meta-sinyali + iptal edilmiş bir principal'ın canlı oturum tutabilmesi (token doğal süresi dolana dek). En kritik senaryo: "attacker'ı kilitlemek için parola değiştirdim" varsayımının WS kanalında geçersiz kalması.

Minimal düzeltme yönü: `handleConnection`'da token verify'dan sonra `companyUser.findUnique({ where: { id: payload.userId }, include: { company: true } })` ile aynı tazelik kapısını uygula (deletedAt/isActive/company.isActive/isBlocked + `(payload.tv ?? 0) === user.tokenVersion`); başarısızsa `disconnect`, ve `companyId`'yi imzalı payload yerine taze kayıttan türet. Not: mevcut açık soketler yine kopmaz (socket.io doğası) — bu düzeltme yalnız YENİ bağlantı kabulünü sıkılaştırır; canlı iptal isteniyorsa ayrı bir "revoked companyId/userId" yayını gerekir (kapsam dışı, ayrı iş).

Çapraz-referans: `authz-reviewer` bu bulguyu bağımsız doğruladı ve `docs/audit-findings-authz.md`'de invariant eşlemesiyle (INV-MT-3 iptal garantisi + INV-SD-1 bildirim iş akışı) authz-gap olarak teyit etti; severity (MED) ve etki çerçevesi ("değişti" varlık/timing oracle'ı, cross-tenant değil) iki denetçide örtüşüyor.

---

## DOĞRULANMIŞ OLUMLU GÖZLEMLER (kontrol VAR — ihlal yok)

- **Realtime oda-abonelik yetkisi (K1) DOĞRU kurulmuş** — görevdeki "[EK] başka firmanın room'una abone olunabiliyor mu?" sorusunun cevabı HAYIR. `onSubscribe` (`realtime.gateway.ts:89-107`) yalnız `listing|order` kind kabul eder, id'yi doğrular, ve `canSubscribeOrder` (yalnız buyer/seller companyId, `:110-121`) / `canSubscribeListing` (sahip VEYA teklif/davet/aktif-bağlantı, `:128-157`) ile DB'den ilişki doğrular. Oda adı client'tan gelse de erişim kontrollü. `company:{id}` odası ise handshake'te imzalı JWT'nin `companyId`'sinden kurulur (client'tan değil) → başka firma odasına giriş yapısal olarak imkânsız.
- **Emit payload'ları id-only** — `RealtimeService.pingListing/pingOrder` yalnız `{listingId}`/`{orderId}`, `pingNotification/pingMessage` boş `{}` taşır (`realtime.service.ts:28-59`). Başka firmanın verisi payload'da taşınmaz; yorumdaki "veri REST'ten yetkiyle çekilir" iddiası kodla tutarlı.
- **Emit çağıranlar doğru firmaya hedeflenmiş** — `pingOrder(id, [sellerCompanyId, buyerCompanyId])` (orders servis tüm çağrılar), `pingListing(id, [listing.companyId])` (admin-inspection `:157/201/259/423`, listings award akışları teklifçi/parti id'leriyle), `pingNotification(companyId)` (notification servis, kendi firma odası), `pingMessage(otherCompanyId)` (mesaj alıcısının odası; `company-messages.service.ts:308`, otherCompanyId thread karşı-tarafı, sinyal-only). Cross-tenant emit yok.
- **notification.service** — `notifyCompanyUser` alıcıyı `isActive && !deletedAt` süzer (`:93`), `pushToCompanies` verilen id kümesine + portal roL'üne kısıtlar (`:139-149`), emit yalnız yazılan firmalara (`:184-186`). INV-CRON-1 ile tutarlı.
- **Scheduler'lar** — `membership.scheduler.ts` cross-tenant sistem işi ama delete'ler `inviterCompanyId: { in: ids }` ile, e-posta tek tek firmaya (`:88-168`). `listing.scheduler.ts` / `order.scheduler.ts` yalnız id toplayıp INV-CRON-1'de doğrulanan `notify*` metotlarına delege eder; alıcı çözümü parti-scope'lu. `approvals.scheduler.ts` servise delege. `cron-registry.service.ts` yalnız in-memory meta (label/schedule/lastRun), tenant verisi tutmaz.
- **company-listings.service.ts (131 sorgu tarandı)** — `listing.findUnique({where:{id}})` deseni tutarlı olarak hemen `companyId !== user.companyId` kontrolü veya `ownerOpenListing`/`assertListingManageRole` ile takip ediliyor (ör. `roundHistory:4984`, `eliminate:5027`, `changeClosingTime→ownerOpenListing:5318`, `ownerOpenListing:5518`). Adres okumaları scope'lu (`:2570` companyId eşitliği, `:2604` count+companyId; `assertListingAddressesOwned`). `extendBidValidity` composite key `listingId_bidderCompanyId` ile teklifçiye scope'lu (INV-AZ-4, `:4796`). `orderDeliverySnapshot:2620` bare-id okur ama girdi id'si önceden `assertListingAddressesOwned`/`assertBidAddressOwned` ile sahiplik-doğrulanmış → attacker-erişilir değil. Scope'suz kaçak sorgu bulunamadı.
- **company-orders.service.ts (35 sorgu tarandı)** — TÜM sipariş aksiyonları `loadParticipant` (`:1064-1097`, `seller/buyerCompanyId === user.companyId` şart) veya `list(companyId)` (`:1385`, OR seller/buyer) veya `getOne` (`:1428-1434` parti guard) üzerinden geçer. Ödeme onay/ret `payment.orderId === id` (`:1262`) + atomik CAS (`:1286`). Revizyon yolları (`approve/reject/cancelRevision`) parti-guard + `orderRevision ... orderId: id` scope'lu (`:615, :680, :717`). Banka hesabı accept'te `acct.companyId !== user.companyId` (`:173`). Scope'suz kaçak sorgu bulunamadı.

---

## KALAN KÖR NOKTALAR (bakılamadı / belirsiz)

- WS token'ının doğal ömrü (JWT `expiresIn`): Yukarıdaki MEDIUM bulgunun etki penceresi buna bağlı (kısa=düşük risk, uzun=daha anlamlı). `company-auth.service.ts` token imzalama parametresi bu turda okunmadı.
- `company-listings.service.ts`'in 5748 satırının tamamı satır-satır okunmadı; sorgu-yüzeyi (131 çağrı sitesi) triaj edildi ve şüpheli olanlar tek tek doğrulandı, ama sorgu-dışı veri birleştirme/serialize dallarının tamamı incelenmedi.
- Peer handshake ACK'i (authz-reviewer'dan) dosya yazımı anında henüz gelmemişti; realtime iptal-atlamasının "authz gap mı" değerlendirmesi authz-reviewer'a soruldu, yanıt bekleniyor.
