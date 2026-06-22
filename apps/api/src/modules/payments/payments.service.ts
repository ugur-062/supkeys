import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { PaymentProvider } from "./payment-provider";
import { IyzicoProvider } from "./providers/iyzico.provider";
import { TestPaymentProvider } from "./providers/test.provider";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly provider: PaymentProvider;
  private readonly premiumPrice: number;
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.webUrl = config.get<string>("WEB_URL", "http://localhost:3000");
    this.premiumPrice = Number(config.get<string>("PREMIUM_PRICE_TRY", "4999"));

    const apiKey = config.get<string>("IYZICO_API_KEY");
    const secret = config.get<string>("IYZICO_SECRET_KEY");
    if (apiKey && secret) {
      this.provider = new IyzicoProvider(
        apiKey,
        secret,
        config.get<string>(
          "IYZICO_BASE_URL",
          "https://sandbox-api.iyzipay.com",
        ),
      );
      this.logger.log("Ödeme sağlayıcısı: Iyzico");
    } else {
      this.provider = new TestPaymentProvider(this.webUrl);
      this.logger.warn(
        "IYZICO_API_KEY yok — TEST ödeme sağlayıcısı kullanılıyor (gerçek tahsilat yok).",
      );
    }
  }

  /** Faz 7 — Premium ödeme başlat. Doğrulama (VERIFIED + 2FA) şart. */
  async createPremiumCheckout(supplierId: string, supplierUserId: string) {
    const [supplier, user] = await Promise.all([
      this.prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          companyName: true,
          membership: true,
          companyVerificationStatus: true,
        },
      }),
      this.prisma.supplierUser.findUnique({
        where: { id: supplierUserId },
        select: { email: true, firstName: true, lastName: true, twoFactorEnabled: true },
      }),
    ]);
    if (!supplier || !user) throw new NotFoundException("Tedarikçi bulunamadı");
    if (supplier.membership === "PREMIUM") {
      throw new ConflictException("Zaten premium üyesiniz");
    }
    if (
      supplier.companyVerificationStatus !== "VERIFIED" ||
      !user.twoFactorEnabled
    ) {
      throw new ForbiddenException(
        "Premium'a geçmek için şirket doğrulaması ve 2 adımlı doğrulama gereklidir.",
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        purpose: "PREMIUM_SUPPLIER",
        status: "PENDING",
        supplierId,
        amount: this.premiumPrice,
        currency: "TRY",
        provider: this.provider.name,
      },
    });

    const checkout = await this.provider.createCheckout({
      paymentId: payment.id,
      amount: this.premiumPrice,
      currency: "TRY",
      description: "Supkeys Premium Üyelik (yıllık)",
      callbackUrl: `${this.webUrl.replace(/\/$/, "")}/supplier/premium`,
      buyer: {
        id: supplierId,
        name: `${user.firstName} ${user.lastName}`.trim() || supplier.companyName,
        email: user.email,
      },
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: checkout.providerRef ?? null },
    });

    return {
      paymentId: payment.id,
      provider: this.provider.name,
      redirectUrl: checkout.redirectUrl,
    };
  }

  /** Test sağlayıcı: ödeme onayı (yalnızca test modunda). */
  async confirmTestPayment(supplierId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.supplierId !== supplierId) {
      throw new NotFoundException("Ödeme bulunamadı");
    }
    if (payment.provider !== "test") {
      throw new ForbiddenException("Bu ödeme test modunda değil");
    }
    if (payment.status !== "PENDING") {
      throw new ConflictException("Ödeme zaten sonuçlanmış");
    }
    await this.activatePremium(paymentId, supplierId);
    return { ok: true };
  }

  /** Ödeme PAID + tedarikçi PREMIUM (1 yıl). */
  private async activatePremium(paymentId: string, supplierId: string) {
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: "PAID", paidAt: new Date(), periodEnd },
      }),
      this.prisma.supplier.update({
        where: { id: supplierId },
        data: { membership: "PREMIUM" },
      }),
    ]);
  }
}
