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
    const res = await this.prisma.company.updateMany({
      where: {
        tier: "PAKET",
        membershipEndAt: { not: null, lt: new Date() },
      },
      data: { tier: "STANDARD" },
    });
    if (res.count > 0) {
      this.logger.log(
        `${res.count} firmanın premium süresi doldu → STANDARD'a düşürüldü`,
      );
    }
  }
}
