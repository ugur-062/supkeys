/**
 * Realtime WS geçidi — iptal-bypass kapısı (INV-MT-3) + süresiz-soket kapatması
 * (INV-SD-1). WS doğrulaması yalnız handshake'te olduğundan handleConnection,
 * REST company-jwt.strategy ile AYNI DB-taze kapısını uygular; ayrıca token
 * exp'inde soketi otomatik kapatır. Room-join yetkisi ayrı (onSubscribe) —
 * burada test edilmez.
 */
import { JwtService } from "@nestjs/jwt";
import type { Socket } from "socket.io";
import { RealtimeGateway } from "../../src/modules/realtime/realtime.gateway";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

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
  join: jest.Mock;
  disconnect: jest.Mock;
  leave: jest.Mock;
}

function fakeSocket(token?: string): FakeSocket {
  const s: FakeSocket = {
    handshake: { headers: {}, auth: { token } },
    data: {},
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
