import {
  DEFAULT_LOCALE,
  isLocale,
  translateRoutePath,
  type Locale,
} from "@rothern/i18n";
import { tApi, type ApiMessageKey } from "../../../common/i18n/i18n.service";
import { localeOf } from "../../notifications/notification.service";
import { currentLocale } from "../../../common/i18n/locale-context";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { authenticator } from "otplib";
import * as crypto from "node:crypto";
import * as QRCode from "qrcode";
import { CompanyRole, Prisma, type Company, type CompanyUser } from "@rothern/db";
import {
  generateShortCode,
  tierAtLeast,
  isValidCountryCode,
  isValidTaxIdForCountry,
  isValidTckn,

  isRegistrationOpen,} from "@rothern/shared";
import { ensureUniqueCompanySlug } from "../../../common/company/company-slug";
import { effectiveTier } from "../../../common/company/effective-tier";
import { validateCategorySelection } from "../../../common/helpers/category-selection.helper";
import { ensureOwnerBuySeat } from "../../../common/company/owner-buy-seat";
import { NOTIFICATION_PREF_KEYS } from "../../../common/notifications/notification-prefs";
import {
  PrismaService,
  PrismaBypassService,
} from "../../../common/prisma/prisma.service";
import { runTenantTx } from "../../../common/prisma/tenant-tx";
import { AuditService } from "../../audit/audit.service";
import { EmailService } from "../../email/email.service";
import { SupabaseAuthService } from "../../supabase-auth/supabase-auth.service";
import { CompanyLoginDto } from "../dto/company-login.dto";
import { CompanySignupDto } from "../dto/company-signup.dto";
import { CompleteOnboardingDto } from "../dto/onboarding.dto";
import {
  effectivePermissions,
  permissionsForRoles,
} from "../permissions/company-permissions.constants";
import type { CompanyJwtPayload } from "../strategies/company-jwt.strategy";
import { resolveWebUrl } from "../../../common/config/web-url";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  totpEncKey,
} from "../../../common/auth/totp-secret-cipher";

/** Her bildirim e-postasının ilk paragrafı (alıcının dilinde). */
const NOTIFY_GREETING_KEY = "api.notifications.common.greeting" as ApiMessageKey;

/**
 * İÇ (Türkçe, ön eksiz) yol → alıcının dilindeki TAM adres.
 * `common/company/app-routes.ts` içindeki `localize` ile AYNI kural (o dosya
 * yardımcıyı dışa aktardığında burası ona bağlanmalı — iki kopya ayrışmasın).
 */
function localizeUrl(base: string, path: string, locale: Locale): string {
  const outer = translateRoutePath(path, locale);
  if (locale === DEFAULT_LOCALE) return `${base}${outer}`;
  return `${base}${outer === "/" ? `/${locale}` : `/${locale}${outer}`}`;
}

const ROLE_LABELS: Record<CompanyRole, string> = {
  [CompanyRole.SAHIP]: "Kurucu",
  [CompanyRole.YONETICI]: "Yönetici",
  [CompanyRole.SATIN_ALMACI]: "Satın Almacı",
  [CompanyRole.SATISCI]: "Satışçı",
  [CompanyRole.ONAYLAYICI]: "Onaylayıcı",
};

type Ctx = { ip?: string; userAgent?: string };

const EMAIL_CODE_TTL_MIN = 15;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
// Denetim 2026-08-23 #9: hesap-bazlı kod ÜRETİM tavanı — resend/login-2FA her
// çağrıda sayacı sıfır yeni kod veriyordu (IP throttle tek savunmaydı). Saat
// başına en fazla 5 kod → toplam tahmin bütçesi ≈25/saat (10^6'ya karşı
// brute-force pratik olarak kapanır); e-posta flood'u da sınırlanır.
const EMAIL_CODE_MAX_PER_HOUR = 5;

@Injectable()
export class CompanyAuthService {
  private readonly logger = new Logger(CompanyAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    // RLS Faz 2: pre-context (giriş-öncesi) kimlik-çözümü bypass client ile
    // koşar (tenant bağlamı YOK → RLS'li main client bloklardı). YALNIZ
    // pre-context metodlarda (login/signup/verify/…) kullanılır; authenticated
    // self-yönetim metodları (getMe/changePassword/2FA-setup) main'de RLS-korumalı
    // kalır. bkz. bu servisteki this.bypass kullanımları.
    private readonly bypass: PrismaBypassService,
  ) {}

  // ============================================================
  // SIGNUP — firma self-servis kaydı (kaydeden = SAHİP)
  // ============================================================
  async signup(dto: CompanySignupDto, ctx?: Ctx) {
    const email = dto.email.toLowerCase().trim();

    // Aynı e-posta zaten bir CompanyUser'da var mı? (dostane mesaj)
    const existing = await this.bypass.companyUser.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(i18nMessage("api.companyAuth.buEPostaIleZatenBir"));
    }

    // 1) Supabase auth.users oluştur
    const { authId } = await this.supabaseAuth.createUser(email, dto.password, {
      type: "company",
    });

    const rothernId = await this.generateUniqueRothernId();
    const now = new Date();

    // 2) Company + ilk CompanyUser (owner). Prisma hatasında auth.users temizle.
    //    Firma adı signup'ta sorulmaz → geçici ad; onboarding'de legalName ile
    //    güncellenir. E-posta doğrulanmadan (emailVerifiedAt=null) login engelli.
    let result: { company: Company; user: CompanyUser };
    try {
      result = await runTenantTx(this.bypass, async (tx) => {
        const company = await tx.company.create({
          data: {
            name: `${dto.firstName.trim()} ${dto.lastName.trim()} Firması`,
            tier: "STANDART",
            rothernId,
          },
        });
        const user = await tx.companyUser.create({
          data: {
            email,
            authId,
            // i18n: kayıt sayfasının dili hesabın dili olur (Accept-Language → ALS).
            locale: currentLocale(),
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone.trim(),
            // Faz R: Kurucu ETİKETİ işlem yetkisi vermez → kuran kişiye op-rol
            // default eklenir; SAHIP-only başlasaydı ilk teklife kadar
            // salt-okunur kalırdı.
            //
            // YALNIZ SATIŞ KOLTUĞU (2026-09-14): firma STANDART doğar ve
            // satınalma koltuğu o pakette İŞE YARAMAZ (talep açmak GOLD ister).
            // İkisi birden verilseydi kurucu tek başına ücretsiz paketin 2
            // koltuğunu doldurur, ilk çalışan davetinde "koltuk dolu" duvarına
            // çarpardı. Satınalma koltuğu GOLD'a geçişte açılır
            // (`ensureOwnerBuySeat`) — kullanılabilir olduğu anda.
            roles: [CompanyRole.SAHIP, CompanyRole.SATISCI],
            permissions: permissionsForRoles([
              CompanyRole.SAHIP,
              CompanyRole.SATISCI,
            ]),
            companyId: company.id,
            emailVerifiedAt: null, // 6-haneli kod ile doğrulanacak
            // Zorunlu sözleşme + opsiyonel rıza denetim izi.
            termsAcceptedAt: now,
            mediationAcceptedAt: now,
            kvkkAcceptedAt: now,
            marketingConsent: dto.marketingConsent ?? false,
            profileImprovementConsent: dto.profileImprovementConsent ?? false,
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
      // Eşzamanlı aynı-e-posta kaydı (ön kontrolü geçen yarış) → dostane çakışma.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(i18nMessage("api.companyAuth.buEPostaIleZatenBir"));
      }
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

    await this.acceptReferralInvites(
      email,
      result.company.id,
      dto.referralToken,
    ).catch((err) =>
      this.logger.error(
        `Referans daveti bağlama hatası (${email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );

    // 3) 6-haneli doğrulama kodu üret + e-posta gönder. Token DÖNMEZ — kullanıcı
    //    önce kodu doğrulamalı (verifyEmail token verir). failure-aware (1b):
    //    kod e-postası gitmezse `emailSent:false` — kayıt olan kendi hesabını
    //    biliyor (enumeration sızıntısı DEĞİL) → frontend "tekrar gönder" gösterir.
    const { sent } = await this.issueEmailCode(
      result.user.id,
      email,
      result.user.firstName,
    );
    return { email, verificationRequired: true as const, emailSent: sent };
  }

  // ============================================================
  // E-POSTA DOĞRULAMA — 6 haneli kod (Resend ile gönderilir)
  // ============================================================

  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  /**
   * Yeni kod üret, eski kodları geçersiz kıl, e-posta gönder.
   * failure-aware (1b): gönderim AWAIT edilir; başarısızsa `{ sent: false }`
   * döner (throw ETMEZ — kod-satırı yine oluşur, çağıran karar verir). Sentry
   * alarmı `EmailService.send` içinde (Commit 1) — burada tekrar gerekmez.
   */
  private async issueEmailCode(
    userId: string,
    email: string,
    firstName: string,
    kind: "verify" | "login" = "verify",
    /** ALICININ dili — verilmezse istek bağlamı (giriş/kayıt sayfasının dili). */
    locale: Locale = currentLocale(),
  ): Promise<{ sent: boolean; capped?: boolean }> {
    // Hesap-bazlı üretim tavanı (son 60 dk). Aşıldıysa yeni kod ÜRETİLMEZ ve
    // e-posta gitmez; mevcut kod (varsa) geçerli kalır. Çağıran generic yanıt
    // döner (kayıt/yeniden gönder akışında enumeration sızdırmaz).
    const recent = await this.bypass.emailVerificationCode.count({
      where: { companyUserId: userId, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
    });
    if (recent >= EMAIL_CODE_MAX_PER_HOUR) {
      this.logger.warn(`E-posta kodu üretim tavanı aşıldı (user=${userId})`);
      return { sent: false, capped: true };
    }
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await this.bypass.emailVerificationCode.updateMany({
      where: { companyUserId: userId, usedAt: null },
      data: { usedAt: new Date() }, // eskileri kapat
    });
    await this.bypass.emailVerificationCode.create({
      data: {
        companyUserId: userId,
        codeHash: this.hashCode(code),
        expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60_000),
      },
    });
    const isLogin = kind === "login";
    // Metin ALICININ dilinde (katalog anahtarı + ICU parametresi).
    const t = (key: ApiMessageKey, values?: Record<string, string | number>) =>
      tApi(key, values, locale);
    const subject = t(
      isLogin
        ? "api.notifications.companyAuth.girisKoduKonu"
        : "api.notifications.companyAuth.dogrulamaKoduKonu",
    );
    try {
      const res = await this.email.send({
        to: { email, name: firstName },
        subject,
        locale,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: t(
              isLogin
                ? "api.notifications.companyAuth.girisKoduBaslik"
                : "api.notifications.companyAuth.dogrulamaKoduBaslik",
            ),
            paragraphs: [
              t(NOTIFY_GREETING_KEY),
              t(
                isLogin
                  ? "api.notifications.companyAuth.girisKoduGovde"
                  : "api.notifications.companyAuth.dogrulamaKoduGovde",
                { kod: code },
              ),
              t("api.notifications.companyAuth.kodGecerlilik", {
                dakika: EMAIL_CODE_TTL_MIN,
              }),
            ],
          },
        },
        context: { type: isLogin ? "login_2fa" : "email_verify", id: userId },
      });
      // Dalga B (P7): suppress edilmiş adreste send() hata ATMAZ ama gönderim
      // de yapmaz — dönüşteki `sent` bayrağını onurlandır, yoksa kullanıcıya
      // yalan "kod gönderildi" deriz ve kalıcı mahsur kalır.
      return { sent: res.sent };
    } catch (err) {
      this.logger.error(
        `Doğrulama kodu e-postası gönderilemedi (${email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { sent: false };
    }
  }

  /**
   * Admin destek akışı — doğrulanmamış kullanıcıya doğrulama kodunu yeniden
   * gönderir ("doğrulama maili gelmedi" çağrısı). issueEmailCode'un public
   * sarmalayıcısı; kod/TTL/hash mantığı tek yerde kalır.
   */
  async adminResendVerificationCode(userId: string): Promise<void> {
    const user = await this.bypass.companyUser.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        emailVerifiedAt: true,
        locale: true,
      },
    });
    if (!user) throw new BadRequestException(i18nMessage("api.companyAuth.kullaniciBulunamadi"));
    if (user.emailVerifiedAt) {
      throw new BadRequestException(i18nMessage("api.companyAuth.ePostaZatenDogrulanmis"));
    }
    await this.issueEmailCode(
      userId,
      user.email,
      user.firstName,
      "verify",
      localeOf(user.locale),
    );
  }

  /**
   * En son gönderilen e-posta kodunu doğrulayıp tüketir (emailVerifiedAt'e
   * DOKUNMAZ). E-posta 2FA login/kurulumunda kullanılır. Başarısızda false.
   */
  private async consumeEmailCode(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const record = await this.bypass.emailVerificationCode.findFirst({
      where: { companyUserId: userId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.expiresAt < new Date()) return false;
    if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return false;
    if (record.codeHash !== this.hashCode(code.trim())) {
      await this.bumpCodeAttempt(record.id);
      return false;
    }
    await this.bypass.emailVerificationCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return true;
  }

  /**
   * Hatalı deneme sayacı — KOŞULLU artış (attempts < MAX): eşzamanlı burst
   * tavanı aşamaz (denetim 2026-08-23 #9, check-then-act yarışı kapatıldı).
   */
  private async bumpCodeAttempt(recordId: string): Promise<void> {
    await this.bypass.emailVerificationCode.updateMany({
      where: { id: recordId, attempts: { lt: EMAIL_CODE_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
  }

  /** Kodu doğrula → emailVerifiedAt set + otomatik login (token). */
  async verifyEmail(email: string, code: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.bypass.companyUser.findUnique({
      where: { email: normalized },
      include: { company: true },
    });
    if (!user) throw new BadRequestException(i18nMessage("api.companyAuth.kodGecersizVeyaSuresiDolmus"));
    // GÜVENLİK: bu uç KİMLİK DOĞRULAMASIZ. Zaten doğrulanmış e-postada kod
    // kontrolü olmadan token DÖNDÜRÜLEMEZ (hesap ele geçirme). Sadece bilgi ver;
    // oturum için normal login kullanılır.
    if (user.emailVerifiedAt) {
      return { alreadyVerified: true as const };
    }
    const record = await this.bypass.emailVerificationCode.findFirst({
      where: { companyUserId: user.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException(i18nMessage("api.companyAuth.kodGecersizVeyaSuresiDolmus"));
    }
    if (record.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      throw new BadRequestException(
        i18nMessage("api.companyAuth.cokFazlaHataliDenemeYeniKod"),
      );
    }
    if (record.codeHash !== this.hashCode(code)) {
      await this.bumpCodeAttempt(record.id);
      throw new BadRequestException(i18nMessage("api.companyAuth.kodGecersizVeyaSuresiDolmus"));
    }
    const [, updatedUser] = await this.bypass.$transaction([
      this.bypass.emailVerificationCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.bypass.companyUser.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
        include: { company: true },
      }),
    ]);
    return this.buildLoginResponse(updatedUser, updatedUser.company);
  }

  /** Kodu yeniden gönder (enumeration'a karşı her zaman genel yanıt). */
  async resendEmailCode(email: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.bypass.companyUser.findUnique({
      where: { email: normalized },
      select: {
        id: true,
        firstName: true,
        emailVerifiedAt: true,
        locale: true,
      },
    });
    if (user && !user.emailVerifiedAt) {
      await this.issueEmailCode(
        user.id,
        normalized,
        user.firstName,
        "verify",
        localeOf(user.locale),
      );
    }
    return { success: true as const };
  }

  // ============================================================
  // ONBOARDING — Firma Doğrulama sihirbazı (Faz 2)
  // ============================================================
  async completeOnboarding(
    userId: string,
    companyId: string,
    dto: CompleteOnboardingDto,
  ) {
    // GÜVENLİK: yalnız firma SAHİBİ onboarding yapabilir (rol ataması +
    // kurumsal alanları belirler → yetki yükseltme/veri ezme önlenir). Ayrıca
    // tek seferliktir (tekrar çağrı adresleri silip rolleri yeniden yazardı).
    const existing = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { ownerUserId: true, onboardingCompletedAt: true },
    });
    if (!existing) throw new UnauthorizedException();
    if (existing.ownerUserId !== userId) {
      throw new ForbiddenException(i18nMessage("api.companyAuth.yalnizcaFirmaSahibiDogrulamaYapabilir"));
    }
    if (existing.onboardingCompletedAt) {
      throw new BadRequestException(i18nMessage("api.companyAuth.firmaDogrulamasiZatenTamamlanmis"));
    }

    const country = (dto.country || "TR").toUpperCase();
    // KKTC (XN) ISO listesinde YOK — profil kapısı onu tanır, `COUNTRIES`
    // tanımaz. Bu yüzden geçerlilik "ISO'da var VEYA açık bir profili var".
    if (!isValidCountryCode(country) && !isRegistrationOpen(country)) {
      throw new BadRequestException(i18nMessage("api.companyAuth.gecersizUlkeSecimi"));
    }
    // KAYIT KAPISI (2026-09-01): yeni kayıt yalnız profili AÇIK ülkelerden.
    // YALNIZ YENİ KAYDA uygulanır — mevcut firmalar etkilenmez (bu metot
    // yukarıda `onboardingCompletedAt` ile zaten korunuyor). Aksi hâlde
    // kapatılan bir ülkedeki çalışan hesap kilitlenirdi.
    if (!isRegistrationOpen(country)) {
      throw new BadRequestException(
        i18nMessage("api.companyAuth.buUlkedenYeniKayitAlinmiyor"),
      );
    }
    const isSole = dto.companyType === "SOLE_PROPRIETOR";
    if (!isValidTaxIdForCountry(dto.taxNumber, country, isSole)) {
      throw new BadRequestException(
        i18nMessage(
          country === "TR"
            ? isSole
              ? "api.companyAuth.sahisFirmasiIcin11HaneliTckn"
              : "api.companyAuth.tuzelKisiIcin10HaneliVergiNo"
            : "api.companyAuth.gecerliBirVergiSicilNumarasiGiriniz",
        ),
      );
    }
    if (country === "TR") {
      if (!dto.authorizedTckn || !isValidTckn(dto.authorizedTckn)) {
        throw new BadRequestException(i18nMessage("api.companyAuth.yetkiliTCKimlikNoGecersiz"));
      }
      if (!dto.taxOffice?.trim()) {
        throw new BadRequestException(i18nMessage("api.companyAuth.vergiDairesiZorunlu"));
      }
      if (!dto.district?.trim()) {
        throw new BadRequestException(i18nMessage("api.companyAuth.ilceZorunlu"));
      }
    }

    const { mainIds, subIds } = await validateCategorySelection(
      this.prisma,
      dto.mainCategoryIds,
      dto.subCategoryIds ?? [],
    );

    // Faz 5 (yetki tablosu): Kurucu koltuklarını KAYITTA seçer — "Bu hesapla
    // talep de açacak mısınız, teklif de verecek misiniz?" İki kutu, iki
    // koltuk; ikisi de kapalıysa Kurucu yalnız yönetir (SAHIP etiketi işlem
    // yetkisi vermez; onboarding roller/izinleri yeniden yazar).
    // KURUCU KOLTUĞU — SATIŞ, satınalma DEĞİL (2026-09-14, kullanıcı kararı).
    //
    // Eskiden kayıt ekranı "Bu hesapla ne yapacaksınız?" diye soruyor ve iki
    // kutu da işaretli geliyordu. Üç yerden çürüktü:
    //  1. Satınalma koltuğu ücretsiz pakette İŞE YARAMAZ — talep açmak GOLD
    //     ister (`BUYING_TIER`). Ekran bunu kendisi itiraf ediyordu
    //     ("koltuk seçimi paket alınca geçerli olur").
    //  2. İkisi de işaretliyken kurucu tek başına STANDART'ın 2 koltuğunun
    //     İKİSİNİ de dolduruyordu → ilk çalışan davetinde "koltuk dolu", ve
    //     ekranda bunu söyleyen tek kelime yoktu.
    //  3. Yanlış an: kurucu tanım gereği tam yetkili; "kim hangi koltuğu alır"
    //     kararı ikinci kişi davet edilirken doğuyor ve kapı zaten orada
    //     (`assertSeatAvailable`).
    //
    // Satınalma koltuğu GOLD'a geçişte otomatik açılır (`ensureOwnerBuySeat`) —
    // yani kullanılabilir olduğu anda, bir koltuk önceden yakmadan.
    const roles: CompanyRole[] = [CompanyRole.SAHIP, CompanyRole.SATISCI];
    const deliverySame = dto.deliverySameAsBilling !== false;

    await runTenantTx(this.prisma, async (tx) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          name: dto.legalName.trim(),
          legalName: dto.legalName.trim(),
          companyType: dto.companyType,
          country,
          taxNumber: dto.taxNumber.trim(),
          taxOffice: dto.taxOffice?.trim() || null,
          website: normalizeWebsite(dto.website),
          /**
           * PROFİL OTOMATİK YAYINA ALINIR (2026-09-15, kullanıcı kararı:
           * "profiller otomatik yayına alınsın").
           *
           * Eskiden `publicEnabled` varsayılanı `false`ti ve firmaların çoğu
           * hiç açmıyordu → canlıda `companies.xml` 0 URL, yani SEO motoru
           * kurulu ama yakıtsızdı. Kapı BURADA açılıyor, kayıtta değil: firma
           * adı ancak burada gerçek oluyor (signup geçici ad üretiyor) ve slug
           * ona göre kuruluyor.
           *
           * İNDEKS AYRI KAPIDA (`isProfileIndexable`): içi boş profil vitrinde
           * durur ama sitemap'e ve arama motoruna girmez. Firma isterse
           * Profilim'den kapatabilir.
           */
          publicEnabled: true,
          slug: await ensureUniqueCompanySlug(tx, dto.legalName.trim(), companyId),
          city: dto.city.trim(),
          district: dto.district?.trim() || null,
          stateRegion: dto.stateRegion?.trim() || null,
          neighborhood: dto.neighborhood?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          addressLine: dto.addressLine.trim(),
          authorizedTckn: dto.authorizedTckn?.trim() || null,
          authorizedTitle: ROLE_LABELS[CompanyRole.SAHIP],
          // AYNI LİSTE DÖRT ALANA — bilinçli, kopyala-yapıştır değil.
          //
          // Kayıt ekranı TEK soru sorar ("ne alıp satıyorsunuz"). Yeni kullanıcı
          // henüz alış ile satış beyanını ayıracak durumda değil; iki ayrı liste
          // istemek kayıt akışını uzatır ve çoğu firma ikisine de aynı şeyi
          // yazar. Bu yüzden beyan her iki eksene de düşer: firma ilk günden
          // hem talep bildirimi alır (seller*) hem "size uygun ürünler"
          // sıralamasından yararlanır (buyer*).
          //
          // Ayrıştırma Ayarlar › Kategoriler'de yapılır ve kayıt ekranının ipucu
          // metni bunu SÖYLER — iki ekranın birbirine yalan söylememesi için.
          buyerCategoryIds: mainIds,
          sellerCategoryIds: mainIds,
          buyerSubCategoryIds: subIds,
          sellerSubCategoryIds: subIds,
          activities: [...new Set(dto.activities ?? [])] as never,
          onboardingCompletedAt: new Date(),
        },
      });
      await tx.companyUser.update({
        where: { id: userId },
        data: { roles, permissions: permissionsForRoles(roles) },
      });
      // Eski onboarding adres kayıtlarını temizle (idempotent tekrar).
      await tx.companyAddress.deleteMany({ where: { companyId } });
      await tx.companyAddress.create({
        data: {
          companyId,
          type: "FATURA",
          title: "Merkez",
          country,
          city: dto.city.trim(),
          district: dto.district?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          addressLine: dto.addressLine.trim(),
          taxOffice: dto.taxOffice?.trim() || null,
          taxNumber: dto.taxNumber.trim(),
          isDefault: true,
        },
      });
      await tx.companyAddress.create({
        data: {
          companyId,
          type: "TESLIMAT",
          title: deliverySame ? "Teslimat (fatura ile aynı)" : "Teslimat",
          country,
          city: (deliverySame ? dto.city : dto.deliveryCity ?? dto.city).trim(),
          district:
            (deliverySame ? dto.district : dto.deliveryDistrict)?.trim() || null,
          postalCode:
            (deliverySame ? dto.postalCode : dto.deliveryPostalCode)?.trim() ||
            null,
          addressLine: (deliverySame
            ? dto.addressLine
            : dto.deliveryAddressLine ?? dto.addressLine
          ).trim(),
          isDefault: true,
        },
      });
    });

    return { ok: true as const };
  }

  /**
   * Yeni kayıt olan firmaya gönderilmiş bekleyen e-posta davetlerini işler:
   * her biri için davet eden firma ile ACTIVE INVITE bağlantı kurar (kalıcı).
   */
  private async acceptReferralInvites(
    email: string,
    newCompanyId: string,
    usedToken?: string,
  ): Promise<void> {
    const invites = await this.bypass.companyReferralInvite.findMany({
      where: { email, status: "PENDING" },
      select: {
        id: true,
        inviterCompanyId: true,
        invitedById: true,
        token: true,
        listingId: true,
      },
    });
    if (invites.length === 0) return;
    const newCompany = await this.bypass.company.findUnique({
      where: { id: newCompanyId },
      select: { name: true },
    });
    for (const inv of invites) {
      if (inv.inviterCompanyId === newCompanyId) continue;
      // BK-CONN-1: rıza yalnız KULLANILAN davet linki için verildi. O token'ın
      // referral'ı ACTIVE bağlantı olur; aynı e-postayı davet eden DİĞER firmalar
      // PENDING İSTEK olur (yeni firma listIncoming'de görür, mevcut accept/reject
      // ile onaylar). Token yoksa (doğrudan signup) HEPSİ PENDING istek → güvenli.
      const isUsed = !!usedToken && inv.token === usedToken;
      const conn = await this.bypass.companyConnection.upsert({
        where: {
          inviterCompanyId_inviteeCompanyId: {
            inviterCompanyId: inv.inviterCompanyId,
            inviteeCompanyId: newCompanyId,
          },
        },
        create: {
          inviterCompanyId: inv.inviterCompanyId,
          inviteeCompanyId: newCompanyId,
          invitedById: inv.invitedById,
          status: isUsed ? "ACTIVE" : "PENDING",
          origin: "INVITE",
          decidedAt: isUsed ? new Date() : null,
        },
        update: {},
      });
      // Faz C: davet ihale bağlamlıysa ve link KULLANILDIYSA — ihale hâlâ
      // davete açıksa yeni firmayı ihaleye otomatik davet et (kapalı zarf
      // etkisi yok; firma paneline girince ihaleyi davetlilerinde görür).
      if (isUsed && inv.listingId) {
        const listing = await this.bypass.listing.findUnique({
          where: { id: inv.listingId },
          select: { id: true, status: true, companyId: true },
        });
        if (
          listing &&
          listing.companyId === inv.inviterCompanyId &&
          (listing.status === "DRAFT" || listing.status === "OPEN")
        ) {
          await this.bypass.listingInvitation.upsert({
            where: {
              listingId_invitedCompanyId: {
                listingId: listing.id,
                invitedCompanyId: newCompanyId,
              },
            },
            create: {
              listingId: listing.id,
              invitedCompanyId: newCompanyId,
              invitedById: inv.invitedById,
            },
            update: {},
          });
        }
      }
      await this.bypass.companyReferralInvite.update({
        where: { id: inv.id },
        data: {
          status: "ACCEPTED",
          acceptedCompanyId: newCompanyId,
          acceptedAt: new Date(),
        },
      });
      // INV-AUDIT-1 (dalga 3): referral kaydından oto-oluşan bağlantı — açık
      // kullanıcı aksiyonu yok, yine de ilişki olayı → uyuşmazlıkta delil.
      // Aktör = yeni kayıtlı firma (signup akışı, ayrı userId yok).
      await this.audit.log({
        action: "company.connection.auto_created",
        actorType: "company",
        actorId: null,
        actorEmail: email,
        tenantId: newCompanyId,
        entityType: "company_connection",
        entityId: conn.id,
        metadata: {
          inviterCompanyId: inv.inviterCompanyId,
          inviteeCompanyId: newCompanyId,
          referralInviteId: inv.id,
          origin: "INVITE",
          status: isUsed ? "ACTIVE" : "PENDING",
        },
      });
      // Yalnız KULLANILAN davet (ACTIVE) inviter'a "kabul edildi" e-postası;
      // PENDING istekler yeni firmanın onayını bekler (listIncoming). in-app kanal
      // burada döngü nedeniyle yok — NotificationModule bu servise enjekte edilemez.
      if (isUsed) {
        const inviterEmail = await this.companyNotifyEmail(inv.inviterCompanyId);
        if (inviterEmail) {
          this.sendNotificationEmail(
            { email: inviterEmail.email, name: inviterEmail.name },
            inviterEmail.locale,
            {
              subjectKey: "api.notifications.companyAuth.davetKabulBaslik",
              paragraphKeys: newCompany?.name
                ? ["api.notifications.companyAuth.davetKabulGovde"]
                : ["api.notifications.companyAuth.davetKabulGovdeIsimsiz"],
              ctaLabelKey: "api.notifications.companyAuth.baglantilarim",
              ctaPath: "/company",
              params: { firma: newCompany?.name ?? "" },
            },
            "connection_accepted",
            inv.id,
          );
        }
      }
    }
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
    } catch (err) {
      // Supabase erişim/kesinti hatası (503) parola hatası DEĞİLDİR — aynen
      // geçir (denetim 2026-08-23 #10: yanlış audit + kullanıcıya yanlış mesaj).
      if (err instanceof ServiceUnavailableException) throw err;
      auditFail("bad_credentials");
      throw new UnauthorizedException(i18nMessage("api.companyAuth.ePostaVeyaSifreHatali"));
    }

    const user = await this.bypass.companyUser.findUnique({
      where: { authId },
      include: { company: true },
    });
    if (!user) {
      auditFail("user_missing");
      throw new UnauthorizedException(i18nMessage("api.companyAuth.ePostaVeyaSifreHatali"));
    }
    if (user.deletedAt || !user.isActive) {
      auditFail("user_inactive");
      throw new ForbiddenException(i18nMessage("api.companyAuth.kullaniciHesabiAktifDegil"));
    }
    if (user.company.isBlocked) {
      auditFail("company_blocked");
      throw new ForbiddenException(i18nMessage("api.companyAuth.firmaHesabiEngellenmis"));
    }
    if (!user.company.isActive) {
      auditFail("company_inactive");
      throw new ForbiddenException(i18nMessage("api.companyAuth.firmaHesabiAktifDegil"));
    }
    if (!user.emailVerifiedAt) {
      auditFail("email_unverified");
      // Yapısal `code` — frontend akış kararını MESAJ METNİNE değil koda
      // bağlar (metin eşleşmesi CSRF 403'üyle karışıp sahte "kod gönderildi"
      // akışı tetiklemişti; mesaj değişse de akış kırılmasın).
      throw new ForbiddenException({ ...i18nMessage("api.companyAuth.girisYapmadanOnceEPostaAdresinizi", undefined, "EMAIL_NOT_VERIFIED"), statusCode: 403 });
    }

    // 2FA açıksa: kod yoksa "gerekli" yanıtı. E-posta yönteminde kodu HEMEN
    // e-postaya gönder; authenticator'da kullanıcı uygulamadan okur.
    if (user.twoFactorEnabled) {
      if (!dto.code) {
        if (user.twoFactorMethod === "EMAIL") {
          const { sent } = await this.issueEmailCode(
            user.id,
            user.email,
            user.firstName,
            "login",
            localeOf(user.locale),
          );
          // failure-aware (1b): kod gitmezse kullanıcı ilerleyemez → sessizce
          // "kodu gir" deme, açık hata ver. Parola zaten doğrulandı (post-auth)
          // → enumeration sızıntısı DEĞİL. (Sentry alarmı send() içinde.)
          if (!sent) {
            throw new ServiceUnavailableException(
              i18nMessage("api.companyAuth.dogrulamaKoduSuAndaGonderilemediLutfen"),
            );
          }
          return { twoFactorRequired: true as const, method: "email" as const };
        }
        return {
          twoFactorRequired: true as const,
          method: "authenticator" as const,
        };
      }
      const { ok, usedRecovery } = await this.verifyTwoFactorCode(
        user.id,
        dto.code,
      );
      if (!ok) {
        auditFail("bad_2fa");
        throw new UnauthorizedException(i18nMessage("api.companyAuth.dogrulamaKoduHatali"));
      }
      if (usedRecovery) {
        // Kurtarma koduyla giriş iz bırakır (tek kullanımlık kod tüketildi).
        void this.audit.log({
          action: "auth.2fa_recovery_used",
          actorType: "company",
          actorId: user.id,
          actorEmail: user.email,
          ip: ctx?.ip,
          userAgent: ctx?.userAgent,
        });
      }
    }

    return this.buildLoginResponse(user, user.company, ctx);
  }

  // ============================================================
  // VIES — AB VAT numarası ücretsiz oto-doğrulama (Faz 5)
  // ============================================================
  async viesCheck(countryCode: string, vatNumber: string) {
    const cc = countryCode.toUpperCase().trim().replace(/[^A-Z]/g, "");
    const num = vatNumber.replace(/[^A-Za-z0-9]/g, "");
    const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${encodeURIComponent(
      cc,
    )}/vat/${encodeURIComponent(num)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { valid: false, unavailable: true as const };
      const data = (await res.json()) as {
        valid?: boolean;
        name?: string;
        address?: string;
      };
      return {
        valid: !!data.valid,
        name: data.name?.trim() || null,
        address: data.address?.trim() || null,
      };
    } catch (err) {
      this.logger.warn(
        `VIES sorgusu başarısız (${cc}${num}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { valid: false, unavailable: true as const };
    }
  }

  // ============================================================
  // PREMIUM'A GEÇ (Faz 3) — doğrulama tamamsa tier=PAKET
  // ============================================================
  async upgradeToPremium(userId: string, companyId: string) {
    // Y2: self-servis premium ödeme entegrasyonuna kadar KAPALI (flag default
    // false). Endpoint silinmedi — ödeme gelince PREMIUM_SELF_UPGRADE_ENABLED=true
    // ile açılır. Bugün premium yalnız admin grant ile verilir. Bkz. INV-TIER-1.
    if (this.config.get<string>("PREMIUM_SELF_UPGRADE_ENABLED") !== "true") {
      throw new ForbiddenException(
        i18nMessage("api.companyAuth.premiumSuAnManuelOnaylaVeriliyor"),
      );
    }
    // Kullanıcı satırı ARTIK OKUNMUYOR — 2FA şartı kalktı (aşağıdaki not).
    // Ölü sorgu bırakmak, "hâlâ denetleniyor" izlenimi verirdi.
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        tier: true,
        membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için
        companyVerificationStatus: true,
        ownerUserId: true,
      },
    });
    if (!company) throw new UnauthorizedException();
    // GÜVENLİK: faturalandırma/paket işlemi yalnız firma sahibinde (billing:manage
    // OWNER_ONLY). Sahip olmayan doğrulanmış kullanıcı tier'ı yükseltemez.
    if (company.ownerUserId !== userId) {
      throw new ForbiddenException(i18nMessage("api.companyAuth.yalnizcaFirmaSahibiPaketYukseltebilir"));
    }
    // INV-TIER-1: efektif tier — süresi-dolmuş (lazy) PAKET firma "zaten premium"
    // engeline takılmadan yenileyebilsin; efektif STANDARD ise yükseltme akışına girer.
    if (effectiveTier(company.tier, company.membershipEndAt) === "GOLD") {
      return { ok: true as const, tier: "GOLD" };
    }
    if (company.companyVerificationStatus !== "VERIFIED") {
      throw new BadRequestException(
        i18nMessage("api.companyAuth.onceSirketBelgeleriniziDogrulatmalisiniz"),
      );
    }
    // 2FA ve WEB SİTESİ ŞARTLARI KALDIRILDI (2026-09-15, kullanıcı kararı).
    //
    // 2FA — bugünkü hâli koruma SAĞLAMIYORDU: kapı yalnız yükseltme ANINDA
    // bakıyordu, kullanıcı ertesi gün `disableTwoFactor` ile kapatabiliyordu ve
    // hiçbir şey olmuyordu. Yani onay kutusuydu, kontrol değil. Gerçekten
    // isteniyorsa doğru yeri KAZANDIRMA ve FATURA işlemleridir (sürekli
    // denetlenir) — ödeme turunda oraya konmalı, yükseltme ekranına değil.
    //
    // WEB SİTESİ — onboarding'de "teşvik et, zorlama" kararı verildi
    // (2026-09-15); burada zorunlu bırakmak iki ekranın aynı şeyi farklı
    // söylemesi olurdu. Sitesi olmayan firma da paket alabilir.
    //
    // TEK ŞART DOĞRULAMA: platformun kefil olduğu yer orası. Ve doğrulama
    // ÜCRETSİZ — paket satmadan da teşvik ediliyor (profilde "Doğrulanmış"
    // rozeti `companyVerificationStatus`tan gelir, pakete bağlı DEĞİL).
    // TODO(ödeme): premium ücretlendirme burada devreye girecek. Şimdilik
    // doğrulama tamamlandıysa ücretsiz PAKET'e geçilir (açık seam).
    // Dalga B-3: `membershipEndAt` TEMİZLENMELİ. Eskiden yalnız `tier` yazılıyordu;
    // süresi DOLMUŞ paketli firma (membershipEndAt geçmişte) yükseltince satır
    // "GOLD" oluyor ama `effectiveTier` hâlâ STANDART döndürüyordu (INV-TIER-1)
    // → SESSİZ ETKİSİZ YÜKSELTME: kullanıcı yükselttim sanıyor, hiçbir kapı
    // açılmıyor ve ödeme devreye girdiğinde parası da alınmış oluyor.
    // Bugün süre yok (ücretsiz seam) → null = süresiz. Ödeme geldiğinde bu
    // satır dönem sonunu yazacak.
    await this.prisma.company.update({
      where: { id: companyId },
      data: { tier: "GOLD", membershipEndAt: null },
    });
    // Satınalma koltuğu BURADA açılır: kayıtta verilmiyor çünkü STANDART'ta
    // kullanılamıyor ve ücretsiz paketin koltuğunu boşuna yakıyordu.
    await ensureOwnerBuySeat(this.prisma, companyId);
    return { ok: true as const, tier: "GOLD" };
  }

  // ============================================================
  // 2FA (TOTP) — eski ayarlar
  // ============================================================

  /**
   * TOTP secret'ları DB'de ŞİFRELİ tutulur (AES-256-GCM, anahtar JWT_SECRET
   * türevi — ayrı env gerektirmeden DB sızıntısında seed'ler açık kalmasın).
   * Eski düz-metin kayıtlar okurken şeffaf desteklenir (lazy migration).
   */
  // Ortak yardımcı (common/auth/totp-secret-cipher.ts) — admin realm'le AYNI;
  // anahtar TOTP_ENC_KEY (varsa) ya da JWT_SECRET türevi; `enc:v1:` biçimi korunur.
  private encKey(): Buffer {
    return totpEncKey({
      jwtSecret: this.config.getOrThrow<string>("JWT_SECRET"),
      totpEncKey: this.config.get<string>("TOTP_ENC_KEY"),
    });
  }

  private encryptSecret(plain: string): string {
    return encryptTotpSecret(plain, this.encKey());
  }

  private decryptSecret(stored: string): string {
    return decryptTotpSecret(stored, this.encKey());
  }

  /**
   * Kurtarma kodu hash'i — v2 PEPPER'lı (anahtar: TOTP şifreleme anahtarından
   * türetilir; DB sızıntısında 40-bit kodlar çevrimdışı kırılamaz). Denetim
   * 2026-08-23 LOW. Eski pepper'sız hash'ler doğrulamada ŞEFFAF kabul edilir
   * (legacyHashRecoveryCode) — yeni kod üretiminde v2 yazılır.
   */
  private hashRecoveryCode(code: string): string {
    const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pepper = this.encKey().toString("hex");
    return crypto.createHash("sha256").update(`rc:v2:${pepper}:${norm}`).digest("hex");
  }

  /** Pepper'sız eski biçim (yalnız doğrulamada kabul). */
  private legacyHashRecoveryCode(code: string): string {
    const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return crypto.createHash("sha256").update(`rc:${norm}`).digest("hex");
  }

  private generateRecoveryCodes(): string[] {
    // 8 kod, XXXX-XXXX (karışan karakterler yok: 0/O, 1/I dışarıda).
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 8 }, () => {
      const raw = Array.from(crypto.randomBytes(8))
        .map((b) => alphabet[b % alphabet.length])
        .join("");
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
  }

  /**
   * TOTP kodu VEYA kurtarma kodu doğrula. Kurtarma kodu eşleşirse TÜKETİLİR
   * (tek kullanımlık). Dönen değer: geçerli mi + kurtarma kodu mu kullanıldı.
   */
  private async verifyTwoFactorCode(
    userId: string,
    code: string,
  ): Promise<{ ok: boolean; usedRecovery: boolean }> {
    const user = await this.bypass.companyUser.findUnique({
      where: { id: userId },
      select: {
        twoFactorMethod: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodes: true,
      },
    });
    if (!user) return { ok: false, usedRecovery: false };
    const trimmed = code.trim();
    // Ana yöntem: EMAIL → e-postaya giden kod; AUTHENTICATOR → TOTP.
    if (user.twoFactorMethod === "EMAIL") {
      if (await this.consumeEmailCode(userId, trimmed)) {
        return { ok: true, usedRecovery: false };
      }
    } else if (
      user.twoFactorSecret &&
      authenticator.verify({
        token: trimmed,
        secret: this.decryptSecret(user.twoFactorSecret),
      })
    ) {
      return { ok: true, usedRecovery: false };
    }
    // Kurtarma kodu — her iki yöntemde de geçerli; hash eşleşirse listeden düş.
    // ATOMİK tüketim (denetim 2026-08-23): `where: has(hash)` koşullu updateMany —
    // aynı kodla eşzamanlı iki giriş denemesinde yalnız biri geçer.
    const candidates = [this.hashRecoveryCode(trimmed), this.legacyHashRecoveryCode(trimmed)];
    const hash = candidates.find((h) => user.twoFactorRecoveryCodes.includes(h));
    if (hash) {
      const { count } = await this.bypass.companyUser.updateMany({
        where: { id: userId, twoFactorRecoveryCodes: { has: hash } },
        data: {
          twoFactorRecoveryCodes: {
            set: user.twoFactorRecoveryCodes.filter((h) => h !== hash),
          },
        },
      });
      if (count === 1) return { ok: true, usedRecovery: true };
    }
    return { ok: false, usedRecovery: false };
  }

  /** 2FA kurulumunu başlat — secret üret, QR + otpauth döndür (henüz aktif değil). */
  async setupTwoFactor(userId: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) {
      throw new BadRequestException(i18nMessage("api.companyAuth.ikiAdimliDogrulamaZatenAcik"));
    }
    const secret = authenticator.generateSecret();
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: { twoFactorSecret: this.encryptSecret(secret) },
    });
    const otpauthUrl = authenticator.keyuri(user.email, "Rothern", secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { otpauthUrl, qrDataUrl, secret };
  }

  /**
   * Kurulum kodunu doğrulayıp 2FA'yı aç. Kurtarma kodları BURADA üretilir ve
   * yalnızca bu yanıtta düz görünür — kullanıcı saklamalı (authenticator
   * kaybında tek giriş yolu).
   */
  private webBase() {
    return resolveWebUrl(this.config);
  }

  /**
   * Generic "notification" şablonlu e-posta — best-effort.
   *
   * DİL (i18n Faz 3): metin ALICININ dilinde üretilir; çağıran düz metin
   * değil KATALOG ANAHTARI verir ve alıcının `locale`'ini geçirir. Selamlama
   * ("Merhaba,") otomatik eklenir; `paragraphKeys` yalnız içerik paragrafları.
   * `ctaPath` İÇ (Türkçe) yoldur, alıcının diline çevrilir.
   */
  private sendNotificationEmail(
    to: { email: string; name?: string },
    locale: Locale,
    msg: {
      subjectKey: ApiMessageKey;
      paragraphKeys: readonly ApiMessageKey[];
      ctaLabelKey: ApiMessageKey;
      ctaPath: string;
      params?: Record<string, string | number>;
    },
    type: string,
    id: string,
  ) {
    const t = (key: ApiMessageKey) => tApi(key, msg.params, locale);
    const subject = t(msg.subjectKey);
    void this.email
      .send({
        to,
        subject,
        locale,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: subject,
            paragraphs: [
              t(NOTIFY_GREETING_KEY),
              ...msg.paragraphKeys.map(t),
            ],
            ctaLabel: t(msg.ctaLabelKey),
            ctaUrl: localizeUrl(this.webBase(), msg.ctaPath, locale),
          },
        },
        context: { type, id },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Bildirim e-postası gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  /** Firmanın bildirim e-postası (billingEmail → ilk aktif kullanıcı). */
  private async companyNotifyEmail(companyId: string) {
    const c = await this.bypass.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        billingEmail: true,
        users: {
          where: { isActive: true, deletedAt: null },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            locale: true,
          },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
    const email = c?.billingEmail || c?.users[0]?.email;
    if (!c || !email) return null;
    const name = c.users[0]
      ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
      : c.name;
    // E-POSTA DİLİ: firmanın EN ESKİ aktif üyesinin (pratikte kurucu) dili;
    // yalnız `billingEmail` taşıyan, üyesi çözülmemiş firmada varsayılan.
    return { email, name, locale: localeOf(c.users[0]?.locale) };
  }

  async enableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorSecret: true, locale: true },
    });
    if (!user?.twoFactorSecret) {
      throw new BadRequestException(i18nMessage("api.companyAuth.once2faKurulumunuBaslatin"));
    }
    if (
      !authenticator.verify({
        token: code.trim(),
        secret: this.decryptSecret(user.twoFactorSecret),
      })
    ) {
      throw new BadRequestException(i18nMessage("api.companyAuth.dogrulamaKoduHatali"));
    }
    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        twoFactorMethod: "AUTHENTICATOR",
        twoFactorRecoveryCodes: recoveryCodes.map((c) =>
          this.hashRecoveryCode(c),
        ),
      },
    });
    this.notify2faEnabled(userId, user.email, localeOf(user.locale));
    return { ok: true, recoveryCodes };
  }

  /** E-posta 2FA kurulumu/kapatma için kod gönder (kullanıcının e-postasına). */
  async sendEmailTwoFactorCode(userId: string) {
    const user = await this.bypass.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, locale: true },
    });
    if (!user) throw new UnauthorizedException();
    await this.issueEmailCode(
      userId,
      user.email,
      user.firstName,
      "login",
      localeOf(user.locale),
    );
    return { sent: true };
  }

  /** E-postaya gelen kodu doğrulayıp E-POSTA 2FA'yı aç (kurtarma kodları üret). */
  async enableEmailTwoFactor(userId: string, code: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true, locale: true },
    });
    if (!user) throw new UnauthorizedException();
    if (user.twoFactorEnabled) {
      throw new BadRequestException(i18nMessage("api.companyAuth.ikiAdimliDogrulamaZatenAcik"));
    }
    if (!(await this.consumeEmailCode(userId, code))) {
      throw new BadRequestException(i18nMessage("api.companyAuth.dogrulamaKoduHataliVeyaSuresiDolmus"));
    }
    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        twoFactorMethod: "EMAIL",
        twoFactorSecret: null,
        twoFactorRecoveryCodes: recoveryCodes.map((c) =>
          this.hashRecoveryCode(c),
        ),
      },
    });
    this.notify2faEnabled(userId, user.email, localeOf(user.locale));
    return { ok: true, recoveryCodes };
  }

  private notify2faEnabled(userId: string, email: string, locale: Locale) {
    void this.audit.log({
      action: "auth.2fa_enabled",
      actorType: "company",
      actorId: userId,
      actorEmail: email,
    });
    this.sendNotificationEmail(
      { email },
      locale,
      {
        subjectKey: "api.notifications.companyAuth.ikiAdimliAcildiBaslik",
        paragraphKeys: ["api.notifications.companyAuth.ikiAdimliAcildiGovde"],
        ctaLabelKey: "api.notifications.companyAuth.hesapAyarlari",
        ctaPath: "/company/ayarlar",
      },
      "two_factor_enabled",
      userId,
    );
  }

  /** TOTP veya kurtarma koduyla 2FA'yı kapat. */
  async disableTwoFactor(userId: string, code: string) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true, locale: true },
    });
    if (!user?.twoFactorEnabled) {
      throw new BadRequestException(i18nMessage("api.companyAuth.ikiAdimliDogrulamaZatenKapali"));
    }
    // Kod: authenticator TOTP / e-posta kodu / kurtarma kodu (yönteme göre).
    const { ok } = await this.verifyTwoFactorCode(userId, code);
    if (!ok) {
      throw new BadRequestException(i18nMessage("api.companyAuth.dogrulamaKoduHatali"));
    }
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        twoFactorMethod: "AUTHENTICATOR", // varsayılana dön
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
      },
    });
    void this.audit.log({
      action: "auth.2fa_disabled",
      actorType: "company",
      actorId: userId,
      actorEmail: user.email,
    });
    this.sendNotificationEmail(
      { email: user.email },
      localeOf(user.locale),
      {
        subjectKey: "api.notifications.companyAuth.ikiAdimliKapatildiBaslik",
        paragraphKeys: ["api.notifications.companyAuth.ikiAdimliKapatildiGovde"],
        ctaLabelKey: "api.notifications.companyAuth.hesapAyarlari",
        ctaPath: "/company/ayarlar",
      },
      "two_factor_disabled",
      userId,
    );
    return { ok: true };
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
      // Y2: self-servis premium açık mı — frontend CTA'sı bunu okur (TEK KAYNAK,
      // env drift'i yok). Ödeme entegrasyonuna kadar default false.
      selfUpgradeEnabled:
        this.config.get<string>("PREMIUM_SELF_UPGRADE_ENABLED") === "true",
    };
  }

  // ============================================================
  // HESAP AYARLARI (eski ayarlar — kişisel)
  // ============================================================

  /** Kendi profilini güncelle (ad/soyad/telefon/dil). */
  async updateMe(
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string; locale?: string },
  ) {
    if (dto.locale !== undefined && !isLocale(dto.locale)) {
      throw new BadRequestException(i18nMessage("api.validation.localeUnsupported"));
    }
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
      },
    });
    return this.getMe(userId);
  }

  /**
   * Mevcut parolayı doğrulayıp yenisini ata (Supabase). tokenVersion artar —
   * diğer cihazlardaki/eski JWT'ler geçersizleşir; bu oturuma TAZE token
   * döner (kullanıcı oturumda kalır).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, authId: true, companyId: true, locale: true },
    });
    if (!user || !user.authId) throw new UnauthorizedException();
    try {
      await this.supabaseAuth.verifyPassword(user.email, currentPassword);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      throw new ForbiddenException(i18nMessage("api.companyAuth.mevcutParolaHatali"));
    }
    await this.supabaseAuth.updatePassword(user.authId, newPassword);
    const updated = await this.prisma.companyUser.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
      select: { tokenVersion: true },
    });
    void this.audit.log({
      action: "auth.password_changed",
      actorType: "company",
      actorId: userId,
      actorEmail: user.email,
    });
    this.sendNotificationEmail(
      { email: user.email },
      localeOf(user.locale),
      {
        subjectKey: "api.notifications.companyAuth.parolaDegistiBaslik",
        paragraphKeys: ["api.notifications.companyAuth.parolaDegistiGovde"],
        ctaLabelKey: "api.notifications.companyAuth.hesapAyarlari",
        ctaPath: "/company/ayarlar",
      },
      "password_changed",
      userId,
    );
    const payload: CompanyJwtPayload = {
      sub: userId,
      email: user.email,
      type: "company",
      userId,
      companyId: user.companyId,
      tv: updated.tokenVersion,
    };
    return { ok: true, token: this.jwt.sign(payload) };
  }

  /**
   * Bildirim tercihlerini güncelle — anahtarlar whitelist'ten, değerler
   * boolean; MEVCUTLA BİRLEŞTİRİLİR (kısmi gönderim diğer tercihleri
   * sıfırlamaz). Transactional tipler zaten okuma tarafında korunur.
   */
  async updateNotificationPrefs(
    userId: string,
    prefs: Record<string, unknown>,
  ) {
    const valid = new Set<string>(NOTIFICATION_PREF_KEYS);
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(prefs ?? {})) {
      if (!valid.has(k)) {
        throw new BadRequestException(i18nMessage("api.companyAuth.gecersizBildirimTercihi", { k: k }));
      }
      clean[k] = v === true;
    }
    const current = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const merged = {
      ...((current?.notificationPrefs as Record<string, boolean> | null) ?? {}),
      ...clean,
    };
    await this.prisma.companyUser.update({
      where: { id: userId },
      data: { notificationPrefs: merged },
    });
    return this.getMe(userId);
  }

  /**
   * Parolasız oturum aç — davet kabulü gibi kimliği BAŞKA yoldan kanıtlanmış
   * akışlar için (token'lı davet linki). Login ile aynı yanıt şekli.
   */
  async createSession(userId: string, ctx?: Ctx) {
    const user = await this.bypass.companyUser.findUnique({
      where: { id: userId },
      include: { company: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.buildLoginResponse(user, user.company, ctx);
  }

  // ============================================================
  // HELPERS
  // ============================================================
  private async buildLoginResponse(
    user: CompanyUser,
    company: Company,
    ctx?: Ctx,
  ) {
    await this.bypass.companyUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: CompanyJwtPayload = {
      sub: user.id,
      email: user.email,
      type: "company",
      userId: user.id,
      companyId: company.id,
      // Oturum sürümü — parola değişince artar, eski token'lar ölür.
      tv: user.tokenVersion,
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
    // Efektif izinler — UI kapıları bunu okur. Doğruluk kaynağı kişinin açık
    // izin listesi (kurucu örtük izinleri + eski anahtar eşlemesi
    // effectivePermissions'ta; boş liste + rol → hazır set geçiş emniyeti).
    // Sahiplik normalizasyonu (strategy ile aynı kural): sahibin efektif rol
    // kümesi HER ZAMAN SAHIP etiketini içerir — eski/tutarsız veri UI'da
    // portal/rol ekranlarını kırmasın.
    const roles =
      isOwner && !user.roles.includes("SAHIP")
        ? (["SAHIP", ...user.roles] as typeof user.roles)
        : user.roles;
    const permissions = effectivePermissions({
      isOwner,
      permissions: user.permissions,
      roles: user.roles,
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      roles,
      isOwner,
      permissions,
      twoFactorEnabled: user.twoFactorEnabled,
      notificationPrefs:
        (user.notificationPrefs as Record<string, boolean> | null) ?? null,
      lastLoginAt: user.lastLoginAt,
      locale: user.locale,
    };
  }

  /** Çakışmasız rothernId üretir (XXXX-XXXX). Bağlantı davetinde kullanılır. */
  private async generateUniqueRothernId(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = generateShortCode();
      const exists = await this.bypass.company.count({
        where: { rothernId: code },
      });
      if (exists === 0) return code;
    }
    throw new Error("rothernId üretilemedi (çakışma)");
  }

  private serializeCompany(company: Company) {
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      rothernId: company.rothernId,
      // INV-TIER-1: efektif tier (süre-dolma penceresinde ham PAKET görünse de
      // STANDARD döner) — /me'yi okuyan web shell tek kaynaktan görür.
      tier: effectiveTier(company.tier, company.membershipEndAt),
      country: company.country,
      companyVerificationStatus: company.companyVerificationStatus,
      onboardingCompletedAt: company.onboardingCompletedAt,
      ownerUserId: company.ownerUserId,
      publicEnabled: company.publicEnabled,
      isActive: company.isActive,
      website: company.website,
      // Faz T: kademe-bayrakları — UI tüketicileri için hazır (AI özelliği
      // henüz yok; Silver+ açılınca bu bayrak kapı olacak).
      features: {
        ai: tierAtLeast(
          effectiveTier(company.tier, company.membershipEndAt),
          "SILVER",
        ),
      },
    };
  }
}


/** Web sitesi normalizasyonu: boş → null; şemasızsa https:// öne eklenir. */
function normalizeWebsite(raw?: string): string | null {
  const w = (raw ?? "").trim();
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w.slice(0, 200) : `https://${w}`.slice(0, 200);
}
