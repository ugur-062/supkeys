import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AUTH_COOKIE, parseCookies } from "../../common/auth/cookie";
import type { CompanyJwtPayload } from "../company-auth/strategies/company-jwt.strategy";
import { RealtimeService } from "./realtime.service";

/**
 * Firma WS geçidi — bağlantıda company JWT doğrulanır, istemci kendi
 * company:{id} odasına alınır. İlan/sipariş odaları "değişti" sinyali içindir;
 * odaya katılmak veri SIZDIRMAZ (event yalnızca id taşır, veri REST'ten
 * yetkiyle çekilir) — bu yüzden oda aboneliğinde ayrıca erişim kontrolü
 * yapılmaz (kapalı zarf REST katmanında korunur).
 */
// WS CORS, REST ile AYNI allowlist (CORS_ORIGINS) — origin:true yerine.
// Env decorator değerlendirilmeden (AppModule import'undan) önce dotenv ile yüklenir.
const WS_ORIGINS = (
  process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: { origin: WS_ORIGINS, credentials: true },
  path: "/rt",
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.logger.log("Realtime gateway hazır (path=/rt)");
  }

  async handleConnection(client: Socket): Promise<void> {
    // Önce httpOnly cookie (withCredentials handshake), geri düşüş auth.token /
    // Authorization Bearer (geçiş uyumu).
    const cookieToken = parseCookies(client.handshake.headers.cookie)[
      AUTH_COOKIE.company
    ];
    const token =
      cookieToken ??
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization ?? "").replace(/^Bearer /, "");
    try {
      const payload = await this.jwt.verifyAsync<CompanyJwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
      if (payload.type !== "company" || !payload.companyId) {
        throw new Error("Geçersiz token tipi");
      }
      client.data.companyId = payload.companyId;
      await client.join(`company:${payload.companyId}`);
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage("subscribe")
  async onSubscribe(
    client: Socket,
    body: { kind: "listing" | "order"; id: string },
  ): Promise<void> {
    if (!client.data.companyId) return;
    if (!body?.id || (body.kind !== "listing" && body.kind !== "order")) return;
    if (typeof body.id !== "string" || body.id.length > 60) return;
    // subscribe-spam koruması: tek soket sınırsız odaya katılıp bellek şişiremez.
    if (client.rooms.size > 100) return;
    await client.join(`${body.kind}:${body.id}`);
  }

  @SubscribeMessage("unsubscribe")
  async onUnsubscribe(
    client: Socket,
    body: { kind: "listing" | "order"; id: string },
  ): Promise<void> {
    if (!body?.id || (body.kind !== "listing" && body.kind !== "order")) return;
    await client.leave(`${body.kind}:${body.id}`);
  }
}
