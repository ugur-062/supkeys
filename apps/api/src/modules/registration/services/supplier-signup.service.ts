import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { generateShortCode } from "@supkeys/shared";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { TwoFactorService } from "../../two-factor/two-factor.service";
import { hashToken } from "../helpers/token.helper";
import {
  SupplierSignupDto,
  VerifySupplierEmailDto,
} from "../dto/supplier-signup.dto";

/**
 * Signup sırasında kurulacak alıcı bağlantısı. `invite` → alıcı davet linki
 * (ACTIVE); `connect` → "Tedarikçi Ol" başvurusu (alıcı onayı bekler).
 */
type ResolvedLink =
  | {
      kind: "invite";
      tenantId: string;
      invitationId: string;
      tenderId: string | null;
    }
  | { kind: "connect"; tenantId: string };

/**
 * Madde 29 — Tedarikçi signup (önce hesap). Hesap anında oluşur (admin ön-onayı
 * yok); şirket bilgileri onboarding'de, doğrulama belgeleri FAZ 3'te toplanır.
 * E-posta 6 haneli KOD ile doğrulanır; doğrulanana kadar login engellenir.
 */
@Injectable()
export class SupplierSignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  async signup(dto: SupplierSignupDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.supplierUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Bu e-posta ile zaten bir tedarikçi hesabı var. Giriş yapın.",
      );
    }

    // Davet/connect linkini hesap oluşturmadan ÖNCE doğrula — geçersiz linkte
    // boş hesap (Supabase + domain) kalmasın.
    const link = await this.resolveLink(dto);

    // Supabase auth kullanıcısı (parola doğrulama kaynağı).
    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      kind: "supplier",
    });

    let created: { id: string; firstName: string };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({
          data: {
            supkeysId: generateShortCode(),
            // Şirket bilgileri onboarding'de doldurulur (placeholder'lar).
            companyName: `${dto.firstName} ${dto.lastName}`.trim() || "Yeni Tedarikçi",
            companyType: "LIMITED",
            taxNumber: null,
            taxOffice: "",
            taxCertUrl: null,
            city: "",
            district: "",
            addressLine: "",
          },
          select: { id: true },
        });
        const supplierUser = await tx.supplierUser.create({
          data: {
            email,
            authId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim() || null,
            isManager: true,
            supplierId: supplier.id,
            // emailVerifiedAt null → doğrulanana kadar login engelli.
          },
          select: { id: true, firstName: true },
        });
        // Madde 29 — davet linkiyle gelindiyse alıcı bağlantısını burada kur.
        if (link) await this.linkToTenant(tx, supplier.id, link);
        return supplierUser;
      });
    } catch (err) {
      // Domain kaydı başarısızsa Supabase kullanıcısını geri al.
      await this.supabaseAuth.deleteUser(authId).catch(() => undefined);
      throw err;
    }

    const { challengeId, expiresAt } = await this.twoFactor.issueChallenge(
      { kind: "supplier", id: created.id, email, firstName: created.firstName },
      "EMAIL_VERIFY",
    );
    return { challengeId, expiresAt, email };
  }

  /**
   * Davet token'ı / connect slug'ını doğrula (hesap oluşturmadan önce). Yoksa
   * null döner (klasik self-register). Geçersiz/süresi dolmuş linkte hata atar.
   */
  private async resolveLink(dto: SupplierSignupDto): Promise<ResolvedLink | null> {
    if (dto.invitationToken) {
      const tokenHash = hashToken(dto.invitationToken);
      const invitation = await this.prisma.supplierInvitation.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          tenantId: true,
          status: true,
          expiresAt: true,
          tenderId: true,
        },
      });
      if (!invitation) {
        throw new NotFoundException("Davet bağlantısı geçersiz");
      }
      if (invitation.status !== "PENDING") {
        throw new BadRequestException(
          "Davet bağlantısı kullanılamaz (iptal edilmiş veya kabul edilmiş)",
        );
      }
      if (invitation.expiresAt < new Date()) {
        throw new GoneException("Davet bağlantısının süresi dolmuş");
      }
      return {
        kind: "invite",
        tenantId: invitation.tenantId,
        invitationId: invitation.id,
        tenderId: invitation.tenderId,
      };
    }

    if (dto.connectSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: dto.connectSlug },
        select: { id: true, publicEnabled: true, isActive: true },
      });
      if (!tenant || !tenant.publicEnabled || !tenant.isActive) {
        throw new NotFoundException("Firma bulunamadı veya başvuruya kapalı");
      }
      return { kind: "connect", tenantId: tenant.id };
    }

    return null;
  }

  /**
   * Tedarikçi ↔ alıcı bağlantısını kur. Davet (INVITE) → direkt ACTIVE; connect
   * ("Tedarikçi Ol") → PENDING_TENANT_APPROVAL (alıcı "Gelen İstekler"de onaylar).
   * Davet bir ihaleye bağlıysa (tenderId) tedarikçiyi o ihaleye de davetli yapar.
   */
  private async linkToTenant(
    tx: Prisma.TransactionClient,
    supplierId: string,
    link: ResolvedLink,
  ): Promise<void> {
    const isConnect = link.kind === "connect";
    await tx.supplierTenantRelation.upsert({
      where: { supplierId_tenantId: { supplierId, tenantId: link.tenantId } },
      create: {
        supplierId,
        tenantId: link.tenantId,
        status: isConnect ? "PENDING_TENANT_APPROVAL" : "ACTIVE",
        origin: isConnect ? "CONNECT_REQUEST" : "INVITE",
        requestedAt: isConnect ? new Date() : null,
      },
      // Connect-request mevcut ilişkiye dokunmaz; davet ise ACTIVE'e çeker.
      update: isConnect ? {} : { status: "ACTIVE", origin: "INVITE" },
    });

    if (link.kind !== "invite") return;

    // Davet kaydını ACCEPTED işaretle.
    await tx.supplierInvitation.update({
      where: { id: link.invitationId },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedBySupplierId: supplierId,
      },
    });

    // V2-7 — davet bir ihaleye bağlıysa tedarikçiyi o ihaleye davetli yap
    // (ihale hâlâ DRAFT/OPEN_FOR_BIDS ise; kapanmışsa atla).
    if (link.tenderId) {
      const tender = await tx.tender.findUnique({
        where: { id: link.tenderId },
        select: { status: true },
      });
      if (
        tender &&
        (tender.status === "OPEN_FOR_BIDS" || tender.status === "DRAFT")
      ) {
        await tx.tenderInvitation.upsert({
          where: {
            tenderId_supplierId: { tenderId: link.tenderId, supplierId },
          },
          create: {
            tenderId: link.tenderId,
            supplierId,
            status: "PENDING",
          },
          update: {},
        });
      }
    }
  }

  /** 6 haneli kodu doğrula → e-posta doğrulandı (login açılır). */
  async verifyEmail(dto: VerifySupplierEmailDto) {
    this.twoFactor.assertCodeFormat(dto.code);
    const { id } = await this.twoFactor.verifyChallenge(
      dto.challengeId,
      dto.code,
      { kind: "supplier", purpose: "EMAIL_VERIFY" },
    );
    await this.prisma.supplierUser.update({
      where: { id },
      data: { emailVerifiedAt: new Date() },
    });
    return { ok: true };
  }

  /** Kodu yeniden gönder (challengeId ile kullanıcıyı bul). */
  async resend(challengeId: string) {
    const ch = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: challengeId },
      select: { supplierUserId: true },
    });
    if (!ch?.supplierUserId) {
      throw new ConflictException("Geçersiz oturum, lütfen tekrar kayıt olun");
    }
    const u = await this.prisma.supplierUser.findUnique({
      where: { id: ch.supplierUserId },
      select: { id: true, email: true, firstName: true },
    });
    if (!u) throw new ConflictException("Kullanıcı bulunamadı");
    return this.twoFactor.issueChallenge(
      { kind: "supplier", id: u.id, email: u.email, firstName: u.firstName },
      "EMAIL_VERIFY",
    );
  }
}
