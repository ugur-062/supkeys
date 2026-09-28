/**
 * YAYIN DENETİMİ 2026-09-28 — RLS REGRESYONU: BAĞLAMSIZ (cron / sistem / admin) YOLLAR.
 * Kayıt: docs/qa-launch-audit-2026-09-28.md, "RLS — canlıda var olan hata sınıfı"
 * (R-4, R-5, R-6). Düzeltme: b9ef1089.
 *
 * Kök: canlıda RLS_ENABLED=true; enjekte edilen PrismaService kısıtlı `rothern_app`
 * rolü + RLS extension'dır. Tenant store YOKSA (cron, sistem, admin) extension
 * passthrough → kısıtlı rol 29 kısıtlı tablonun HİÇBİR satırını görmez: okuma boş,
 * updateMany 0 satır — hata yok, log yok. Mevcut entegrasyon testleri owner
 * `prisma`'yı İKİ slota da verdiği için bu sınıf hiç yakalanmadı. Bu dosya servisleri
 * CANLI kablolamayla kurar: PrismaService slotu = `rls`, PrismaBypassService = owner.
 *
 * Korunan kullanıcı-görünür belirtiler:
 *  - R-5 (ORTA): onaylayıcı kalmayınca dakikalık cron (`fallbackInactiveApprovers` →
 *    `rejectForNoApprover`) isteği reddedemiyordu → istek PENDING'de, talep kazandırma
 *    onayında TAKILI; başlatan haber almıyordu. Aynı cron'un yeniden atama dalı
 *    (uygun onaylayıcı VAR → adım ona geçer, "onayınız bekleniyor" gider) da canlı
 *    kablolamayla sınanır.
 *  - R-6 (ORTA): `blockedCompanyIds` bağlamsız çağrıda [] → engellenen firmaya kapanış /
 *    hatırlatma / davet / kategori duyurusu / AI eşleşme e-postası gidiyordu. Uçtan uca
 *    üç gerçek cron tüketicisi: kapanış (closeExpired), kapanış hatırlatması
 *    (sendClosingReminders), embargolu talebin açılış daveti (announceOpened).
 *  - R-4 (YÜKSEK): SeoIndexService bağlamsız (admin ürün onayı / toplu onay / reddi,
 *    çeviri süpürücüsü) ürünü okuyamıyordu (null) → IndexNow'a ve web tazelemesine
 *    HİÇBİR şey gitmiyordu: onaylanan ürün motorlara duyurulmuyor, reddedilen ürün
 *    önbellek süresi dolana dek vitrinde kalıyordu. Düzeltmeyle görünürlük kapısı
 *    bağlamsız yolda İLK KEZ çalışır → kapalı içerik (reddedilen / vitrini kapalı
 *    firma) IndexNow'a SIZMAMALI.
 *
 * KANIT-ÇİFTİ (her testte): (a) canlı kablolama → doğru sonuç; (b) aynı servis `rls`
 * İKİ slotta (ya da düzeltme öncesi token / satır) → düzeltme öncesi belirti. (b)
 * fikstürün RLS'i GERÇEKTEN tetiklediğini kanıtlar; (a) tek başına yeşil kalamaz.
 *
 * Nest DI: `@nestjs/testing` bu pakette KURULU DEĞİL (paket dosyalarına dokunulmaz) →
 * `NestFactory.createApplicationContext` + GERÇEK `PrismaModule` + GERÇEK
 * `SeoIndexModule`. PrismaModule'ün iki sağlayıcısı env ile canlı kablolamaya
 * bağlanır: DATABASE_URL → kısıtlı rol (+ RLS extension, `createInjectablePrisma`),
 * DATABASE_URL_BYPASS → owner. Böylece hem kurucu-token / modül-fabrikası geri dönüşü
 * (SeoIndexService `PrismaBypassService` → `PrismaService`) hem de `@Optional()`
 * bypass'ın sessizce düşmesi (CompanyBlocksService) yakalanır — elle `new X(owner)`
 * ikisini de göremez. DI yarısının (b)'si: düzeltme öncesi kurucu imzasını taşıyan
 * alt sınıflar (`PreFix*`) AYNI uygulama bağlamında çözülür; tek fark token.
 *
 * ROBUST DESEN (rls-isolation.spec ile aynı): beforeEach truncateAll YOK; her test
 * benzersiz firmalar yaratır ve yalnız kendi kimliklerini doğrular. afterAll: önce
 * kısıtlı/DI bağlantıları kapanır, sonra truncateAll (TRUNCATE ↔ kısıtlı bağlantı
 * ters-kilit yarışı olmasın, bkz. rls-db.ts).
 */
import { Global, Injectable, Module, type INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { CompanyRole, Prisma, PrismaClient } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { TEST_DB_URL } from "./env";
import {
  makeCompany,
  makeCompanyWithUser,
  makeListing,
  makeUser,
  invite,
} from "./factories";
import {
  ensureRestrictedRolePassword,
  makeRestrictedPrisma,
  restrictedDbUrl,
} from "./rls-db";
import { createRlsExtension } from "../../src/common/prisma/rls-extension";
import { PrismaModule } from "../../src/common/prisma/prisma.module";
import {
  PrismaBypassService,
  PrismaService,
} from "../../src/common/prisma/prisma.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { ApprovalsScheduler } from "../../src/modules/company-approvals/approvals.scheduler";
import { CompanyBlocksService } from "../../src/modules/company-blocks/company-blocks.service";
import { CompanyListingsService } from "../../src/modules/company-listings/services/company-listings.service";
import { ListingScheduler } from "../../src/modules/company-listings/schedulers/listing.scheduler";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { AdminProductsService } from "../../src/modules/admin-companies/admin-products.service";
import { ContentTranslationService } from "../../src/modules/content-translation/content-translation.service";
import { SeoIndexModule } from "../../src/modules/seo-index/seo-index.module";
import { SeoIndexService } from "../../src/modules/seo-index/seo-index.service";

/* ------------------------------------------------------------------ */
/* Ortak düzen                                                         */
/* ------------------------------------------------------------------ */

let restricted: PrismaClient | undefined;
let rls: ReturnType<PrismaClient["$extends"]>;
let app: INestApplicationContext | undefined;
const prevFlag = process.env.RLS_ENABLED;

const R = () => rls as never as PrismaClient;
/** DI bağlamı (beforeAll başarısızsa testler burada net hata verir). */
const di = (): INestApplicationContext => {
  if (!app) throw new Error("DI bağlamı kurulamadı (beforeAll)");
  return app;
};

// SEO kanalları AÇIK bir canlı yapılandırma: NODE_ENV=test kuyruğu kapatır,
// localhost/staging IndexNow'u atlar — belirti ancak canlı konakta görünür.
// Dış çağrılar global `fetch` üzerinden ve testte STUB'lıdır (ağ yok).
const WEB = "https://www.rothern.com";
const SEO_ENV: Record<string, string> = {
  NODE_ENV: "production",
  WEB_URL: WEB,
  INDEXNOW_KEY: "rls-regression-key",
  SEO_REVALIDATE_SECRET: "rls-regression-secret",
};
const seoConfig = { get: (k: string) => SEO_ENV[k] } as unknown as ConfigService;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

// DI için yan-etki bağımlılıkları mock; Prisma sağlayıcıları GERÇEK PrismaModule'den.
const diAudit = { log: jest.fn().mockResolvedValue(undefined) };

/**
 * Canlıda ConfigModule ve AuditModule GLOBAL'dir → GERÇEK SeoIndexModule
 * (importsuz, global) bağımlılıklarını buradan çözer. Yalnız yan-etki sağlayıcıları.
 */
@Global()
@Module({
  providers: [
    { provide: ConfigService, useValue: seoConfig },
    { provide: AuditService, useValue: diAudit },
  ],
  exports: [ConfigService, AuditService],
})
class SideEffectGlobalsModule {}

/**
 * DI KANIT-ÇİFTİ'nin (b) yarısı: düzeltme ÖNCESİ kurucu imzaları, AYNI modülde
 * Nest DI ile çözülür — tek fark enjeksiyon token'ı. Böylece DI testinin bir
 * token geri dönüşünü GERÇEKTEN yakaladığı kanıtlanır (src'ye dokunmadan).
 */
// b9ef1089 öncesi: `constructor(private readonly prisma: PrismaService, config)`.
@Injectable()
class PreFixTokenSeoIndexService extends SeoIndexService {
  constructor(prisma: PrismaService, config: ConfigService) {
    super(prisma as unknown as PrismaBypassService, config);
  }
}
// b9ef1089 öncesi: bypass parametresi yok (= @Optional sağlayıcı bulunamadı).
@Injectable()
class PreFixCompanyBlocksService extends CompanyBlocksService {
  constructor(prisma: PrismaService, audit: AuditService) {
    super(prisma, audit);
  }
}

@Module({
  // SeoIndexModule GERÇEK modül: sağlayıcısı ileride fabrikaya dönüp PrismaService
  // geçirse (kurucu token'ı PrismaBypassService kalsa bile) R-4 DI testleri kırılır.
  imports: [PrismaModule, SideEffectGlobalsModule, SeoIndexModule],
  providers: [
    // CompanyBlocksModule CompanyAuthModule'ü çeker (ağır) → servis doğrudan;
    // test edilen şey @Optional bypass'ın PrismaModule'den çözülmesi.
    CompanyBlocksService,
    PreFixTokenSeoIndexService,
    PreFixCompanyBlocksService,
  ],
})
class RlsSystemWiringModule {}

/** Owner URL'i tek bağlantıyla (test-db.ts ile aynı deadlock gerekçesi). */
const ownerUrl = TEST_DB_URL.includes("connection_limit=")
  ? TEST_DB_URL
  : `${TEST_DB_URL}${TEST_DB_URL.includes("?") ? "&" : "?"}connection_limit=1`;

beforeAll(async () => {
  process.env.RLS_ENABLED = "true";
  await ensureRestrictedRolePassword(prisma as never);
  restricted = makeRestrictedPrisma();
  await restricted.$connect();
  rls = restricted.$extends(createRlsExtension());

  // GERÇEK PrismaModule'ü canlı kablolamaya bağla: PrismaService fabrikası
  // (`createInjectablePrisma`) DATABASE_URL'i, PrismaBypassService
  // DATABASE_URL_BYPASS'ı okur. Env yalnız kurulum + bağlanma süresince değişir;
  // motor $connect'te URL'i sabitler (aşağıdaki current_user kontrolü doğrular).
  const prevDb = process.env.DATABASE_URL;
  const prevBypass = process.env.DATABASE_URL_BYPASS;
  process.env.DATABASE_URL = restrictedDbUrl();
  process.env.DATABASE_URL_BYPASS = ownerUrl;
  try {
    app = await NestFactory.createApplicationContext(RlsSystemWiringModule, {
      logger: false,
      // DI hatasında process.abort() yerine fırlat (jest süreci ölmesin).
      abortOnError: false,
    });
  } finally {
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
    if (prevBypass === undefined) delete process.env.DATABASE_URL_BYPASS;
    else process.env.DATABASE_URL_BYPASS = prevBypass;
  }
});

afterAll(async () => {
  if (prevFlag === undefined) delete process.env.RLS_ENABLED;
  else process.env.RLS_ENABLED = prevFlag;
  // Savunmacı sıra: beforeAll yarıda kalsa ya da bir kapanış reddetse bile
  // truncate + owner kapanışı KOŞAR (açık tutamak / artık veri kalmasın).
  // Kısıtlı + DI bağlantıları ÖNCE kapanır → truncate (owner) onlarla yarışmaz.
  try {
    await app?.close().catch(() => undefined);
    await restricted?.$disconnect().catch(() => undefined);
  } finally {
    try {
      await truncateAll();
    } finally {
      await prisma.$disconnect();
    }
  }
});

/**
 * `void` ile başlatılan (özel) async metotların sözlerini yakala ve bekle
 * (setImmediate/saat tahmini yok — deterministik). Tetik fırlatsa da başlamış
 * işler beklenir (test bitince arka planda DB'ye yazan iş kalmasın). Eşzamanlı
 * fırlatan çağrı (sonuç tipi "throw") sessizce "çözülmüş" sayılmaz.
 */
async function awaitVoided<T extends object>(
  obj: T,
  methods: string | string[],
  trigger: () => Promise<unknown>,
): Promise<void> {
  const spies = (Array.isArray(methods) ? methods : [methods]).map((m) =>
    jest.spyOn(obj as never as Record<string, (...a: unknown[]) => Promise<unknown>>, m),
  );
  try {
    await trigger();
  } finally {
    const results = spies.flatMap((s) => s.mock.results);
    for (const s of spies) s.mockRestore();
    expect(results.map((r) => r.type)).toEqual(results.map(() => "return"));
    await Promise.all(results.map((r) => r.value));
  }
}

/**
 * Owner istemcisi; YALNIZ verilen `delegate.metot` çağrıları kısıtlı `rls`e gider
 * ve kayda geçer (argüman + sonuç/hata). Tek bir satırın düzeltme öncesi hâlini
 * birebir kurar ve fikstürün o satıra GERÇEKTEN ulaştığını pozitif kanıtlar.
 */
type RoutedCall = {
  model: string;
  method: string;
  args: { where?: Record<string, unknown>; data?: Record<string, unknown> };
  result?: unknown;
  error?: unknown;
};
function ownerRoutingToRls(routes: Record<string, readonly string[]>) {
  const calls: RoutedCall[] = [];
  const client = new Proxy(prisma, {
    get(target, prop) {
      const value = (target as never as Record<PropertyKey, unknown>)[prop];
      if (typeof prop !== "string" || !(prop in routes)) return value;
      const methods = routes[prop]!;
      const rDelegate = (R() as never as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[prop]!;
      return new Proxy(value as Record<string, unknown>, {
        get(d, m) {
          if (typeof m !== "string" || !methods.includes(m)) return d[m as string];
          return async (args: RoutedCall["args"]) => {
            const rec: RoutedCall = { model: prop, method: m, args };
            calls.push(rec);
            try {
              rec.result = await rDelegate[m]!(args);
              return rec.result;
            } catch (err) {
              rec.error = err;
              throw err;
            }
          };
        },
      });
    },
  });
  return { client, calls };
}

/** CompanyListingsService CANLI kablolamayla (PrismaService=rls, bypass=owner);
 *  yan-etki bağımlılıkları mock (make-service.ts deseni). Engel servisi çağırandan
 *  gelir — R-6'da tek değişken onun bypass slotudur. */
function liveListingsService(blocks: CompanyBlocksService) {
  const email = {
    send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }),
  };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const service = new CompanyListingsService(
    R() as never, // PrismaService
    prisma as never, // PrismaBypassService
    blocks,
    {
      requestApproval: jest.fn().mockResolvedValue({ approved: true }),
      pendingForListing: jest.fn().mockResolvedValue(null),
    } as never,
    {
      getCurrentRate: jest.fn().mockResolvedValue(30),
      getFreshRate: jest.fn().mockResolvedValue(30),
    } as never,
    email as never,
    config as never,
    // In-app bildirim canlıda PrismaService ile yazılır (notifications permissive).
    new NotificationService(R() as never),
    { log: jest.fn().mockResolvedValue(undefined) } as never,
    undefined, // realtime
    undefined, // storage
    undefined, // affinity
    undefined, // seo
    undefined, // translations
  );
  return { service, email };
}

const recipientsOf = (send: jest.Mock) =>
  send.mock.calls.map((c) => (c[0] as { to: { email: string } }).to.email);

/* ------------------------------------------------------------------ */
/* DI kablolamasının kendisi (diğer DI testlerinin öncülü)             */
/* ------------------------------------------------------------------ */

describe("DI kablolaması — gerçek PrismaModule canlıdaki iki istemciyi üretir", () => {
  it("PrismaService = kısıtlı rothern_app (bağlamsız kısıtlı tablo BOŞ), PrismaBypassService = owner", async () => {
    const tenant = di().get(PrismaService) as unknown as PrismaClient;
    const bypass = di().get(PrismaBypassService) as unknown as PrismaClient;
    const [{ u: tenantRole }] = await tenant.$queryRaw<{ u: string }[]>`SELECT current_user AS u`;
    const [{ u: bypassRole }] = await bypass.$queryRaw<{ u: string }[]>`SELECT current_user AS u`;
    expect(tenantRole).toBe("rothern_app");
    // Bypass slotu TAM OLARAK owner rolü (test DB URL'indeki kullanıcı) — "kısıtlı
    // değil" yetmez; başka/beklenmeyen bir role bağlanmak da kırmızı olmalı.
    expect(bypassRole).toBe(decodeURIComponent(new URL(TEST_DB_URL).username));

    // Aynı kısıtlı satırı: DI PrismaService bağlamsız GÖREMEZ, bypass görür.
    const a = await makeCompany(prisma);
    const b = await makeCompany(prisma);
    await prisma.companyBlock.create({
      data: { blockerCompanyId: a.id, blockedCompanyId: b.id },
    });
    const where = { blockerCompanyId: a.id };
    expect(await tenant.companyBlock.findMany({ where })).toEqual([]);
    expect(await bypass.companyBlock.count({ where })).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* R-5 — onaylayıcı kalmayınca otomatik ret (dakikalık cron)           */
/* ------------------------------------------------------------------ */

describe("R-5 — onaylayıcı kalmayınca cron isteği reddeder (PENDING'de takılı kalmaz)", () => {
  function approvalsRig(tenantSlot: unknown, bypassSlot: unknown) {
    // Olay yolu canlıdaki gibi: ret olayı → CompanyListingsService.onAwardRejected
    // (talep IN_AWARD_APPROVAL → IN_AWARD; canlı kablolamayla). `emit` beklenmez →
    // dinleyici sözleri toplanıp test içinde beklenir.
    const listings = liveListingsService(
      new CompanyBlocksService(R() as never, { log: jest.fn() } as never, prisma as never),
    ).service;
    const eventWork: Promise<unknown>[] = [];
    const events = {
      emit: jest.fn((name: string, payload: { listingId: string }) => {
        if (name === "listing.award.rejected") {
          eventWork.push(listings.onAwardRejected(payload));
        }
        return true;
      }),
    };
    const email = {
      send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }),
    };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    const notifications = {
      pushToUser: jest.fn().mockResolvedValue(1),
      pushToCompany: jest.fn().mockResolvedValue(1),
    };
    // AuditService canlıda PrismaService enjekte eder → kısıtlı slotla kurulur.
    const audit = new AuditService(tenantSlot as never);
    const service = new CompanyApprovalsService(
      tenantSlot as never,
      bypassSlot as never,
      events as never,
      email as never,
      config as never,
      notifications as never,
      audit,
    );
    // Cron giriş noktası: @Cron(EVERY_MINUTE) — tenant bağlamı YOK, registry yok.
    const scheduler = new ApprovalsScheduler(service);
    /** Cron'u gerçek giriş noktasından koştur; void'lenen bildirim ve olay işini bekle. */
    const runCron = async () => {
      try {
        await awaitVoided(service, ["notifyRequester", "notifyApprover"], () =>
          scheduler.fallbackInactiveApprovers(),
        );
      } finally {
        await Promise.all(eventWork);
      }
    };
    return { runCron, events, email, notifications };
  }

  /** Tek aktif kullanıcısı başlatan olan firma: iki adımlı kazandırma onayı,
   *  iki onaylayıcı da pasifleşmiş → initiator-dışı uygun onaylayıcı YOK.
   *  `withFallback`: firmada aktif bir ONAYLAYICI daha var (yeniden atama dalı). */
  async function seedStuckAwardApproval(opts: { withFallback?: boolean } = {}) {
    const { company, user: initiator } = await makeCompanyWithUser(prisma);
    const gone1 = await makeUser(prisma, company.id, [CompanyRole.ONAYLAYICI], {
      isActive: false,
    });
    const gone2 = await makeUser(prisma, company.id, [CompanyRole.ONAYLAYICI], {
      isActive: false,
    });
    const fallback = opts.withFallback
      ? await makeUser(prisma, company.id, [CompanyRole.ONAYLAYICI])
      : null;
    const listing = await makeListing(prisma, {
      companyId: company.id,
      createdById: initiator.id,
      status: "IN_AWARD_APPROVAL",
    });
    const req = await prisma.approvalRequest.create({
      data: {
        companyId: company.id,
        listingId: listing.id,
        type: "LISTING_AWARD",
        status: "PENDING",
        amount: new Prisma.Decimal(1000),
        payload: { selections: [] },
        createdById: initiator.id,
        steps: {
          create: [
            { order: 1, approverUserId: gone1.id, status: "PENDING" },
            { order: 2, approverUserId: gone2.id, status: "WAITING" },
          ],
        },
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    return { company, initiator, gone1, fallback, listing, req, firstStepId: req.steps[0]!.id };
  }

  /** Kullanıcının gördüğü durum: istek + adımlar + talebin statüsü. */
  const stateOf = async (requestId: string) => {
    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: {
        steps: { orderBy: { order: "asc" } },
        listing: { select: { status: true } },
      },
    });
    return {
      status: req.status,
      decided: req.decidedAt !== null,
      steps: req.steps.map((s) => s.status),
      listing: req.listing.status,
    };
  };
  const STUCK = {
    status: "PENDING",
    decided: false,
    steps: ["PENDING", "WAITING"],
    listing: "IN_AWARD_APPROVAL",
  };

  it("KANIT-ÇİFTİ: canlı kablolamada istek + PENDING/WAITING adımlar REJECTED, talep değerlendirmeye döner, başlatan haberdar; rls iki slotta (tarama düzeyi) istek PENDING ve talep kazandırma onayında TAKILI", async () => {
    // (a) CANLI kablolama: PrismaService = rls, PrismaBypassService = owner.
    const live = await seedStuckAwardApproval();
    const a = approvalsRig(R(), prisma);
    await a.runCron();
    // İstek + bekleyen/sıradaki adımlar REJECTED; ret olayıyla talep kazandırma
    // onayından çıkıp değerlendirmeye (IN_AWARD) döner — alıcı yeniden karar verir.
    expect(await stateOf(live.req.id)).toEqual({
      status: "REJECTED",
      decided: true,
      steps: ["REJECTED", "REJECTED"],
      listing: "IN_AWARD",
    });
    expect(a.events.emit).toHaveBeenCalledWith(
      "listing.award.rejected",
      expect.objectContaining({
        requestId: live.req.id,
        listingId: live.listing.id,
      }),
    );
    // Başlatan "uygun onaylayıcı yok → reddedildi" e-postasını alır.
    expect(recipientsOf(a.email.send)).toContain(live.initiator.email);
    // Sistem kararının izi (firma aktivite logu) — kısıtlı slotla da yazılır.
    expect(
      await prisma.auditLog.count({
        where: { entityId: live.req.id, action: "company.approval.rejected" },
      }),
    ).toBe(1);

    // (b) rls İKİ slotta → belirti, TARAMA DÜZEYİNDE: approval_request_steps
    // kısıtlı istemcide görünmez, cron hiçbir adımı bulamaz (2026-08-28 öncesi
    // hâl). b9ef1089'un düzelttiği RET YAZIMI birebir bir sonraki testte.
    const stuck = await seedStuckAwardApproval();
    const b = approvalsRig(R(), R());
    await b.runCron();
    expect(await stateOf(stuck.req.id)).toEqual(STUCK);
    expect(b.events.emit).not.toHaveBeenCalledWith(
      "listing.award.rejected",
      expect.objectContaining({ requestId: stuck.req.id }),
    );
  });

  it("düzeltme ÖNCESİ birebir (b9ef1089'un iki satırı): tarama owner'la adımı bulur, ret updateMany'si kısıtlı istemcide 0 satır → istek PENDING, talep onayda takılı", async () => {
    // Bypass owner; YALNIZ approvalRequest/approvalRequestStep.updateMany kısıtlı
    // `rls`e yönlenir — düzeltmenin değiştirdiği iki çağrının eski hâli.
    const routed = ownerRoutingToRls({
      approvalRequest: ["updateMany"],
      approvalRequestStep: ["updateMany"],
    });
    const stuck = await seedStuckAwardApproval();
    const rig = approvalsRig(R(), routed.client);
    await rig.runCron();

    // POZİTİF KANIT: fikstür `rejectForNoApprover`a GERÇEKTEN ulaştı — isteğin ret
    // yazımı kısıtlı istemcide koştu ve 0 satır döndü (sessiz başarısızlık).
    const reqWrite = routed.calls.find(
      (c) => c.model === "approvalRequest" && c.args.where?.id === stuck.req.id,
    );
    expect(reqWrite).toMatchObject({
      method: "updateMany",
      args: { where: { id: stuck.req.id, status: "PENDING" }, data: { status: "REJECTED" } },
      result: { count: 0 },
    });
    expect(reqWrite?.error).toBeUndefined();
    // count !== 1 → erken dönüş: adım yazımına hiç gelinmedi.
    expect(
      routed.calls.some(
        (c) => c.model === "approvalRequestStep" && c.args.where?.requestId === stuck.req.id,
      ),
    ).toBe(false);

    // Kullanıcı-görünür belirti: istek PENDING, talep kazandırma onayında TAKILI.
    expect(await stateOf(stuck.req.id)).toEqual(STUCK);
    expect(rig.events.emit).not.toHaveBeenCalledWith(
      "listing.award.rejected",
      expect.objectContaining({ requestId: stuck.req.id }),
    );
    // Başlatan hiçbir şey öğrenmez (count !== 1 → erken dönüş).
    expect(recipientsOf(rig.email.send)).not.toContain(stuck.initiator.email);
  });

  it("yeniden atama dalı KANIT-ÇİFTİ: uygun onaylayıcı VARSA canlı kablolamada adım ona geçer ve 'onayınız bekleniyor' gider; rls iki slotta adım pasif onaylayıcıda kalır; yalnız yeniden atama yazımı kısıtlı istemcide olsa cron patlar", async () => {
    // (a) CANLI kablolama. Uygunluk sorgusu company_users'ı kısıtlı istemciyle okur
    // (permissive tablo); adım yazımı bypass'la.
    const live = await seedStuckAwardApproval({ withFallback: true });
    const a = approvalsRig(R(), prisma);
    await a.runCron();
    const step = await prisma.approvalRequestStep.findUniqueOrThrow({
      where: { id: live.firstStepId },
    });
    expect(step).toMatchObject({ approverUserId: live.fallback!.id, status: "PENDING" });
    // İstek reddedilmez, talep kazandırma onayında YAŞAYAN bir onaylayıcıyla bekler.
    expect(await stateOf(live.req.id)).toEqual(STUCK);
    expect(recipientsOf(a.email.send)).toContain(live.fallback!.email);
    expect(a.notifications.pushToUser).toHaveBeenCalledWith(
      live.fallback!.id,
      expect.objectContaining({ type: "approval_pending", listingId: live.listing.id }),
    );

    // (b) rls İKİ slotta → tarama düzeyinde belirti: adım pasif onaylayıcıda kalır,
    // yeni onaylayıcı hiçbir şey öğrenmez (zincir sessizce tıkalı).
    const stuck = await seedStuckAwardApproval({ withFallback: true });
    const b = approvalsRig(R(), R());
    await b.runCron();
    expect(
      (await prisma.approvalRequestStep.findUniqueOrThrow({ where: { id: stuck.firstStepId } }))
        .approverUserId,
    ).toBe(stuck.gone1.id);
    expect(recipientsOf(b.email.send)).not.toContain(stuck.fallback!.email);

    // (b') Regresyon tespiti — YALNIZ yeniden atama yazımı (`approvalRequestStep.
    // update`) kısıtlı istemcide olsaydı: satır görünmez → P2025, cron her dakika
    // patlar ve adım yine pasif onaylayıcıda kalır. Aynı (hâlâ tıkalı) fikstür.
    const routed = ownerRoutingToRls({ approvalRequestStep: ["update"] });
    const c = approvalsRig(R(), routed.client);
    await expect(c.runCron()).rejects.toMatchObject({ code: "P2025" });
    const write = routed.calls.find((x) => x.args.where?.id === stuck.firstStepId);
    expect(write).toMatchObject({
      method: "update",
      args: { data: { approverUserId: stuck.fallback!.id } },
    });
    expect(write?.error).toMatchObject({ code: "P2025" });
    expect(
      (await prisma.approvalRequestStep.findUniqueOrThrow({ where: { id: stuck.firstStepId } }))
        .approverUserId,
    ).toBe(stuck.gone1.id);
    expect(recipientsOf(c.email.send)).not.toContain(stuck.fallback!.email);
  });
});

/* ------------------------------------------------------------------ */
/* R-6 — blockedCompanyIds bağlamsız (cron) çağrıda                    */
/* ------------------------------------------------------------------ */

describe("R-6 — engel listesi cron yollarında iki yönde de dolu", () => {
  /** me → iBlocked (ben engelledim), blockedMe → me (beni engelledi); ilgisiz
   *  bystander ↔ iBlocked engeli me'nin listesine SIZMAMALI. */
  async function seedBlocks() {
    const me = await makeCompany(prisma);
    const iBlocked = await makeCompany(prisma);
    const blockedMe = await makeCompany(prisma);
    const bystander = await makeCompany(prisma);
    await prisma.companyBlock.createMany({
      data: [
        { blockerCompanyId: me.id, blockedCompanyId: iBlocked.id },
        { blockerCompanyId: blockedMe.id, blockedCompanyId: me.id },
        { blockerCompanyId: bystander.id, blockedCompanyId: iBlocked.id },
      ],
    });
    return { me, expected: [iBlocked.id, blockedMe.id].sort() };
  }
  const audit = { log: jest.fn() };

  it("KANIT-ÇİFTİ: canlı kablolama iki yönü de döner; rls iki slotta (ve bypass'sız @Optional düşüşü) [] döner", async () => {
    const { me, expected } = await seedBlocks();
    // (a) canlı: new CompanyBlocksService(PrismaService=rls, audit, bypass=owner)
    const live = new CompanyBlocksService(R() as never, audit as never, prisma as never);
    expect((await live.blockedCompanyIds(me.id)).sort()).toEqual(expected);

    // (b) rls İKİ slotta → düzeltme öncesi belirti: liste BOŞ.
    const preFix = new CompanyBlocksService(R() as never, audit as never, R() as never);
    expect(await preFix.blockedCompanyIds(me.id)).toEqual([]);
    // (b') @Optional bypass hiç enjekte edilmezse aynı sessiz düşüş.
    const noBypass = new CompanyBlocksService(R() as never, audit as never);
    expect(await noBypass.blockedCompanyIds(me.id)).toEqual([]);
  });

  it("KANIT-ÇİFTİ (Nest DI): gerçek PrismaModule'den çözülen servis bypass'ı alır; bypass enjekte edilmeyen imza aynı modülde [] döner", async () => {
    const { me, expected } = await seedBlocks();
    // (a) canlı DI: @Optional() bypass PrismaModule'ün PrismaBypassService'inden.
    const svc = di().get(CompanyBlocksService);
    expect((await svc.blockedCompanyIds(me.id)).sort()).toEqual(expected);
    // Kanıt: aynı modülün PrismaService'i bağlamsız bu satırları GÖREMEZ →
    // doğru sonuç ancak PrismaBypassService token'ından gelmiş olabilir.
    const tenant = di().get(PrismaService) as unknown as PrismaClient;
    expect(
      await tenant.companyBlock.findMany({
        where: { OR: [{ blockerCompanyId: me.id }, { blockedCompanyId: me.id }] },
      }),
    ).toEqual([]);
    // (b) aynı DI, bypass'sız imza (sağlayıcı düşse @Optional böyle sessizce
    // kısıtlı istemciye iner) → belirti: liste BOŞ.
    const preFix = di().get(PreFixCompanyBlocksService);
    expect(await preFix.blockedCompanyIds(me.id)).toEqual([]);
  });

  describe("uçtan uca cron tüketicileri (ListingScheduler, gerçek engel servisiyle)", () => {
    function listingsRig(blocksBypassSlot: unknown) {
      // CompanyListingsService CANLI kablolamayla; tek değişken engel servisinin
      // bypass slotu (owner = düzeltme sonrası, rls = düzeltme öncesi).
      const blocks = new CompanyBlocksService(
        R() as never,
        audit as never,
        blocksBypassSlot as never,
      );
      const { service, email } = liveListingsService(blocks);
      // Cron giriş noktası: ListingScheduler (PrismaBypassService = owner).
      const scheduler = new ListingScheduler(prisma as never, service);
      return { service, scheduler, email };
    }

    /** Her tüketici: talebin cron'a girmesi için gereken alanlar, cron giriş
     *  noktası, `void`lenen bildirim metotları, in-app bildirim tipi ve cron'un
     *  talebi GERÇEKTEN işlediğinin damgası. */
    type ListingSeed = {
      status: "OPEN";
      closesAt: Date;
      bidsOpenAt?: Date;
      openNotifiedAt?: null;
      sendClosingReminder?: boolean;
      reminderMinutesBefore?: number;
    };
    type Consumer = {
      name: string;
      listing: () => ListingSeed;
      run: (s: ListingScheduler) => Promise<void>;
      voided: string[];
      type: string;
      processed: (l: {
        status: string;
        closingReminderSentAt: Date | null;
        openNotifiedAt: Date | null;
      }) => boolean;
    };
    const CONSUMERS: Consumer[] = [
      {
        name: "süre dolan talebin kapanışı — closeExpired",
        listing: () => ({ status: "OPEN", closesAt: new Date(Date.now() - 60_000) }),
        run: (s) => s.closeExpired(),
        voided: ["notifyListingClosed"],
        type: "listing_closed",
        processed: (l) => l.status === "IN_AWARD",
      },
      {
        name: "kapanış hatırlatması — sendClosingReminders",
        listing: () => ({
          status: "OPEN",
          closesAt: new Date(Date.now() + 30 * 60_000),
          sendClosingReminder: true,
          reminderMinutesBefore: 60,
        }),
        run: (s) => s.sendClosingReminders(),
        voided: ["notifyListingInvitees"],
        type: "listing_reminder",
        processed: (l) => l.closingReminderSentAt !== null,
      },
      {
        name: "embargolu talebin açılış daveti — announceOpened",
        listing: () => ({
          status: "OPEN",
          bidsOpenAt: new Date(Date.now() - 60_000),
          closesAt: new Date(Date.now() + 24 * 60 * 60_000),
          openNotifiedAt: null,
        }),
        run: (s) => s.announceOpened(),
        // Açılış duyurusu davet + kategori duyurusunu `void` başlatır; ikisi de beklenir.
        voided: ["notifyListingInvitees", "notifyCategoryMatchedCompanies"],
        type: "listing_invitation",
        processed: (l) => l.openNotifiedAt !== null,
      },
    ];

    /** Alıcı O'nun ÖZEL talebi; davetliler: O'nun engellediği B1, O'yu engelleyen
     *  B2, engelsiz kontrol firması C. */
    async function seedInvitedListing(c: Consumer) {
      const owner = await makeCompanyWithUser(prisma);
      const b1 = await makeCompanyWithUser(prisma);
      const b2 = await makeCompanyWithUser(prisma);
      const ctl = await makeCompanyWithUser(prisma);
      await prisma.companyBlock.createMany({
        data: [
          { blockerCompanyId: owner.company.id, blockedCompanyId: b1.company.id },
          { blockerCompanyId: b2.company.id, blockedCompanyId: owner.company.id },
        ],
      });
      const listing = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        visibility: "PRIVATE",
        ...c.listing(),
      });
      for (const p of [b1, b2, ctl]) {
        await invite(prisma, listing.id, p.company.id, owner.user.id);
      }
      return { owner, b1, b2, c: ctl, listing };
    }

    async function runConsumer(
      c: Consumer,
      rig: ReturnType<typeof listingsRig>,
      listingId: string,
    ) {
      // Tüketiciler bildirimi `void` ile başlatır → sözleri yakalayıp bekle.
      await awaitVoided(rig.service, c.voided, () => c.run(rig.scheduler));
      const l = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
      expect(c.processed(l)).toBe(true); // cron talebi gerçekten işledi
      const notified = (
        await prisma.notification.findMany({
          where: { listingId, type: c.type },
          select: { companyId: true },
        })
      ).map((n) => n.companyId);
      return { emailed: recipientsOf(rig.email.send), notified };
    }

    it.each(CONSUMERS)(
      "KANIT-ÇİFTİ ($name): canlıda engellenen iki yöndeki firmaya e-posta/bildirim GİTMEZ (kontrol firmasına gider); engel servisi rls iki slotta → engellenenlere GİDER",
      async (c) => {
        // (a) canlı: engel servisi bypass=owner.
        const f = await seedInvitedListing(c);
        const a = await runConsumer(c, listingsRig(prisma), f.listing.id);
        expect(a.emailed).toContain(f.c.user.email);
        expect(a.emailed).not.toContain(f.b1.user.email);
        expect(a.emailed).not.toContain(f.b2.user.email);
        expect(a.notified).toContain(f.c.company.id);
        expect(a.notified).not.toContain(f.b1.company.id);
        expect(a.notified).not.toContain(f.b2.company.id);

        // (b) engel servisi rls iki slotta (düzeltme öncesi) → belirti: engellenen
        // firmalar e-posta + in-app bildirimi alır.
        const g = await seedInvitedListing(c);
        const b = await runConsumer(c, listingsRig(R()), g.listing.id);
        expect(b.emailed).toEqual(
          expect.arrayContaining([g.b1.user.email, g.b2.user.email, g.c.user.email]),
        );
        expect(b.notified).toEqual(
          expect.arrayContaining([g.b1.company.id, g.b2.company.id, g.c.company.id]),
        );
      },
    );
  });
});

/* ------------------------------------------------------------------ */
/* R-4 — SEO bildirimi bağlamsız çağrıda                               */
/* ------------------------------------------------------------------ */

describe("R-4 — ürün değişikliği IndexNow'a ve web tazelemesine gider (bağlamsız)", () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    // Dış HTTP STUB: hiçbir istek ağa çıkmaz; çağrılar kayıt altında.
    fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 200 }));
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  /** Canlı DI: GERÇEK SeoIndexModule'ün sağlayıcısı (strict — başka modülden değil). */
  const liveSeo = () => di().select(SeoIndexModule).get(SeoIndexService, { strict: true });
  /** Düzeltme öncesi kurucu token'ı (PrismaService), aynı uygulama bağlamında. */
  const preFixSeo = (): SeoIndexService => di().get(PreFixTokenSeoIndexService);

  let seq = 0;
  type ItemOver = Partial<Prisma.CompanyItemUncheckedCreateInput>;
  /** Vitrini açık firmada ürün; varsayılan: admin onayı bekleyen (PENDING) taslak. */
  async function seedProduct(
    opts: { item?: ItemOver; company?: Partial<Prisma.CompanyUncheckedCreateInput> } = {},
  ) {
    const tag = `${Date.now().toString(36)}-${seq++}`;
    const company = await makeCompany(prisma, {
      slug: `rls-seo-${tag}`,
      publicEnabled: true,
      ...opts.company,
    });
    const owner = await makeUser(prisma, company.id, [CompanyRole.SAHIP, CompanyRole.SATISCI]);
    const item = await prisma.companyItem.create({
      data: {
        companyId: company.id,
        createdById: owner.id,
        name: `Çelik boru ${tag}`,
        unit: "adet",
        slug: `celik-boru-${tag}`,
        isActive: true,
        isPublic: false,
        reviewStatus: "PENDING",
        submittedAt: new Date(),
        ...opts.item,
      },
    });
    return { companySlug: company.slug!, itemSlug: item.slug!, item };
  }
  type Seeded = Awaited<ReturnType<typeof seedProduct>>;

  const adminProducts = (seo: SeoIndexService) =>
    new AdminProductsService(
      prisma as never, // PrismaBypassService (admin servisleri zaten bypass)
      { log: jest.fn().mockResolvedValue(undefined) } as never,
      { notifyCompany: jest.fn().mockResolvedValue(undefined) } as never,
      seo,
    );

  /** Kuyruğa atılan (void) hazırlığı bekle, sonra toplu gönderimi hemen tetikle
   *  (5 sn zamanlayıcısını beklemeden — flush zamanlayıcıyı da temizler). */
  async function notifyAndFlush(seo: SeoIndexService, trigger: () => Promise<unknown>) {
    await awaitVoided(seo, "safely", trigger);
    await seo.flush();
  }

  type FetchInit = { body: string; headers: Record<string, string> };
  const callTo = (url: string) =>
    fetchMock.mock.calls.find((c) => c[0] === url) as [string, FetchInit] | undefined;

  // Beklenen adresler ELLE yazılır (src yardımcılarından türetilmez) — web'in
  // yol şeması (`ROUTE_PATHNAMES`) ve etiket sözleşmesi (`lib/seo/tags.ts`) ile.
  const expected = (p: Seeded) => ({
    productPath: `/firma/${p.companySlug}/urun/${p.itemSlug}`,
    companyPath: `/firma/${p.companySlug}`,
    productTag: `product:${p.companySlug}/${p.itemSlug}`,
    indexNow: [
      `${WEB}/firma/${p.companySlug}/urun/${p.itemSlug}`,
      `${WEB}/en/companies/${p.companySlug}/products/${p.itemSlug}`,
      `${WEB}/ru/kompanii/${p.companySlug}/tovary/${p.itemSlug}`,
    ],
  });

  /** Kanal 2 — web önbellek tazeleme: ürün + firma sayfası ve ürün etiketi. */
  function expectRevalidated(p: Seeded) {
    const e = expected(p);
    const revalidate = callTo(`${WEB}/api/seo/revalidate`);
    expect(revalidate).toBeDefined();
    expect(revalidate![1].headers["x-seo-secret"]).toBe(SEO_ENV.SEO_REVALIDATE_SECRET);
    const body = JSON.parse(revalidate![1].body) as { paths: string[]; tags: string[] };
    expect(body.paths).toEqual(expect.arrayContaining([e.productPath, e.companyPath]));
    expect(body.tags).toContain(e.productTag);
  }

  /** Kanal 1 — IndexNow: ürün sayfasının ÜÇ dildeki adresi (TR/EN/RU), canlı konak. */
  function expectIndexNowed(p: Seeded) {
    const indexNow = callTo(INDEXNOW_ENDPOINT);
    expect(indexNow).toBeDefined();
    const body = JSON.parse(indexNow![1].body) as { host: string; urlList: string[] };
    expect(body.host).toBe("www.rothern.com");
    expect(body.urlList).toEqual(expect.arrayContaining(expected(p).indexNow));
  }

  function expectProductNotified(p: Seeded) {
    expectRevalidated(p);
    expectIndexNowed(p);
  }

  const reviewOf = async (id: string) =>
    prisma.companyItem.findUniqueOrThrow({
      where: { id },
      select: { reviewStatus: true, isPublic: true },
    });

  it("KANIT-ÇİFTİ (Nest DI + admin onayı): canlı DI ile onaylanan ürün IndexNow + web tazelemesine gider; aynı DI'da eski token (PrismaService) ile onay geçer ama HİÇBİR bildirim gitmez", async () => {
    // (a) SeoIndexService GERÇEK SeoIndexModule + PrismaModule DI'sinden
    // (PrismaService=rls, PrismaBypassService=owner). Kurucu token PrismaService'e
    // geri dönerse DI kısıtlı istemciyi verir → bu yarı kırmızı olur.
    const seo = liveSeo();
    const p = await seedProduct();
    await notifyAndFlush(seo, () => adminProducts(seo).approve(p.item.id, "admin-rls-1"));
    expect(await reviewOf(p.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    expectProductNotified(p);
    // Kanıt: aynı modülün PrismaService'i bağlamsız ürünü GÖREMEZ (null).
    const tenant = di().get(PrismaService) as unknown as PrismaClient;
    expect(await tenant.companyItem.findUnique({ where: { id: p.item.id } })).toBeNull();

    // (b) düzeltme öncesi kurucu token'ı, AYNI DI bağlamında (PrismaService →
    // kısıtlı rls) → ürün null; onay DB'de geçer ama arama motoruna/web'e
    // sessizce hiçbir şey gitmez.
    fetchMock.mockClear();
    const pre = preFixSeo();
    const q = await seedProduct();
    await notifyAndFlush(pre, () => adminProducts(pre).approve(q.item.id, "admin-rls-2"));
    expect(await reviewOf(q.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("KANIT-ÇİFTİ (Nest DI + TOPLU onay): approveMany ile onaylanan iki ürün tek toplu gönderimde bildirilir; eski token ile ikisi de yayında ama HİÇBİR bildirim gitmez", async () => {
    // (a) canlı DI.
    const seo = liveSeo();
    const [p1, p2] = [await seedProduct(), await seedProduct()];
    await notifyAndFlush(seo, () =>
      adminProducts(seo).approveMany([p1.item.id, p2.item.id], "admin-rls-bulk"),
    );
    expect(await reviewOf(p1.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    expect(await reviewOf(p2.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    // 5 sn toplama: iki ürün TEK tazeleme + TEK IndexNow isteğinde.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectProductNotified(p1);
    expectProductNotified(p2);

    // (b) eski token → belirti: ikisi de onaylı, motor/web hiçbir şey duymaz.
    fetchMock.mockClear();
    const pre = preFixSeo();
    const [q1, q2] = [await seedProduct(), await seedProduct()];
    await notifyAndFlush(pre, () =>
      adminProducts(pre).approveMany([q1.item.id, q2.item.id], "admin-rls-bulk-2"),
    );
    expect(await reviewOf(q1.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    expect(await reviewOf(q2.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("KANIT-ÇİFTİ (Nest DI + admin REDDİ): yayındaki ürün düzeltmeye gönderilince web sayfası hemen tazelenir ama IndexNow'a GİTMEZ; eski token ile ürün vitrinden düşer ama sayfa önbellek süresi dolana dek canlı kalır (tazeleme yok)", async () => {
    // Yayındaki ürünün içeriği değişti → PENDING ama VİTRİNDE (isPublic korunur).
    const inReview: ItemOver = {
      isPublic: true,
      reviewStatus: "PENDING",
      publishedAt: new Date(),
    };
    // (a) canlı DI.
    const seo = liveSeo();
    const p = await seedProduct({ item: inReview });
    await notifyAndFlush(seo, () =>
      adminProducts(seo).reject(p.item.id, "Görseller ürünle uyuşmuyor", "admin-rls-r1"),
    );
    expect(await reviewOf(p.item.id)).toEqual({ reviewStatus: "REJECTED", isPublic: false });
    // Sayfa düşsün diye web tazelenir (ürün + firma yolu, ürün etiketi)…
    expectRevalidated(p);
    // …ama kapalı içerik motorlara DUYURULMAZ (görünürlük kapısı bağlamsız yolda).
    expect(callTo(INDEXNOW_ENDPOINT)).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // (b) eski token → belirti: DB'de vitrinden çekildi, web'e HİÇBİR tazeleme
    // gitmez → reddedilen ürün sayfası ISR süresi boyunca yayında kalır.
    fetchMock.mockClear();
    const pre = preFixSeo();
    const q = await seedProduct({ item: inReview });
    await notifyAndFlush(pre, () =>
      adminProducts(pre).reject(q.item.id, "Görseller ürünle uyuşmuyor", "admin-rls-r2"),
    );
    expect(await reviewOf(q.item.id)).toEqual({ reviewStatus: "REJECTED", isPublic: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("KANIT-ÇİFTİ (görünürlük kapısı SIZDIRMAZ): vitrini KAPALI firmanın onaylanan ürünü web'de tazelenir ama IndexNow'a gitmez; eski token ile hiçbir şey gitmez", async () => {
    // Bypass okuması kapıyı admin bağlamında İLK KEZ çalıştırır: firma profili
    // kapalıysa ürün adresi dış motorlara bildirilmemeli.
    const closed = { company: { publicEnabled: false } };
    // (a) canlı DI.
    const seo = liveSeo();
    const p = await seedProduct(closed);
    await notifyAndFlush(seo, () => adminProducts(seo).approve(p.item.id, "admin-rls-g1"));
    expect(await reviewOf(p.item.id)).toEqual({ reviewStatus: "APPROVED", isPublic: true });
    expectRevalidated(p);
    expect(callTo(INDEXNOW_ENDPOINT)).toBeUndefined();

    // (b) eski token: ürün okunamaz → hiçbir kanal çalışmaz.
    fetchMock.mockClear();
    const pre = preFixSeo();
    const q = await seedProduct(closed);
    await notifyAndFlush(pre, () => adminProducts(pre).approve(q.item.id, "admin-rls-g2"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("çeviri süpürücüsü → ContentTranslationService.notifySeo (cron, bağlamsız)", () => {
    // Birim testiyle (test/unit/content-translation.spec.ts) AYNI, kalite
    // kapılarından geçtiği bilinen kaynak/çıktı. Nitelik yok (kategorisiz),
    // birim kodlu (serbest birim çeviri kaynağına girmez).
    const SOURCE = {
      name: "Bakır levha 2 mm · 1000×2000",
      description: "Elektrolitik bakır, 2.400 kg stok. Top ağırlığı 25–30 kg.",
      keywords: ["bakır levha", "cu levha"],
    };
    const MODEL_OUTPUT = JSON.stringify({
      sourceLocale: "tr",
      translations: {
        tr: { ...SOURCE, attributes: [] },
        en: {
          name: "Copper sheet 2 mm · 1000×2000",
          description: "Electrolytic copper, 2,400 kg in stock. Roll weight 25–30 kg.",
          keywords: ["copper sheet", "cu sheet"],
          attributes: [],
        },
        ru: {
          name: "Медный лист 2 мм · 1000×2000",
          description: "Электролитическая медь, 2 400 кг на складе. Вес рулона 25–30 кг.",
          keywords: ["медный лист", "лист cu"],
          attributes: [],
        },
      },
    });

    /** Canlıdaki gibi: ContentTranslationService PrismaBypassService (owner) +
     *  sağlayıcı (STUB, ağ yok) + DI'dan gelen SeoIndexService. */
    function sweeper(seo: SeoIndexService) {
      const provider = {
        complete: jest.fn(async () => ({
          text: MODEL_OUTPUT,
          usage: { inputTokens: 100, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0 },
        })),
      };
      const cfg = { enabled: true, models: { premium: "gemini-rls-test" }, pricing: {} };
      const service = new ContentTranslationService(
        prisma as never,
        cfg as never,
        provider as never,
        seo,
      );
      return { service, provider };
    }

    /** Yayındaki ürün + bekleyen çeviri satırları. Kuyruk `kick`SİZ açılır
     *  (sağlayıcısız servis): süreç yeniden başlayınca kaybolan anlık çeviriyi
     *  süpürücü toplar — tam da bu cron'un var olma sebebi. */
    async function seedQueuedTranslation() {
      const p = await seedProduct({
        item: {
          ...SOURCE,
          unitCode: "PCE",
          isPublic: true,
          reviewStatus: "APPROVED",
          publishedAt: new Date(),
        },
      });
      expect(await new ContentTranslationService(prisma as never).enqueue("PRODUCT", p.item.id)).toBe(
        true,
      );
      return p;
    }

    const statusesOf = async (id: string) =>
      (await prisma.contentTranslation.findMany({ where: { entityId: id }, select: { status: true } }))
        .map((r) => r.status);

    it("KANIT-ÇİFTİ: süpürücü çeviriyi bitirince canlı DI SeoIndexService ürünü EN/RU adresleriyle bildirir; eski token ile çeviri DONE ama motor/web hiçbir şey duymaz", async () => {
      // (a) canlı DI. Süpürücünün iş döngüsü (`processPending`) → translateEntity
      // → DONE → notifySeo → productChanged (tenant bağlamı YOK).
      const seo = liveSeo();
      const p = await seedQueuedTranslation();
      const a = sweeper(seo);
      let run: Awaited<ReturnType<ContentTranslationService["processPending"]>> | undefined;
      await notifyAndFlush(seo, async () => {
        run = await a.service.processPending();
      });
      expect(run?.done).toBe(1);
      expect(a.provider.complete).toHaveBeenCalled();
      expect(await statusesOf(p.item.id)).toEqual(["DONE", "DONE", "DONE"]);
      expectProductNotified(p);

      // (b) eski token (PrismaService → kısıtlı) → belirti: çeviri yazılır ama
      // EN/RU sayfaları çevrilmiş içerikle tazelenmez, motorlara bildirilmez.
      fetchMock.mockClear();
      const pre = preFixSeo();
      const q = await seedQueuedTranslation();
      const b = sweeper(pre);
      let runB: Awaited<ReturnType<ContentTranslationService["processPending"]>> | undefined;
      await notifyAndFlush(pre, async () => {
        runB = await b.service.processPending();
      });
      expect(runB?.done).toBe(1);
      expect(await statusesOf(q.item.id)).toEqual(["DONE", "DONE", "DONE"]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
