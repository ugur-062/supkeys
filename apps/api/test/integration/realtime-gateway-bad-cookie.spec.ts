/**
 * Denetim 2026-08-23 #1 (HIGH): WS handshake'te bozuk yüzde-kodlu Cookie
 * header'ı (domain'deki HERHANGİ bir çerez) parseCookies/decodeURIComponent'ı
 * patlatıyor, çağrı try dışında olduğu için unhandledRejection → süreç
 * düşebiliyordu. Sözleşme: bozuk çerezli handshake YALNIZ o soketi kapatır;
 * süreç ayakta kalır; ardından geçerli token'la bağlantı çalışır.
 */
import "reflect-metadata";
import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { io, type Socket as ClientSocket } from "socket.io-client";
import { RealtimeGateway } from "../../src/modules/realtime/realtime.gateway";
import { RealtimeService } from "../../src/modules/realtime/realtime.service";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const SECRET = "test-jwt-secret-realtime-bad-cookie";

@Module({
  providers: [
    RealtimeGateway,
    RealtimeService,
    { provide: PrismaService, useValue: prisma },
    { provide: JwtService, useValue: new JwtService({}) },
    { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
  ],
})
class TestRealtimeModule {}

function connect(port: number, opts: Record<string, unknown>): Promise<{ client: ClientSocket; outcome: "connect" | "disconnect" | "error" }> {
  return new Promise((resolve, reject) => {
    const client = io(`http://localhost:${port}`, {
      path: "/rt",
      transports: ["websocket"],
      reconnection: false,
      ...opts,
    });
    const timer = setTimeout(() => reject(new Error("timeout")), 8000);
    client.on("connect", () => {
      // Sunucu handleConnection async: reddederse kısa süre sonra disconnect gelir.
      setTimeout(() => {
        clearTimeout(timer);
        resolve({ client, outcome: client.connected ? "connect" : "disconnect" });
      }, 700);
    });
    client.on("disconnect", () => {
      clearTimeout(timer);
      resolve({ client, outcome: "disconnect" });
    });
    client.on("connect_error", () => {
      clearTimeout(timer);
      resolve({ client, outcome: "error" });
    });
  });
}

describe("WS handshake — bozuk Cookie header'ı süreci düşürmez", () => {
  let app: INestApplication;
  let port: number;
  let goodToken: string;
  const rejections: unknown[] = [];
  const onRejection = (r: unknown) => rejections.push(r);

  beforeAll(async () => {
    await truncateAll();
    const { company, user } = await makeCompanyWithUser(prisma, {});
    app = await NestFactory.create(TestRealtimeModule, { logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    goodToken = await new JwtService({}).signAsync(
      { sub: user.id, type: "company", userId: user.id, companyId: company.id, tv: 0 },
      { secret: SECRET, expiresIn: "1h" },
    );
    process.on("unhandledRejection", onRejection);
  }, 20000);

  afterAll(async () => {
    process.off("unhandledRejection", onRejection);
    await app?.close();
    await truncateAll();
    await prisma.$disconnect();
  });

  it("bozuk çerez (%zz / %E0%A4%A) → soket KAPANIR, unhandledRejection YOK, süreç ayakta; ardından geçerli token bağlanır", async () => {
    const bad1 = await connect(port, { extraHeaders: { Cookie: "rk_company=%E0%A4%A" } });
    expect(bad1.outcome).not.toBe("connect");
    bad1.client.close();
    const bad2 = await connect(port, { extraHeaders: { Cookie: "foo=%zz; rk_company=abc" } });
    expect(bad2.outcome).not.toBe("connect");
    bad2.client.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(rejections).toHaveLength(0);

    const good = await connect(port, { auth: { token: goodToken } });
    expect(good.outcome).toBe("connect");
    good.client.close();
  }, 30000);
});
