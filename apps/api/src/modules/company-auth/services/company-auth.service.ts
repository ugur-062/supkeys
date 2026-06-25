import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyRole, type Company, type CompanyUser } from "@supkeys/db";
import { generateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { CompanyLoginDto } from "../dto/company-login.dto";
import { CompanySignupDto } from "../dto/company-signup.dto";
import type { CompanyJwtPayload } from "../strategies/company-jwt.strategy";

type Ctx = { ip?: string; userAgent?: string };

@Injectable()
export class CompanyAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
  ) {}

  // ============================================================
  // SIGNUP — firma self-servis kaydı (kaydeden = SAHİP)
  // ============================================================
  async signup(dto: CompanySignupDto, ctx?: Ctx) {
    const email = dto.email.toLowerCase().trim();

    // Aynı e-posta zaten bir CompanyUser'da var mı? (dostane mesaj)
    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("Bu e-posta ile zaten bir hesap var");
    }

    // 1) Supabase auth.users oluştur (email_confirm: true)
    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      type: "company",
    });

    const supkeysId = await this.generateUniqueSupkeysId();

    // 2) Company + ilk CompanyUser (owner). Prisma hatasında auth.users temizle.
    let result: { company: Company; user: CompanyUser };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.companyName.trim(),
            tier: "STANDARD",
            supkeysId,
          },
        });
        const user = await tx.companyUser.create({
          data: {
            email,
            authId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim() || null,
            // İlk kullanıcı = sahip → yönetici + her iki operasyon rolü.
            roles: [
              CompanyRole.YONETICI,
              CompanyRole.SATIN_ALMACI,
              CompanyRole.SATISCI,
            ],
            companyId: company.id,
            // Supabase email_confirm:true → doğrulanmış kabul. (6-haneli kod
            // akışı sonraki chunk.)
            emailVerifiedAt: new Date(),
          },
        });
        const updatedCompany = await tx.company.update({
          where: { id: company.id },
          data: { ownerUserId: user.id },
        });
        return { company: updatedCompany, user };
      });
    } catch (e) {
      // Orphan auth.users bırakma.
      await this.supabaseAuth.deleteUser(authId);
      throw e;
    }

    void this.audit.log({
      action: "company.signup",
      actorType: "company",
      actorId: result.user.id,
      actorEmail: email,
      metadata: { companyId: result.company.id, portal: "company" },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return this.buildLoginResponse(result.user, result.company);
  }

  // ============================================================
  // LOGIN
  // ============================================================
  async login(dto: CompanyLoginDto, ctx?: Ctx) {
    const email = dto.email.toLowerCase().trim();
    const auditFail = (reason: string) =>
      void this.audit.log({
        action: "auth.login_failed",
        actorType: "company",
        actorEmail: email,
        metadata: { reason, portal: "company" },
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      });

    let authId: string;
    try {
      const r = await this.supabaseAuth.verifyPassword(email, dto.password);
      authId = r.authId;
    } catch {
      auditFail("bad_credentials");
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }

    const user = await this.prisma.companyUser.findUnique({
      where: { authId },
      include: { company: true },
    });
    if (!user) {
      auditFail("user_missing");
      throw new UnauthorizedException("E-posta veya şifre hatalı");
    }
    if (user.deletedAt || !user.isActive) {
      auditFail("user_inactive");
      throw new ForbiddenException("Kullanıcı hesabı aktif değil");
    }
    if (user.company.isBlocked) {
      auditFail("company_blocked");
      throw new ForbiddenException("Firma hesabı engellenmiş");
    }
    if (!user.company.isActive) {
      auditFail("company_inactive");
      throw new ForbiddenException("Firma hesabı aktif değil");
    }
    if (!user.emailVerifiedAt) {
      auditFail("email_unverified");
      throw new ForbiddenException(
        "Giriş yapmadan önce e-posta adresinizi doğrulayın.",
      );
    }

    return this.buildLoginResponse(user, user.company, ctx);
  }

  // ============================================================
  // ME
  // ============================================================
  async getMe(userId: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new UnauthorizedException();
    return {
      user: this.serializeUser(user, user.company.ownerUserId === user.id),
      company: this.serializeCompany(user.company),
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================
  private async buildLoginResponse(
    user: CompanyUser,
    company: Company,
    ctx?: Ctx,
  ) {
    await this.prisma.companyUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: CompanyJwtPayload = {
      sub: user.id,
      email: user.email,
      type: "company",
      userId: user.id,
      companyId: company.id,
    };

    void this.audit.log({
      action: "auth.login",
      actorType: "company",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { portal: "company", companyId: company.id },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      token: this.jwt.sign(payload),
      user: this.serializeUser(
        { ...user, lastLoginAt: new Date() },
        company.ownerUserId === user.id,
      ),
      company: this.serializeCompany(company),
    };
  }

  private serializeUser(user: CompanyUser, isOwner: boolean) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      roles: user.roles,
      isOwner,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /** Çakışmasız supkeysId üretir (XXXX-XXXX). Bağlantı davetinde kullanılır. */
  private async generateUniqueSupkeysId(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateShortCode();
      const exists = await this.prisma.company.count({
        where: { supkeysId: code },
      });
      if (exists === 0) return code;
    }
    throw new Error("supkeysId üretilemedi (çakışma)");
  }

  private serializeCompany(company: Company) {
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      supkeysId: company.supkeysId,
      tier: company.tier,
      country: company.country,
      companyVerificationStatus: company.companyVerificationStatus,
      onboardingCompletedAt: company.onboardingCompletedAt,
      ownerUserId: company.ownerUserId,
      publicEnabled: company.publicEnabled,
      isActive: company.isActive,
    };
  }
}
