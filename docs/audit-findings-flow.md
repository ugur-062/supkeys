# Akış / Durum Makinesi Denetimi — flow-reviewer

Kapsam: İlan + Sipariş + Revizyon + Belge durum makineleri; atomik geçiş guard'ları,
yarış durumları, idempotency. Salt-okunur kod-yolu izlemesi (invariants.md Bölüm 2/3).

**Handshake:** sent→integrity-reviewer (ilk deneme "not reachable", 2. deneme OK);
received←(henüz peer PING gelmedi).

---

## Bulgular

### FLOW-1 [HIGH] `createNextRound` durum yazımı KOŞULSUZ — AWARDED ilanı yeniden açar (çift sipariş) · INV-SM-1

- **Dosya:** `company-listings.service.ts:4603` (`await tx.listing.update({ where: { id: listingId }, data: { status: "OPEN", currentRound: { increment: 1 }, ... } })`).
- **Kök neden:** Durum kontrolü tx-DIŞI `findUnique` (`:4454`) + `if(!["OPEN","CLOSED","IN_AWARD","CLOSED_NO_AWARD"].includes(status))` (`:4475`) ile yapılıyor; transaction içindeki yazım ise `tx.listing.update` (koşulsuz, yalnız `id` ile) — INV-SM-1'in şart koştuğu `updateMany({ where:{ id, status:{ in:[...] } } })` + count kontrolü YOK. Kardeş metot `closeNoAward` (`:5439`) aynı geçişi DOĞRU şekilde koşullu atomik yazımla yapıyor; `createNextRound` istisna.
- **Somut senaryo (award ile yarış → INV-SM-1 F1 ihlali):**
  1. İlan L, `IN_AWARD` (kapanmış, değerlendirmede). İki SUBMITTED teklif B1, B2.
  2. Sahip/operatör eşzamanlı: `award(L, B1)` (onay yoksa `runFullAward`) VE `createNextRound(L, dto)` (AUTO taşıma).
  3. `createNextRound` durumu `IN_AWARD` okur (`:4454`), kontrolleri geçer.
  4. `award`→`runFullAward` tx commit: L→`AWARDED`, B1→`WON`, B2→`LOST`, Sipariş **O1** oluşur (`:3818-3868`).
  5. `createNextRound` tx: `bids` sorgusu `round=currentRound, status∈[SUBMITTED,LOST]` → **B2 (artık LOST) yakalanır**; AUTO ile B2→`SUBMITTED, round=2`; sonra **koşulsuz** `tx.listing.update` L→`OPEN, round=2`.
  6. Sonuç: L `OPEN` (tur 2) + canlı SUBMITTED B2, ve B1'in kazandırmasından **canlı O1 siparişi**. Sahip artık B2'yi de kazandırır (award `OPEN`'da serbest) → **O2 siparişi**. Tek "tek-kazanan" akışından İKİ sipariş; ilan zaten bir kez AWARDED olmuştu.
- **İkinci somut senaryo (self-race):** İki eşzamanlı `createNextRound` (çift-tık) → ikisi de `currentRound=N` okur, ikisi de tx'e girer; her biri `{increment:1}` → tur N+2'ye atlar (N+1 kaybolur), snapshot çiftlenir, `announceListingOpen` iki kez tetiklenir.
- **Ek faset:** `createNextRound`, bir `award` tarafından bu arada `IN_AWARD_APPROVAL`'a alınmış ilanı da (koşulsuz olduğu için) `OPEN`'a ezer → bekleyen kazandırma onayı sessizce düşer.
- **Minimal düzeltme:** `:4603` `tx.listing.update` yerine
  `tx.listing.updateMany({ where: { id: listingId, status: { in: ["OPEN","CLOSED","IN_AWARD","CLOSED_NO_AWARD"] }, currentRound: listing.currentRound }, data: {...} })` + `if (count !== 1) throw new ConflictException(...)` (tx rollback). `currentRound: listing.currentRound` guard'ı self-race'i de kapatır; `{increment:1}` yerine sabit `newRound` yazmak daha güvenli.

---

### FLOW-2 [MEDIUM] `cancel` (ilan) durum yazımı KOŞULSUZ — CANCELLED ilanla canlı sipariş · INV-SM-1

- **Dosya:** `company-listings.service.ts:5120` (`this.prisma.listing.update({ where:{ id }, data:{ status:"CANCELLED" } })`, `$transaction([...])` dizi formunda).
- **Kök neden:** Durum kontrolü tx-dışı `findUnique` + `if(status!=="OPEN")` (`:5116`); yazım koşulsuz `listing.update`. Yine kardeş `closeNoAward`'ın koşullu deseni burada uygulanmamış.
- **Somut senaryo (award ile yarış):**
  1. İlan L `OPEN`. Sahip/operatör eşzamanlı: `award(L, B1)` VE `cancel(L)`.
  2. `cancel` durumu `OPEN` okur (stale), geçer.
  3. `award`→`runFullAward` commit: L→`AWARDED`, B1→`WON`, Sipariş **O1** oluşur.
  4. `cancel` tx: `listing.update` L→`CANCELLED` (koşulsuz, AWARDED'ı ezer) + `listingBid.updateMany(SUBMITTED→LOST)` (B1 zaten WON, etkilenmez).
  5. Sonuç: L `CANCELLED` + katılımcılara "ihale iptal edildi" bildirimi (`:5130`), AMA **O1 siparişi canlı** (PENDING) — satıcı kabul edip işleyebilir. İlan durumu ↔ sipariş varlığı tutarsız.
- **Fark (FLOW-1'e göre daha dar):** çift sipariş değil; tek siparişin "iptal edilmiş" bir ilana asılı kalması + yanıltıcı iptal bildirimi. Yine de gerçek mali yükümlülük doğuran sipariş söz konusu.
- **Minimal düzeltme:** `listing.update`'i tx içinde `listing.updateMany({ where:{ id, status:"OPEN" }, data:{...} })` + `count===1` guard'ına çevir (interactive tx formuna geçir); `closeNoAward:5439` ile birebir simetri.

---

### FLOW-3 [LOW] `publishListing` DRAFT→OPEN yazımı KOŞULSUZ — çift-yayınında çift duyuru · INV-SM-1 (küçük idempotency)

- **Dosya:** `company-listings.service.ts:1439` (`this.prisma.listing.update({ data:{ status:"OPEN", publishedAt } })`), önce `if(status!=="DRAFT")` (`:1415`).
- **Senaryo:** Eşzamanlı iki `publishListing` (çift-tık) → ikisi de DRAFT okur, ikisi de `update` yapar (idempotent son-durum aynı: OPEN), fakat her ikisi de `announceListingOpen` (`:1444`) tetikler → PRIVATE'de davetlilere / PUBLIC'te kategori-eşleşen PAKET firmalara **çift açılış bildirimi**. `announceListingOpen`'ın `openNotifiedAt` damgası tek çalıştırmada iki çağrıyı tekilleştirebilir ama iki eşzamanlı çağrı damgayı görmeden geçebilir.
- **Etki:** Sadece yinelenen bildirim; durum bütünlüğü bozulmaz (aynı hedef durum). Düşük.
- **Minimal düzeltme:** `update` → `updateMany({ where:{ id, status:"DRAFT" }, ... })` + `count===1` guard; duyuruyu yalnız kazanan çağrı tetikler.

---

## Doğrulanmış TEMİZ (kod-yolu izlendi, "bilinmiyor" değil)

- **`award` / `awardByItem` / `runFullAward` / `runItemAward`** — sipariş oluşturma tx'i **atomik durum guard'ı** ile korunuyor: `tx.listing.updateMany({ where:{ id, status:{ in:["OPEN","CLOSED","IN_AWARD","IN_AWARD_APPROVAL"] } }, data:{ status:"AWARDED" } })` + `if(count!==1) throw` (`:3818-3827`, `:4261-4270`). Eşzamanlı ikinci kazandırma / yeniden gönderilen onay-event'i count=0 alır → **çift sipariş oluşmaz (F1)**. INV-SM-1 / INV-AZ-2 tutuyor. Ayrıca kazandırma anında teklif hâlâ `SUBMITTED` doğrulanır (`:3772`), belge zorunluluğu erken kapatılır (`:3666`, `:4002`).
- **`onAwardApproved` / `onAwardRejected`** (`:4407`, `:4429`) — onay-event'i yeniden tetiklense bile `runFullAward`/`runItemAward`'ın kendi atomik guard'ı tek-etki sağlar; reject yalnız `IN_AWARD_APPROVAL`→`IN_AWARD` koşullu (`:4433`). INV-SM-5 / INV-AZ-3 tutuyor.
- **`startEvaluation` (manuel) vs `listing.scheduler.closeExpired` (cron)** — ikisi de `updateMany({ where:{ id, status:"OPEN" }, data:{ status:"IN_AWARD" } })` + count kontrolü (`:5246-5258`, `scheduler:75-80`). OPEN→IN_AWARD için tek kazanan; kaybeden Conflict alır, **çift kapanış bildirimi yok**. INV-SM-1 tutuyor.
- **`closeNoAward`** (`:5436-5452`) — koşullu `updateMany` + count; eşzamanlı `runFullAward` AWARDED yazdıysa count=0 → "kazanansız kapatma uygulanamadı". Doğru desen (FLOW-1/2 bunu kaçırıyor).
- **`eliminate`** (`:5047`) — teklif `SUBMITTED` doğrulaması + tek-teklif yazımı; durum makinesi tarafını ilgilendiren yarış yok (ilan durumu değişmez).
- **Sipariş `transition()` yardımcı** (`:999-1038`) — `updateMany({ where:{ id, status:{ in: fromList } } })` + `count!==1` guard + `assertOrderRole(side)`. accept/reject/ship/receive tümü buradan → **atomik + taraf-guard**. INV-SM-3 tutuyor. accept teminat + banka hesabı ön-koşulları uygulanıyor (`:152-175`); ship'te akreditif/peşin-eşik/bekleyen-ödeme kilitleri (`:237-273`).
- **`complete()`** (`:353-408`) — INV-SM-4: bekleyen `AWAITING_CONFIRMATION` sayımı + `isFullyPaid(total, confirmedSum)` kapıları uygulanıyor; okunan CONFIRMED toplamı monotonik (geri gitmez) → gate **atlanabilir değil**. `receive()` (`:307`) BEFORE_DELIVERY'de aynı tam-ödeme koşuluyla COMPLETED'a geçer. INV-SM-4 tutuyor.
- **`paymentDecision` (confirm/reject)** (`:1246-1351`) — `FOR UPDATE` sipariş kilidi + atomik CAS `updateMany({ where:{ id, orderId, status:"AWAITING_CONFIRMATION" } })` + `count!==1`→"zaten sonuçlanmış" (çift-tık güvenli); CONFIRMED, CANCELLED/REJECTED siparişte reddedilir; auto-complete kilit altında `updateMany(status=DELIVERED→COMPLETED)`. INV-SM-5 tutuyor.
- **`recordPayment`** (`:1170-1212`) — `FOR UPDATE` + AWAITING+CONFIRMED toplam tavanı; eşzamanlı kayıtlar serileşir, **fazla-tahsilat imkânsız**.
- **`cancel` (sipariş)** (`:433-461`) — `FOR UPDATE` + CONFIRMED-ödeme kapısı + atomik `updateMany(status∈CANCELABLE)`; iptal↔ödeme-onayı yarışı serileşir. (İLAN `cancel`'i değil — bkz. FLOW-2.)
- **Revizyon** (`proposeRevision`/`approveRevision`/`rejectRevision`/`cancelRevision`, `:523-733`) — `OrderRevision` AYRI kayıt; sipariş state machine'i tek-yönlü kalır (approve yalnız `amount`/`items`/`expectedDeliveryDate` günceller, durum geri sarmaz). approve `FOR UPDATE` + status=ACCEPTED + ödeme-yok re-check + rev PENDING re-check tx içinde (`:589-651`); reject/cancel atomik `updateMany(status="PENDING")` + count. INV-SM (revizyon) tutuyor.
- **`lcMarkPaid` auto-complete** (`:842-891`) — `FOR UPDATE` + `updateMany(status=DELIVERED→COMPLETED)` + count; idempotent `lcPaidAt` damgası çift-tıkı engeller.
- **Belge adım-kilidi** (`company-order-documents.service.ts`) — her tip için taraf + evre kapısı (`assertCanUpload:202-309`), key-prefix anti-tamper (`:76-79`), rol kapısı (`assertUploadRole`). TEMINAT yalnız PENDING'de yönetilir; onay-sonrası silme reddi (`remove:136-146`). **Award→order doğuşu atomik** (yukarıdaki runFullAward/runItemAward guard'ı) → çift-award çift-order üretmez.
- **Cron idempotency** — `closingReminders`/`announceOpened`/`evaluationValidityReminders` hepsi atomik damga-claim (`updateMany(...SentAt: null → now)` + count) → overlap/2-replica çift-bildirim yok. `sendDuePaymentReminders` (`orders:948`) aynı desen.

## Bilinen kalıntı (kod yorumunda kabul edilmiş — yeni bulgu değil)
- `company-order-documents.service.ts:132-135` — `accept()`'in teminat-sayımı+geçişi ile TEMINAT `remove()` arasında dar yarış (satıcı kendi teminatını silerken kendi siparişini onaylarsa). Self-inflicted, tek-taraf; yorumda "ayrı iş" olarak işaretli. Doğruladım, aynen geçerli.

## KALAN KÖR NOKTALAR (bakılmadı / satır-satır izlenmedi — "temiz" DEĞİL)
- `addInvitations`, `updateListing`, `deleteListing` atomikliği (durum geçişi değil, ilan yönetim yazımları). `changeClosingTime`/`updateInternalNotes` koşulsuz `update` kullanıyor ama **durum değiştirmiyor** → award ile yarışta yalnız zararsız metadata yazar (AWARDED ilana closesAt yazmak etkisiz). Bu yüzden FLOW listesine alınmadı; yine de doğrulanmadı.
- `placeBid` / `extendBidValidity` eşzamanlılığı (teklif-tarafı; bu görevin kapsamı ilan/sipariş durum makinesiydi).
- `approvals.requestApproval` / `decide` motorunun iç akışı okunmadı — award idempotency'si runFullAward'ın KENDİ guard'ına dayandığından (doğrulandı) çift-fire senaryosunda bile güvenli; ancak event teslim semantiği (at-least-once mi) izlenmedi. integrity-reviewer'ın alanı.
- Realtime `pingListing`/`pingOrder` payload'ının tenant sınırı (invariants "denetlenmemiş alanlar").
