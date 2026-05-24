import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";

export type AuditActorType = "tenant" | "admin" | "supplier" | "system";

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
      this.logger.error(
        `audit log yazılamadı (${entry.action}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
