import { Logger } from "@nestjs/common";
import { runWithTenantContext } from "../../common/tenant/tenant-context";
import { hasValidConnection } from "../../common/company/valid-connection";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AUTH_COOKIE, parseCookies } from "../../common/auth/cookie";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { CompanyJwtPayload } from "../company-auth/strategies/company-jwt.strategy";
import { RealtimeService } from "./realtime.service";

/**
 * Firma WS geçidi — bağlantıda company JWT doğrulanır, istemci kendi
 * company:{id} odasına alınır. İlan/sipariş odaları "değişti" sinyali içindir;
 * event yalnız id taşır (veri REST'ten yetkiyle çekilir). Yine de oda ABONELİĞİ
 * erişim-kontrollüdür: aksi halde ilgisiz firma `listing:{id}` odasına katılıp
 * her teklifte gelen ping'i sayarak kapalı-zarf RFQ'da rakip teklif sayısı/
 * zamanlaması çıkarabilir (K1). Subscribe'da katılımcı/görünürlük doğrulanır.
 */
// WS CORS, REST (main.ts) ile AYNI kural: CORS_ORIGINS allowlist + tüm Vercel
// deploy/preview origin'leri (*.vercel.app) otomatik izinli. Fonksiyon origin
// handshake ANINDA çalışır → env'i lazy okur (decorator module-load'da
// değerlendirilse bile dotenv sıralaması footgun olmaktan çıkar).
const WS_VERCEL_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function wsOriginAllowed(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void {
  const allowlist = (
    process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  // origin yoksa (native/mobil istemci) engelleme — REST ile aynı davranış.
  // `*.vercel.app` jokeri REST ile AYNI kapıdan (CORS_ALLOW_VERCEL=true) —
  // denetim 2026-08-23: WS'te koşulsuz açıktı (drift).
  const allowVercel = process.env.CORS_ALLOW_VERCEL === "true";
  const ok =
    !origin ||
    allowlist.includes(origin) ||
    (allowVercel && WS_VERCEL_ORIGIN.test(origin));
  cb(null, ok);
}

// F-WS-1: soket başına mesaj rate-limiti (kayan pencere). REST'te ThrottlerGuard
// var, WS'te yoktu (kardeş-yol asimetrisi) → kimliği-doğrulanmış client `subscribe`
// floodlayıp her mesajda DB sorgusu (canSubscribeListing 3 count) tetikleyebiliyordu;
// oda büyümediği için rooms.size cap'i tetiklenmiyordu. Limit DB'den ÖNCE uygulanır
// → amplifikasyon kesilir. 30/10sn: gezinme (detay aç/kapa) çok üstünde, flood altında.
const WS_MSG_LIMIT = 30;
const WS_MSG_WINDOW_MS = 10_000;

// F-WS-4: payload'lar {kind,id} (~100 byte) → 1MB socket.io default'u fazla cömert.
// 16KB açık cap DoS yüzeyini 64x küçültür (handshake HTTP olduğu için etkilenmez).
@WebSocketGateway({
  cors: { origin: wsOriginAllowed, credentials: true },
  path: "/rt",
  maxHttpBufferSize: 16 * 1024,
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.attach(server);
    this.logger.log("Realtime gateway hazır (path=/rt)");
  }

  async handleConnection(client: Socket): Promise<void> {
    // TÜM handshake işlemi try içinde (denetim 2026-08-23 #1): token çıkarımı
    // dışarıdaysa bozuk çerez başlığı yakalanmamış red → süreç düşebiliyordu.
    try {
      // Önce httpOnly cookie (withCredentials handshake), geri düşüş auth.token /
      // Authorization Bearer (geçiş uyumu).
      const cookieToken = parseCookies(client.handshake.headers.cookie)[
        AUTH_COOKIE.company
      ];
      const token =
        cookieToken ??
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.headers.authorization ?? "").replace(/^Bearer /, "");
      const payload = await this.jwt.verifyAsync<CompanyJwtPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
      if (payload.type !== "company" || !payload.companyId) {
        throw new Error("Geçersiz token tipi");
      }

      // İptal-bypass kapısı (INV-MT-3): REST company-jwt.strategy.ts:61-78 ile
      // AYNI DB-taze doğrulama. WS doğrulaması yalnız handshake'te olduğundan,
      // iptal edilmiş aktör (soft-delete/pasif kullanıcı, pasif/bloklu firma,
      // parola değişmiş=tokenVersion artmış) yeni/yeniden bağlantı AÇAMAMALI.
      // NOT: strategy ile senkron tutulmalı (reuse yerine inline — CompanyAuth
      // passport'a bağlı, RealtimeModule'de değil).
      const user = await this.prisma.companyUser.findUnique({
        where: { id: payload.userId },
        include: { company: true },
      });
      if (!user || !user.isActive || user.deletedAt) {
        throw new Error("Kullanıcı geçersiz");
      }
      if (!user.company.isActive || user.company.isBlocked) {
        throw new Error("Firma hesabı pasif veya engellenmiş");
      }
      if ((payload.tv ?? 0) !== user.tokenVersion) {
        throw new Error("Oturum geçersiz");
      }

      client.data.companyId = payload.companyId;
      await client.join(`company:${payload.companyId}`);

      // Süresiz-soket kapatması (INV-SD-1): açık soket token doğal ömrünü
      // aşarak yaşamasın. Saf exp-zamanlı self-disconnect — DB-polling DEĞİL,
      // gateway'e sorgu yükü bindirmez. Client geçerli token'la reconnect
      // edebilir (yeniden yukarıdaki kapıdan geçer). Expired token connect'te
      // verifyAsync tarafından zaten reddedildiğinden ms daima > 0.
      const exp = (payload as { exp?: number }).exp;
      if (typeof exp === "number") {
        const ms = exp * 1000 - Date.now();
        if (ms > 0) {
          client.data.expiryTimer = setTimeout(
            () => client.disconnect(true),
            ms,
          );
        }
      }
    } catch {
      client.disconnect(true);
    }
  }

  /** Soket kapanınca sarkan exp-timer'ı temizle (bellek sızıntısı önlemi). */
  handleDisconnect(client: Socket): void {
    const timer = client.data?.expiryTimer as
      | ReturnType<typeof setTimeout>
      | undefined;
    if (timer) clearTimeout(timer);
  }

  /**
   * F-WS-1: soket başına kayan-pencere rate-limit — DB sorgusundan ÖNCE çağrılır
   * ki amplifikasyon (canSubscribeListing count'ları) kesilsin, yalnız mesaj
   * reddedilmesin. Dizi pencere+LIMIT ile sınırlı (bellek şişmez).
   */
  private rateOk(client: Socket): boolean {
    const now = Date.now();
    const prev = (client.data.msgTimes as number[] | undefined) ?? [];
    const recent = prev.filter((t) => now - t < WS_MSG_WINDOW_MS);
    if (recent.length >= WS_MSG_LIMIT) {
      client.data.msgTimes = recent;
      return false;
    }
    recent.push(now);
    client.data.msgTimes = recent;
    return true;
  }

  @SubscribeMessage("subscribe")
  async onSubscribe(
    client: Socket,
    body: { kind: "listing" | "order"; id: string },
  ): Promise<void> {
    if (!this.rateOk(client)) return; // F-WS-1: DB'den ÖNCE
    const companyId = client.data.companyId as string | undefined;
    if (!companyId) return;
    if (!body?.id || (body.kind !== "listing" && body.kind !== "order")) return;
    if (typeof body.id !== "string" || body.id.length > 60) return;
    // subscribe-spam koruması: tek soket sınırsız odaya katılıp bellek şişiremez.
    if (client.rooms.size > 100) return;
    // Erişim kontrolü (K1): yalnız ilgili firma odaya katılabilir.
    // RLS aktivasyon hazırlığı (denetim 2026-08-23 Parça 4): WS yolunda HTTP
    // middleware'i çalışmadığı için tenant bağlamı YOK; policy'li tabloları
    // (listings/bids/orders/invitations) bağlamsız okumak RLS açıldığında TÜM
    // abonelikleri sessizce reddeder. Handshake'te doğrulanmış companyId ile
    // bağlamı burada kurarız.
    const allowed = await runWithTenantContext(
      { companyId, realm: "company" },
      () =>
        body.kind === "order"
          ? this.canSubscribeOrder(companyId, body.id)
          : this.canSubscribeListing(companyId, body.id),
    );
    if (!allowed) return;
    await client.join(`${body.kind}:${body.id}`);
  }

  /** Sipariş odası: yalnız alıcı veya satıcı. */
  private async canSubscribeOrder(
    companyId: string,
    orderId: string,
  ): Promise<boolean> {
    const count = await this.prisma.companyOrder.count({
      where: {
        id: orderId,
        OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
      },
    });
    return count > 0;
  }

  /**
   * İlan odası: sahip VEYA ilanla meşru ilişkisi olan (teklif vermiş, davetli
   * veya sahibiyle aktif bağlantılı) firma. İlgisiz/engellenen firma katılamaz
   * → kapalı-zarf teklif-aktivitesi ping'lerini dinleyemez.
   */
  private async canSubscribeListing(
    companyId: string,
    listingId: string,
  ): Promise<boolean> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        companyId: true,
        visibility: true,
        bidsOpenAt: true,
      },
    });
    if (!listing) return false;
    if (listing.companyId === companyId) return true; // sahip

    // Denetim 2026-08-24 Parça 7: oda kapısı REST görünürlüğünü aynalamalı.
    // Eski hâli üç sınıfı içeri alıyordu: (a) PRIVATE ilanda davetsiz ama
    // "bağlantılı" firma, (b) embargolu (bidsOpenAt gelecekte) ilanda teklifi
    // olmayan davetli/bağlantılı firma, (c) sahibince bloklanmış ama ESKİ
    // davet/teklif satırı duran firma. Ping'ler yalnız id taşısa da bunlar
    // "bu ilanda hareket var" sinyalidir → kapalı zarf/embargo kararının
    // dışına sızmamalı.
    const blocked = await this.prisma.companyBlock.count({
      where: {
        OR: [
          { blockerCompanyId: listing.companyId, blockedCompanyId: companyId },
          { blockerCompanyId: companyId, blockedCompanyId: listing.companyId },
        ],
      },
    });
    if (blocked > 0) return false;

    const [bid, invite, connection] = await Promise.all([
      this.prisma.listingBid.count({
        where: { listingId, bidderCompanyId: companyId },
      }),
      this.prisma.listingInvitation.count({
        where: { listingId, invitedCompanyId: companyId },
      }),
      // Denetim 2026-08-24 Parça 7: ham ACTIVE sayımı yerine TEK KAYNAK
      // geçerlilik kuralı (bağlantıyı kuran taraf efektif BRONZ+ olmalı) —
      // ilan tarafındaki kapı ile aynı, kardeş-yol driftı kapandı.
      hasValidConnection(this.prisma as never, companyId, listing.companyId),
    ]);
    // Embargo: açılış saati gelmemişse yalnız TEKLİFİ OLAN firma dinleyebilir
    // (ilan detayındaki `bidsOpenAt` istisnasıyla aynı kural).
    const embargoed =
      !!listing.bidsOpenAt && listing.bidsOpenAt.getTime() > Date.now();
    if (embargoed) return bid > 0;
    // PRIVATE ilan: yalnız DAVETLİ (bağlantılı olmak yetmez — listing-visibility).
    if (listing.visibility === "PRIVATE") return bid > 0 || invite > 0;
    return bid > 0 || invite > 0 || connection;
  }

  @SubscribeMessage("unsubscribe")
  async onUnsubscribe(
    client: Socket,
    body: { kind: "listing" | "order"; id: string },
  ): Promise<void> {
    if (!this.rateOk(client)) return; // F-WS-1
    if (!body?.id || (body.kind !== "listing" && body.kind !== "order")) return;
    // F-WS-3: subscribe ile simetrik tip/uzunluk kontrolü (leave zaten no-op ama
    // asimetri kapatılır — coerce'lu oda adı üretilmesin).
    if (typeof body.id !== "string" || body.id.length > 60) return;
    await client.leave(`${body.kind}:${body.id}`);
  }
}
