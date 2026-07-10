import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";

@Injectable()
export class MembershipScheduler implements OnModuleInit {
  private readonly logger = new Logger(MembershipScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'ler.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  /**
   * Boot catch-up — sabit-saatli cron (03:00) uyku/restart'ta KAÇAR ve
   * @nestjs/schedule kaçan çalıştırmayı telafi etmez; her açılışta bir kez
   * süresi geçmişleri süpür (kur boot-seed'iyle aynı desen). 30 sn gecikme:
   * bootstrap'ı bloklamasın. JWT strategy'deki efektif-tier lazy guard bu
   * arada yetkiyi zaten anlık kapatıyor; burası kalıcı state + davet iptali
   * + e-posta.
   */
  onModuleInit(): void {
    this.cronRegistry?.register(
      "membership.downgradeExpired",
      "Üyelik süresi biteni STANDARD'a düşür",
      "günlük 03:00 + boot catch-up",
    );
    setTimeout(() => {
      this.downgradeExpired().catch((err: unknown) =>
        this.logger.warn(
          `Boot membership catch-up başarısız: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }, 30_000);
  }

  /**
   * Her gün İstanbul saatiyle 03:00 — süresi geçmiş PAKET üyelikleri
   * STANDARD'a düşürür. Tier düştüğünde firmanın KURDUĞU bağlantılar (PREMIUM +
   * INVITE, list filtresi sayesinde) pasifleşir; giden bekleyen davetler iptal
   * edilir; firmaya bilgilendirme e-postası gider.
   */
  @Cron("0 3 * * *", { timeZone: "Europe/Istanbul" })
  async downgradeExpired(): Promise<void> {
    return trackCronRun(this.cronRegistry, "membership.downgradeExpired", () =>
      this.doDowngradeExpired(),
    );
  }

  private async doDowngradeExpired(): Promise<void> {
    const expired = await this.prisma.company.findMany({
      where: {
        tier: "PAKET",
        membershipEndAt: { not: null, lt: new Date() },
      },
      select: {
        id: true,
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
    if (expired.length === 0) return;

    // Her firmayı ATOMİK claim et (tier: PAKET → STANDARD): yalnız geçişi
    // gerçekten yapan worker bilgilendirme e-postası atar. Dağıtık kilit yok;
    // iki replica 03:00'te aynı anda tetiklenirse koşulsuz updateMany + mail
    // çift downgrade e-postası atardı.
    const downgraded: typeof expired = [];
    for (const c of expired) {
      const claimed = await this.prisma.company.updateMany({
        where: { id: c.id, tier: "PAKET" },
        data: { tier: "STANDARD" },
      });
      if (claimed.count === 1) downgraded.push(c);
    }
    if (downgraded.length === 0) return;
    const ids = downgraded.map((c) => c.id);

    // Downgrade olan firmanın GÖNDERDİĞİ bekleyen davetleri iptal et: STANDARD
    // davet gönderemez ve kabul edilse bağlantı ölü doğardı (kural: bağlantı
    // onu KURAN taraf PAKET kaldıkça aktif). Kayıtlı-firma daveti + kayıtsız
    // e-posta (referral) daveti — ikisi de. Gelen davetlere dokunulmaz.
    await this.prisma.$transaction([
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

    // Bilgilendirme e-postası (best-effort) — firma yetkisini kaybettiğini bilsin.
    const baseUrl =
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    for (const c of downgraded) {
      const email = c.billingEmail || c.users[0]?.email;
      if (!email) continue;
      const name = c.users[0]
        ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
        : c.name;
      void this.email
        .send({
          to: { email, name },
          subject: "Premium üyeliğiniz sona erdi",
          templateData: {
            template: "notification",
            data: {
              subject: "Premium üyeliğiniz sona erdi",
              heading: "Premium üyeliğiniz sona erdi",
              paragraphs: [
                "Merhaba,",
                "Premium (Rothern) üyeliğinizin süresi doldu ve hesabınız Standart üyeliğe geçirildi. Artık yeni ihale açamaz, firma davet edemez veya dizinde görünemezsiniz; mevcut ilanlarınızı tamamlayabilir ve gelen davetlere teklif verebilirsiniz.",
                "Tekrar premium'a geçmek için hesabınızdan yükseltme yapabilirsiniz.",
              ],
              ctaLabel: "Premium'a Geç",
              ctaUrl: `${baseUrl}/company/premium`,
            },
          },
          context: { type: "membership_downgraded", id: c.id },
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `Downgrade e-postası gönderilemedi (${c.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }
  }
}
