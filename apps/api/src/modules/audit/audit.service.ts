import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";

export type AuditActorType =
  | "tenant"
  | "admin"
  | "supplier"
  | "company"
  | "system";

export interface AuditEntry {
  /** Nokta-ayraçlı eylem: "auth.login", "tender.awarded", "user.deactivated" */
  action: string;
  actorType: AuditActorType;
  actorId?: string | null;
  actorEmail?: string | null;
  tenantId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
  /**
   * Kritik iz (para/yetki geçişi). Yazım başarısız olursa ayırt edilebilir bir
   * marker'la loglanır ki para/yetki audit kaybı sıradan hata gürültüsünde
   * kaybolmasın (ileride alert-webhook bu marker'a key'lenebilir).
   */
  critical?: boolean;
}

/**
 * V2-7+ — Güvenlik denetim izi (OWASP A09). Append-only.
 * `log()` ASLA throw etmez — denetim yazımı başarısız olsa bile ana iş akışı
 * (login, kazandırma vb.) bozulmaz; sadece sunucu loguna hata düşer.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          tenantId: entry.tenantId ?? null,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata:
            (entry.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (entry.critical) {
        // Sabit, greplenebilir marker — para/yetki izinin kaybı sessizce geçmesin.
        this.logger.error(
          `[AUDIT-KRİTİK-KAYIP] action=${entry.action} actorId=${
            entry.actorId ?? "-"
          } entityType=${entry.entityType ?? "-"} entityId=${
            entry.entityId ?? "-"
          }: ${reason}`,
        );
      } else {
        this.logger.error(`audit log yazılamadı (${entry.action}): ${reason}`);
      }
    }
  }

  /** Admin denetim görüntüleyici — filtrelenmiş, sayfalı liste (en yeni önce). */
  async query(params: {
    actorType?: string;
    action?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));

    const where: Prisma.AuditLogWhereInput = {};
    if (params.actorType) where.actorType = params.actorType;
    if (params.action) where.action = { startsWith: params.action };
    if (params.search?.trim()) {
      const term = params.search.trim();
      where.OR = [
        { actorEmail: { contains: term, mode: "insensitive" } },
        { action: { contains: term, mode: "insensitive" } },
        { entityId: { contains: term, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // Admin aktörlerin e-postası yazım anında tutulmuyorsa actorId'den çöz.
    const adminIds = [
      ...new Set(
        items
          .filter((i) => i.actorType === "admin" && !i.actorEmail && i.actorId)
          .map((i) => i.actorId as string),
      ),
    ];
    if (adminIds.length > 0) {
      const admins = await this.prisma.platformAdmin.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, email: true },
      });
      const m = new Map(admins.map((a) => [a.id, a.email]));
      for (const it of items) {
        if (it.actorType === "admin" && !it.actorEmail && it.actorId) {
          it.actorEmail = m.get(it.actorId) ?? null;
        }
      }
    }

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
}
