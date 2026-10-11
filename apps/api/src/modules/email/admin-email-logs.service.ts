import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import type { EmailTemplateData } from "@rothern/email";
import { isLocale } from "@rothern/i18n";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService, REDACTED_CONTEXT_TYPES } from "./email.service";
import { isInternalEmailLog } from "./suppression-marker";
import { ListEmailLogsDto } from "./dto/list-email-logs.dto";

@Injectable()
export class AdminEmailLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** Başarısız/teslim olmamış bir e-postayı aynı içerikle yeniden gönder. */
  async resend(id: string, adminId: string) {
    const log = await this.prisma.emailLog.findUnique({
      where: { id },
      select: {
        id: true,
        template: true,
        toEmail: true,
        toName: true,
        subject: true,
        payload: true,
        contextType: true,
        contextId: true,
        locale: true,
        provider: true,
      },
    });
    if (!log) throw new NotFoundException(i18nMessage("api.email.ePostaKaydiBulunamadi"));

    // Ic kayitlar (engel kaldirma isareti, provider="internal") gercek bir
    // e-posta degildir: sablonu yoktur, render 500 veriyordu ve araya yazilan
    // FAILED satir da `suppression_clear` sablonunu tasidigi icin yeniden
    // engellenmis adresi sessizce akliyordu (arayuz testi O-078).
    if (isInternalEmailLog(log)) {
      throw new BadRequestException(
        i18nMessage("api.email.icKayitYenidenGonderilemez"),
      );
    }

    // Denetim 2026-08-26 Parça 9 #2: tek-kullanımlık sır taşıyan tiplerde
    // `payload` DB'ye MASKELİ yazılır (`{__redacted:…}`) — bu payload'la
    // yeniden gönderim, kullanıcıya kodu/token'ı OLMAYAN bir e-posta yollar
    // (ya da render'da patlar) ve admin'e sahte bir "gönderildi" gösterirdi.
    // Doğru kurtarma yolu yeni bir kod/davet ÜRETMEK; burada net şekilde
    // reddedip admin'i oraya yönlendiriyoruz.
    const redactedPayload =
      !!log.payload &&
      typeof log.payload === "object" &&
      "__redacted" in (log.payload as Record<string, unknown>);
    if (
      (log.contextType && REDACTED_CONTEXT_TYPES.has(log.contextType)) ||
      redactedPayload
    ) {
      throw new BadRequestException(
        i18nMessage("api.email.buEPostaTekKullanimlikKod"),
      );
    }

    // Derin denetim MU-05: orijinal gonderimin DILI ve BAGLAMI geri gecirilir.
    // Baglam olmadan akis TRANSACTIONAL sayiliyordu: tek tik cikis kapisi
    // atlaniyor, List-Unsubscribe/alt bilgi baglantisi basilmiyor, islem
    // gondericisi kullaniliyordu; dil olmadan EN/RU aliciya Turkce gidiyordu.
    // Eski satirda (locale NULL) Turkce varsayilir — orijinal davranis.
    const result = await this.emailService.send({
      to: { email: log.toEmail, name: log.toName ?? undefined },
      subject: log.subject,
      templateData: {
        template: log.template,
        data: log.payload ?? {},
      } as unknown as EmailTemplateData,
      ...(isLocale(log.locale) ? { locale: log.locale } : {}),
      ...(log.contextType
        ? { context: { type: log.contextType, id: log.contextId ?? "" } }
        : {}),
    });

    void this.audit.log({
      action: "email.resent",
      actorType: "admin",
      actorId: adminId || null,
      entityType: "email_log",
      entityId: id,
      metadata: {
        template: log.template,
        toEmail: log.toEmail,
        newLogId: result.emailLogId,
        sent: result.sent,
      },
    });
    // `sent: false` = bastirilmis adres ya da alici bu turden cikmis; yeni log
    // satiri FAILED + nedeniyle yazildi. Admin arayuzu bunu basari saymaz.
    return { success: true, emailLogId: result.emailLogId, sent: result.sent };
  }

  async list(query: ListEmailLogsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EmailLogWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.template) where.template = query.template;
    if (query.toEmail) {
      where.toEmail = { contains: query.toEmail, mode: "insensitive" };
    }
    if (query.contextType) where.contextType = query.contextType;
    if (query.contextId) where.contextId = query.contextId;

    const [items, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        skip,
        take: pageSize,
        // P12: tek alanlı sıralama eşit damgalarda sayfalar arası kayma
        // üretir (aynı satır iki sayfada / hiç görünmez) → id ile tie-break.
        orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const log = await this.prisma.emailLog.findUnique({
      where: { id },
      // V2-1 — webhook event timeline'ı detayda göster
      include: {
        events: { orderBy: { occurredAt: "asc" } },
      },
    });
    if (!log) {
      throw new NotFoundException(i18nMessage("api.email.ePostaLoguBulunamadi"));
    }
    return log;
  }
}
