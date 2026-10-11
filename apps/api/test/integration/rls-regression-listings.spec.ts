/**
 * YAYIN DENETİMİ 2026-09-28 — RLS REGRESYON KANITI (talep/pazarlık parçası).
 * Kaynak: docs/qa-launch-audit-2026-09-28.md → "RLS — canlıda var olan hata
 * sınıfı" (R-1..R-8), düzeltme b9ef1089. Bu dosya R-1, R-3, R-7'yi korur:
 *
 *  - R-1 (YÜKSEK): pazarlıkta teklifçi yalnız KENDİ teklifini görüyordu →
 *    "en iyi fiyat" kendi fiyatı, sırası hep 1. Kullanıcıya görünen düzeltme
 *    `computeAuctionView` (görünürlük kapılı teklifçi görünümü); teklifçiye
 *    dönen `english` özeti de (currentBest/bidCount) bu görünümden EZİLİR
 *    (`englishForBidder`). Talep detayındaki ikinci bypass okuması
 *    (`getOne` Promise.all → `englishAgg`) KULLANICIYA GÖRÜNMEZ: teklifçide
 *    ezilir, sahip ise kısıtlı client'la da tüm teklifleri görür (listing_bids
 *    politikasının "talep sahibi" kolu). Bu yüzden onun için belirti testi
 *    YOKTUR; yalnız açıkça etiketli bir KABLO KONTROLÜ (kayıt tutan Proxy) iki
 *    okumanın da bypass'tan gittiğini ve kısıtlı client'a düşmediğini sabitler.
 *    Asıl güvence görünürlük kapısıdır: OWN_ONLY/OWN_RANK rakip tutarını
 *    SIZDIRMAZ (bypass rakip teklifleri belleğe okusa da).
 *  - R-3 (YÜKSEK): teklif verebilen tedarikçi (canBid) sahibin teslim
 *    adresini hep BOŞ görüyordu. canBid kapısı değişmedi mi: teklif veremeyen
 *    tedarikçi adresi hâlâ ALMAZ. Genişleme yok mu: aynı bypass okuması FATURA
 *    adresini (vergi no) da belleğe alır → teklifçi yanıtında HİÇ geçmemeli;
 *    `companyId: listing.companyId` süzgeci artık tek engel → başka firmanın
 *    adres id'si talebe yazılmış olsa bile dönmemeli.
 *  - R-7 (DÜŞÜK): cron yollarında (bağlam YOK) `connectedCompanyIds` boş
 *    dönüyordu. İki bağlamsız tüketici üzerinden, doğrudan (public metot,
 *    özel metot çağrısı YOK):
 *      · `notifyHiddenAiMatches` sahibin AKTİF bağlantısını atlamalı — bağlı
 *        sınırlı (doğrulanmamış) firmaya "firmanızı doğrulayın" çağrısı gitmemeli;
 *      · `notifyCategoryMatchedCompanies` bağlı sınırlı firmaya KİLİTLİ değil
 *        AÇIK metni (talep bağlantısı) göndermeli.
 *    DERİNLİK SAVUNMASI: olağan akışta üst katman bu firmaları zaten eler
 *    (keşif `discoverRegisteredFor` AKTİF bağlantıları düşürür;
 *    `announceListingOpen` önce `autoInviteConnections` ile bağlantıları davet
 *    edip kategori duyurusundan çıkarır — denetimdeki "bugün başka süzgeçler
 *    örtüyor"). Testler o yüzden metodun KENDİ bağlamsız sözleşmesini sabitler.
 *
 * NEDEN ŞİMDİYE KADAR YAKALANMADI: mevcut entegrasyon testleri owner
 * `prisma`'yı HEM PrismaService HEM PrismaBypassService yuvasına veriyor —
 * owner RLS'i bypass eder, kısıtlı rolün "başka firmanın satırını göremez /
 * bağlamsız hiç satır göremez" davranışı hiç koşmuyordu.
 *
 * KABLOLAMA (canlıyla birebir): PrismaService yuvası = kısıtlı `rothern_app`
 * + RLS extension (`rls`); PrismaBypassService yuvası = owner `prisma`.
 * Her test KANIT-ÇİFTİ: (a) canlı kablolama → kullanıcının göreceği DOĞRU
 * sonuç; (b) aynı servis, iki yuvada da `rls` → düzeltme öncesi belirti
 * (fikstürün RLS'i gerçekten tetiklediğinin kanıtı). DİKKAT: (b) "b9ef1089
 * geri alındı" değil, "HER bypass okuması kısıtlı client'ta" modelidir —
 * b9ef1089'dan önce de bypass olan okumalar (ör. davet/e-posta günlüğü)
 * orada da kısıtlanır; bu fikstürlerde sonucu etkilemez. Düzeltmenin geri
 * alınmasını yakalayan (a) yarılarıdır (geri alınınca kırmızıya döner).
 * Kapı testlerinde (b) yerine KONTROL yarısı var: aynı veri kapı açıkken
 * görünür → gizleyen RLS değil, görünürlük kapısıdır.
 *
 * ROBUST DESEN (rls-isolation.spec ile aynı): beforeEach truncateAll YOK;
 * her test kendi benzersiz firmalarını kurar (RLS bağlamı companyId'ye göre
 * doğal izole eder). afterAll: önce kısıtlı client kapanır, sonra truncate.
 */
import { PrismaClient } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { connect, makeBid, makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { ensureRestrictedRolePassword, makeRestrictedPrisma } from "./rls-db";
import { createRlsExtension } from "../../src/common/prisma/rls-extension";
import { runWithTenantContext } from "../../src/common/tenant/tenant-context";
import {
  AI_MATCH_LOCKED_CONTEXT,
  CompanyListingsService,
} from "../../src/modules/company-listings/services/company-listings.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import type { AuthenticatedCompanyUser } from "../../src/modules/company-auth/strategies/company-jwt.strategy";

let restricted: PrismaClient;
let rls: ReturnType<PrismaClient["$extends"]>;
const prevFlag = process.env.RLS_ENABLED;

beforeAll(async () => {
  // Canlı: RLS_ENABLED=true → extension set_config'li tx'e sarar.
  process.env.RLS_ENABLED = "true";
  await ensureRestrictedRolePassword(prisma as never);
  restricted = makeRestrictedPrisma();
  await restricted.$connect();
  rls = restricted.$extends(createRlsExtension());
});
afterAll(async () => {
  if (prevFlag === undefined) delete process.env.RLS_ENABLED;
  else process.env.RLS_ENABLED = prevFlag;
  // Kısıtlı client ÖNCE kapatılır → truncate (owner) onunla yarışmaz.
  await restricted.$disconnect();
  await truncateAll();
  await prisma.$disconnect();
});

const FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

/**
 * ÜCRETSİZ DÖNEM (2026-10-07): SINIRLI firma = DOĞRULANMAMIŞ firma (saklı
 * kademesi STANDART). Doğrulanmış firma saklı kademesinden bağımsız tam
 * erişimlidir; factory varsayılanı VERIFIED + GOLD = tam erişimli firma.
 */
const LIMITED = { tier: "STANDART", companyVerificationStatus: "UNVERIFIED" } as const;
/** Kilitli duyurunun çağrısı: firma doğrulama sayfası. */
const VERIFY_PATH = "/company/ayarlar/dogrulama";

// Rakip tutarları AYIRT EDİCİ seçildi: yanıt JSON'unda "1111.11" / "2222.22"
// geçmesi = rakip tutarı sızdı (id/tarih alanlarıyla çakışmaz).
const BEST = "1111.11"; // rakip X — en iyi (ters eksiltme: düşük kazanır)
const MID = "2222.22"; // rakip Y
const MINE = "3333.33"; // izleyen teklifçi Z — en kötü (gerçek sıra 3/3)

/**
 * Gerçek CompanyListingsService — yuvalar pozisyonel (make-service.ts ile
 * aynı sıra): 1. PrismaService, 2. PrismaBypassService. Yan-etki
 * bağımlılıkları mock; NotificationService GERÇEK ve canlıdaki gibi
 * PrismaService yuvasındaki client'la (bildirim satırı kullanıcı-görünür
 * sonuçtur — R-7'de assert edilir).
 *
 * BİLİNÇLİ: `translations` (son @Optional) VERİLMEZ → `notify()` e-postayı
 * EŞZAMANLI yollar (çeviri varken `listingTitles.forParams(...).then(send)`
 * ile ertelenirdi). R-7 yine de okumadan önce `settle()` ile kuyruğu boşaltır.
 */
function buildService(tenantDb: unknown, bypassDb: unknown) {
  const email = {
    send: jest.fn().mockResolvedValue({ emailLogId: "test", sent: true }),
  };
  const service = new CompanyListingsService(
    tenantDb as never,
    bypassDb as never,
    // R-6 (blockedCompanyIds) ayrı spec'in konusu — burada engel yok.
    { blockedCompanyIds: jest.fn().mockResolvedValue([] as string[]) } as never,
    {
      requestApproval: jest.fn().mockResolvedValue({ approved: true }),
      pendingForListing: jest.fn().mockResolvedValue(null),
    } as never,
    {
      getCurrentRate: jest.fn().mockResolvedValue(30),
      getFreshRate: jest.fn().mockResolvedValue(30),
    } as never,
    email as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    new NotificationService(tenantDb as never),
    { log: jest.fn() } as never, // audit — bu yollarda yazılmaz
    undefined, // realtime
    undefined, // storage
    undefined, // affinity
    // seo, translations: verilmez (bkz. doc yorumu)
  );
  return { service, email };
}

/** Canlı kablolama: kısıtlı+RLS PrismaService, owner bypass. */
const production = () => buildService(rls, prisma);
/** Düzeltme ÖNCESİ davranış: bypass yuvasında da kısıtlı client. */
const preFix = () => buildService(rls, rls);

// Bağlam içinde servis çağrısı (runtime yolu birebir). await İÇERDE olmalı —
// PrismaPromise LAZY, aksi halde sorgu ALS dışında koşar (bkz. Faz 1b).
const asCompany = <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
  runWithTenantContext({ companyId, realm: "company" }, async () => await fn());

/** Ateşle-unut (`void email.send(...)`) zincirlerinin bitmesini bekler. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

type AuctionView = {
  bestTotal: string | null;
  bestCurrency: string | null;
  myRank: number | null;
  participantCount: number | null;
  allBids:
    | { rank: number; total: string; currency: string; isMine: boolean }[]
    | null;
} | null;
type English = {
  isEnglishAuction: true;
  currentBest: string | null;
  currentBestCurrency: string | null;
  bidCount: number;
} | null;
type BidderDetail = {
  isOwner: false;
  canBid: boolean;
  auctionView: AuctionView;
  english: English;
  deliveryAddress: {
    title: string;
    addressLine: string;
    city: string | null;
    contactName: string | null;
    phone: string | null;
  } | null;
};
type OwnerDetail = { isOwner: true; english: English };

/** Teklifçinin KENDİ firma bağlamında talep detayı (canlı istek yolu). */
const viewAsBidder = (
  service: CompanyListingsService,
  auth: AuthenticatedCompanyUser,
  listingId: string,
) =>
  asCompany(auth.companyId, () => service.getOne(auth, listingId)) as Promise<
    BidderDetail
  >;

/** Sahibin KENDİ firma bağlamında talep detayı. */
const viewAsOwner = (
  service: CompanyListingsService,
  auth: AuthenticatedCompanyUser,
  listingId: string,
) =>
  asCompany(auth.companyId, () => service.getOne(auth, listingId)) as Promise<
    OwnerDetail
  >;

// ── KABLO KONTROLÜ yardımcısı ────────────────────────────────────────────
// Model delege çağrılarını (model, işlem, argüman) kaydeden şeffaf Proxy.
// Sorgu ASIL client'ta, aynı ALS bağlamında koşar (lazy PrismaPromise aynen
// döner); yalnız "hangi yuvadan gitti" bilgisini tutar. Belirti DEĞİL —
// kullanıcıya görünmeyen bir okumanın yuvasını sabitlemek için.
type Call = {
  model: string;
  op: string;
  args: { where?: Record<string, unknown>; select?: Record<string, unknown> } | undefined;
};
function recording<T extends object>(client: T, calls: Call[]): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      const isModel =
        typeof prop === "string" &&
        !prop.startsWith("$") &&
        !prop.startsWith("_") &&
        value !== null &&
        typeof value === "object";
      if (!isModel) {
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      }
      return new Proxy(value as object, {
        get(delegate, op) {
          const fn = Reflect.get(delegate, op, delegate) as unknown;
          if (typeof fn !== "function" || typeof op !== "string") return fn;
          return (...args: unknown[]) => {
            calls.push({ model: prop as string, op, args: args[0] as Call["args"] });
            return (fn as (...a: unknown[]) => unknown).apply(delegate, args);
          };
        },
      });
    },
  });
}

/**
 * Açık eksiltme (ENGLISH_AUCTION, ALIM, PUBLIC) + 3 SUBMITTED teklif.
 * İzleyen Z (GOLD → canBid) en KÖTÜ teklifte; X en iyi. Kalemsiz ilan →
 * üç teklif de kıyaslanabilir (bidCoversAllItems). Kalemli + çok birimli
 * gerçekçi senaryo ayrı fikstürde (aşağıda).
 */
async function auctionFixture(bidVisibility: string) {
  const owner = await makeCompanyWithUser(prisma, { country: "TR", name: "R1-Sahip" });
  const x = await makeCompanyWithUser(prisma, { country: "TR", name: "R1-RakipX" });
  const y = await makeCompanyWithUser(prisma, { country: "TR", name: "R1-RakipY" });
  const viewer = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "OPEN",
    visibility: "PUBLIC",
    format: "ENGLISH_AUCTION",
    bidVisibility: bidVisibility as never,
    closesAt: FUTURE,
    publishedAt: new Date(),
  });
  for (const [c, amount] of [
    [x, BEST],
    [y, MID],
    [viewer, MINE],
  ] as const) {
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: c.company.id,
      createdById: c.user.id,
      amount,
    });
  }
  return { owner, x, y, viewer, listing };
}

describe("R-1 — pazarlık: teklifçi TÜM tekliflere göre en iyi fiyatı ve gerçek sırasını görür", () => {
  it("KANIT-ÇİFTİ (BEST_AND_OWN_RANK): canlı kablolamada en iyi fiyat rakibin (1111.11), sıram 3/3 — teklifçiye dönen `english` özeti auctionView'dan ezildiği için aynı; iki yuvada kısıtlı client → kendi fiyatım + sıra 1 (canlı belirti)", async () => {
    const { owner, viewer, listing } = await auctionFixture("BEST_AND_OWN_RANK");

    // (a) canlı: computeAuctionView bypass ile tüm SUBMITTED teklifleri sıralar.
    const ok = await viewAsBidder(production().service, viewer.auth, listing.id);
    expect(ok.isOwner).toBe(false);
    expect(ok.auctionView).toEqual({
      bestTotal: BEST,
      bestCurrency: "TRY",
      myRank: 3,
      participantCount: 3,
      allBids: null, // ALL modu değil → liste yok
    });
    // Teklifçiye dönen `english` bloğu: currentBest/bidCount `englishForBidder`
    // ile auctionView'dan EZİLİR — yani bu satır da computeAuctionView'u
    // ölçer, `englishAgg` bypass'ını DEĞİL (onun için bkz. KABLO KONTROLÜ).
    expect(ok.english).toMatchObject({
      isEnglishAuction: true,
      currentBest: BEST,
      currentBestCurrency: "TRY",
      bidCount: 3,
    });

    // Sahip tarafı özet: sahip, listing_bids politikasının "talep sahibi"
    // koluyla kısıtlı client'ta da TÜM teklifleri görür → bu özet düzeltme
    // öncesi de doğruydu. Aşağıdaki iki satır bypass'ı KORUMAZ; yalnız
    // sahip için kullanıcıya görünen bir belirti OLMADIĞINI belgeler.
    const ownerOk = await viewAsOwner(production().service, owner.auth, listing.id);
    expect(ownerOk.isOwner).toBe(true);
    expect(ownerOk.english).toMatchObject({ currentBest: BEST, bidCount: 3 });
    const ownerPre = await viewAsOwner(preFix().service, owner.auth, listing.id);
    expect(ownerPre.english).toMatchObject({ currentBest: BEST, bidCount: 3 });

    // (b) düzeltme öncesi: kısıtlı client teklifçi bağlamında yalnız KENDİ
    // teklifini gösterir → "en iyi fiyat" kendi fiyatı, sıra hep 1.
    const bug = await viewAsBidder(preFix().service, viewer.auth, listing.id);
    expect(bug.auctionView).toMatchObject({
      bestTotal: MINE,
      myRank: 1,
      participantCount: 1,
    });
    expect(bug.english).toMatchObject({ currentBest: MINE, bidCount: 1 });
  });

  it("KANIT-ÇİFTİ (kalemli + çok birimli, BEST_AND_OWN_RANK): canlıda en iyi = USD'li tam kapsamlı rakip (TRY karşılığıyla), daha ucuz KISMİ teklif kıyasa girmez, sıram 2/2; iki yuvada kısıtlı client → kendi fiyatım + sıra 1", async () => {
    // Gerçekçi senaryo: 2 kalemli talep, açılış kur damgası USD=30.
    //  - X: 37.03 USD (≈1110,90 TRY), iki kalem fiyatlı → EN İYİ
    //  - Y: 999.99 TRY ama yalnız 1 kalem fiyatlı → KISMİ, kıyas dışı
    //    (süzgeç rakibin listing_bid_items satırlarını bypass ile okur)
    //  - Z (izleyen): 3333.33 TRY, iki kalem fiyatlı → 2/2
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const x = await makeCompanyWithUser(prisma, { country: "TR" });
    const y = await makeCompanyWithUser(prisma, { country: "TR" });
    const viewer = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      format: "ENGLISH_AUCTION",
      bidVisibility: "BEST_AND_OWN_RANK",
      closesAt: FUTURE,
      publishedAt: new Date(),
      auctionRateSnapshot: { USD: "30" },
    });
    const i1 = await makeItem(prisma, listing.id, { lineNo: 1 });
    const i2 = await makeItem(prisma, listing.id, { lineNo: 2 });
    const full = (p: string) => [
      { itemId: i1.id, unitPrice: p },
      { itemId: i2.id, unitPrice: p },
    ];
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: x.company.id,
      createdById: x.user.id,
      amount: "37.03",
      currency: "USD",
      items: full("18.5"),
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: y.company.id,
      createdById: y.user.id,
      amount: "999.99",
      items: [{ itemId: i1.id, unitPrice: "999.99" }],
    });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: viewer.company.id,
      createdById: viewer.user.id,
      amount: MINE,
      items: full("1666.66"),
    });

    const ok = await viewAsBidder(production().service, viewer.auth, listing.id);
    expect(ok.auctionView).toEqual({
      bestTotal: "37.03",
      bestCurrency: "USD", // tutar KENDİ biriminde; sıralama TRY-normalize
      myRank: 2,
      participantCount: 2, // kısmi Y sayılmaz
      allBids: null,
    });
    expect(JSON.stringify(ok)).not.toContain("999.99");

    const bug = await viewAsBidder(preFix().service, viewer.auth, listing.id);
    expect(bug.auctionView).toMatchObject({
      bestTotal: MINE,
      bestCurrency: "TRY",
      myRank: 1,
      participantCount: 1,
    });
  });

  it("KANIT-ÇİFTİ (ALL): canlıda üç tutar sıralı ve KİMLİKSİZ, yalnız kendi satırım isMine; iki yuvada kısıtlı client → liste yalnız kendi satırım", async () => {
    const { x, y, viewer, listing } = await auctionFixture("ALL");

    const ok = await viewAsBidder(production().service, viewer.auth, listing.id);
    expect(ok.auctionView?.allBids).toEqual([
      { rank: 1, total: BEST, currency: "TRY", isMine: false },
      { rank: 2, total: MID, currency: "TRY", isMine: false },
      { rank: 3, total: MINE, currency: "TRY", isMine: true },
    ]);
    expect(ok.auctionView?.myRank).toBe(3);
    // Kapalı zarf: ALL modunda bile rakip KİMLİĞİ yanıtta yok.
    const json = JSON.stringify(ok);
    for (const rival of [x, y]) {
      expect(json).not.toContain(rival.company.id);
      expect(json).not.toContain(rival.company.name);
    }

    const bug = await viewAsBidder(preFix().service, viewer.auth, listing.id);
    expect(bug.auctionView?.allBids).toEqual([
      { rank: 1, total: MINE, currency: "TRY", isMine: true },
    ]);
  });

  it("GÖRÜNÜRLÜK KAPISI (OWN_RANK): canlıda gerçek sıram (3) açılır ama rakip tutarı yanıtın HİÇBİR yerinde yok (özet dahil); iki yuvada kısıtlı client → sıra hep 1", async () => {
    const { viewer, listing } = await auctionFixture("OWN_RANK");

    const ok = await viewAsBidder(production().service, viewer.auth, listing.id);
    expect(ok.auctionView).toEqual({
      bestTotal: null,
      bestCurrency: null,
      myRank: 3,
      participantCount: 3,
      allBids: null,
    });
    // Özet okuması (englishAgg) bypass ile tüm teklifleri okusa da
    // `englishForBidder` en iyiyi auctionView'dan (null) ezer.
    expect(ok.english).toMatchObject({ currentBest: null, currentBestCurrency: null });
    const json = JSON.stringify(ok);
    expect(json).not.toContain(BEST);
    expect(json).not.toContain(MID);

    // (b) canlı belirti: sıra hep 1 (yalnız kendi teklifi görünür).
    const bug = await viewAsBidder(preFix().service, viewer.auth, listing.id);
    expect(bug.auctionView?.myRank).toBe(1);
    expect(bug.auctionView?.participantCount).toBe(1);
  });

  it("GÖRÜNÜRLÜK KAPISI (OWN_ONLY): özet okuması (englishAgg) rakip teklifleri bypass ile okusa da detay HİÇBİR rakip bilgisi döndürmez — KONTROL: aynı fikstür BEST_PRICE'a çevrilince rakibin fiyatı görünür (gizleyen kapı, RLS değil)", async () => {
    // OWN_ONLY'de computeAuctionView sorgu atmadan null döner; rakip
    // teklifleri belleğe alan TEK okuma englishAgg'dir (bkz. KABLO KONTROLÜ).
    const { viewer, listing } = await auctionFixture("OWN_ONLY");
    const { service } = production();

    const hidden = await viewAsBidder(service, viewer.auth, listing.id);
    expect(hidden.auctionView).toBeNull();
    expect(hidden.english).toMatchObject({
      isEnglishAuction: true,
      currentBest: null,
      currentBestCurrency: null,
      bidCount: 0,
    });
    const json = JSON.stringify(hidden);
    expect(json).not.toContain(BEST);
    expect(json).not.toContain(MID);

    // KONTROL yarısı: veri canlı kablolamada ERİŞİLEBİLİR — kapı açılınca
    // rakibin fiyatı gelir. Yani OWN_ONLY'deki yokluk kapıdan, RLS'ten değil.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { bidVisibility: "BEST_PRICE" },
    });
    const open = await viewAsBidder(service, viewer.auth, listing.id);
    expect(open.auctionView).toMatchObject({ bestTotal: BEST, myRank: null });
    expect(open.english).toMatchObject({ currentBest: BEST, bidCount: 3 });
  });

  it("KABLO KONTROLÜ (belirti DEĞİL): teklifçi getOne'da SUBMITTED teklif okumalarının İKİSİ de (computeAuctionView + englishAgg özeti) bypass yuvasından gider, kısıtlı client'a HİÇ düşmez; OWN_ONLY'de yalnız özet okuması kalır", async () => {
    // englishAgg hunk'ı geri alınırsa kullanıcıya görünen hiçbir şey değişmez
    // (bkz. başlık) — bu test yalnız YUVAYI sabitleyen tel kopması uyarısıdır.
    const submittedReads = (calls: Call[], listingId: string) =>
      calls.filter(
        (c) =>
          c.model === "listingBid" &&
          c.op === "findMany" &&
          c.args?.where?.listingId === listingId &&
          c.args?.where?.status === "SUBMITTED",
      );
    // computeAuctionView okuması bidderCompanyId seçer (isMine/myRank için);
    // özet okuması seçmez — iki hunk ayrı ayrı ayırt edilir.
    const kinds = (calls: Call[]) =>
      calls
        .map((c) => (c.args?.select?.bidderCompanyId ? "auctionView" : "englishAgg"))
        .sort();

    const ranked = await auctionFixture("BEST_AND_OWN_RANK");
    const tenant1: Call[] = [];
    const bypass1: Call[] = [];
    const s1 = buildService(recording(rls, tenant1), recording(prisma, bypass1)).service;
    const v1 = await viewAsBidder(s1, ranked.viewer.auth, ranked.listing.id);
    expect(v1.auctionView?.myRank).toBe(3); // Proxy davranışı değiştirmedi
    // Boş-geçme koruması: kısıtlı client'taki kayıt CANLI — teklifçinin kendi
    // teklifi (myBid, listingBid.findUnique) oradan okunur ve kaydedilir; yani
    // aşağıdaki "kısıtlı client'ta 0 SUBMITTED okuması" anlamlı bir sıfırdır.
    expect(
      tenant1.some((c) => c.model === "listingBid" && c.op === "findUnique"),
    ).toBe(true);
    expect(kinds(submittedReads(bypass1, ranked.listing.id))).toEqual([
      "auctionView",
      "englishAgg",
    ]);
    expect(submittedReads(tenant1, ranked.listing.id)).toHaveLength(0);

    const ownOnly = await auctionFixture("OWN_ONLY");
    const tenant2: Call[] = [];
    const bypass2: Call[] = [];
    const s2 = buildService(recording(rls, tenant2), recording(prisma, bypass2)).service;
    const v2 = await viewAsBidder(s2, ownOnly.viewer.auth, ownOnly.listing.id);
    expect(v2.auctionView).toBeNull();
    expect(kinds(submittedReads(bypass2, ownOnly.listing.id))).toEqual(["englishAgg"]);
    expect(submittedReads(tenant2, ownOnly.listing.id)).toHaveLength(0);
  });
});

describe("R-3 — teslim adresi: teklif verebilen tedarikçi sahibin adresini görür", () => {
  const ADDRESS_LINE = "Organize Sanayi 7. Cad. No:12-R3";
  const PHONE = "+90 262 555 01 23";
  // FATURA adresi: aynı bypass okumasıyla belleğe gelir, teklifçiye ASLA dönmez.
  const BILLING_LINE = "Vergi Blv. No:99-R3FATURA";
  const TAX_OFFICE = "R3 Kurumlar VD";
  const TAX_NUMBER = "9876543210";

  /** PUBLIC ALIM talebi, sahibin teslim + fatura adresi bağlı. */
  async function listingWithAddress() {
    const owner = await makeCompanyWithUser(prisma, { country: "TR", name: "R3-Sahip" });
    const addr = await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        title: "Ana Depo",
        type: "TESLIMAT",
        addressLine: ADDRESS_LINE,
        city: "Kocaeli",
        country: "TR",
        contactName: "Depo Sorumlusu",
        phone: PHONE,
      },
    });
    const billing = await prisma.companyAddress.create({
      data: {
        companyId: owner.company.id,
        title: "Merkez Fatura",
        type: "FATURA",
        addressLine: BILLING_LINE,
        city: "İstanbul",
        country: "TR",
        taxOffice: TAX_OFFICE,
        taxNumber: TAX_NUMBER,
      },
    });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      publishedAt: new Date(),
      deliveryAddressId: addr.id,
      billingAddressId: billing.id,
    });
    return { owner, listing };
  }

  /** Fatura PII'si (adres satırı, vergi dairesi/no) yanıtın hiçbir yerinde yok. */
  const expectNoBillingPii = (response: unknown) => {
    const json = JSON.stringify(response);
    expect(json).not.toContain(BILLING_LINE);
    expect(json).not.toContain(TAX_OFFICE);
    expect(json).not.toContain(TAX_NUMBER);
  };

  it("KANIT-ÇİFTİ: canBid'li tedarikçi (GOLD, PUBLIC) kendi bağlamında teslim adresini görür ama FATURA adresini/vergi no'yu görmez; iki yuvada kısıtlı client → adres HEP boş (canlı belirti)", async () => {
    const { listing } = await listingWithAddress();
    const supplier = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });

    const ok = await viewAsBidder(production().service, supplier.auth, listing.id);
    expect(ok.canBid).toBe(true);
    expect(ok.deliveryAddress).toMatchObject({
      title: "Ana Depo",
      addressLine: ADDRESS_LINE,
      city: "Kocaeli",
      contactName: "Depo Sorumlusu",
      phone: PHONE,
    });
    // Genişleme yok: bypass fatura satırını da okur (addrIds), yanıta koymaz.
    expectNoBillingPii(ok);

    // (b) düzeltme öncesi: kısıtlı client tedarikçi bağlamında sahibin
    // company_addresses satırını göremez → canBid true iken adres null.
    const bug = await viewAsBidder(preFix().service, supplier.auth, listing.id);
    expect(bug.canBid).toBe(true);
    expect(bug.deliveryAddress).toBeNull();
  });

  it("canBid KAPISI DEĞİŞMEDİ: teklif veremeyen tedarikçi (doğrulanmamış, bağsız, eski teklifi olduğu için talebi açabiliyor) adresi ALMAZ — KONTROL: aynı talepte canBid'li tedarikçi alır", async () => {
    const { listing } = await listingWithAddress();
    // Sınırlı (doğrulanmamış) + bağsız + davetsiz → canBid=false; eski (geri çekilmiş)
    // teklifi olduğu için `hidden` istisnası talebi AÇTIRIR (403 değil).
    const free = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    await makeBid(prisma, {
      listingId: listing.id,
      bidderCompanyId: free.company.id,
      createdById: free.user.id,
      amount: 500,
      status: "WITHDRAWN",
    });
    const paid = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const { service } = production();

    const gated = await viewAsBidder(service, free.auth, listing.id);
    expect(gated.canBid).toBe(false);
    expect(gated.deliveryAddress).toBeNull();
    // PII yanıtın başka bir yerinden de sızmaz (teslim + fatura).
    const json = JSON.stringify(gated);
    expect(json).not.toContain(ADDRESS_LINE);
    expect(json).not.toContain(PHONE);
    expectNoBillingPii(gated);

    // KONTROL: aynı talep + aynı kablolama → canBid'li tedarikçi adresi görür
    // (adres bypass ile ERİŞİLEBİLİR; null'u üreten canBid kapısıdır).
    const open = await viewAsBidder(service, paid.auth, listing.id);
    expect(open.canBid).toBe(true);
    expect(open.deliveryAddress?.addressLine).toBe(ADDRESS_LINE);
    expectNoBillingPii(open);
  });

  it("KAPSAM SÜZGECİ: talebe BAŞKA firmanın adres id'si yazılmış olsa bile canBid'li tedarikçiye dönmez (RLS artık bu okumada yok; tek engel `companyId: listing.companyId`) — KONTROL: aynı sahip + aynı kablolamada kendi adresi görünür", async () => {
    const { owner } = await listingWithAddress();
    const third = await makeCompanyWithUser(prisma, { country: "TR", name: "R3-Ucuncu" });
    const FOREIGN_LINE = "Yabanci Firma Sok. No:5-R3YABANCI";
    const FOREIGN_PHONE = "+90 212 555 99 88";
    const foreign = await prisma.companyAddress.create({
      data: {
        companyId: third.company.id,
        title: "Yabancı Depo",
        type: "TESLIMAT",
        addressLine: FOREIGN_LINE,
        city: "İstanbul",
        country: "TR",
        contactName: "Başka Firma Yetkilisi",
        phone: FOREIGN_PHONE,
      },
    });
    // Servis yazma yolu (assertListingAddressesOwned) bunu reddeder; eski/bozuk
    // veri ya da gelecekteki bir yazma açığı senaryosu → owner ile doğrudan.
    const tainted = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      publishedAt: new Date(),
      deliveryAddressId: foreign.id,
    });
    const supplier = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD" });
    const { service } = production();

    const view = await viewAsBidder(service, supplier.auth, tainted.id);
    expect(view.canBid).toBe(true);
    expect(view.deliveryAddress).toBeNull();
    const json = JSON.stringify(view);
    expect(json).not.toContain(FOREIGN_LINE);
    expect(json).not.toContain(FOREIGN_PHONE);

    // KONTROL: aynı sahibin kendi adresli talebi aynı tedarikçiye görünür →
    // null'u üreten okumanın kapalı olması değil, kapsam süzgecidir.
    const own = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      publishedAt: new Date(),
      deliveryAddressId: (
        await prisma.companyAddress.findFirstOrThrow({
          where: { companyId: owner.company.id, type: "TESLIMAT" },
        })
      ).id,
    });
    const control = await viewAsBidder(service, supplier.auth, own.id);
    expect(control.deliveryAddress?.addressLine).toBe(ADDRESS_LINE);
  });
});

describe("R-7 — bağlamsız (cron) yolda sahibin AKTİF bağlantıları bulunur", () => {
  /**
   * PUBLIC ∧ OPEN ∧ yayınlanmış ∧ embargosuz talep (gizli AI eşleşmesinin ön
   * şartı). Üç sınırlı (doğrulanmamış → AI'ya önerilemez, "gizli" havuz) aday:
   *  - connected: sahiple AKTİF + geçerli bağlantı (davetçi GOLD) → ATLANMALI
   *  - pending:   sahiple yalnız PENDING bağlantı → ACTIVE süzgeci korunmalı, alır
   *  - stranger:  bağsız → alır
   *
   * NEDEN DOĞRUDAN ÇAĞRI: gerçek çağıran `DiscoveryRunsService.process`
   * adayları `SupplierDiscoveryService.discoverRegisteredFor`dan alır ve o
   * zaten AKTİF bağlantıları (bypass okuyucusuyla) düşürür — olağan akışta
   * bağlı firma buraya hiç gelmez. Bu test `notifyHiddenAiMatches`in KENDİ
   * "bağlıyı atla" sözleşmesini (derinlik savunması) bağlamsız sabitler.
   */
  async function hiddenMatchFixture() {
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD", name: "R7-Sahip" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      publishedAt: new Date(),
      bidsOpenAt: null,
    });
    const connected = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    const pending = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    const stranger = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    await connect(prisma, owner.company.id, connected.company.id, owner.user.id);
    await prisma.companyConnection.create({
      data: {
        inviterCompanyId: owner.company.id,
        inviteeCompanyId: pending.company.id,
        invitedById: owner.user.id,
        status: "PENDING",
      },
    });
    return { owner, listing, connected, pending, stranger };
  }

  /** Kullanıcı-görünür sonuç: kime e-posta + kime uygulama içi bildirim gitti. */
  async function outcome(
    email: { send: jest.Mock },
    f: Awaited<ReturnType<typeof hiddenMatchFixture>>,
  ) {
    await settle(); // ateşle-unut e-posta zinciri bitsin (bkz. buildService)
    const mailedTo = new Set(
      email.send.mock.calls.map((c) => (c[0] as { to: { email: string } }).to.email),
    );
    const notified = new Set(
      (
        await prisma.notification.findMany({
          where: {
            type: AI_MATCH_LOCKED_CONTEXT,
            companyId: {
              in: [f.connected.company.id, f.pending.company.id, f.stranger.company.id],
            },
          },
          select: { companyId: true },
        })
      ).map((n) => n.companyId),
    );
    const who = (c: { company: { id: string }; user: { email: string } }) => ({
      mailed: mailedTo.has(c.user.email),
      notified: notified.has(c.company.id),
    });
    return {
      connected: who(f.connected),
      pending: who(f.pending),
      stranger: who(f.stranger),
    };
  }

  it("KANIT-ÇİFTİ (notifyHiddenAiMatches): gizli AI eşleşmesi (bağlam YOK) bağlı sınırlı (doğrulanmamış) firmayı atlar — ona 'firmanızı doğrulayın' e-postası/bildirimi gitmez; iki yuvada kısıtlı client → bağlantı görünmez, ona da gider (canlı belirti)", async () => {
    // (a) canlı kablolama — runWithTenantContext YOK (cron/sistem yolu).
    const fa = await hiddenMatchFixture();
    const prod = production();
    const sentOk = await prod.service.notifyHiddenAiMatches(fa.listing.id, [
      fa.connected.company.id,
      fa.pending.company.id,
      fa.stranger.company.id,
    ]);
    expect(sentOk).toBe(2);
    expect(await outcome(prod.email, fa)).toEqual({
      connected: { mailed: false, notified: false }, // AKTİF bağlantı → atlandı
      pending: { mailed: true, notified: true }, // PENDING bağlantı sayılmaz
      stranger: { mailed: true, notified: true },
    });

    // (b) düzeltme öncesi: bağlamsız kısıtlı client company_connections'ı
    // HİÇ göremez → bağlantı listesi boş → bağlı firma da hedef olur.
    const fb = await hiddenMatchFixture();
    const bug = preFix();
    const sentBug = await bug.service.notifyHiddenAiMatches(fb.listing.id, [
      fb.connected.company.id,
      fb.pending.company.id,
      fb.stranger.company.id,
    ]);
    expect(sentBug).toBe(3);
    expect((await outcome(bug.email, fb)).connected).toEqual({
      mailed: true,
      notified: true,
    });
  });

  /**
   * Kategori duyurusu: PUBLIC ALIM talebi + satış ana segmenti uyan iki
   * sınırlı (saklı kademe STANDART, DOĞRULANMAMIŞ) firma:
   *  - connected: sahiple AKTİF + geçerli bağlantı, DAVETLİ DEĞİL → talebi
   *    görebilir, AÇIK metin + talep bağlantısı almalı
   *  - stranger:  bağsız → KİLİTLİ metin + doğrulama sayfası (KONTROL: her iki kablolamada)
   * Olağan akışta `announceListingOpen` önce `autoInviteConnections` ile
   * bağlı firmayı davet eder ve duyurudan çıkarır; burada duyuru tek başına
   * (bağlamsız) çağrılır → metodun `ownerConnected` sözleşmesi sınanır.
   * Her fikstür kendi segmentini kullanır → iki yarının adayları karışmaz.
   */
  async function categoryMatchFixture(categoryCode: string) {
    const segment = `${categoryCode.slice(0, 2)}000000`;
    const owner = await makeCompanyWithUser(prisma, { country: "TR", tier: "GOLD", name: "R7-KatSahip" });
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "OPEN",
      visibility: "PUBLIC",
      closesAt: FUTURE,
      publishedAt: new Date(),
      categoryIds: [categoryCode],
    });
    const connected = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    const stranger = await makeCompanyWithUser(prisma, { country: "TR", ...LIMITED });
    for (const c of [connected, stranger]) {
      await prisma.company.update({
        where: { id: c.company.id },
        data: { sellerCategoryIds: [segment] },
      });
    }
    await connect(prisma, owner.company.id, connected.company.id, owner.user.id);
    return { owner, listing, connected, stranger };
  }

  /** Kullanıcı-görünür sonuç: e-posta CTA'sı + uygulama içi bildirimin talep bağlantısı. */
  async function categoryOutcome(
    email: { send: jest.Mock },
    f: Awaited<ReturnType<typeof categoryMatchFixture>>,
  ) {
    await settle();
    const ctaOf = (addr: string) =>
      email.send.mock.calls
        .map((c) => c[0] as { to: { email: string }; templateData: { data: { ctaUrl?: string } } })
        .filter((m) => m.to.email === addr)
        .map((m) => m.templateData.data.ctaUrl ?? "");
    const rows = await prisma.notification.findMany({
      where: {
        type: "listing_category_match",
        companyId: { in: [f.connected.company.id, f.stranger.company.id] },
      },
      select: { companyId: true, listingId: true, ctaUrl: true },
    });
    const who = (c: { company: { id: string }; user: { email: string } }) => {
      const ctas = ctaOf(c.user.email);
      const inApp = rows.filter((r) => r.companyId === c.company.id);
      return {
        emails: ctas.length,
        // AÇIK: talebe doğrudan bağlantı; KİLİTLİ: firma doğrulama sayfası
        // (ücretsiz dönem — Paketler sayfası yok, hiçbir CTA oraya gitmez).
        emailOpen: ctas.some((u) => u.includes(`/company/ilan/${f.listing.id}`)),
        emailLocked: ctas.some((u) => u.includes(VERIFY_PATH)),
        emailPackages: ctas.some((u) => u.includes("/company/premium")),
        inAppLinksListing: inApp.some((r) => r.listingId === f.listing.id),
        inAppLocked: inApp.some((r) => (r.ctaUrl ?? "").includes(VERIFY_PATH)),
        inAppPackages: inApp.some((r) => (r.ctaUrl ?? "").includes("/company/premium")),
      };
    };
    return { connected: who(f.connected), stranger: who(f.stranger) };
  }

  it("KANIT-ÇİFTİ (notifyCategoryMatchedCompanies): kategori duyurusu (bağlam YOK) bağlı sınırlı (doğrulanmamış) firmaya AÇIK metni + talep bağlantısını yollar; iki yuvada kısıtlı client → bağlantı görünmez, KİLİTLİ 'firmanızı doğrulayın' metni gider (canlı belirti) — KONTROL: bağsız sınırlı firma iki kablolamada da kilitli", async () => {
    const locked = {
      emails: 1,
      emailOpen: false,
      emailLocked: true,
      emailPackages: false,
      inAppLinksListing: false,
      inAppLocked: true,
      inAppPackages: false,
    };

    // (a) canlı kablolama — bağlam YOK.
    const fa = await categoryMatchFixture("27112700");
    const prod = production();
    await prod.service.notifyCategoryMatchedCompanies(fa.listing.id);
    expect(await categoryOutcome(prod.email, fa)).toEqual({
      connected: {
        emails: 1,
        emailOpen: true,
        emailLocked: false,
        emailPackages: false,
        inAppLinksListing: true,
        inAppLocked: false,
        inAppPackages: false,
      },
      stranger: locked,
    });

    // (b) düzeltme öncesi: bağlamsız kısıtlı client bağlantıyı göremez →
    // bağlı firma "sınırlı ve bağsız" sayılır → kilitli metin + doğrulama sayfası.
    const fb = await categoryMatchFixture("26101100");
    const bug = preFix();
    await bug.service.notifyCategoryMatchedCompanies(fb.listing.id);
    expect(await categoryOutcome(bug.email, fb)).toEqual({
      connected: locked,
      stranger: locked,
    });
  });
});
