import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeShortCode, validateShortCode } from "@rothern/shared";
import { Prisma } from "@rothern/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { EmailService } from "../../email/email.service";
import { NotificationService } from "../../notifications/notification.service";
import { resolveWebUrl } from "../../../common/config/web-url";

type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

/** Bağlantı kartı için firma alanları (ihale daveti adımı + bağlantılar). */
const COMPANY_CARD_SELECT = {
  id: true,
  name: true,
  rothernId: true,
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
    private readonly notifications: NotificationService,
  ) {}

  /** Kendi Rothern ID. */
  async getSelf(user: AuthenticatedCompanyUser) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { rothernId: true },
    });
    return { rothernId: c?.rothernId ?? null };
  }

  /**
   * Rothern ID (rothernId) ile bağlantı isteği — PLATFORM (PREMIUM) bağlantısı.
   * Sadece PAKET gönderebilir; premium bitince bu bağlantı pasifleşir.
   */
  async invite(user: AuthenticatedCompanyUser, rothernIdRaw: string) {
    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        "Bağlantı daveti göndermek premium (PAKET) üyelik gerektirir. Standart üyeler yalnızca gelen davetleri kabul edip tedarikçi olabilir.",
      );
    }
    const code = normalizeShortCode(rothernIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz Rothern ID (XXXX-XXXX)");
    }
    const target = await this.prisma.company.findUnique({
      where: { rothernId: code },
      select: { id: true, name: true, isActive: true, isBlocked: true },
    });
    if (!target || !target.isActive || target.isBlocked) {
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
    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        "Bağlantı daveti göndermek premium (PAKET) üyelik gerektirir. Standart üyeler yalnızca gelen davetleri kabul edip tedarikçi olabilir.",
      );
    }
    const email = emailRaw.trim().toLowerCase();

    // Kayıtlı mı? E-posta CompanyUser'da benzersizdir — pasif/çıkarılmış
    // kullanıcı e-postasına referral maili göndermek boşa gider (o e-postayla
    // yeniden kayıt olunamaz). Kullanıcı pasif ama FİRMA aktifse istek yine
    // firmaya gider; firma pasifse anlamlı hata verilir.
    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: {
        company: {
          select: { id: true, name: true, isActive: true, isBlocked: true },
        },
      },
    });
    if (existing?.company) {
      if (!existing.company.isActive || existing.company.isBlocked) {
        throw new BadRequestException(
          "Bu e-posta adresinin bağlı olduğu firma artık aktif değil",
        );
      }
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
      resolveWebUrl(this.config);
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

  /**
   * Toplu e-posta daveti (eski sistem paritesi, 50'ye kadar). Her adres tek
   * tek işlenir ve SINIFLANDIRILMIŞ sonuç döner — biri patlarsa diğerleri
   * etkilenmez:
   *  - request  → kayıtlı firmaya bağlantı isteği gitti
   *  - invited  → kayıtsız, davet e-postası gitti
   *  - skipped  → gönderilmedi (zaten bağlı / zaten istekli / kendi firması /
   *               pasif firma / engelli) — reason ile
   */
  async inviteByEmailBatch(user: AuthenticatedCompanyUser, emails: string[]) {
    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        "Bağlantı daveti göndermek premium (PAKET) üyelik gerektirir. Standart üyeler yalnızca gelen davetleri kabul edip tedarikçi olabilir.",
      );
    }
    // Normalize + sıra korumalı dedupe.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const raw of emails) {
      const e = raw.trim().toLowerCase();
      if (e && !seen.has(e)) {
        seen.add(e);
        unique.push(e);
      }
    }

    const results: {
      email: string;
      status: "request" | "invited" | "skipped";
      targetName?: string;
      reason?: string;
    }[] = [];

    for (const email of unique) {
      try {
        const res = await this.inviteByEmail(user, email);
        results.push(
          res.kind === "request"
            ? { email, status: "request", targetName: res.targetName }
            : { email, status: "invited" },
        );
      } catch (e) {
        const reason =
          e instanceof ConflictException ||
          e instanceof BadRequestException ||
          e instanceof NotFoundException ||
          e instanceof ForbiddenException
            ? ((e.getResponse() as { message?: string }).message ?? e.message)
            : "Gönderilemedi";
        results.push({ email, status: "skipped", reason });
      }
    }

    return {
      results,
      summary: {
        request: results.filter((r) => r.status === "request").length,
        invited: results.filter((r) => r.status === "invited").length,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
    };
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

    let conn;
    try {
      conn = await this.prisma.companyConnection.create({
        data: {
          inviterCompanyId: user.companyId,
          inviteeCompanyId: target.id,
          invitedById: user.userId,
          status: "PENDING",
          origin,
        },
      });
    } catch (e) {
      // Yarış: findFirst ile create arasında aynı yönde kayıt oluştu.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Bu firmaya zaten istek gönderdiniz");
      }
      throw e;
    }
    // Hedef firmaya in-app haber ver (tercihe tabi değil — bilinmeyen tip açık).
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    void this.notifications
      .pushToCompany(target.id, {
        type: "connection_request",
        title: "Yeni bağlantı isteği",
        body: `${me?.name ?? "Bir firma"} sizinle bağlantı kurmak istiyor. Bağlantılar sayfasındaki Gelen İstekler'den yanıtlayabilirsiniz.`,
      })
      .catch((err) =>
        this.logger.warn(
          `Bağlantı isteği bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    // E-posta kanalı (in-app'e paralel) — hedef firma uygulamada değilse kaçırmasın.
    void this.emailCompany(
      target.id,
      "Yeni bağlantı isteği",
      [
        "Merhaba,",
        `${me?.name ?? "Bir firma"} sizinle bağlantı kurmak istiyor. Rothern'de Bağlantılar → Gelen İstekler'den yanıtlayabilirsiniz.`,
      ],
      "connection_request",
      conn.id,
    );
    return { id: conn.id, status: conn.status, targetName: target.name };
  }

  /** Firmanın bildirim e-postasına (billingEmail → ilk aktif kullanıcı) bildirim
   *  şablonuyla e-posta. Best-effort. */
  private async emailCompany(
    companyId: string,
    subject: string,
    paragraphs: string[],
    type: string,
    contextId: string,
  ) {
    try {
      const c = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          billingEmail: true,
          users: {
            where: { isActive: true, deletedAt: null },
            select: { email: true, firstName: true, lastName: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      const email = c?.billingEmail || c?.users[0]?.email;
      if (!c || !email) return;
      const name = c.users[0]
        ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
        : c.name;
      const baseUrl =
        resolveWebUrl(this.config);
      await this.email.send({
        to: { email, name },
        subject,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: subject,
            paragraphs,
            ctaLabel: "Rothern'e Git",
            ctaUrl: `${baseUrl}/company`,
          },
        },
        context: { type, id: contextId },
      });
    } catch (err) {
      this.logger.warn(
        `Bağlantı e-postası gönderilemedi (${companyId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }


  /** Gönderdiğim bekleyen bağlantı istekleri (iptal edilebilir). */
  async listOutgoing(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviterCompanyId: companyId, status: "PENDING" },
      include: {
        invitee: { select: { id: true, name: true, rothernId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      connectionId: r.id,
      company: r.invitee,
      createdAt: r.createdAt,
    }));
  }

  /** Bekleyen e-posta davetini iptal et (kayıt olunca bağ kurulmaz). */
  async cancelReferralInvite(user: AuthenticatedCompanyUser, id: string) {
    const res = await this.prisma.companyReferralInvite.deleteMany({
      where: { id, inviterCompanyId: user.companyId, status: "PENDING" },
    });
    if (res.count === 0) throw new NotFoundException("Davet bulunamadı");
    return { ok: true };
  }

  /** Bana gelen bekleyen davetler. */
  async listIncoming(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId, status: "PENDING" },
      include: {
        inviter: { select: { id: true, name: true, rothernId: true } },
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
   * Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece aktif sayılır —
   * PREMIUM ve INVITE için (premium bitince pasifleşir, silinmez). ADMIN hariç
   * (platform kararı, hep açık). Böylece bir kez premium olup bol davet atarak
   * kalıcı bedava bağlantı ağı tutulamaz.
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
        // Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece aktif —
        // hem PREMIUM hem INVITE için (ADMIN hariç: platform kararı, hep açık).
        // Ödemeyi bırakınca kendi başlattığın ağı kaybedersin; açık kalan tek
        // pencere hâlâ ödeyen birinin seni davet ettiği bağlantılardır.
        (r) => r.origin === "ADMIN" || r.inviter.tier === "PAKET",
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
            rothernId: other.rothernId,
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
        rothernId: true,
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
          rothernId: c.rothernId,
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
    // Firma dizini araması premium özelliğidir — STANDARD firma dizinde arama
    // yapamaz, yalnızca mevcut bağlantılarını görür (Bağlantılarım sekmesi).
    if (user.tier !== "PAKET") return [];
    const q = (qRaw ?? "").trim();
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    const text = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { rothernId: { contains: normalizeShortCode(q) } },
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
        rothernId: true,
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
      rothernId: r.rothernId,
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
  async getProfile(user: AuthenticatedCompanyUser, rothernIdRaw: string) {
    const code = normalizeShortCode(rothernIdRaw);
    const c = await this.prisma.company.findUnique({
      where: { rothernId: code },
      select: {
        id: true,
        rothernId: true,
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
        isBlocked: true,
        tier: true,
        // Kamuya açık ticari sicil bilgileri (tüzel kişi verisi — KVKK dışı).
        // IBAN / yetkili TCKN / fatura iletişimi ASLA buraya girmez.
        legalName: true,
        taxNumber: true,
        taxOffice: true,
        mersisNo: true,
        tradeRegistryNo: true,
        kepAddress: true,
      },
    });
    // Admin-bloklu firma dizin/doğrudan-id yolundan da görünmez (arama zaten
    // filtreliyor; doğrudan rothernId erişimi bu filtreyi atlıyordu).
    if (!c || !c.isActive || c.isBlocked) {
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

    // Görünürlük kuralı:
    // - İlişkili (kendisi / bağlı / bekleyen / gelen istek) → her zaman görür.
    // - Aksi halde yalnızca "herkese açık" profil: hedef PAKET + publicEnabled
    //   VE izleyen de PAKET (dizin). STANDARD firma yalnız BAĞLANTILARINA görünür;
    //   STANDARD izleyen yalnız ilişkili firmayı görür. Varlığı sızdırmamak için 404.
    const related = isSelf || connectionStatus !== "none";
    const publiclyListed =
      user.tier === "PAKET" && c.tier === "PAKET" && c.publicEnabled;
    if (!related && !publiclyListed) {
      throw new NotFoundException("Firma profili bulunamadı");
    }

    const [listings, ratingAgg] = await Promise.all([
      this.prisma.listing.findMany({
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
      }),
      this.prisma.companyReview.aggregate({
        where: { targetCompanyId: c.id },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    return {
      profile: {
        rothernId: c.rothernId,
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
        trade: {
          legalName: c.legalName,
          taxNumber: c.taxNumber,
          taxOffice: c.taxOffice,
          mersisNo: c.mersisNo,
          tradeRegistryNo: c.tradeRegistryNo,
          kepAddress: c.kepAddress,
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
    // Atomik: ters-yön sarkan PENDING'i ÖNCE sil, SONRA ACTIVE yap — tek tx'te.
    // Sıra önemli: yön-bağımsız partial unique index (PENDING+ACTIVE) A→B ACTIVE
    // olurken B→A PENDING ile çakışırdı; önce silmek çakışmayı önler. Geçiş
    // koşullu (status=PENDING) kalır → reject/disconnect yarışında count=0.
    const updatedCount = await this.prisma.$transaction(async (tx) => {
      // Çapraz yarış temizliği: iki firma AYNI ANDA birbirine istek attıysa
      // ters yönde ikinci bir PENDING kayıt oluşmuş olabilir.
      await tx.companyConnection.deleteMany({
        where: {
          inviterCompanyId: user.companyId,
          inviteeCompanyId: conn.inviterCompanyId,
          status: "PENDING",
        },
      });
      const updated = await tx.companyConnection.updateMany({
        where: {
          id: conn.id,
          inviteeCompanyId: user.companyId,
          status: "PENDING",
        },
        data: { status: "ACTIVE", decidedAt: new Date() },
      });
      return updated.count;
    });
    if (updatedCount === 0) {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    // Davet eden firmaya haber ver.
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    void this.notifications
      .pushToCompany(conn.inviterCompanyId, {
        type: "connection_accepted",
        title: "Bağlantı isteğiniz kabul edildi",
        body: `${me?.name ?? "Bir firma"} bağlantı isteğinizi kabul etti — artık birbirinizin bağlantılara açık ihalelerini görebilirsiniz.`,
      })
      .catch((err) =>
        this.logger.warn(
          `Bağlantı kabul bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    void this.emailCompany(
      conn.inviterCompanyId,
      "Bağlantı isteğiniz kabul edildi",
      [
        "Merhaba,",
        `${me?.name ?? "Bir firma"} bağlantı isteğinizi kabul etti — artık birbirinizin bağlantılara açık ihalelerini görebilirsiniz.`,
      ],
      "connection_accepted",
      conn.id,
    );
    return { ok: true };
  }

  /** Gelen daveti reddet (kaydı sil) — durum guard'lı atomik silme. */
  async reject(user: AuthenticatedCompanyUser, connectionId: string) {
    await this.requireIncoming(user.companyId, connectionId);
    const res = await this.prisma.companyConnection.deleteMany({
      where: {
        id: connectionId,
        inviteeCompanyId: user.companyId,
        status: "PENDING",
      },
    });
    if (res.count === 0) {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    return { ok: true };
  }

  /** Bağlantıyı kopar — taraflardan biri ilişkiyi siler (kaydı kaldırır). */
  async disconnect(user: AuthenticatedCompanyUser, connectionId: string) {
    // Atomik deleteMany (sahiplik koşullu): çift-disconnect yarışında ikinci
    // çağrı count=0 alır — findUnique+delete'in P2025 (yakalanmamış 500) yerine.
    const res = await this.prisma.companyConnection.deleteMany({
      where: {
        id: connectionId,
        OR: [
          { inviterCompanyId: user.companyId },
          { inviteeCompanyId: user.companyId },
        ],
      },
    });
    if (res.count === 0) {
      throw new NotFoundException("Bağlantı bulunamadı");
    }
    return { ok: true };
  }

  private async requireIncoming(companyId: string, connectionId: string) {
    const conn = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        inviterCompanyId: true,
        inviteeCompanyId: true,
        status: true,
      },
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
