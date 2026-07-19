import { Injectable } from "@nestjs/common";
import { Prisma, type EmailStatus } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface SuppressionInfo {
  email: string;
  /** "BOUNCED" (hard) | "COMPLAINED" */
  status: EmailStatus;
  reason: string | null;
  at: Date;
}

/**
 * E-posta suppression türetmesi — TEK KAYNAK. Suppression ayrı model değil,
 * `EmailLog`'dan türetilir. İki tüketici: admin global liste (listSuppressions)
 * + admin firma detayı (bounce rozeti). Türetme iki yerde kalmasın diye burada.
 */
@Injectable()
export class EmailSuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verilen adreslerin suppression durumu (firma detayı için). Suppress OLMAYAN
   * adres dönen Map'te YER ALMAZ. Boş liste → boş Map (DB'ye gitmez).
   */
  async getSuppressionStatus(
    emails: string[],
  ): Promise<Map<string, SuppressionInfo>> {
    const unique = [...new Set(emails.filter((e) => !!e))];
    if (unique.length === 0) return new Map();
    return this.derive({ toEmail: { in: unique } });
  }

  /** Global suppress edilmiş adres listesi (admin sistem paneli). */
  async listSuppressed(limit = 500): Promise<SuppressionInfo[]> {
    const map = await this.derive({}, limit);
    return [...map.values()];
  }

  /**
   * Ortak türetme. Adres suppressed = son `suppression_clear` marker'ından SONRA
   * `COMPLAINED` veya `BOUNCED+bounceType=hard` kaydı var. Soft/undetermined
   * bounce GEÇİCİ → suppress etmez.
   *
   * MARKER SIRASI KRİTİK: yalnız EN SON clear-marker'dan sonraki tetikleyiciler
   * sayılır (öncekiler aklanmış). Yanlış sıralama sessiz yanlış sonuç verir →
   * marker'lar queuedAt desc, adres başına ilk (en yeni) alınır; tetikleyiciler
   * de desc, adres başına ilk (en yeni) geçerli tetikleyici.
   */
  private async derive(
    scope: Prisma.EmailLogWhereInput,
    limit?: number,
  ): Promise<Map<string, SuppressionInfo>> {
    const [triggers, markers] = await Promise.all([
      this.prisma.emailLog.findMany({
        where: {
          ...scope,
          OR: [
            { status: "COMPLAINED" },
            { status: "BOUNCED", bounceType: "hard" },
          ],
        },
        select: {
          toEmail: true,
          status: true,
          bounceReason: true,
          queuedAt: true,
        },
        orderBy: { queuedAt: "desc" },
        ...(limit ? { take: limit } : {}),
      }),
      this.prisma.emailLog.findMany({
        where: { ...scope, template: "suppression_clear" },
        select: { toEmail: true, queuedAt: true },
        orderBy: { queuedAt: "desc" },
      }),
    ]);

    // Adres başına EN SON clear-marker (markers desc → ilk görülen en yeni).
    const lastClear = new Map<string, Date>();
    for (const m of markers) {
      if (!lastClear.has(m.toEmail)) lastClear.set(m.toEmail, m.queuedAt);
    }

    // triggers desc → adres başına ilk geçerli (marker'dan yeni) tetikleyici.
    const result = new Map<string, SuppressionInfo>();
    for (const t of triggers) {
      if (result.has(t.toEmail)) continue;
      const cleared = lastClear.get(t.toEmail);
      if (cleared && t.queuedAt <= cleared) continue; // marker sonrası → aklanmış
      result.set(t.toEmail, {
        email: t.toEmail,
        status: t.status,
        reason: t.bounceReason,
        at: t.queuedAt,
      });
    }
    return result;
  }
}
