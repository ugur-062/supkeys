import { PAID_TIERS } from "@rothern/shared";
import { isFreePeriod } from "../../../common/company/effective-tier";
import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { enforceProductLimit } from "../../../common/company/product-limit";
import { cancelOutgoingReferralInvites } from "../../../common/company/downgrade-invites";
import { SeoIndexService } from "../../seo-index/seo-index.service";

@Injectable()
export class MembershipScheduler implements OnModuleInit {
  private readonly logger = new Logger(MembershipScheduler.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    // @Optional: testler scheduler'ı DI dışında elle `new`'ler.
    @Optional() private readonly cronRegistry?: CronRegistryService,
    // Paket düşünce herkese açık firma/ürün sayfaları tazelenir (Silver+
    // medya: video + belgeler — arayüz testi D-192 yeniden doğrulama).
    @Optional() private readonly seo?: SeoIndexService,
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
    // ÜCRETSİZ DÖNEM: üyelik zamanlayıcısı HİÇBİR ŞEY yapmaz — satır yazmaz,
    // davet iptal etmez, ürün kırpmaz, e-posta atmaz. Doğrulanmış firma zaten
    // tam erişimli; doğrulanmamış firmanın süresi dolmuş saklı paketi
    // `effectiveTier`'ın tembel kuralıyla anında düşer (erişim tarafı cron'a
    // bağlı değil). Kalıcı düşürme, ücretli paketler dönünce (anahtar kapanınca)
    // ilk koşuda yapılır.
    if (isFreePeriod()) return;
    const expired = await this.prisma.company.findMany({
      where: {
        tier: { in: [...PAID_TIERS] },
        membershipEndAt: { not: null, lt: new Date() },
      },
      select: {
        id: true,
        name: true,
        membershipEndAt: true,
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
        // Süre dolumu claim anında YENİDEN denetlenir (derin denetim LU-06):
        // findMany ile claim arasında admin uzatması/paket ataması ya da
        // upgradeToPremium başarılı olduysa firma düşürülmez, yeni bitiş
        // tarihi ezilmez.
        where: {
          id: c.id,
          tier: { in: [...PAID_TIERS] },
          membershipEndAt: { not: null, lt: new Date() },
        },
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
      ...cancelOutgoingReferralInvites(this.prisma, ids),
    ]);
    this.logger.log(
      `${ids.length} firmanın premium süresi doldu → STANDARD; giden bekleyen davetler iptal edildi`,
    );
    // Ücretsiz paket ürün tavanı (2026-09-06): tavanı aşan yayında ürünler
    // taslağa çekilir (silinmez).
    for (const c of downgraded) {
      try {
        await enforceProductLimit(this.prisma, c.id, "STANDART");
      } catch (err) {
        this.logger.warn(
          `Ürün tavanı uygulanamadı (${c.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Herkese açık sayfa önbelleği (arayüz testi D-192 yeniden doğrulama):
    // ürün sayfası Silver+ medyayı (video, belgeler) ve Gold rozetini taşır;
    // `company:<slug>` etiketi firmanın ürün sayfalarını da yeniler. Eskiden
    // düşüş hiçbir tazeleme yaymıyordu, sayfa önbellek süresi boyunca bayat
    // kalıyordu. En iyi çaba: servis kendi hatasını yutar.
    for (const id of ids) this.seo?.companyChanged(id);

    // BİLGİLENDİRME E-POSTASI YOK (ücretsiz dönem, sahip kararı 2026-10-07):
    // "paketinizin süresi doldu" metni paket adı ve yükseltme çağrısı
    // taşıyordu; hiçbir e-posta paket anamaz. Ücretli paketler dönünce bu blok
    // ve `api.notifications.membership.*` metinleri git geçmişinden geri alınır.
  }
}
