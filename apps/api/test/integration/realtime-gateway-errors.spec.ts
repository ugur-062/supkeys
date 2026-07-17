/**
 * WS handler hata-yönetimi (kapsam boşluğu kapanışı). Denetimde "@SubscribeMessage
 * reddinin KESİN davranışı framework varsayımı, kod-yolundan test edilmedi" demiştik;
 * fire-and-forget sweep'inde tam bu sınıf (void promise → unhandled rejection) SÜREÇ
 * ÇÖKERTİYORDU. Buradaki fark: NestJS @SubscribeMessage handler'ını SAHİPLENİP
 * await/catch eder (bizim `void this.x()` değil). GERÇEK socket.io server + client ile
 * doğrulanır: handler throw → süreç çökmez, client 'exception' alır, soket açık kalır.
 */
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

const SECRET = "test-jwt-secret-realtime-e2e";

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

describe("WS handler throw → süreç ÇÖKMEZ, 'exception' emit (framework kapanışı)", () => {
  let app: INestApplication;
  let client: ClientSocket;

  beforeAll(async () => {
    await truncateAll();
    const { company, user } = await makeCompanyWithUser(prisma, {});

    app = await NestFactory.create(TestRealtimeModule, { logger: false });
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);
    const port = (app.getHttpServer().address() as { port: number }).port;

    const token = await new JwtService({}).signAsync(
      {
        sub: user.id,
        email: "u@test.local",
        type: "company",
        userId: user.id,
        companyId: company.id,
        tv: 0,
      },
      { secret: SECRET, expiresIn: "1h" },
    );
    client = io(`http://localhost:${port}`, {
      path: "/rt",
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
    });
    await new Promise<void>((res, rej) => {
      client.on("connect", () => res());
      client.on("connect_error", (e) => rej(e));
      setTimeout(() => rej(new Error("connect timeout")), 8000);
    });
    // Server-side handleConnection async + DB-gated (data.companyId + room join);
    // client 'connect' transport-anında gelir → subscribe'dan önce otursun.
    await new Promise((r) => setTimeout(r, 600));
  }, 20000);

  afterAll(async () => {
    client?.close();
    await app?.close();
    await truncateAll();
    await prisma.$disconnect();
  });

  it("subscribe handler'ı throw ederse client 'exception' alır; unhandledRejection YOK; soket AÇIK kalır", async () => {
    const rejections: unknown[] = [];
    const onRej = (e: unknown) => rejections.push(e);
    process.on("unhandledRejection", onRej);
    // canSubscribeListing'in ilk DB sorgusunu throw ettir → handler reddeder.
    const spy = jest
      .spyOn(prisma.listing, "findUnique")
      .mockRejectedValue(new Error("boom-db"));
    try {
      const gotException = new Promise<unknown>((res) =>
        client.on("exception", (d) => res(d)),
      );
      client.emit("subscribe", { kind: "listing", id: "any-listing-id" });
      const received = await Promise.race([
        gotException,
        new Promise((res) => setTimeout(() => res("__timeout__"), 5000)),
      ]);
      // Framework hatayı yakalayıp 'exception' olarak yansıttı (crash DEĞİL).
      expect(received).not.toBe("__timeout__");
      // Mikrotask'ları boşalt — unhandled rejection düşecek olsaydı burada düşerdi.
      await new Promise((r) => setTimeout(r, 200));
      expect(rejections).toHaveLength(0);
      // Server ayakta, soket hâlâ bağlı.
      expect(client.connected).toBe(true);
    } finally {
      process.off("unhandledRejection", onRej);
      spy.mockRestore();
    }
  }, 15000);
});
