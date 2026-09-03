import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { appRoutes } from "../../common/company/app-routes";
import { hasPublicProfile } from "../../common/company/public-profile-gate";
import { EmailService } from "../email/email.service";

/**
 * MİSAFİR BİLGİ TALEBİ — hesabı OLMAYAN ziyaretçinin ürün sayfasından
 * gönderdiği talep (Faz 1).
 *
 * ── SPAM'İ KAPATAN ŞEY DOĞRULAMA KAPISI, LİMİTLER DEĞİL ───────────────────
 * Talep oluşturulduğunda satıcıya HİÇBİR ŞEY gitmez; iletim yalnız ziyaretçi
 * e-postasını doğruladıktan sonra olur. Bu yüzden sahte/çalışmayan adres
 * satıcıya sıfır maliyet çıkarır. Hız limitleri bunun ÜSTÜNE gelir (gürültüyü
 * ve DB şişmesini azaltmak için), yerine değil.
 *
 * ── SATICI ZİYARETÇİNİN E-POSTASINI GÖRMEZ ────────────────────────────────
 * Gösterilseydi doğrudan yazıp platformu atlar, ilişki dışarı kaçardı ve
 * ziyaretçi hiç kaydolmazdı. İletişim platform üzerinden yürür.
 */
@Injectable()
export class PublicInquiryService {
  private readonly logger = new Logger(PublicInquiryService.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly email: EmailService,
  ) {}

  /** Doğrulama jetonu ömrü — bir günden uzun tutmak ölü satır biriktirir. */
  private static readonly TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
  /** Aynı IP'den saatlik tavan. */
  private static readonly MAX_PER_IP_HOUR = 5;
  /** Aynı IP'den bekleyen (doğrulanmamış) talep tavanı — kuyruk şişmesin. */
  private static readonly MAX_PENDING_PER_IP = 10;
  /** Aynı e-postadan günlük tavan (MİSAFİR yolu). */
  private static readonly MAX_PER_EMAIL_DAY = 3;
  /** Kayıtlı firmadan günlük tavan — misafir tavanı burada geçersiz. */
  private static readonly MAX_PER_COMPANY_DAY = 30;

  async create(input: {
    companySlug: string;
    productSlug: string;
    name: string;
    email: string;
    companyName?: string;
    phone?: string;
    message: string;
    quantity?: string;
    ip?: string;
    /** Bot tuzağı — dolduysa istek SESSİZCE başarılı görünür ama yazılmaz. */
    honeypot?: string;
    /** Formun açılışından gönderime geçen süre (ms) — bot 2 sn'den hızlıdır. */
    elapsedMs?: number;
  }): Promise<{ ok: true }> {
    const email = input.email.trim().toLowerCase();

    // Bot sinyalleri: SESSİZCE başarı döndür. Hata döndürmek bota hangi
    // kontrolün yakaladığını öğretir; sessiz başarı ise onu boşa çalıştırır.
    if (input.honeypot?.trim()) return { ok: true };
    if (input.elapsedMs != null && input.elapsedMs < 2000) return { ok: true };

    await this.assertWithinLimits(email, input.ip);

    const product = await this.requireTarget(
      input.companySlug,
      input.productSlug,
    );

    const token = randomBytes(32).toString("hex");
    const inquiry = await this.prisma.publicInquiry.create({
      data: {
        companyId: product.companyId,
        productId: product.id,
        name: input.name.trim(),
        email,
        companyName: input.companyName?.trim() || null,
        phone: input.phone?.trim() || null,
        message: input.message.trim(),
        quantity: input.quantity?.trim() || null,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + PublicInquiryService.TOKEN_TTL_MS),
        createdIp: input.ip ?? null,
      },
      select: { id: true },
    });

    // Doğrulama e-postası. Gidemezse talep ÖLÜ DOĞMUŞ olur: jeton
    // ulaşmadığı için hiç doğrulanamaz, ama satır kullanıcının günlük
    // kotasını yer (3/gün → üç başarısız deneme kullanıcıyı bir gün kilitler).
    // Bu yüzden başarısızlıkta satırı SİLİP dürüst hata döndürüyoruz.
    const result = await this.email.send({
      to: { email, name: input.name.trim() },
      templateData: {
        template: "notification",
        data: {
          subject: "Talebinizi onaylayın",
          heading: "Tek adım kaldı",
          paragraphs: [
            `${product.name} ürünü hakkındaki talebiniz henüz gönderilmedi.`,
            "Aşağıdaki bağlantıya tıklayarak e-posta adresinizi doğrulayın; talebiniz o an satıcıya iletilecek.",
          ],
          ctaLabel: "Talebimi onayla",
          ctaUrl: `${webBase()}/talep-onayla?t=${token}`,
          footerNote:
            "Bu talebi siz göndermediyseniz bu e-postayı yok sayabilirsiniz — onaylanmayan talep satıcıya iletilmez.",
        },
      },
      context: { type: "public_inquiry_verify", id: inquiry.id },
    }).catch(async (e: unknown) => {
      await this.discard(inquiry.id);
      this.logger.error(
        `Doğrulama e-postası gönderilemedi — inquiry silindi: ${String(e)}`,
      );
      throw new ServiceUnavailableException(
        "Talebiniz şu an gönderilemedi. Lütfen birkaç dakika sonra tekrar deneyin.",
      );
    });

    // `sent: false` = adres suppression listesinde (daha önce kalıcı bounce
    // ya da şikayet). Sessizce "gitti" demek kullanıcıyı sebebini göremeden
    // bekletirdi (Dalga B dersi: dürüst sinyal).
    if (!result.sent) {
      await this.discard(inquiry.id);
      throw new BadRequestException(
        "Bu e-posta adresine gönderim yapılamıyor. Farklı bir adres deneyin.",
      );
    }
    return { ok: true };
  }

  /* ================================================================== */
  /* KAYITLI ALICI                                                       */
  /* ================================================================== */

  /**
   * GİRİŞ YAPMIŞ firmanın bilgi talebi.
   *
   * Misafir yolundan üç yerde ayrılır ve üçü de aynı sebebe dayanır: KİMLİK
   * ZATEN KANITLI.
   *
   *  1. **Doğrulama adımı YOK** — talep anında satıcıya iletilir
   *     (`verifiedAt` hemen). Misafir yolundaki jeton, e-posta kutusunun
   *     sahibi olduğunu kanıtlatmak içindi; hesap açarken o kanıt zaten
   *     verildi (6 haneli kod) ve doğrulanmamış e-postayla giriş kapalı.
   *  2. **Bot savunması YOK** (tuzak alan, süre ölçümü, IP tavanı). Bunlar
   *     anonim yazma ucunun savunmasıydı; burada oturum var.
   *  3. **Kimlik alanları SORULMAZ** — ad/e-posta/firma oturumdan gelir.
   *     Sormak, kullanıcıya kendi bildiğimiz bilgiyi yeniden yazdırmak olurdu
   *     (canlıda tam olarak bu oluyordu: giriş yapmış kullanıcı ürün
   *     sayfasında misafir formuyla karşılaşıyordu).
   *
   * Satır `claimedCompanyId` ile DOĞAR: misafir yolunda bu alan kayıt sonrası
   * tembel bağlamayla doluyor, burada gönderen zaten belli. `sent` listesi
   * (alıcı gözü) bu alanı okuduğu için talep anında orada görünür.
   *
   * `tokenHash` şemada zorunlu ve tekil; hiçbir zaman e-postalanmayan rastgele
   * bir değer yazılır. Kolonu nullable yapmak için migration açmak, canlı
   * tabloya yalnız bu yol için dokunmak demekti — jeton zaten "kullanılmış"
   * sayılıyor (`expiresAt` geçmiş).
   */
  async createAsCompany(input: {
    companyId: string;
    email: string;
    fullName: string;
    companySlug: string;
    productSlug: string;
    message: string;
    quantity?: string;
  }): Promise<{ id: string }> {
    const product = await this.requireTarget(
      input.companySlug,
      input.productSlug,
    );

    // Kendi ürününe talep: satıcıya kendi kendine bildirim gider, "gelen
    // talepler" kendi satırıyla kirlenir.
    if (product.companyId === input.companyId) {
      throw new BadRequestException(
        "Kendi ürününüz için bilgi talebi gönderemezsiniz",
      );
    }

    await this.assertCompanyWithinLimits(input.companyId, product.id);

    // Alıcı firma adı OTURUMDAN değil VERİTABANINDAN: JWT'de yok ve olsaydı
    // bile bayatlardı — satıcının gördüğü ad her zaman güncel olmalı.
    const buyer = await this.prisma.company.findUnique({
      where: { id: input.companyId },
      select: { name: true },
    });

    const inquiry = await this.prisma.publicInquiry.create({
      data: {
        companyId: product.companyId,
        productId: product.id,
        name: input.fullName,
        email: input.email.trim().toLowerCase(),
        companyName: buyer?.name ?? null,
        message: input.message.trim(),
        quantity: input.quantity?.trim() || null,
        // Jeton hiç kullanılmaz — satır doğrulanmış doğuyor.
        tokenHash: hashToken(randomBytes(32).toString("hex")),
        expiresAt: new Date(),
        verifiedAt: new Date(),
        claimedCompanyId: input.companyId,
        claimedAt: new Date(),
      },
      select: { id: true, name: true },
    });

    // Misafir yolundaki İLETİM adımının aynısı — tek fark, doğrulamayı
    // beklemeden burada olması.
    void this.notifySeller(product.companyId, product.name, inquiry.name);

    return { id: inquiry.id };
  }

  /**
   * Kayıtlı alıcı tavanları. Misafir tavanları (3/gün/e-posta) BURAYA
   * UYGULANMAZ: gerçek bir satın almacı gün içinde üçten fazla tedarikçiye
   * soru sorar ve dördüncüde kilitlenmek ürünü kullanılmaz yapardı.
   *
   * İki fren kalıyor:
   *  · aynı ÜRÜNE 24 saat içinde ikinci talep — satıcının kutusunda aynı
   *    sorunun kopyası birikmesin (kullanıcı yanıt gelmedi diye tekrar
   *    gönderir; doğru yol mevcut talebe bakmak),
   *  · firma başına günlük tavan — hesap ele geçirilirse zarar sınırlı kalsın.
   */
  private async assertCompanyWithinLimits(companyId: string, productId: string) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sameProduct, dayTotal] = await Promise.all([
      this.prisma.publicInquiry.count({
        where: { claimedCompanyId: companyId, productId, createdAt: { gte: dayAgo } },
      }),
      this.prisma.publicInquiry.count({
        where: { claimedCompanyId: companyId, createdAt: { gte: dayAgo } },
      }),
    ]);
    if (sameProduct > 0) {
      throw new BadRequestException(
        "Bu ürün için zaten bir talep gönderdiniz — yanıtı Bilgi Taleplerim sayfasından takip edebilirsiniz",
      );
    }
    if (dayTotal >= PublicInquiryService.MAX_PER_COMPANY_DAY) {
      throw new BadRequestException(
        "Bugün için talep sınırına ulaştınız — yarın tekrar deneyebilirsiniz",
      );
    }
  }

  /* ================================================================== */
  /* SATICI TARAFI                                                       */
  /* ================================================================== */

  /**
   * Firmaya gelen bilgi talepleri.
   *
   * YALNIZ DOĞRULANMIŞLAR listelenir — doğrulanmamış satır satıcı için var
   * değildir (spam kapısının anlamı bu). Ziyaretçinin E-POSTASI ve TELEFONU
   * dönmez: gösterilseydi satıcı doğrudan yazıp platformu atlar, ilişkiyi
   * göremezdik ve ziyaretçi hiç kaydolmazdı.
   */
  async listForCompany(companyId: string, page = 1) {
    const pageSize = 20;
    const where = { companyId, verifiedAt: { not: null } } as const;
    const [total, rows] = await Promise.all([
      this.prisma.publicInquiry.count({ where }),
      this.prisma.publicInquiry.findMany({
        where,
        select: {
          id: true,
          name: true,
          companyName: true,
          message: true,
          quantity: true,
          verifiedAt: true,
          claimedAt: true,
          product: { select: { name: true, slug: true } },
          replies: {
            select: { id: true, body: true, createdAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { verifiedAt: "desc" },
        skip: (Math.max(1, page) - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        companyName: r.companyName,
        message: r.message,
        quantity: r.quantity,
        receivedAt: r.verifiedAt?.toISOString() ?? null,
        /** Ziyaretçi kaydoldu mu — satıcıya "artık panelden de ulaşabilir". */
        hasAccount: r.claimedAt != null,
        product: r.product,
        replies: r.replies.map((x) => ({
          id: x.id,
          body: x.body,
          createdAt: x.createdAt.toISOString(),
        })),
      })),
      total,
      page: Math.max(1, page),
      pageSize,
    };
  }

  /**
   * Satıcının yanıtı. Alıcıya giden bildirim İÇERİK TAŞIMAZ — yalnız "yanıt
   * geldi" der. İçeriği koysaydık platform ücretsiz bir e-posta rölesine
   * dönerdi; ilişkiyi de göremezdik.
   *
   * Bildirimin geri kalanı alıcının KAYITLI olup olmamasına göre ayrışır
   * (`notifyVisitorOfReply`).
   */
  async reply(
    companyId: string,
    authorId: string,
    inquiryId: string,
    body: string,
  ) {
    const inquiry = await this.prisma.publicInquiry.findFirst({
      where: { id: inquiryId, companyId, verifiedAt: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        // Talebi KAYITLI bir alıcı mı gönderdi — bildirimin dili buna bağlı.
        claimedCompanyId: true,
        product: { select: { name: true } },
        company: { select: { name: true } },
      },
    });
    if (!inquiry) throw new NotFoundException("Talep bulunamadı");

    const reply = await this.prisma.publicInquiryReply.create({
      data: { inquiryId, authorId, body: body.trim() },
      select: { id: true, body: true, createdAt: true },
    });

    // Bildirim fire-and-forget: gönderilemezse yanıt YİNE de kaydedilmiş olur
    // (ziyaretçi kaydolduğunda panelde görür). Yanıtı bildirime bağlamak,
    // e-posta sağlayıcısının kesintisinde satıcının emeğini çöpe atardı.
    void this.notifyVisitorOfReply(
      reply.id,
      inquiry.email,
      inquiry.name,
      inquiry.product.name,
      inquiry.company.name,
      inquiry.claimedCompanyId != null,
    );

    return {
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
    };
  }

  /**
   * Yanıt bildirimi — ALICI KAYITLI MI, dil ona göre.
   *
   * Misafire "hesap açın" demek doğru: yanıtı okumasının tek yolu bu ve
   * içeriği e-postaya koymak platformu ücretsiz bir röleye çevirirdi. Aynı
   * metni KAYITLI alıcıya göndermek ise düpedüz yanlış — hesabı zaten var,
   * "Hesabımı oluştur" düğmesi onu kayıt ekranına atar ve yanıtın hangi
   * sayfada beklediğini hiç söylemez.
   *
   * İçerik iki dalda da TAŞINMAZ: satıcı bildirimi de içerik taşımıyor,
   * yazışma platformda kalsın diye (aynı model notu).
   */
  private async notifyVisitorOfReply(
    replyId: string,
    email: string,
    name: string,
    productName: string,
    companyName: string,
    claimed: boolean,
  ) {
    try {
      const res = await this.email.send({
        to: { email, name },
        templateData: {
          template: "notification",
          data: {
            subject: "Talebinize yanıt geldi",
            heading: "Yanıtınız hazır",
            paragraphs: [
              `${companyName}, "${productName}" hakkındaki talebinizi yanıtladı.`,
              // İÇERİK BİLİNÇLİ OLARAK YOK.
              claimed
                ? "Yanıtı Bilgi Taleplerim sayfanızdan okuyabilirsiniz."
                : "Yanıtı okumak için ücretsiz hesabınızı oluşturun; bu talebiniz ve gelen yanıtlar hesabınıza bağlanacak.",
            ],
            ctaLabel: claimed ? "Yanıtı oku" : "Hesabımı oluştur ve yanıtı oku",
            ctaUrl: claimed
              ? appRoutes.inquiriesSent(webBase())
              : `${webBase()}/company/kayit?email=${encodeURIComponent(email)}`,
          },
        },
        context: { type: "public_inquiry_reply", id: replyId },
      });
      if (res.sent) {
        await this.prisma.publicInquiryReply.update({
          where: { id: replyId },
          data: { notifiedAt: new Date() },
        });
      }
    } catch (e) {
      this.logger.warn(`Yanıt bildirimi gönderilemedi: ${String(e)}`);
    }
  }

  /**
   * Kayıt sonrası: ziyaretçinin e-postasıyla eşleşen DOĞRULANMIŞ talepleri
   * yeni hesaba bağlar.
   *
   * Yalnız doğrulanmışlar: doğrulanmamış talep satıcıya hiç iletilmedi,
   * hesaba bağlanacak bir şey de yok. Zaten başka bir hesaba bağlanmışları
   * atlar (aynı adresle ikinci kayıt).
   */
  async claimForCompany(companyId: string, email: string) {
    const result = await this.prisma.publicInquiry.updateMany({
      where: {
        email: email.trim().toLowerCase(),
        verifiedAt: { not: null },
        claimedCompanyId: null,
      },
      data: { claimedCompanyId: companyId, claimedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(
        `${result.count} misafir talebi ${companyId} hesabına bağlandı`,
      );
    }
    return result.count;
  }

  /**
   * Ziyaretçinin hesabına bağlanmış talepleri + yanıtları.
   *
   * BAĞLAMA BURADA, TEMBEL yapılır (kayıt akışında değil): `CompanyAuthService`e
   * bağımlılık eklemek onun çok sayıdaki test rig'ini kırardı (CLAUDE.md'de
   * sekiz kez tekrarlamış "rig stub" tuzağı) ve kayıt yolunu bu özelliğe
   * bağımlı hâle getirirdi.
   *
   * Tembel bağlama ayrıca DAHA GENİŞ çalışıyor: talebi göndermeden ÖNCE
   * kaydolmuş kullanıcıyı da, mevcut bir hesabı olan ziyaretçiyi de yakalar.
   * İdempotent.
   *
   * GÜVENLİK: e-posta eşleşmesi iki taraflı kanıta dayanıyor — talep
   * doğrulanırken o kutuya gelen bağlantıya tıklandı, hesap doğrulanırken de
   * aynı kutuya gelen 6 haneli kod girildi. Doğrulanmamış e-postayla login
   * zaten engelli, yani bu sayfaya ulaşan herkes adresini kanıtlamıştır.
   */
  async listClaimed(companyId: string, email: string) {
    await this.claimForCompany(companyId, email);
    const rows = await this.prisma.publicInquiry.findMany({
      where: { claimedCompanyId: companyId },
      select: {
        id: true,
        message: true,
        quantity: true,
        verifiedAt: true,
        company: { select: { name: true, slug: true } },
        product: { select: { name: true, slug: true } },
        replies: {
          select: { id: true, body: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { verifiedAt: "desc" },
      take: 50,
    });
    return rows.map((r) => ({
      id: r.id,
      message: r.message,
      quantity: r.quantity,
      sentAt: r.verifiedAt?.toISOString() ?? null,
      seller: r.company,
      product: r.product,
      replies: r.replies.map((x) => ({
        id: x.id,
        body: x.body,
        createdAt: x.createdAt.toISOString(),
      })),
    }));
  }

  /**
   * Doğrulama e-postası gidemeyen talebi siler. Kalsaydı asla
   * doğrulanamayacak bir satır kullanıcının günlük kotasını yerdi.
   */
  private async discard(id: string) {
    await this.prisma.publicInquiry
      .delete({ where: { id } })
      .catch(() => undefined);
  }

  /**
   * Jetonla doğrular ve talebi satıcıya İLETİR.
   *
   * Idempotent: aynı bağlantıya ikinci tıklama hata vermez, aynı sonucu döner
   * (kullanıcı e-postayı iki kez açabilir).
   */
  async verify(token: string) {
    const row = await this.prisma.publicInquiry.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        verifiedAt: true,
        expiresAt: true,
        email: true,
        name: true,
        message: true,
        company: { select: { id: true, name: true, slug: true } },
        product: { select: { name: true, slug: true } },
      },
    });
    if (!row) throw new NotFoundException("Bağlantı geçersiz");
    if (row.verifiedAt) {
      return this.verifiedPayload(row);
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        "Bağlantının süresi doldu — talebi yeniden gönderin",
      );
    }

    await this.prisma.publicInquiry.update({
      where: { id: row.id },
      data: { verifiedAt: new Date() },
    });

    // Satıcıya bildirim. Ziyaretçinin E-POSTASI/TELEFONU GEÇMEZ — iletişim
    // platform üzerinden yürüsün (model notu).
    void this.notifySeller(row.company.id, row.product.name, row.name);

    return this.verifiedPayload(row);
  }

  private verifiedPayload(row: {
    email: string;
    company: { name: string; slug: string | null };
    product: { name: string; slug: string | null };
  }) {
    return {
      ok: true as const,
      productName: row.product.name,
      companyName: row.company.name,
      /**
       * Kayıt ekranına ön-doldurma için: ziyaretçi aynı e-postayla kaydolunca
       * talebi hesabına bağlanır.
       */
      email: row.email,
    };
  }

  /** Satıcının firma kullanıcılarına "yeni bilgi talebi" bildirimi. */
  private async notifySeller(
    companyId: string,
    productName: string,
    visitorName: string,
  ) {
    const users = await this.prisma.companyUser.findMany({
      where: { companyId, isActive: true },
      select: { email: true, firstName: true },
      take: 5,
    });
    for (const u of users) {
      await this.email
        .send({
          to: { email: u.email, name: u.firstName ?? "" },
          templateData: {
            template: "notification",
            data: {
              subject: "Ürününüz için yeni bilgi talebi",
              heading: "Yeni bilgi talebi",
              paragraphs: [
                `${visitorName}, "${productName}" ürününüz hakkında bilgi istedi.`,
                "Talebi panelinizden görüntüleyip yanıtlayabilirsiniz.",
              ],
              ctaLabel: "Talebi görüntüle",
              ctaUrl: appRoutes.inquiriesReceived(webBase()),
            },
          },
          context: { type: "public_inquiry_received", id: companyId },
        })
        .catch((e: unknown) => {
          this.logger.warn(`Satıcı bildirimi gönderilemedi: ${String(e)}`);
        });
    }
  }

  /**
   * Hedef ürün gerçekten yayımda mı ve firması vitrin kapısından geçiyor mu.
   * `getPublicProduct` ile AYNI kapı — ayrışırsa gizli bir ürüne talep
   * gönderilebilirdi.
   */
  private async requireTarget(companySlug: string, productSlug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug: companySlug },
      select: {
        id: true,
        slug: true,
        publicEnabled: true,
        isActive: true,
        isBlocked: true,
        tier: true,
        membershipEndAt: true,
      },
    });
    if (!company || !hasPublicProfile({ ...company, tier: company.tier as string })) {
      throw new NotFoundException("Ürün bulunamadı");
    }
    const product = await this.prisma.companyItem.findFirst({
      where: {
        companyId: company.id,
        slug: productSlug,
        isPublic: true,
        isActive: true,
      },
      select: { id: true, name: true, companyId: true },
    });
    if (!product) throw new NotFoundException("Ürün bulunamadı");
    return product;
  }

  /**
   * Hız limitleri. Doğrulama kapısının YERİNE değil ÜSTÜNE: kapı iletimi
   * durdurur, bunlar kuyruğun ve gönderilen e-postaların şişmesini durdurur.
   */
  private async assertWithinLimits(email: string, ip?: string) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const emailCount = await this.prisma.publicInquiry.count({
      where: { email, createdAt: { gte: dayAgo } },
    });
    if (emailCount >= PublicInquiryService.MAX_PER_EMAIL_DAY) {
      throw new BadRequestException(
        "Bu e-posta adresinden bugün çok fazla talep gönderildi — yarın tekrar deneyin",
      );
    }

    if (!ip) return;
    const [ipHour, ipPending] = await Promise.all([
      this.prisma.publicInquiry.count({
        where: { createdIp: ip, createdAt: { gte: hourAgo } },
      }),
      this.prisma.publicInquiry.count({
        where: { createdIp: ip, verifiedAt: null, createdAt: { gte: dayAgo } },
      }),
    ]);
    if (
      ipHour >= PublicInquiryService.MAX_PER_IP_HOUR ||
      ipPending >= PublicInquiryService.MAX_PENDING_PER_IP
    ) {
      throw new BadRequestException(
        "Çok fazla talep gönderildi — bir süre sonra tekrar deneyin",
      );
    }
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function webBase(): string {
  return process.env.WEB_URL ?? "http://localhost:3000";
}
