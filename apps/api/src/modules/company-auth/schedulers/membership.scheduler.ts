import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../../common/prisma/prisma.service";

@Injectable()
export class MembershipScheduler {
  private readonly logger = new Logger(MembershipScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Her gün İstanbul saatiyle 03:00 — süresi geçmiş PAKET üyelikleri
   * STANDARD'a düşürür. Tier düştüğünde premium-origin bağlantılar
   * (connectedCompanyIds / list filtresi sayesinde) otomatik pasifleşir;
   * referans (INVITE) bağlantılar etkilenmez.
   */
  @Cron("0 3 * * *", { timeZone: "Europe/Istanbul" })
  async downgradeExpired(): Promise<void> {
    const expired = await this.prisma.company.findMany({
      where: {
        tier: "PAKET",
        membershipEndAt: { not: null, lt: new Date() },
      },
      select: { id: true },
    });
    if (expired.length === 0) return;
    const ids = expired.map((c) => c.id);

    await this.prisma.$transaction([
      this.prisma.company.updateMany({
        where: { id: { in: ids } },
        data: { tier: "STANDARD" },
      }),
      // Downgrade olan firmanın GÖNDERDİĞİ bekleyen davetleri iptal et: STANDARD
      // davet gönderemez ve kabul edilse bağlantı ölü doğardı (kural: bağlantı
      // onu KURAN taraf PAKET kaldıkça aktif). Kayıtlı-firma daveti + kayıtsız
      // e-posta (referral) daveti — ikisi de. Gelen davetlere dokunulmaz.
      this.prisma.companyConnection.deleteMany({
        where: { inviterCompanyId: { in: ids }, status: "PENDING" },
      }),
      this.prisma.companyReferralInvite.deleteMany({
        where: { inviterCompanyId: { in: ids }, status: "PENDING" },
      }),
    ]);
    this.logger.log(
      `${ids.length} firmanın premium süresi doldu → STANDARD; giden bekleyen davetler iptal edildi`,
    );
  }
}
