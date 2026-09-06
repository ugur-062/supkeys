import { PAID_TIERS } from "@rothern/shared";
import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";
import { resolveWebUrl } from "../../../common/config/web-url";
import { appRoutes } from "../../../common/company/app-routes";
import { enforceProductLimit } from "../../../common/company/product-limit";

@Injectable()
export class MembershipScheduler implements OnModuleInit {
  private readonly logger = new Logger(MembershipScheduler.name);

  constructor(
    private readonly prisma: PrismaBypassService,
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
        tier: { in: [...PAID_TIERS] },
        membershipEndAt: { not: null, lt: new Date() },
      },
      select: {
        id: true,
        name: true,
        membershipEndAt: true,
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
        where: { id: c.id, tier: { in: [...PAID_TIERS] } },
        // Y3: membershipEndAt'i TEMİZLE — bayat geçmiş tarih kalırsa sonraki
        // cron bu firmayı yeniden eşleştirir + gelecekteki re-grant/upgrade bayat
        // tarihe takılır. Geçmiş EXPIRE event'inde (endBefore) korunur.
        data: { tier: "STANDART", membershipEndAt: null },
      });
      if (claimed.count !== 1) continue;
      downgraded.push(c);
      // Üyelik geçmişi: sistem EXPIRE olayı (adminId null) — best-effort,
      // kayıt hatası downgrade akışını durdurmaz.
      await this.prisma.companyMembershipEvent
        .create({
          data: {
            companyId: c.id,
            action: "EXPIRE",
            endBefore: c.membershipEndAt,
            endAfter: null,
            reason: "Süre doldu (otomatik)",
          },
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `EXPIRE event yazılamadı (${c.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
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
    // Ücretsiz paket ürün tavanı (2026-09-06): tavanı aşan yayında ürünler
    // taslağa çekilir (silinmez) — sayı e-postada söylenir.
    const trimmed = new Map<string, number>();
    for (const c of downgraded) {
      try {
        const r = await enforceProductLimit(this.prisma, c.id, "STANDART");
        if (r.unpublished > 0) trimmed.set(c.id, r.unpublished);
      } catch (err) {
        this.logger.warn(
          `Ürün tavanı uygulanamadı (${c.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Bilgilendirme e-postası (best-effort) — firma yetkisini kaybettiğini bilsin.
    const baseUrl =
      resolveWebUrl(this.config);
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
                "Paket üyeliğinizin süresi doldu ve hesabınız Standart üyeliğe geçirildi. Standart üyelikte yeni satın alma talebi açamaz ve firma davet edemezsiniz; herkese açık talepler ile gelen bilgi taleplerinde alıcı kimliği ve yanıt Silver paketiyle açılır. Profiliniz ve vitrininiz dizinde kalır (paketli firmaların ardından sıralanır); vitrinde en fazla 10 ürün yayında olabilir. Mevcut ilanlarınızı tamamlayabilir, gelen davetlere teklif verebilirsiniz.",
                ...(trimmed.get(c.id)
                  ? [
                      `Tavanı aşan ${trimmed.get(c.id)} ürününüz taslağa alındı; silinmedi, Silver'a dönünce yeniden yayımlayabilirsiniz.`,
                    ]
                  : []),
                "Tekrar pakete geçmek için hesabınızdan yükseltme yapabilirsiniz.",
              ],
              ctaLabel: "Premium'a Geç",
              ctaUrl: appRoutes.premium(baseUrl),
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
