import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { EmailService } from "../../email/email.service";

type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

/** Bağlantı kartı için firma alanları (ihale daveti adımı + bağlantılar). */
const COMPANY_CARD_SELECT = {
  id: true,
  name: true,
  supkeysId: true,
  tier: true,
  taxNumber: true,
  city: true,
  country: true,
  industry: true,
  users: {
    where: { isActive: true, deletedAt: null },
    take: 1,
    orderBy: { createdAt: "asc" as const },
    select: { firstName: true, lastName: true, email: true },
  },
} as const;

@Injectable()
export class CompanyConnectionsService {
  private readonly logger = new Logger(CompanyConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: CompanyBlocksService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** Kendi Rothern ID. */
  async getSelf(user: AuthenticatedCompanyUser) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { supkeysId: true },
    });
    return { rothernId: c?.supkeysId ?? null };
  }

  /**
   * Rothern ID (supkeysId) ile bağlantı isteği — PLATFORM (PREMIUM) bağlantısı.
   * Sadece PAKET gönderebilir; premium bitince bu bağlantı pasifleşir.
   */
  async invite(user: AuthenticatedCompanyUser, supkeysIdRaw: string) {
    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        "Rothern ID ile bağlantı isteği premium üyelik gerektirir. Kendi tedarikçinizi referans kodu ile davet edebilirsiniz.",
      );
    }
    const code = normalizeShortCode(supkeysIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz Rothern ID (XXXX-XXXX)");
    }
    const target = await this.prisma.company.findUnique({
      where: { supkeysId: code },
      select: { id: true, name: true, isActive: true },
    });
    if (!target || !target.isActive) {
      throw new NotFoundException("Bu Rothern ID'ye sahip firma bulunamadı");
    }
    return this.createRequest(user, target, "PREMIUM");
  }

  /**
   * E-posta ile davet. Kayıtlıysa doğrudan INVITE bağlantı isteği; değilse
   * ReferralInvite kaydı + davet e-postası. Hedef bu e-posta ile kayıt olunca
   * (signup hook) otomatik INVITE bağlantı kurulur.
   */
  async inviteByEmail(user: AuthenticatedCompanyUser, emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();

    // Kayıtlı mı? (aktif kullanıcı)
    const existing = await this.prisma.companyUser.findFirst({
      where: { email, isActive: true, deletedAt: null },
      select: {
        company: { select: { id: true, name: true, isActive: true } },
      },
    });
    if (existing?.company) {
      const res = await this.createRequest(user, existing.company, "INVITE");
      return { kind: "request" as const, targetName: res.targetName };
    }

    // Kayıtsız → davet kaydı (varsa koru) + e-posta.
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });

    const inv = await this.prisma.companyReferralInvite.upsert({
      where: {
        inviterCompanyId_email: { inviterCompanyId: user.companyId, email },
      },
      create: {
        inviterCompanyId: user.companyId,
        email,
        invitedById: user.userId,
      },
      update: {},
    });

    const baseUrl =
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    const registerUrl = `${baseUrl}/company/kayit?ref=${inv.token}`;

    this.email
      .send({
        to: { email },
        templateData: {
          template: "referral_invite",
          data: {
            inviterName: me?.name ?? "Bir firma",
            email,
            registerUrl,
          },
        },
        context: { type: "referral_invite", id: inv.id },
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Davet e-postası gönderilemedi (${email}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );

    return { kind: "invited" as const, email };
  }

  /** Gönderdiğim bekleyen e-posta davetleri. */
  async listReferralInvites(companyId: string) {
    const rows = await this.prisma.companyReferralInvite.findMany({
      where: { inviterCompanyId: companyId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true },
    });
    return rows;
  }

  /** Ortak istek oluşturma — self/blok/mevcut kontrolleri + kayıt. */
  private async createRequest(
    user: AuthenticatedCompanyUser,
    target: { id: string; name: string; isActive: boolean },
    origin: ConnectionOrigin,
  ) {
    if (target.id === user.companyId) {
      throw new BadRequestException("Kendinize istek gönderemezsiniz");
    }
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    if (blockedIds.includes(target.id)) {
      throw new NotFoundException("Firma bulunamadı");
    }
    const existing = await this.prisma.companyConnection.findFirst({
      where: {
        OR: [
          { inviterCompanyId: user.companyId, inviteeCompanyId: target.id },
          { inviterCompanyId: target.id, inviteeCompanyId: user.companyId },
        ],
      },
      select: { status: true, inviteeCompanyId: true },
    });
    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new ConflictException("Bu firmayla zaten bağlısınız");
      }
      if (existing.inviteeCompanyId === user.companyId) {
        throw new ConflictException(
          "Bu firma size zaten istek göndermiş — Gelen İstekler'den kabul edin",
        );
      }
      throw new ConflictException("Bu firmaya zaten istek gönderdiniz");
    }

    const conn = await this.prisma.companyConnection.create({
      data: {
        inviterCompanyId: user.companyId,
        inviteeCompanyId: target.id,
        invitedById: user.userId,
        status: "PENDING",
        origin,
      },
    });
    return { id: conn.id, status: conn.status, targetName: target.name };
  }


  /** Bana gelen bekleyen davetler. */
  async listIncoming(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId, status: "PENDING" },
      include: {
        inviter: { select: { id: true, name: true, supkeysId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      connectionId: r.id,
      company: r.inviter,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Aktif bağlantılarım (her iki yön — karşı firmayı döner).
   * PREMIUM-origin bağlantı yalnızca İKİ taraf da PAKET iken aktif sayılır
   * (premium bitince pasifleşir, silinmez). INVITE/ADMIN her zaman aktif.
   */
  async list(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId },
          { inviteeCompanyId: companyId },
        ],
      },
      include: {
        inviter: { select: COMPANY_CARD_SELECT },
        invitee: { select: COMPANY_CARD_SELECT },
      },
      orderBy: { decidedAt: "desc" },
    });
    return rows
      .filter(
        // PREMIUM bağlantı, onu KURAN (Keşfet'i kullanan → daima PAKET olan)
        // davet eden taraf PAKET kaldığı sürece aktif. Tedarikçi STANDARD olabilir.
        (r) => r.origin !== "PREMIUM" || r.inviter.tier === "PAKET",
      )
      .map((r) => {
        const other = r.inviterCompanyId === companyId ? r.invitee : r.inviter;
        const contact = other.users[0] ?? null;
        return {
          connectionId: r.id,
          origin: r.origin,
          company: {
            id: other.id,
            name: other.name,
            supkeysId: other.supkeysId,
            tier: other.tier,
            taxNumber: other.taxNumber,
            city: other.city,
            country: other.country,
            industry: other.industry,
            contactName: contact
              ? `${contact.firstName} ${contact.lastName}`.trim()
              : null,
            contactEmail: contact?.email ?? null,
          },
          decidedAt: r.decidedAt,
        };
      });
  }

  /**
   * Keşfet — bağlanılacak firmaları kategori-eşleşmesine göre sıralı listeler.
   * Sadece PAKET keşfedebilir; yalnızca PAKET (görünür) firmalar çıkar.
   * Skor: (ben alırım ∩ o satar) + (ben satarım ∩ o alır). Bağlı/davetli hariç.
   */
  async discover(user: AuthenticatedCompanyUser) {
    if (user.tier !== "PAKET") {
      return { locked: true as const, companies: [] };
    }
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { buyerCategoryIds: true, sellerCategoryIds: true },
    });
    const myBuyer = new Set(me?.buyerCategoryIds ?? []);
    const mySeller = new Set(me?.sellerCategoryIds ?? []);

    // Mevcut bağlantı/davet olan firmaları çıkar.
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: user.companyId },
          { inviteeCompanyId: user.companyId },
        ],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    const exclude = new Set<string>([user.companyId]);
    for (const c of conns) {
      exclude.add(c.inviterCompanyId);
      exclude.add(c.inviteeCompanyId);
    }
    // Engellenenler (iki yön) keşifte görünmez.
    for (const id of await this.blocks.blockedCompanyIds(user.companyId)) {
      exclude.add(id);
    }

    const companies = await this.prisma.company.findMany({
      where: {
        tier: "PAKET",
        isActive: true,
        isBlocked: false,
        id: { notIn: [...exclude] },
      },
      select: {
        id: true,
        name: true,
        supkeysId: true,
        industry: true,
        buyerCategoryIds: true,
        sellerCategoryIds: true,
      },
      take: 100,
    });

    const scored = companies
      .map((c) => {
        const sellsWhatIBuy = c.sellerCategoryIds.filter((x) =>
          myBuyer.has(x),
        ).length;
        const buysWhatISell = c.buyerCategoryIds.filter((x) =>
          mySeller.has(x),
        ).length;
        return {
          id: c.id,
          name: c.name,
          supkeysId: c.supkeysId,
          industry: c.industry,
          matchScore: sellsWhatIBuy + buysWhatISell,
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore);

    return { locked: false as const, companies: scored };
  }

  /** Firma id'leri için bağlantı durumu haritası (kart/profil için). */
  private async connectionStatusMap(
    companyId: string,
    otherIds: string[],
  ): Promise<Map<string, "active" | "pending" | "incoming">> {
    const m = new Map<string, "active" | "pending" | "incoming">();
    if (otherIds.length === 0) return m;
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: companyId, inviteeCompanyId: { in: otherIds } },
          { inviterCompanyId: { in: otherIds }, inviteeCompanyId: companyId },
        ],
      },
      select: {
        inviterCompanyId: true,
        inviteeCompanyId: true,
        status: true,
      },
    });
    for (const c of conns) {
      const other =
        c.inviterCompanyId === companyId
          ? c.inviteeCompanyId
          : c.inviterCompanyId;
      m.set(
        other,
        c.status === "ACTIVE"
          ? "active"
          : c.inviteeCompanyId === companyId
            ? "incoming"
            : "pending",
      );
    }
    return m;
  }

  /** Firma dizini araması — public profilli (PAKET) aktif firmalar. */
  async searchCompanies(user: AuthenticatedCompanyUser, qRaw?: string) {
    const q = (qRaw ?? "").trim();
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    const text = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { supkeysId: { contains: normalizeShortCode(q) } },
            { industry: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const rows = await this.prisma.company.findMany({
      where: {
        id: { notIn: [user.companyId, ...blockedIds] },
        isActive: true,
        isBlocked: false,
        publicEnabled: true,
        tier: "PAKET",
        ...text,
      },
      select: {
        id: true,
        supkeysId: true,
        slug: true,
        name: true,
        industry: true,
        city: true,
        logoUrl: true,
      },
      orderBy: { name: "asc" },
      take: 50,
    });
    const statusMap = await this.connectionStatusMap(
      user.companyId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => ({
      supkeysId: r.supkeysId,
      slug: r.slug,
      name: r.name,
      industry: r.industry,
      city: r.city,
      logoUrl: r.logoUrl,
      connectionStatus: statusMap.get(r.id) ?? ("none" as const),
    }));
  }

  /**
   * Herkese açık firma profili + bağlantı durumu + AÇIK ihaleleri.
   * Bağlıysa tüm açık ihaleleri; değilse yalnızca PUBLIC olanlar.
   */
  async getProfile(user: AuthenticatedCompanyUser, supkeysIdRaw: string) {
    const code = normalizeShortCode(supkeysIdRaw);
    const c = await this.prisma.company.findUnique({
      where: { supkeysId: code },
      select: {
        id: true,
        supkeysId: true,
        slug: true,
        name: true,
        industry: true,
        city: true,
        country: true,
        logoUrl: true,
        coverImageUrl: true,
        aboutText: true,
        services: true,
        certifications: true,
        photos: true,
        certificateImages: true,
        foundedYear: true,
        employeeCount: true,
        website: true,
        linkedinUrl: true,
        instagramUrl: true,
        publicEnabled: true,
        isActive: true,
      },
    });
    if (!c || !c.isActive || !c.publicEnabled) {
      throw new NotFoundException("Firma profili bulunamadı");
    }
    const isSelf = c.id === user.companyId;
    if (!isSelf) {
      const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
      if (blockedIds.includes(c.id)) {
        throw new NotFoundException("Firma profili bulunamadı");
      }
    }
    const conn = isSelf
      ? null
      : await this.prisma.companyConnection.findFirst({
          where: {
            OR: [
              { inviterCompanyId: user.companyId, inviteeCompanyId: c.id },
              { inviterCompanyId: c.id, inviteeCompanyId: user.companyId },
            ],
          },
          select: { id: true, status: true, inviteeCompanyId: true },
        });
    const connectionStatus = isSelf
      ? ("self" as const)
      : !conn
        ? ("none" as const)
        : conn.status === "ACTIVE"
          ? ("active" as const)
          : conn.inviteeCompanyId === user.companyId
            ? ("incoming" as const)
            : ("pending" as const);
    const connectionId = conn?.id ?? null;
    const connected = connectionStatus === "active" || isSelf;

    const listings = await this.prisma.listing.findMany({
      where: {
        companyId: c.id,
        status: "OPEN",
        ...(connected ? {} : { visibility: "PUBLIC" as const }),
      },
      select: {
        id: true,
        number: true,
        type: true,
        format: true,
        title: true,
        status: true,
        createdAt: true,
        closesAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const ratingAgg = await this.prisma.companyReview.aggregate({
      where: { targetCompanyId: c.id },
      _avg: { rating: true },
      _count: true,
    });

    return {
      profile: {
        supkeysId: c.supkeysId,
        slug: c.slug,
        name: c.name,
        industry: c.industry,
        city: c.city,
        country: c.country,
        logoUrl: c.logoUrl,
        coverImageUrl: c.coverImageUrl,
        aboutText: c.aboutText,
        services: c.services,
        certifications: c.certifications,
        photos: c.photos,
        certificateImages: c.certificateImages,
        foundedYear: c.foundedYear,
        employeeCount: c.employeeCount,
        website: c.website,
        linkedinUrl: c.linkedinUrl,
        instagramUrl: c.instagramUrl,
        rating: {
          avg: ratingAgg._avg.rating ?? 0,
          count: ratingAgg._count,
        },
      },
      connectionStatus,
      connectionId,
      connected,
      listings,
    };
  }

  /** Gelen daveti kabul et. */
  async accept(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.requireIncoming(user.companyId, connectionId);
    await this.prisma.companyConnection.update({
      where: { id: conn.id },
      data: { status: "ACTIVE", decidedAt: new Date() },
    });
    return { ok: true };
  }

  /** Gelen daveti reddet (kaydı sil). */
  async reject(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.requireIncoming(user.companyId, connectionId);
    await this.prisma.companyConnection.delete({ where: { id: conn.id } });
    return { ok: true };
  }

  /** Bağlantıyı kopar — taraflardan biri ilişkiyi siler (kaydı kaldırır). */
  async disconnect(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, inviterCompanyId: true, inviteeCompanyId: true },
    });
    if (
      !conn ||
      (conn.inviterCompanyId !== user.companyId &&
        conn.inviteeCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Bağlantı bulunamadı");
    }
    await this.prisma.companyConnection.delete({ where: { id: conn.id } });
    return { ok: true };
  }

  private async requireIncoming(companyId: string, connectionId: string) {
    const conn = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, inviteeCompanyId: true, status: true },
    });
    if (!conn || conn.inviteeCompanyId !== companyId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (conn.status !== "PENDING") {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    return conn;
  }
}
