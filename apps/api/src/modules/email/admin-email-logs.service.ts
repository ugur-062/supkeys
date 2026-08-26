import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import type { EmailTemplateData } from "@rothern/email";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailService, REDACTED_CONTEXT_TYPES } from "./email.service";
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
      },
    });
    if (!log) throw new NotFoundException("E-posta kaydı bulunamadı");

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
        "Bu e-posta tek-kullanımlık kod/token taşıdığı için içeriği saklanmaz — yeniden gönderilemez. Kullanıcı kodu/daveti yeniden talep etmeli (parola sıfırlama, doğrulama kodu veya daveti tekrar gönderme akışı).",
      );
    }

    const result = await this.emailService.send({
      to: { email: log.toEmail, name: log.toName ?? undefined },
      subject: log.subject,
      templateData: {
        template: log.template,
        data: log.payload ?? {},
      } as unknown as EmailTemplateData,
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
      },
    });
    return { success: true, emailLogId: result.emailLogId };
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
        orderBy: { queuedAt: "desc" },
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
      throw new NotFoundException("E-posta logu bulunamadı");
    }
    return log;
  }
}
