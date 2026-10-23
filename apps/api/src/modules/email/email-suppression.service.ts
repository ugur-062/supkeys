import { Injectable } from "@nestjs/common";
import { Prisma, type EmailStatus } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  INTERNAL_EMAIL_PROVIDER,
  SUPPRESSION_CLEAR_MARKER_WHERE,
  SUPPRESSION_CLEAR_TEMPLATE,
} from "./suppression-marker";

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
   * Adresi akla — append-only marker (tarih yeniden yazılmaz). Döner: marker
   * yazılan adres yazımları.
   *
   * Eşleşme (türetme ve `EmailService` gönderim kapısı) `toEmail` üzerinde
   * BİREBİR ve indeksli; EmailLog ise gönderimdeki ham adresi tutar (eski
   * `billingEmail` "Info@Firma.com" olabilir). Marker yalnız küçük harfle
   * yazılınca büyük harfli tetikleyici aklanmıyor, uç yine `{ok:true}`
   * dönüyordu (derin denetim LU-04). Bu yüzden kayıtlardaki TÜM büyük/küçük
   * harf yazımları (seyrek admin işlemi — duyarsız arama burada kabul) ve
   * girilen adresin kendisi için marker yazılır.
   */
  async clear(rawEmail: string, adminId: string): Promise<string[]> {
    const email = rawEmail.trim();
    const variants = await this.prisma.emailLog.findMany({
      where: { toEmail: { equals: email, mode: "insensitive" } },
      distinct: ["toEmail"],
      select: { toEmail: true },
    });
    const targets = [
      ...new Set([email, email.toLowerCase(), ...variants.map((v) => v.toEmail)]),
    ];
    const now = new Date();
    await this.prisma.emailLog.createMany({
      data: targets.map((toEmail) => ({
        template: SUPPRESSION_CLEAR_TEMPLATE,
        toEmail,
        subject: "suppression clear (admin)",
        provider: INTERNAL_EMAIL_PROVIDER,
        status: "SENT" as const,
        sentAt: now,
        queuedAt: now,
        contextType: "suppression_clear",
        contextId: adminId,
      })),
    });
    return targets;
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
        // Yalniz gecerli isaret (provider=internal, SENT) — ayni sablonlu
        // FAILED bir satir aklamaz (arayuz testi O-078).
        where: { ...scope, ...SUPPRESSION_CLEAR_MARKER_WHERE },
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
