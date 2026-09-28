/**
 * RLS REGRESYON — panel firma profili + bağlantı kartı (yayın denetimi
 * 2026-09-28, docs/qa-launch-audit-2026-09-28.md "RLS — canlıda var olan hata
 * sınıfı", düzeltme b9ef1089). Canlıda `PrismaService` kısıtlı `rothern_app`
 * rolü + RLS uzantısıdır; firma bağlamında yalnız çağıranın satırları döner.
 * Eski integration testleri owner `prisma`yı İKİ yuvaya da verdiği için bu
 * belirtiler hiç yakalanmadı. Burada servisler PROD kablolamasıyla kurulur:
 * PrismaService yuvası = kısıtlı rol + RLS uzantısı (`rls`), PrismaBypassService
 * yuvası = owner (`prisma`).
 *
 * Koruduğu canlı belirtiler:
 *  - R-2 (YÜKSEK): panelde BAŞKA firmanın profili — firma ÜÇÜNCÜ firmadan
 *    değerlendirme aldıysa sayfa 500 (özet seçimindeki zorunlu `order` ilişkisi,
 *    `company_orders` kısıtlı → izleyene görünmez → Prisma istisnası); ürün
 *    ızgarası boş, sayaç 0. `reviews.listForCompany` aynı 500 sınıfı.
 *  - R-8 (DÜŞÜK): bağlantılar listesi kartında karşı firmanın ürün önizlemesi
 *    (küçük resimler + toplam) hep boş.
 *
 * Her test KANIT-ÇİFTİ: (a) prod kablolaması → kullanıcının görmesi gereken
 * doğru sonuç; (b) AYNI servis iki yuvada da `rls` → düzeltme öncesi belirti
 * (500 / boş ızgara / boş önizleme). (b) fikstürün RLS'i gerçekten
 * tetiklediğinin kanıtıdır — (b) yeşilse (a)'nın yeşili boş bir zafer değildir.
 * DİKKAT: (b) "b9ef1089 geri alındı" değil, "HER bypass okuması kısıtlı
 * istemcide" modelidir; düzeltmenin geri alınmasını yakalayan (a) yarılarıdır.
 * Kapı testinde ek olarak KONTROL yarısı var: aynı veri kapı açılınca görünür →
 * 404'ü veren RLS değil, görünürlük kapısıdır.
 *
 * BYPASS = RLS emniyet ağı YOK: profil/önizleme okumalarını hedef firmaya
 * daraltan tek şey sorgudaki süzgeçlerdir (`companyId`, `targetCompanyId`,
 * `publicProductWhere`). Bu yüzden:
 *  - her testte GÜRÜLTÜ firması (yayında ürünler + dördüncü firmadan
 *    değerlendirme) kurulur ve tam-küme iddiaları (slug listesi, sayaç,
 *    firms/orders) süzgeç düşerse o testin İÇİNDE kırılır — önceki testlerin
 *    artığına bağlı değil (`-t` ile tek başına koşunca da);
 *  - `publicProductWhere`in her koşulu için TEK farklı bir negatif ürün var
 *    (arşiv / vitrinden çekilmiş / slug'sız) + sahibin profil kapısı
 *    (yayında olmayan bağlı firma: ürünleri profilde ve kartta YOK);
 *  - bypass okumasından ÖNCEKİ kapılar (karşılıklı engel iki yönde, ilişkisiz
 *    yayında-olmayan firma) prod kablolamasında 404 kalır.
 *
 * Nest DI: `CompanyReviewsService` bypass'ı `@Optional()` alır: sağlayıcı eksik
 * olsa Nest SESSİZCE `undefined` verir ve servis RLS istemcisine düşer (elle
 * `new X(owner)` bunu yakalayamaz). Bu yüzden gerçek `PrismaModule` ile DI
 * testleri var (reviews + connections). NOT: `@nestjs/testing` bu pakette kurulu
 * değil (paket dosyasına dokunulmaz) → `NestFactory.createApplicationContext` +
 * GERÇEK `PrismaModule`; PrismaService token'ı prod'daki `createInjectablePrisma`
 * fabrikasından (env kısıtlı role yönlendirilir), PrismaBypassService owner'a.
 * DI (b) yarısı bypass token'ını SAĞLAR ama ona kısıtlı RLS istemcisini koyar
 * (düzeltme öncesi grafiğin eşi) — `@Optional` düşüşüne DAYANMAZ; bypass ileride
 * zorunlu bağımlılık yapılırsa da geçerli kalır.
 * KAPSAM SINIRI: kök modül servisi `providers: [X]` ile yeniden bildirir (ağır
 * CompanyAuthModule grafiği kurulmaz). DI testi kurucu metadata'sını + PrismaModule
 * ihracını sınar; üretim modülünün sağlayıcı TANIMI ayrıca metadata ile sabitlenir
 * (`CompanyReviewsModule`/`CompanyConnectionsModule` sınıfın KENDİSİNİ sağlar —
 * `useFactory` ile bypass'ı düşüren özel sağlayıcıya dönerse kırmızı).
 *
 * ROBUST DESEN (rls-isolation.spec ile aynı): beforeEach truncateAll YOK — her
 * test kendi benzersiz firmalarını kurar; afterAll'da kısıtlı istemci ÖNCE
 * kapanır, sonra truncate (deadlock yok, bkz. rls-db.ts).
 */
import "reflect-metadata";
import {
  HttpException,
  Module,
  NotFoundException,
  type INestApplicationContext,
  type Provider,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Prisma, PrismaClient } from "@rothern/db";
import { generateShortCode } from "@rothern/shared";
import { prisma, truncateAll } from "./test-db";
import { TEST_DB_URL } from "./env";
import { invite, makeCompanyWithUser, makeListing } from "./factories";
import { ensureRestrictedRolePassword, makeRestrictedPrisma, restrictedDbUrl } from "./rls-db";
import { createRlsExtension } from "../../src/common/prisma/rls-extension";
import { runWithTenantContext } from "../../src/common/tenant/tenant-context";
import { PrismaModule } from "../../src/common/prisma/prisma.module";
import {
  PrismaBypassService,
  PrismaService,
  createInjectablePrisma,
} from "../../src/common/prisma/prisma.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyConnectionsModule } from "../../src/modules/company-connections/company-connections.module";
import { CompanyConnectionsService } from "../../src/modules/company-connections/services/company-connections.service";
import { CompanyReviewsModule } from "../../src/modules/company-reviews/company-reviews.module";
import { CompanyReviewsService } from "../../src/modules/company-reviews/company-reviews.service";
import { EmailService } from "../../src/modules/email/email.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";

let restricted: PrismaClient;
let rls: ReturnType<PrismaClient["$extends"]>;
const prevFlag = process.env.RLS_ENABLED;

beforeAll(async () => {
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

const R = () => rls as never as PrismaClient;
// Bağlam içinde servis çağrısı (runtime yolu birebir). await İÇERDE olmalı —
// PrismaPromise LAZY, aksi halde sorgu ALS dışında koşar (bkz. Faz 1b).
const asCompany = <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
  runWithTenantContext({ companyId, realm: "company" }, async () => await fn());

// Deterministik zaman damgaları (duvar saatine bağlı değil).
const T0 = new Date("2026-09-01T09:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
// Süresi çoktan dolmuş paket (effectiveTier → STANDART); saatten bağımsız geçmiş.
const LAPSED = new Date("2020-01-01T00:00:00.000Z");

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

type Firm = Awaited<ReturnType<typeof makeCompanyWithUser>>;
const firm = (name?: string) =>
  makeCompanyWithUser(prisma, { tier: "GOLD", ...(name ? { name } : {}) });

/**
 * Profil kapısı (PUBLIC_PROFILE_WHERE: publicEnabled + slug). `enabled: false`
 * → slug VAR ama yayında DEĞİL: kapıdan yalnız `publicEnabled` farkıyla kalır.
 */
async function publish(companyId: string, enabled = true): Promise<string> {
  const slug = `rls-reg-${companyId}`;
  await prisma.company.update({ where: { id: companyId }, data: { publicEnabled: enabled, slug } });
  return slug;
}

/** Panel bağlantıları /company/firma/<RothernID> — biçim `K7X9-3M2P`. */
async function giveRothernId(companyId: string): Promise<string> {
  const rothernId = generateShortCode();
  await prisma.company.update({ where: { id: companyId }, data: { rothernId } });
  return rothernId;
}

/**
 * Vitrindeki ürün — varsayılan hâliyle `publicProductWhere` kapısını geçer
 * (isPublic + isActive + slug; sahibin profil kapısı firmaya bağlı). `over`
 * tek bir koşulu bozmak için.
 */
async function makeProduct(
  companyId: string,
  createdById: string,
  score: number,
  over: Partial<Prisma.CompanyItemUncheckedCreateInput> = {},
) {
  const key = uniq();
  return prisma.companyItem.create({
    data: {
      companyId,
      createdById,
      name: `Ürün ${key}`,
      unit: "adet",
      isActive: true,
      isPublic: true,
      reviewStatus: "APPROVED",
      slug: `urun-${key}`,
      publishedAt: at(score),
      completionScore: score,
      images: [`https://cdn.test/${companyId}/${key}-kapak.jpg`, `https://cdn.test/${companyId}/${key}-2.jpg`],
      ...over,
    },
  });
}
/** Taslak: vitrine hiç çıkmamış (isPublic yok, slug yok). */
const DRAFT = { isPublic: false, reviewStatus: "DRAFT", slug: null, publishedAt: null } as const;

/**
 * `publicProductWhere`in HER ürün koşulu için TEK farklı bir negatif. Skor en
 * yüksek (100) → koşul bypass sorgusundan düşerse ızgaranın/önizlemenin BAŞINA
 * geçer ve tam-küme iddiası kırılır.
 */
async function makeGateNegatives(companyId: string, createdById: string): Promise<void> {
  await makeProduct(companyId, createdById, 100, { isActive: false }); // arşiv, ama isPublic + slug
  await makeProduct(companyId, createdById, 100, { isPublic: false }); // vitrinden çekilmiş, slug duruyor
  await makeProduct(companyId, createdById, 100, { slug: null }); // yayında işaretli, slug'sız
}

/**
 * ÜÇÜNCÜ firmanın hedefe verdiği değerlendirme. Sipariş değerlendiren ↔ hedef
 * arasında (`reviewerIs`: değerlendirenin siparişteki rolü) — izleyen firma
 * siparişin tarafı DEĞİL, yani `company_orders` satırı izleyenin RLS
 * bağlamında GÖRÜNMEZ.
 */
async function thirdPartyReview(
  targetCompanyId: string,
  opts: { rating: number; reviewerIs?: "buyer" | "seller"; showName?: boolean; minute?: number; comment?: string },
) {
  const reviewerIsBuyer = (opts.reviewerIs ?? "buyer") === "buyer";
  const reviewer = await firm(`Değerlendiren ${uniq()}`);
  const order = await prisma.companyOrder.create({
    data: {
      buyerCompanyId: reviewerIsBuyer ? reviewer.company.id : targetCompanyId,
      sellerCompanyId: reviewerIsBuyer ? targetCompanyId : reviewer.company.id,
      amount: new Prisma.Decimal(1000),
      status: "COMPLETED",
      completedAt: at(10),
    },
  });
  await prisma.companyReview.create({
    data: {
      orderId: order.id,
      reviewerCompanyId: reviewer.company.id,
      targetCompanyId,
      rating: opts.rating,
      comment: opts.comment ?? "Zamanında teslim, sorunsuz.",
      showName: opts.showName ?? true,
      createdAt: at(opts.minute ?? 20),
    },
  });
  return { reviewer, order };
}

/**
 * GÜRÜLTÜ: ilgisiz, yayında firma — skoru en yüksek iki vitrin ürünü +
 * DÖRDÜNCÜ firmadan 1 puanlık değerlendirme. Bypass okuması `companyId` /
 * `targetCompanyId` süzgecini kaybederse bunlar hedefin profiline sızar.
 */
async function seedNoise(): Promise<Firm> {
  const noise = await firm(`Gürültü ${uniq()}`);
  await publish(noise.company.id);
  await makeProduct(noise.company.id, noise.user.id, 100);
  await makeProduct(noise.company.id, noise.user.id, 100);
  await thirdPartyReview(noise.company.id, { rating: 1, comment: "Gürültü yorumu" });
  return noise;
}

/** İzleyen (V) + herkese açık hedef (T) + T'ye üçüncü firmadan değerlendirme + gürültü. */
async function seedReviewedTarget() {
  const viewer = await firm();
  const target = await firm();
  const slug = await publish(target.company.id);
  const { reviewer, order } = await thirdPartyReview(target.company.id, { rating: 4 });
  await seedNoise();
  return { viewer, target, slug, reviewer, order };
}

/** Bağlantı satırı (deterministik decidedAt). */
async function link(
  inviter: Firm,
  invitee: Firm,
  opts: { status?: "ACTIVE" | "PENDING"; minute?: number } = {},
) {
  const status = opts.status ?? "ACTIVE";
  return prisma.companyConnection.create({
    data: {
      inviterCompanyId: inviter.company.id,
      inviteeCompanyId: invitee.company.id,
      invitedById: inviter.user.id,
      status,
      origin: "INVITE",
      decidedAt: status === "ACTIVE" ? at(opts.minute ?? 30) : null,
    },
  });
}

/**
 * Kullanıcıya görünen "500" belirtisi. Birincil: HttpException OLMAYAN (Nest
 * 500'e çevirir) ve sınıfı Prisma'nın "tutarsız sorgu sonucu" istisnası
 * (`PrismaClientUnknownRequestError`). Mesaj metnine BAĞLI DEĞİL — Prisma
 * sürümünde yeniden yazılırsa kırılmasın; kök neden aşağıda yapısal olarak
 * (`expectOrderHiddenFromViewer`) kanıtlanır.
 */
async function expectServerError(p: Promise<unknown>): Promise<void> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  expect(err).not.toBeInstanceOf(HttpException);
  expect(err).toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
}

/**
 * Kök neden (yapısal, mesajdan bağımsız): izleyenin bağlamında kısıtlı
 * istemci değerlendirme satırını GÖRÜR (`company_reviews` kısıtlı değil) ama
 * özetin ZORUNLU `order` ilişkisini (`company_orders`, kısıtlı) GÖRMEZ.
 */
async function expectOrderHiddenFromViewer(viewerCompanyId: string, orderId: string): Promise<void> {
  const reviews = await asCompany(viewerCompanyId, () =>
    R().companyReview.findMany({ where: { orderId }, select: { id: true } }),
  );
  const orders = await asCompany(viewerCompanyId, () =>
    R().companyOrder.findMany({ where: { id: orderId }, select: { id: true } }),
  );
  expect(reviews).toHaveLength(1);
  expect(orders).toEqual([]);
}

const expectNotFound = (p: Promise<unknown>) => expect(p).rejects.toBeInstanceOf(NotFoundException);

/** Bağlantı servisi — yan-etki bağımlılıkları sahte; engel servisi prod kablolamasıyla gerçek. */
function connectionsService(bypassSlot: unknown) {
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const blocks = new CompanyBlocksService(R() as never, audit as never, prisma as never);
  return new CompanyConnectionsService(
    R() as never, // PrismaService yuvası — kısıtlı rol + RLS uzantısı (prod)
    bypassSlot as never, // PrismaBypassService yuvası
    blocks,
    { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } as never,
    { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
    { pushToCompany: jest.fn(), pushToUser: jest.fn() } as never,
    audit as never,
    undefined, // views — ziyaret kaydı bu testin konusu değil
    undefined, // translations — ham metin yeterli
  );
}
/** Prod kablolaması: bypass yuvası owner. */
const prodConnections = () => connectionsService(prisma);
/** Düzeltme öncesi: iki yuva da kısıtlı RLS istemcisi. */
const preFixConnections = () => connectionsService(R());

/** Değerlendirme servisi — PrismaService yuvası hep `rls`; bypass yuvası parametre. */
const reviewsService = (bypassSlot: unknown) => new CompanyReviewsService(R() as never, bypassSlot as never);

type ConnectionCards = Awaited<ReturnType<CompanyConnectionsService["list"]>>;
const previewOf = (cards: ConnectionCards, companyId: string) =>
  cards.find((k) => k.company.id === companyId)?.company.productPreview;

/** Owner URL'i + connection_limit=1 (test-db ile aynı gerekçe: TRUNCATE deadlock). */
function ownerDbUrl(): string {
  return TEST_DB_URL.includes("connection_limit=")
    ? TEST_DB_URL
    : `${TEST_DB_URL}${TEST_DB_URL.includes("?") ? "&" : "?"}connection_limit=1`;
}

/**
 * Gerçek Nest bağlamı. PrismaService fabrikası (`createInjectablePrisma`) ve
 * PrismaBypassService kurucu argümansız env okur → süre boyunca env test
 * DB'sine yönlendirilir: DATABASE_URL = kısıtlı rol, DATABASE_URL_BYPASS =
 * owner. Env ancak bağlam KAPANDIKTAN sonra geri yüklenir (Prisma env'i ne zaman
 * okursa okusun doğru URL'i görür). `abortOnError: false` → açılış hatası
 * process.exit yerine istisna. Açılış YARIDA kalırsa (`app` yok → close yok)
 * o ana dek `$connect` olmuş istemciler kaydedilip kapatılır ve hata loglanır —
 * sızan bağlantı afterAll truncate'ini gölgelemesin.
 */
async function withNest<T>(
  meta: { imports?: unknown[]; providers: Provider[] },
  fn: (app: INestApplicationContext) => Promise<T>,
): Promise<T> {
  const prevUrl = process.env.DATABASE_URL;
  const prevBypass = process.env.DATABASE_URL_BYPASS;
  process.env.DATABASE_URL = restrictedDbUrl();
  process.env.DATABASE_URL_BYPASS = ownerDbUrl();
  let app: INestApplicationContext | undefined;
  try {
    class RegressionRootModule {}
    Module({ imports: (meta.imports ?? []) as never[], providers: meta.providers })(RegressionRootModule);
    // Yalnız açılış süresince: onModuleInit'te bağlanan her istemciyi kaydet.
    const opened = new Set<PrismaClient>();
    const realConnect = PrismaClient.prototype.$connect;
    const connectSpy = jest
      .spyOn(PrismaClient.prototype, "$connect")
      .mockImplementation(function (this: PrismaClient) {
        opened.add(this);
        return realConnect.call(this);
      });
    try {
      app = await NestFactory.createApplicationContext(RegressionRootModule, {
        logger: false,
        abortOnError: false,
      });
    } catch (bootErr) {
      // eslint-disable-next-line no-console
      console.error("[rls-regression-profile] Nest bağlamı açılamadı:", bootErr);
      await Promise.allSettled([...opened].map((c) => c.$disconnect()));
      throw bootErr;
    } finally {
      connectSpy.mockRestore();
    }
    return await fn(app);
  } finally {
    // Nest kapanışı PrismaService/PrismaBypassService bağlantılarını keser
    // (onModuleDestroy) → afterAll truncate'i açık kısıtlı bağlantıyla yarışmaz.
    if (app) await app.close();
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    if (prevBypass === undefined) delete process.env.DATABASE_URL_BYPASS;
    else process.env.DATABASE_URL_BYPASS = prevBypass;
  }
}

/**
 * Düzeltme öncesi DI grafiğinin eşi: bypass token'ı SAĞLANIR ama değeri kısıtlı
 * RLS istemcisidir. `@Optional` düşüşüne dayanmaz → bypass zorunlu yapılsa da
 * bu yarı açılır ve belirtiyi üretir.
 */
const preFixPrismaProviders = (): Provider[] => [
  { provide: PrismaService, useFactory: () => createInjectablePrisma() },
  { provide: PrismaBypassService, useFactory: () => createInjectablePrisma() },
];

/** CompanyConnectionsService'in yan-etki bağımlılıkları (DI'de useValue). */
const connectionsSideDeps = (): Provider[] => [
  CompanyBlocksService, // gerçek sınıf — bypass'ı da DI'den alır
  { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(undefined) } },
  { provide: EmailService, useValue: { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) } },
  { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") } },
  { provide: NotificationService, useValue: { pushToCompany: jest.fn(), pushToUser: jest.fn() } },
];

/**
 * DI ön koşulu: izleyenin bağlamında DI'nin verdiği iki istemci üçüncü
 * firmanın siparişini görüyor mu? Prod grafiğinde {service:false, bypass:true}
 * olmalı — aksi hâlde (a)'nın yeşili owner'a bağlanmış bir DI'de boş zafer olurdu.
 */
async function diClientsSeeOrder(app: INestApplicationContext, viewerCompanyId: string, orderId: string) {
  const q = (c: PrismaClient) =>
    asCompany(viewerCompanyId, () => c.companyOrder.findMany({ where: { id: orderId }, select: { id: true } }));
  const service = await q(app.get(PrismaService));
  const bypass = await q(app.get(PrismaBypassService));
  return { service: service.length === 1, bypass: bypass.length === 1 };
}

/** Üretim modülü sınıfın KENDİSİNİ sağlıyor mu (özel useFactory değil)? */
const moduleProviders = (mod: object): unknown[] => Reflect.getMetadata("providers", mod) ?? [];

describe("R-2 — panel firma profili (CompanyConnectionsService.getProfile)", () => {
  it("KANIT-ÇİFTİ: üçüncü firmalardan değerlendirme almış firmanın profili (slug) — prod kablolaması özet (showName=false ad gizli) + yalnız kapıdan geçen ürünlerle açılır; iki yuva RLS → 500 (zorunlu `order` görünmez)", async () => {
    const viewer = await firm();
    const target = await firm();
    const slug = await publish(target.company.id);
    // X: alıcı olarak puanladı, adını açtı. Y: SATICI olarak puanladı (hedef
    // alıcıydı), adını AÇMADI → "Doğrulanmış tedarikçi".
    const x = await thirdPartyReview(target.company.id, { rating: 5, reviewerIs: "buyer", showName: true, minute: 20 });
    const y = await thirdPartyReview(target.company.id, { rating: 3, reviewerIs: "seller", showName: false, minute: 25 });
    const p1 = await makeProduct(target.company.id, target.user.id, 90);
    const p2 = await makeProduct(target.company.id, target.user.id, 60);
    await makeProduct(target.company.id, target.user.id, 99, DRAFT);
    await makeGateNegatives(target.company.id, target.user.id);
    await seedNoise();

    // (a) PROD: izleyen kendi bağlamında hedefin profilini açar → 500 YOK.
    const page = await asCompany(viewer.company.id, () =>
      prodConnections().getProfile(viewer.auth, slug),
    );
    expect(page.connectionStatus).toBe("none"); // ilişkisiz: siparişlerin tarafı değil
    // Değerlendirme özeti: yalnız HEDEFİN iki değerlendirmesi (gürültü yok),
    // rol siparişten türer; ortak ortalamalarının ortalaması (5+3)/2.
    expect(page.profile.rating).toEqual({ avg: 4, count: 2 });
    expect(page.profile.reviewSummary).toMatchObject({
      avg: 4,
      firms: 2,
      orders: 2,
      distribution: { 5: 1, 4: 0, 3: 1, 2: 0, 1: 0 },
    });
    expect(page.profile.reviewSummary.partners).toEqual([
      expect.objectContaining({ name: null, role: "seller", avg: 3, count: 1 }), // en yeni önce
      expect.objectContaining({ name: x.reviewer.company.name, role: "buyer", avg: 5, count: 1 }),
    ]);
    expect(JSON.stringify(page.profile.reviewSummary)).not.toContain(y.reviewer.company.name);
    // Ürün ızgarası dolu, sayaç > 0; taslak + her tek-koşul negatifi + gürültü dışarıda.
    expect(page.productCount).toBe(2);
    expect(page.products.map((p) => p.slug)).toEqual([p1.slug, p2.slug]);

    // (b) DÜZELTME ÖNCESİ (iki yuva RLS): aynı istek → Prisma istisnası = 500.
    await expectServerError(
      asCompany(viewer.company.id, () => preFixConnections().getProfile(viewer.auth, slug)),
    );
    await expectOrderHiddenFromViewer(viewer.company.id, x.order.id);
  });

  it("KANIT-ÇİFTİ: ürün ızgarası — prod kablolaması yalnız hedefin kapıdan geçen ürünlerini ve sayacını döner; iki yuva RLS → ızgara boş, sayaç 0", async () => {
    // Hedefe değerlendirme YOK → (b) patlamaz, ızgara belirtisi tek başına görünür.
    const viewer = await firm();
    const target = await firm();
    const slug = await publish(target.company.id);
    const top = await makeProduct(target.company.id, target.user.id, 95);
    const mid = await makeProduct(target.company.id, target.user.id, 70);
    const low = await makeProduct(target.company.id, target.user.id, 40);
    await makeProduct(target.company.id, target.user.id, 100, DRAFT);
    await makeGateNegatives(target.company.id, target.user.id);
    await seedNoise(); // gürültünün değerlendirmesi de var → targetCompanyId süzgeci de sınanır

    // (a) PROD: vitrinle aynı kapı + sıra (completionScore desc).
    const page = await asCompany(viewer.company.id, () =>
      prodConnections().getProfile(viewer.auth, slug),
    );
    expect(page.productCount).toBe(3);
    expect(page.products.map((p) => p.slug)).toEqual([top.slug, mid.slug, low.slug]);
    expect(page.products[0]!.images[0]).toBe(top.images[0]);
    expect(page.profile.reviewSummary).toMatchObject({ firms: 0, orders: 0 });

    // (b) DÜZELTME ÖNCESİ: `company_items` başka firmanınki → kısıtlı istemci görmez.
    const broken = await asCompany(viewer.company.id, () =>
      preFixConnections().getProfile(viewer.auth, slug),
    );
    expect(broken.products).toEqual([]);
    expect(broken.productCount).toBe(0);
  });

  it("KANIT-ÇİFTİ: bağlı izleyen RothernID ile açar — 'active', CONNECTIONS + davetli PRIVATE talepler görünür, yayında olmayan firmanın ürünleri sahip kapısında kalır, özet döner; iki yuva RLS → 500", async () => {
    const viewer = await firm();
    const target = await firm();
    await link(viewer, target); // izleyen (GOLD) davet etti → GEÇERLİ bağlantı
    // Profil YAYINDA DEĞİL (slug var, publicEnabled yok): panel yalnız ilişki
    // sayesinde açar; ürünler `company: PUBLIC_PROFILE_WHERE` kapısında kalmalı.
    await publish(target.company.id, false);
    const rothernId = await giveRothernId(target.company.id);
    await makeProduct(target.company.id, target.user.id, 90);
    await makeProduct(target.company.id, target.user.id, 80);
    const { reviewer, order } = await thirdPartyReview(target.company.id, { rating: 4 });
    await seedNoise();
    // Talepler: kısıtlı istemcideki hasValidConnection + davet alt sorgusu.
    const own = { companyId: target.company.id, createdById: target.user.id };
    const lConn = await makeListing(prisma, { ...own, visibility: "CONNECTIONS" });
    const lPrivInvited = await makeListing(prisma, { ...own, visibility: "PRIVATE" });
    await invite(prisma, lPrivInvited.id, viewer.company.id, target.user.id);
    const lPub = await makeListing(prisma, { ...own, visibility: "PUBLIC" });
    await makeListing(prisma, { ...own, visibility: "PRIVATE" }); // davetsiz → görünmez

    // (a) PROD: izleyenin bağlamında RothernID ile.
    const page = await asCompany(viewer.company.id, () =>
      prodConnections().getProfile(viewer.auth, rothernId),
    );
    expect(page.profile.rothernId).toBe(rothernId);
    expect(page.connectionStatus).toBe("active");
    expect(page.connected).toBe(true);
    expect(page.listings.map((l) => l.id).sort()).toEqual([lConn.id, lPrivInvited.id, lPub.id].sort());
    expect(page.products).toEqual([]);
    expect(page.productCount).toBe(0);
    expect(page.profile.reviewSummary).toMatchObject({ avg: 4, firms: 1, orders: 1 });
    expect(page.profile.reviewSummary.partners).toEqual([
      expect.objectContaining({ name: reviewer.company.name, role: "buyer" }),
    ]);

    // (b) DÜZELTME ÖNCESİ: bağlı olmak siparişin tarafı olmak değil → yine 500.
    await expectServerError(
      asCompany(viewer.company.id, () => preFixConnections().getProfile(viewer.auth, rothernId)),
    );
    await expectOrderHiddenFromViewer(viewer.company.id, order.id);
  });
});

describe("R-2 — kapılar bypass okumasından ÖNCE (getProfile + listForCompany)", () => {
  it("KANIT-ÇİFTİ + KONTROL: karşılıklı engel (iki yön) ve ilişkisiz yayında-olmayan firma prod kablolamasında 404; kapı açılınca aynı veri görünür; iki yuva RLS → 500", async () => {
    const viewer = await firm();
    // T: yayında, üçüncü firmadan değerlendirilmiş; T izleyeni ENGELLEDİ
    // (izleyen engellenen taraf).
    const t = await firm();
    const tSlug = await publish(t.company.id);
    await makeProduct(t.company.id, t.user.id, 50);
    const { order } = await thirdPartyReview(t.company.id, { rating: 4 });
    const tBlock = await prisma.companyBlock.create({
      data: { blockerCompanyId: t.company.id, blockedCompanyId: viewer.company.id },
    });
    // T2: yayında; İZLEYEN T2'yi engelledi (ters yön).
    const t2 = await firm();
    const t2Slug = await publish(t2.company.id);
    await makeProduct(t2.company.id, t2.user.id, 50);
    const t2Block = await prisma.companyBlock.create({
      data: { blockerCompanyId: viewer.company.id, blockedCompanyId: t2.company.id },
    });
    // H: ilişkisiz ve yayında DEĞİL; değerlendirmesi ve vitrin ürünü var.
    const h = await firm();
    const hCode = await giveRothernId(h.company.id);
    await makeProduct(h.company.id, h.user.id, 50);
    await thirdPartyReview(h.company.id, { rating: 2 });
    await seedNoise();

    const profile = (key: string) =>
      asCompany(viewer.company.id, () => prodConnections().getProfile(viewer.auth, key));
    const reviews = (companyId: string) =>
      asCompany(viewer.company.id, () => reviewsService(prisma).listForCompany(viewer.auth, companyId));

    // (a) PROD: kapılar bypass okumasından önce 404 verir — özet/ürün sızmaz.
    await expectNotFound(profile(tSlug));
    await expectNotFound(reviews(t.company.id));
    await expectNotFound(profile(t2Slug));
    await expectNotFound(reviews(t2.company.id));
    await expectNotFound(profile(hCode));
    await expectNotFound(reviews(h.company.id));

    // KONTROL: kapı açılınca AYNI veri görünür → 404'ü veren kapıdır.
    await prisma.companyBlock.deleteMany({ where: { id: { in: [tBlock.id, t2Block.id] } } });
    await prisma.company.update({ where: { id: h.company.id }, data: { publicEnabled: true } });
    const tPage = await profile(tSlug);
    expect(tPage.profile.reviewSummary).toMatchObject({ avg: 4, firms: 1, orders: 1 });
    expect(tPage.productCount).toBe(1);
    expect(await reviews(t.company.id)).toMatchObject({ avg: 4, firms: 1, orders: 1 });
    const t2Page = await profile(t2Slug);
    expect(t2Page.productCount).toBe(1);
    expect(t2Page.profile.reviewSummary.orders).toBe(0);
    const hPage = await profile(hCode);
    expect(hPage.profile.reviewSummary).toMatchObject({ avg: 2, firms: 1, orders: 1 });
    expect(await reviews(h.company.id)).toMatchObject({ avg: 2, orders: 1 });

    // (b) DÜZELTME ÖNCESİ: engel kalkmış T, iki yuva RLS → 500 (fikstür RLS'i tetikler).
    await expectServerError(
      asCompany(viewer.company.id, () => preFixConnections().getProfile(viewer.auth, tSlug)),
    );
    await expectServerError(
      asCompany(viewer.company.id, () => reviewsService(R()).listForCompany(viewer.auth, t.company.id)),
    );
    await expectOrderHiddenFromViewer(viewer.company.id, order.id);
  });
});

describe("R-2 — CompanyReviewsService.listForCompany (aynı 500 sınıfı)", () => {
  it("KANIT-ÇİFTİ: prod kablolaması yalnız hedefin üçüncü firma değerlendirmesinin özetini döner; iki yuva RLS → 500", async () => {
    const { viewer, target, reviewer, order } = await seedReviewedTarget();

    // (a) PROD: (rls, owner bypass). Gürültü firmasının değerlendirmesi YOK.
    const summary = await asCompany(viewer.company.id, () =>
      reviewsService(prisma).listForCompany(viewer.auth, target.company.id),
    );
    expect(summary).toMatchObject({ avg: 4, firms: 1, orders: 1 });
    expect(summary.partners).toEqual([
      expect.objectContaining({ name: reviewer.company.name, role: "buyer", count: 1 }),
    ]);
    expect(summary.partners[0]!.comments.map((c) => c.comment)).toEqual(["Zamanında teslim, sorunsuz."]);

    // (b) DÜZELTME ÖNCESİ: iki yuva RLS → 500.
    await expectServerError(
      asCompany(viewer.company.id, () =>
        reviewsService(R()).listForCompany(viewer.auth, target.company.id),
      ),
    );
    await expectOrderHiddenFromViewer(viewer.company.id, order.id);
  });

  it("KANIT-ÇİFTİ (Nest DI): gerçek PrismaModule @Optional bypass'ı owner olarak ENJEKTE eder → özet döner; bypass token'ı kısıtlı RLS istemcisiyse → 500", async () => {
    // Üretim modülü sınıfın KENDİSİNİ sağlar → aşağıda sınanan kurucu token'ları geçerli.
    expect(moduleProviders(CompanyReviewsModule)).toContain(CompanyReviewsService);

    const { viewer, target, order } = await seedReviewedTarget();
    const call = (app: INestApplicationContext) =>
      asCompany(viewer.company.id, () =>
        app.get(CompanyReviewsService).listForCompany(viewer.auth, target.company.id),
      );

    // (a) PROD DI grafiği: PrismaModule (createInjectablePrisma + PrismaBypassService).
    await withNest({ imports: [PrismaModule], providers: [CompanyReviewsService] }, async (app) => {
      // Ön koşul: PrismaService GERÇEKTEN kısıtlı RLS istemcisi, bypass owner.
      expect(await diClientsSeeOrder(app, viewer.company.id, order.id)).toEqual({ service: false, bypass: true });
      const summary = await call(app);
      expect(summary).toMatchObject({ avg: 4, firms: 1, orders: 1 });
      expect(summary.partners[0]!.role).toBe("buyer");
    });

    // (b) DÜZELTME ÖNCESİ DI: bypass token'ı VAR ama kısıtlı RLS istemcisi.
    await withNest(
      { providers: [...preFixPrismaProviders(), CompanyReviewsService] },
      async (app) => {
        expect(await diClientsSeeOrder(app, viewer.company.id, order.id)).toEqual({ service: false, bypass: false });
        await expectServerError(call(app));
      },
    );
  });
});

describe("R-8 — bağlantı kartı ürün önizlemesi (CompanyConnectionsService.list)", () => {
  it("KANIT-ÇİFTİ: prod kablolaması karşı firmaların ürün küçük resimlerini + toplamı döner (iki yön; ürün ve sahip kapısı, geçerlilik ve PENDING süzgeci korunur); iki yuva RLS → önizleme hep boş", async () => {
    const viewer = await firm();
    // B: izleyen DAVET ETTİ. 4 vitrin ürünü → ilk 3 kapak + toplam 4; tek-koşul negatifleri dışarıda.
    const b = await firm();
    await publish(b.company.id);
    const b1 = await makeProduct(b.company.id, b.user.id, 90);
    const b2 = await makeProduct(b.company.id, b.user.id, 80);
    const b3 = await makeProduct(b.company.id, b.user.id, 70);
    await makeProduct(b.company.id, b.user.id, 60);
    await makeGateNegatives(b.company.id, b.user.id);
    await link(viewer, b, { minute: 30 });
    // C: izleyeni DAVET ETTİ (C GOLD → bağlantı geçerli). 1 vitrin + 1 taslak.
    const c = await firm();
    await publish(c.company.id);
    const c1 = await makeProduct(c.company.id, c.user.id, 50);
    await makeProduct(c.company.id, c.user.id, 99, DRAFT);
    await link(c, viewer, { minute: 40 });
    // D: izleyen davet etti ama D profilini YAYINLAMADI → kart var, önizleme YOK
    // (sahip kapısı `company: PUBLIC_PROFILE_WHERE` bypass sorgusunda).
    const d = await firm();
    await publish(d.company.id, false);
    await makeProduct(d.company.id, d.user.id, 90);
    await makeProduct(d.company.id, d.user.id, 80);
    await link(viewer, d, { minute: 50 });
    // E: izleyeni davet etti ama STANDART; L: GOLD ama paketi DOLMUŞ → geçersiz, kart YOK.
    const e = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    await publish(e.company.id);
    await makeProduct(e.company.id, e.user.id, 90);
    await link(e, viewer, { minute: 60 });
    const lapsed = await firm();
    await prisma.company.update({ where: { id: lapsed.company.id }, data: { membershipEndAt: LAPSED } });
    await publish(lapsed.company.id);
    await makeProduct(lapsed.company.id, lapsed.user.id, 90);
    await link(lapsed, viewer, { minute: 70 });
    // F: bekleyen (PENDING) davet → aktif bağlantı değil, kart YOK.
    const f = await firm();
    await publish(f.company.id);
    await makeProduct(f.company.id, f.user.id, 90);
    await link(viewer, f, { status: "PENDING" });

    // (a) PROD: izleyen kendi bağlamında bağlantılar listesini açar.
    const cards = await asCompany(viewer.company.id, () =>
      prodConnections().list(viewer.company.id),
    );
    expect(cards.map((k) => k.company.id).sort()).toEqual([b.company.id, c.company.id, d.company.id].sort());
    expect(previewOf(cards, b.company.id)).toEqual({
      thumbnails: [b1.images[0], b2.images[0], b3.images[0]],
      total: 4,
    });
    expect(previewOf(cards, c.company.id)).toEqual({ thumbnails: [c1.images[0]], total: 1 });
    expect(previewOf(cards, d.company.id)).toBeNull();

    // (b) DÜZELTME ÖNCESİ: başka firmanın `company_items`ı görünmez → kartlar
    // (bağlantı satırları iki taraflı policy ile görünür) ama önizleme boş.
    const broken = await asCompany(viewer.company.id, () =>
      preFixConnections().list(viewer.company.id),
    );
    expect(broken.map((k) => k.company.id).sort()).toEqual([b.company.id, c.company.id, d.company.id].sort());
    expect(previewOf(broken, b.company.id)).toBeNull();
    expect(previewOf(broken, c.company.id)).toBeNull();
  });

  it("KANIT-ÇİFTİ (Nest DI, R-8 + R-2): gerçek PrismaModule ile CompanyConnectionsService bypass'ı owner alır → kart önizlemesi dolu, profil özet + ürünlerle açılır; bypass token'ı kısıtlı RLS istemcisiyse → önizleme boş, profil 500", async () => {
    // Üretim modülü sınıfın KENDİSİNİ sağlar → aşağıda sınanan kurucu token'ları geçerli.
    expect(moduleProviders(CompanyConnectionsModule)).toContain(CompanyConnectionsService);

    const { viewer, target, slug, order } = await seedReviewedTarget();
    const p1 = await makeProduct(target.company.id, target.user.id, 90);
    const p2 = await makeProduct(target.company.id, target.user.id, 60);
    await link(viewer, target);
    const svc = (app: INestApplicationContext) => app.get(CompanyConnectionsService);

    // (a) PROD DI grafiği.
    await withNest(
      { imports: [PrismaModule], providers: [CompanyConnectionsService, ...connectionsSideDeps()] },
      async (app) => {
        expect(await diClientsSeeOrder(app, viewer.company.id, order.id)).toEqual({ service: false, bypass: true });
        const cards = await asCompany(viewer.company.id, () => svc(app).list(viewer.company.id));
        expect(previewOf(cards, target.company.id)).toEqual({ thumbnails: [p1.images[0], p2.images[0]], total: 2 });
        const page = await asCompany(viewer.company.id, () => svc(app).getProfile(viewer.auth, slug));
        expect(page.connectionStatus).toBe("active");
        expect(page.profile.reviewSummary).toMatchObject({ avg: 4, firms: 1, orders: 1 });
        expect(page.products.map((p) => p.slug)).toEqual([p1.slug, p2.slug]);
        expect(page.productCount).toBe(2);
      },
    );

    // (b) DÜZELTME ÖNCESİ DI: bypass token'ı kısıtlı RLS istemcisi.
    await withNest(
      { providers: [...preFixPrismaProviders(), CompanyConnectionsService, ...connectionsSideDeps()] },
      async (app) => {
        expect(await diClientsSeeOrder(app, viewer.company.id, order.id)).toEqual({ service: false, bypass: false });
        const cards = await asCompany(viewer.company.id, () => svc(app).list(viewer.company.id));
        expect(cards.map((k) => k.company.id)).toEqual([target.company.id]);
        expect(previewOf(cards, target.company.id)).toBeNull();
        await expectServerError(
          asCompany(viewer.company.id, () => svc(app).getProfile(viewer.auth, slug)),
        );
      },
    );
  });
});
