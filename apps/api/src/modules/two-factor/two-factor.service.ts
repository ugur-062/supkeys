import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailService } from "../email/email.service";

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export type TwoFactorKind = "user" | "supplier";
export type TwoFactorPurpose = "LOGIN" | "ENABLE";

export interface TwoFactorTarget {
  kind: TwoFactorKind;
  id: string;
  email: string;
  firstName: string;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** 6 haneli OTP üret, hash'le, kaydet, e-posta gönder. challengeId döner. */
  async issueChallenge(
    target: TwoFactorTarget,
    purpose: TwoFactorPurpose,
  ): Promise<{ challengeId: string; expiresAt: string }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

    const challenge = await this.prisma.twoFactorChallenge.create({
      data: {
        userId: target.kind === "user" ? target.id : null,
        supplierUserId: target.kind === "supplier" ? target.id : null,
        purpose,
        codeHash: hashCode(code),
        expiresAt,
      },
      select: { id: true },
    });

    // Dev: kodu log'la (demo e-postaları gerçek gelen kutusu olmayabilir).
    if (process.env.NODE_ENV !== "production") {
      this.logger.debug(
        `2FA ${purpose} kodu (${target.email}): ${code} [challenge=${challenge.id}]`,
      );
    }

    try {
      await this.email.send({
        to: { email: target.email, name: target.firstName },
        templateData: {
          template: "two_factor_otp",
          data: {
            firstName: target.firstName,
            otpCode: code,
            expiresInMinutes: CODE_TTL_MIN,
            purposeLabel: purpose === "LOGIN" ? "giriş" : "etkinleştirme",
          },
        },
      });
    } catch (err) {
      // E-posta sağlayıcı hatası login'i tamamen bloklamasın; dev'de log var.
      this.logger.warn(
        `2FA e-postası gönderilemedi (${target.email}): ${String(err)}`,
      );
    }

    return { challengeId: challenge.id, expiresAt: expiresAt.toISOString() };
  }

  /**
   * challengeId + kod doğrula. Doğruysa consumed işaretler + hedef id döner.
   * Hatalı kod → attempt++ + 401. Süre/limit → 401.
   */
  async verifyChallenge(
    challengeId: string,
    code: string,
    expect: { kind: TwoFactorKind; purpose: TwoFactorPurpose },
  ): Promise<{ id: string }> {
    const ch = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: challengeId },
    });
    const fail = () =>
      new UnauthorizedException("Doğrulama kodu geçersiz veya süresi dolmuş");

    if (!ch || ch.purpose !== expect.purpose) throw fail();
    if (ch.consumedAt) throw fail();
    if (ch.expiresAt.getTime() < Date.now()) throw fail();
    if (ch.attempts >= MAX_ATTEMPTS) throw fail();

    const targetId = expect.kind === "user" ? ch.userId : ch.supplierUserId;
    if (!targetId) throw fail();

    if (ch.codeHash !== hashCode(code.trim())) {
      await this.prisma.twoFactorChallenge.update({
        where: { id: ch.id },
        data: { attempts: { increment: 1 } },
      });
      throw fail();
    }

    await this.prisma.twoFactorChallenge.update({
      where: { id: ch.id },
      data: { consumedAt: new Date() },
    });
    return { id: targetId };
  }

  /** ENABLE doğrulaması sırasında basit kod format kontrolü. */
  assertCodeFormat(code: string): void {
    if (!/^[0-9]{6}$/.test(code.trim())) {
      throw new BadRequestException("Doğrulama kodu 6 haneli olmalıdır");
    }
  }
}
