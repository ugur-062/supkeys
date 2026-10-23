/**
 * Realtime WS geçidi — iptal-bypass kapısı (INV-MT-3) + süresiz-soket kapatması
 * (INV-SD-1). WS doğrulaması yalnız handshake'te olduğundan handleConnection,
 * REST company-jwt.strategy ile AYNI DB-taze kapısını uygular; ayrıca token
 * exp'inde soketi otomatik kapatır. Oda aboneliği yetkisi (onSubscribe →
 * canSubscribeOrder / canSubscribeListing) dosyanın sonundaki "K1" bloğunda.
 */
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import {
  RealtimeGateway,
  isWsOriginAllowed,
  wsAllowRequest,
} from "../../src/modules/realtime/realtime.gateway";
import { prisma, truncateAll } from "./test-db";
import { CompanyRole } from "@rothern/db";
import {
  connect,
  invite,
  makeBid,
  makeCompanyWithUser,
  makeListing,
  makeUser,
} from "./factories";

const SECRET = "test-jwt-secret-realtime";
const jwt = new JwtService({});
const config = {
  getOrThrow: () => SECRET,
} as unknown as import("@nestjs/config").ConfigService;
const realtimeStub = { attach: jest.fn() } as never;

function gateway(): RealtimeGateway {
  return new RealtimeGateway(realtimeStub, jwt, config, prisma as never);
}

// Kurulan gerçek exp-timer'ları test sonunda temizle (Node'u açık tutmasın).
const openSockets: FakeSocket[] = [];

interface FakeSocket {
  handshake: { headers: Record<string, string>; auth: { token?: string } };
  data: Record<string, unknown>;
  rooms: Set<string>;
  join: jest.Mock;
  disconnect: jest.Mock;
  leave: jest.Mock;
}

function fakeSocket(token?: string): FakeSocket {
  const s: FakeSocket = {
    handshake: { headers: {}, auth: { token } },
    data: {},
    rooms: new Set<string>(),
    join: jest.fn(),
    disconnect: jest.fn(),
    leave: jest.fn(),
  };
  openSockets.push(s);
  return s;
}

async function sign(
  userId: string,
  companyId: string,
  opts: { tv?: number; expiresIn?: string } = {},
): Promise<string> {
  return jwt.signAsync(
    {
      sub: userId,
      email: "u@test.local",
      type: "company",
      userId,
      companyId,
      tv: opts.tv ?? 0,
    },
    { secret: SECRET, expiresIn: opts.expiresIn ?? "1h" },
  );
}

afterEach(() => {
  for (const s of openSockets) {
    const t = s.data.expiryTimer as ReturnType<typeof setTimeout> | undefined;
    if (t) clearTimeout(t);
  }
  openSockets.length = 0;
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("3a — DB-taze iptal kapısı", () => {
  it("geçerli+aktif kullanıcı bağlanır (company odasına join, disconnect yok)", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const token = await sign(user.id, company.id);
    const client = fakeSocket(token);
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.join).toHaveBeenCalledWith(`company:${company.id}`);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("soft-delete edilmiş kullanıcı reddedilir", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("pasif kullanıcı reddedilir", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { isActive: false },
    });
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("bloklu firma reddedilir", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({
      where: { id: company.id },
      data: { isBlocked: true },
    });
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("pasif firma reddedilir", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    await prisma.company.update({
      where: { id: company.id },
      data: { isActive: false },
    });
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("tokenVersion uyuşmazlığı (parola değişmiş eski token) reddedilir", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    // Token tv=0 ile imzalı; DB'de tokenVersion 1'e çıkar → eski token geçersiz.
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { tokenVersion: 1 },
    });
    const client = fakeSocket(await sign(user.id, company.id, { tv: 0 }));
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it("geçersiz/eksik token reddedilir", async () => {
    const client = fakeSocket("bozuk.token.xyz");
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });
});

describe("3b — exp-zamanlı self-disconnect", () => {
  it("geçerli bağlantı exp'e kadar timer kurar; timer soketi disconnect eder", async () => {
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);

    // Timer kuruldu (~1h gecikme).
    expect(client.data.expiryTimer).toBeTruthy();
    const bigCall = setTimeoutSpy.mock.calls.find(
      (c) => typeof c[1] === "number" && (c[1] as number) > 1_000_000,
    );
    expect(bigCall).toBeDefined();
    expect(bigCall![1] as number).toBeLessThanOrEqual(3_600_000);

    // Timer callback'i çalışınca soket kopar.
    expect(client.disconnect).not.toHaveBeenCalled();
    (bigCall![0] as () => void)();
    expect(client.disconnect).toHaveBeenCalledWith(true);

    setTimeoutSpy.mockRestore();
  });

  it("exp sonrası geçerli yeni token'la yeniden bağlanılabilir", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    // Fresh token → 3a kapısından geçer.
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);
    expect(client.join).toHaveBeenCalledWith(`company:${company.id}`);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("handleDisconnect sarkan timer'ı temizler", async () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const client = fakeSocket(await sign(user.id, company.id));
    await gateway().handleConnection(client as unknown as Socket);
    const timer = client.data.expiryTimer;
    expect(timer).toBeTruthy();

    gateway().handleDisconnect(client as unknown as Socket);
    expect(clearSpy).toHaveBeenCalledWith(timer);
    clearSpy.mockRestore();
  });
});

describe("F-WS-1 — subscribe rate-limit (DB sorgusundan ÖNCE)", () => {
  it("LIMIT (30) mesajdan sonra canSubscribe DB sorgusu ÇAĞRILMAZ — amplifikasyon kesilir", async () => {
    const { company } = await makeCompanyWithUser(prisma, {});
    const gw = gateway();
    const client = fakeSocket();
    client.data.companyId = company.id;
    // Olmayan id → canSubscribeListing findUnique(null) → join yok, oda büyümez
    // (rooms.size cap'i tetiklenmez); yalnız DB sorgusu üretir = amplifikasyon.
    const spy = jest.spyOn(prisma.listing, "findUnique");
    const call = (n: number) =>
      gw.onSubscribe(client as never, {
        kind: "listing",
        id: `nope-${n}`,
      } as never);

    for (let i = 0; i < 30; i++) await call(i);
    expect(spy).toHaveBeenCalledTimes(30); // limit içi her mesaj DB'ye gitti

    // 31. ve 32. mesaj rate-limitli → DB'ye HİÇ ulaşmaz (reddedilmesi yetmez,
    // amplifikasyon kesilir). Spy sayısı 30'da kalır.
    await call(30);
    await call(31);
    expect(spy).toHaveBeenCalledTimes(30);
    spy.mockRestore();
  });

  it("pencere geçince yeniden izin verilir (kalıcı kilit değil)", async () => {
    const { company } = await makeCompanyWithUser(prisma, {});
    const gw = gateway();
    const client = fakeSocket();
    client.data.companyId = company.id;
    // Pencereyi doldur.
    for (let i = 0; i < 30; i++)
      await gw.onSubscribe(client as never, { kind: "listing", id: `a${i}` } as never);
    // 10sn öncesine kaydır (kayan pencere dışına).
    client.data.msgTimes = (client.data.msgTimes as number[]).map(
      (t) => t - 11_000,
    );
    const spy = jest.spyOn(prisma.listing, "findUnique");
    await gw.onSubscribe(client as never, { kind: "listing", id: "again" } as never);
    expect(spy).toHaveBeenCalledTimes(1); // yeniden izin verildi
    spy.mockRestore();
  });
});

describe("F-WS-3 — unsubscribe validation (subscribe ile simetri)", () => {
  it("non-string id → leave çağrılmaz", async () => {
    const client = fakeSocket();
    await gateway().onUnsubscribe(client as never, {
      kind: "listing",
      id: { evil: 1 },
    } as never);
    expect(client.leave).not.toHaveBeenCalled();
  });
  it("60+ karakter id → leave çağrılmaz", async () => {
    const client = fakeSocket();
    await gateway().onUnsubscribe(client as never, {
      kind: "listing",
      id: "x".repeat(61),
    } as never);
    expect(client.leave).not.toHaveBeenCalled();
  });
  it("geçerli id → leave çağrılır", async () => {
    const client = fakeSocket();
    await gateway().onUnsubscribe(client as never, {
      kind: "listing",
      id: "abc",
    } as never);
    expect(client.leave).toHaveBeenCalledWith("listing:abc");
  });
});

describe("LU-19 — handshake origin kapısı (allowRequest, CSWSH)", () => {
  const prev = { o: process.env.CORS_ORIGINS, v: process.env.CORS_ALLOW_VERCEL };
  beforeEach(() => {
    process.env.CORS_ORIGINS = "https://www.rothern.com,https://rothern.com";
    delete process.env.CORS_ALLOW_VERCEL;
  });
  afterAll(() => {
    if (prev.o === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = prev.o;
    if (prev.v === undefined) delete process.env.CORS_ALLOW_VERCEL;
    else process.env.CORS_ALLOW_VERCEL = prev.v;
  });

  it("allowlist'teki origin kabul, same-site ama listede olmayan alt alan adı RED", () => {
    expect(isWsOriginAllowed("https://www.rothern.com")).toBe(true);
    expect(isWsOriginAllowed("https://cdn.rothern.com")).toBe(false);
    expect(isWsOriginAllowed("https://x.vercel.app")).toBe(false);
    expect(isWsOriginAllowed(undefined)).toBe(true); // native istemci (REST ile aynı)
  });

  it("wsAllowRequest izinsiz origin'de success=false döner (engine.io 403)", () => {
    const cb = jest.fn();
    wsAllowRequest({ headers: { origin: "https://cdn.rothern.com" } }, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(String), false);
    const ok = jest.fn();
    wsAllowRequest({ headers: { origin: "https://www.rothern.com" } }, ok);
    expect(ok).toHaveBeenCalledWith(null, true);
  });

  it("gateway metadata'sında allowRequest bağlı", () => {
    const meta = Reflect.getMetadata(
      "websockets:gateway_options",
      RealtimeGateway,
    ) as { allowRequest?: unknown };
    expect(meta.allowRequest).toBe(wsAllowRequest);
  });
});

describe("LU-19 — handshake bitmeden gelen subscribe düşmez", () => {
  it("handleConnection beklenmeden gelen subscribe doğrulama sonrası odaya katar", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const listing = await makeListing(prisma, {
      companyId: company.id,
      createdById: user.id,
    });
    const gw = gateway();
    const client = fakeSocket(await sign(user.id, company.id));
    // Nest'in yaptığı gibi: handleConnection'ı BEKLEMEDEN mesaj işle.
    const conn = gw.handleConnection(client as unknown as Socket);
    expect(client.data.companyId).toBeUndefined();
    await gw.onSubscribe(client as never, { kind: "listing", id: listing.id });
    await conn;
    expect(client.join).toHaveBeenCalledWith(`listing:${listing.id}`);
  });

  it("doğrulama başarısızsa bekleyen subscribe odaya katmaz", async () => {
    const client = fakeSocket("bozuk.token.xyz");
    const gw = gateway();
    const conn = gw.handleConnection(client as unknown as Socket);
    await gw.onSubscribe(client as never, { kind: "listing", id: "x" });
    expect(await conn).toBe(false);
    expect(client.join).not.toHaveBeenCalled();
  });
});

/**
 * K1 — oda aboneliği yetkisi (canlı öncesi sağlamlaştırma H5). Odalar yalnız
 * "değişti" ping'i taşır ama ping'in KENDİSİ sinyaldir: ilgisiz firma
 * `listing:{id}` odasında teklif zamanlamasını, `order:{id}` odasında iki
 * firma arasındaki sipariş hareketini sayabilir. Gerçek handshake'ten geçilir
 * (izinler DB'den hesaplanır), sonra subscribe denenir.
 */
describe("K1 — oda aboneliği yetkisi (canSubscribeOrder / canSubscribeListing)", () => {
  async function connected(userId: string, companyId: string) {
    const gw = gateway();
    const client = fakeSocket(await sign(userId, companyId));
    await gw.handleConnection(client as unknown as Socket);
    expect(client.disconnect).not.toHaveBeenCalled();
    client.join.mockClear(); // company:{id} katılımını say dışı bırak
    return { gw, client };
  }

  async function trySubscribe(
    userId: string,
    companyId: string,
    kind: "listing" | "order",
    id: string,
  ): Promise<boolean> {
    const { gw, client } = await connected(userId, companyId);
    await gw.onSubscribe(client as never, { kind, id });
    const joined = client.join.mock.calls.some(
      (c) => c[0] === `${kind}:${id}`,
    );
    // Reddedilen abonelik HİÇBİR odaya katmamalı.
    if (!joined) expect(client.join).not.toHaveBeenCalled();
    return joined;
  }

  describe("sipariş odası", () => {
    async function orderBetween() {
      const buyer = await makeCompanyWithUser(prisma, {});
      const seller = await makeCompanyWithUser(prisma, {});
      const order = await prisma.companyOrder.create({
        data: {
          buyerCompanyId: buyer.company.id,
          sellerCompanyId: seller.company.id,
          amount: 500,
          currency: "TRY",
        },
      });
      return { buyer, seller, order };
    }

    it("alıcı ve satıcı firma kendi siparişinin odasına katılır", async () => {
      const { buyer, seller, order } = await orderBetween();
      expect(
        await trySubscribe(buyer.user.id, buyer.company.id, "order", order.id),
      ).toBe(true);
      expect(
        await trySubscribe(seller.user.id, seller.company.id, "order", order.id),
      ).toBe(true);
    });

    it("üçüncü firma A–B siparişinin odasına KATILAMAZ", async () => {
      const { order } = await orderBetween();
      const third = await makeCompanyWithUser(prisma, {});
      expect(
        await trySubscribe(third.user.id, third.company.id, "order", order.id),
      ).toBe(false);
    });

    it("olmayan sipariş id'si → katılım yok", async () => {
      const third = await makeCompanyWithUser(prisma, {});
      expect(
        await trySubscribe(third.user.id, third.company.id, "order", "yok-boyle-bir-siparis"),
      ).toBe(false);
    });

    it("satıcı firmanın sell:view'sız üyesi (yalnız Satın Almacı) sipariş odasına katılamaz", async () => {
      const { seller, order } = await orderBetween();
      const buyerOnly = await makeUser(prisma, seller.company.id, [
        CompanyRole.SATIN_ALMACI,
      ]);
      expect(buyerOnly.permissions).not.toContain("sell:view");
      expect(
        await trySubscribe(buyerOnly.id, seller.company.id, "order", order.id),
      ).toBe(false);
    });

    it("alıcı firmanın buy:view'sız üyesi (yalnız Satışçı) sipariş odasına katılamaz", async () => {
      const { buyer, order } = await orderBetween();
      const sellerOnly = await makeUser(prisma, buyer.company.id, [
        CompanyRole.SATISCI,
      ]);
      expect(sellerOnly.permissions).not.toContain("buy:view");
      expect(
        await trySubscribe(sellerOnly.id, buyer.company.id, "order", order.id),
      ).toBe(false);
    });

    it("kind=order ile bir İLAN id'si verilirse katılım yok (tür karışmaz)", async () => {
      const owner = await makeCompanyWithUser(prisma, {});
      const listing = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
      });
      expect(
        await trySubscribe(owner.user.id, owner.company.id, "order", listing.id),
      ).toBe(false);
    });
  });

  describe("ilan odası", () => {
    async function publicListing(
      over: Parameters<typeof makeListing>[1] extends infer O
        ? Partial<O>
        : never = {},
    ) {
      const owner = await makeCompanyWithUser(prisma, {});
      const listing = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        ...over,
      });
      return { owner, listing };
    }

    it("sahip firma (buy:view) katılır; sahibin buy:view'sız üyesi katılamaz", async () => {
      const { owner, listing } = await publicListing();
      expect(
        await trySubscribe(owner.user.id, owner.company.id, "listing", listing.id),
      ).toBe(true);
      const sellerOnly = await makeUser(prisma, owner.company.id, [
        CompanyRole.SATISCI,
      ]);
      expect(
        await trySubscribe(sellerOnly.id, owner.company.id, "listing", listing.id),
      ).toBe(false);
    });

    it("ilgisiz firma (teklif/davet/bağlantı yok) PUBLIC ilanın odasına KATILAMAZ", async () => {
      const { listing } = await publicListing();
      const stranger = await makeCompanyWithUser(prisma, {});
      expect(
        await trySubscribe(stranger.user.id, stranger.company.id, "listing", listing.id),
      ).toBe(false);
    });

    it("teklif vermiş firma katılır; aynı firmanın sell:view'sız üyesi KATILAMAZ", async () => {
      const { listing } = await publicListing();
      const bidder = await makeCompanyWithUser(prisma, {});
      await makeBid(prisma, {
        listingId: listing.id,
        bidderCompanyId: bidder.company.id,
        createdById: bidder.user.id,
        amount: 100,
      });
      expect(
        await trySubscribe(bidder.user.id, bidder.company.id, "listing", listing.id),
      ).toBe(true);

      const buyerOnly = await makeUser(prisma, bidder.company.id, [
        CompanyRole.SATIN_ALMACI,
      ]);
      expect(buyerOnly.permissions).not.toContain("sell:view");
      const { gw, client } = await connected(buyerOnly.id, bidder.company.id);
      expect(client.data.permissions).not.toContain("sell:view");
      await gw.onSubscribe(client as never, { kind: "listing", id: listing.id });
      expect(client.join).not.toHaveBeenCalled();
    });

    it("davetli firma katılır", async () => {
      const { owner, listing } = await publicListing();
      const invited = await makeCompanyWithUser(prisma, {});
      await invite(prisma, listing.id, invited.company.id, owner.user.id);
      expect(
        await trySubscribe(invited.user.id, invited.company.id, "listing", listing.id),
      ).toBe(true);
    });

    it("engel ilişkisi (sahip → firma) eski davet ve teklif dursa da REDDEDİLİR", async () => {
      const { owner, listing } = await publicListing();
      const blocked = await makeCompanyWithUser(prisma, {});
      await invite(prisma, listing.id, blocked.company.id, owner.user.id);
      await makeBid(prisma, {
        listingId: listing.id,
        bidderCompanyId: blocked.company.id,
        createdById: blocked.user.id,
        amount: 100,
      });
      await connect(prisma, owner.company.id, blocked.company.id, owner.user.id);
      // Engel yokken katılabiliyor (testin kendisi anlamlı olsun).
      expect(
        await trySubscribe(blocked.user.id, blocked.company.id, "listing", listing.id),
      ).toBe(true);

      await prisma.companyBlock.create({
        data: {
          blockerCompanyId: owner.company.id,
          blockedCompanyId: blocked.company.id,
        },
      });
      expect(
        await trySubscribe(blocked.user.id, blocked.company.id, "listing", listing.id),
      ).toBe(false);
    });

    it("engel ters yönde de (firma → sahip) reddedilir", async () => {
      const { owner, listing } = await publicListing();
      const blocker = await makeCompanyWithUser(prisma, {});
      await invite(prisma, listing.id, blocker.company.id, owner.user.id);
      await prisma.companyBlock.create({
        data: {
          blockerCompanyId: blocker.company.id,
          blockedCompanyId: owner.company.id,
        },
      });
      expect(
        await trySubscribe(blocker.user.id, blocker.company.id, "listing", listing.id),
      ).toBe(false);
    });

    it("geçerli bağlantılı firma CONNECTIONS ilanda katılır; PRIVATE ilanda davetsizse KATILAMAZ", async () => {
      const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
      const connected_ = await makeCompanyWithUser(prisma, {});
      await connect(prisma, owner.company.id, connected_.company.id, owner.user.id);
      const open = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        visibility: "CONNECTIONS",
      });
      const priv = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        visibility: "PRIVATE",
      });
      expect(
        await trySubscribe(connected_.user.id, connected_.company.id, "listing", open.id),
      ).toBe(true);
      expect(
        await trySubscribe(connected_.user.id, connected_.company.id, "listing", priv.id),
      ).toBe(false);
    });

    it("bağlantıyı kuran taraf doğrulanmamışsa (sınırlı firma, saklı kademe STANDART) bağlantı GEÇERSİZ → katılamaz; doğrulanınca geçerli olur", async () => {
      // Ücretsiz dönem (2026-10-07): sınırlı firma = doğrulanmamış firma.
      const owner = await makeCompanyWithUser(prisma, {
        tier: "STANDART",
        companyVerificationStatus: "UNVERIFIED",
      });
      const other = await makeCompanyWithUser(prisma, {});
      await connect(prisma, owner.company.id, other.company.id, owner.user.id);
      const listing = await makeListing(prisma, {
        companyId: owner.company.id,
        createdById: owner.user.id,
        visibility: "CONNECTIONS",
      });
      expect(
        await trySubscribe(other.user.id, other.company.id, "listing", listing.id),
      ).toBe(false);
      // Doğrulanan firma saklı kademesi STANDART kalsa da tam erişimli → bağlantı geçerli.
      await prisma.company.update({
        where: { id: owner.company.id },
        data: { companyVerificationStatus: "VERIFIED" },
      });
      expect(
        await trySubscribe(other.user.id, other.company.id, "listing", listing.id),
      ).toBe(true);
    });

    it("embargolu ilan (bidsOpenAt gelecekte): davetli ama teklifsiz firma katılamaz, teklifi olan katılır", async () => {
      const { owner, listing } = await publicListing({
        bidsOpenAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const invitedOnly = await makeCompanyWithUser(prisma, {});
      await invite(prisma, listing.id, invitedOnly.company.id, owner.user.id);
      expect(
        await trySubscribe(invitedOnly.user.id, invitedOnly.company.id, "listing", listing.id),
      ).toBe(false);

      const bidder = await makeCompanyWithUser(prisma, {});
      await makeBid(prisma, {
        listingId: listing.id,
        bidderCompanyId: bidder.company.id,
        createdById: bidder.user.id,
        amount: 100,
      });
      expect(
        await trySubscribe(bidder.user.id, bidder.company.id, "listing", listing.id),
      ).toBe(true);
    });

    it("kind=listing ile bir SİPARİŞ id'si verilirse katılım yok", async () => {
      const buyer = await makeCompanyWithUser(prisma, {});
      const seller = await makeCompanyWithUser(prisma, {});
      const order = await prisma.companyOrder.create({
        data: {
          buyerCompanyId: buyer.company.id,
          sellerCompanyId: seller.company.id,
          amount: 500,
          currency: "TRY",
        },
      });
      expect(
        await trySubscribe(buyer.user.id, buyer.company.id, "listing", order.id),
      ).toBe(false);
    });
  });
});
