import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { reportToSentry } from "../../instrument";

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
 * Firma aktivite logu modul filtresi -> action onekleri (derin denetim S017).
 * Eskiden tek onek `company.<modul>.` idi; alt-tur eylemleri
 * (`company.approval_flow.*`, `company.listing_document.*`,
 * `company.bid_document.*`, `company.ownership.*`, `company.signup`,
 * `company.profile_enriched`) "Tumu"nde gorunup modul filtresinde kayboluyordu.
 * Listede olmayan modul varsayilan `company.<modul>.` onekini kullanir.
 */
const TENANT_ACTIVITY_MODULE_PREFIXES: Record<string, string[]> = {
  listing: ["company.listing.", "company.listing_document."],
  bid: ["company.bid.", "company.bid_document."],
  approval: ["company.approval.", "company.approval_flow."],
  user: ["company.user.", "company.ownership."],
  // `company.profile_enrich` = the three AI description suggestion actions
  // (`_attempt`, `_settled`, `company.profile_enriched`). Only the last one
  // was listed here, so the attempt rows showed under "All" and vanished
  // under the profile filter (same class as S017; live re-check PD-R5).
  profile: ["company.profile.", "company.profile_enrich"],
  signup: ["company.signup"],
};

/**
 * THE COMPANY'S OWN PROFILE RECORDS in the admin company "Denetim" tab (live
 * re-check 2026-10-09, PD-R5). The tab searches the audit log by company id.
 * A company-actor row matched only through `entityId`, so "company profile
 * updated" (written with the company as its entity) was listed while the AI
 * description suggestion rows of the same minutes were not: they carry the
 * company only in `tenantId` (`company.profile_enrich_attempt` and
 * `company.profile_enriched` have no entity, `company.profile_enrich_settled`
 * points at the attempt row). They are records about the company itself, like
 * the profile update, so the tab lists them too.
 *
 * Deliberately narrow: only this action family. The rest of the company's own
 * activity (requests, quotes, users...) still stays out of the tab - it would
 * drown the admin interventions the tab is for.
 */
export const COMPANY_PROFILE_ACTION_PREFIX = "company.profile";

/**
 * V2-7+ — Güvenlik denetim izi (OWASP A09). Append-only.
 * `log()` ASLA throw etmez — denetim yazımı başarısız olsa bile ana iş akışı
 * (login, kazandırma vb.) bozulmaz; sadece sunucu loguna hata düşer.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `PlatformAdmin.id` → e-posta. Audit yazımını ASLA bozmaz: hata/bulunamama
   * durumunda null döner (log() zaten fail-safe).
   */
  private async resolveAdminEmail(adminId: string): Promise<string | null> {
    try {
      const admin = await this.prisma.platformAdmin.findUnique({
        where: { id: adminId },
        select: { email: true },
      });
      return admin?.email ?? null;
    } catch {
      return null;
    }
  }

  /** `CompanyUser.id` → e-posta; aynı fail-safe sözleşme. */
  private async resolveCompanyUserEmail(userId: string): Promise<string | null> {
    try {
      const user = await this.prisma.companyUser.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email ?? null;
    } catch {
      return null;
    }
  }

  async log(entry: AuditEntry): Promise<void> {
    try {
      // Dalga B (denetim 2026-08-26 Parça 9): admin aksiyonlarının izi yalnız
      // `actorId`'ye bağlıydı — personel kaydı silinince/id değişince geçmiş
      // kararların sahibi geriye dönük olarak isimsizleşiyordu. Çağıranların
      // 17 ayrı noktada e-posta taşımasını beklemek yerine burada TEK yerde
      // çözülür (çağıran açıkça verirse ona dokunulmaz).
      // Firma aktörü de aynı: e-postasız yazan noktalar (VIES sorgusu,
      // onay akışıyla kazandırma, paket yükseltme) admin Denetim Kaydı'nda ham
      // kullanıcı kimliği gösteriyordu (arayüz testi webC-14, yeniden doğrulama).
      const actorEmail =
        entry.actorEmail ??
        (entry.actorType === "admin" && entry.actorId
          ? await this.resolveAdminEmail(entry.actorId)
          : entry.actorType === "company" && entry.actorId
            ? await this.resolveCompanyUserEmail(entry.actorId)
            : null);
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          actorEmail,
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
        // Log stdout'ta kalır; kritik audit kaybı alarm üretmeli → Sentry'e de
        // bildir. PII GÖNDERME: actorEmail/metadata/ip/userAgent hariç, yalnız
        // kimlik/eylem context'i. DSN yoksa reportToSentry sessiz no-op.
        reportToSentry("[AUDIT-KRİTİK-KAYIP]", "error", {
          tags: { audit: "critical-loss", action: entry.action },
          extra: {
            actorId: entry.actorId ?? null,
            entityType: entry.entityType ?? null,
            entityId: entry.entityId ?? null,
            reason,
          },
        });
      } else {
        this.logger.error(`audit log yazılamadı (${entry.action}): ${reason}`);
      }
    }
  }

  /**
   * Faz O — FİRMA-yüzü aktivite logu: yalnız kendi tenant'ının `company.*`
   * eylem kayıtları, SANITIZE edilmiş projeksiyon (ip/userAgent/actorType/
   * tenantId YANITTA YOK — teknik log değil eylem kaydı; metadata zaten değer
   * değil eylem-özeti taşır: maskeli IBAN referansı, changedFields adları,
   * rol before/after). Denial kayıtları DAHİL (K+Y güvenlik gözetimi).
   * Admin `query()` DEĞİŞMEDİ — bu ayrı, daha dar bir pencere.
   */
  async queryForTenant(
    tenantId: string,
    params: { page?: number; pageSize?: number; module?: string } = {},
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 50));
    const prefixes = params.module
      ? (TENANT_ACTIVITY_MODULE_PREFIXES[params.module] ?? [`company.${params.module}.`])
      : ["company."];
    const where = {
      tenantId,
      OR: prefixes.map((p) => ({ action: { startsWith: p } })),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        // P12: tek alanlı sıralama eşit damgalarda sayfalar arası kayma
        // üretir (aynı satır iki sayfada / hiç görünmez) → id ile tie-break.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          actorEmail: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);
    // Hedef kişi: kullanıcı yönetimi kayıtları (rol/izin/aktiflik) yalnız
    // `entityId` taşır; Detay'da "kimin" değiştiği görünmüyordu (arayüz testi
    // api2-01 yeniden doğrulama). Yalnız AYNI firmanın kullanıcıları çözülür —
    // başka tenant'ın kişisi ad olarak sızmaz; silinmiş kişi null kalır.
    const userIds = [
      ...new Set(
        rows
          .filter((r) => r.entityType === "company_user" && r.entityId)
          .map((r) => r.entityId as string),
      ),
    ];
    const people = userIds.length
      ? await this.prisma.companyUser.findMany({
          where: { id: { in: userIds }, companyId: tenantId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const labelById = new Map(
      people.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]),
    );
    // Davet kayıtları (invited / invitation_cancelled) hedefi davet edilen
    // ADRESTİR: e-posta (PII) audit metadata'sına yazılmaz, okuma anında yine
    // AYNI firmanın davet satırından çözülür — Kullanıcı Yönetimi bu adresleri
    // aynı kişilere zaten gösteriyor. "Üye daveti iptal edildi" satırının Detay
    // hücresi boş kalıyordu (arayüz testi kalanlar api-2); davet satırı iptalde
    // silinmediği için eski (metadata'sız) kayıtlar da adresini kazanır.
    const invitationIds = [
      ...new Set(
        rows
          .filter((r) => r.entityType === "company_user_invitation" && r.entityId)
          .map((r) => r.entityId as string),
      ),
    ];
    const invitations = invitationIds.length
      ? await this.prisma.companyUserInvitation.findMany({
          where: { id: { in: invitationIds }, companyId: tenantId },
          select: { id: true, email: true },
        })
      : [];
    const inviteEmailById = new Map(invitations.map((i) => [i.id, i.email]));
    const entityLabelOf = (r: (typeof rows)[number]): string | null => {
      if (!r.entityId) return null;
      if (r.entityType === "company_user") return labelById.get(r.entityId) ?? null;
      if (r.entityType === "company_user_invitation")
        return inviteEmailById.get(r.entityId) ?? null;
      return null;
    };
    return {
      // JsonValue tip-referansı dışa sızmasın (TS2742) — metadata unknown.
      items: rows.map((r) => ({
        ...r,
        metadata: r.metadata as unknown,
        entityLabel: entityLabelOf(r),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
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
        // Firma detayı Denetim sekmesi firma id'siyle arar: firmaya bağlı
        // varlıklara (kullanıcı, ilan, ürün) yapılan ADMIN işlemleri
        // `tenantId`=firma ile yazılır (arayüz testi D-205). Yalnız admin
        // aktörü — firmanın kendi etkinliği bu görünümü boğmasın.
        { tenantId: term, actorType: "admin" },
        // ...and the company's own PROFILE records (profile update, AI
        // description suggestion): see `COMPANY_PROFILE_ACTION_PREFIX`.
        { tenantId: term, action: { startsWith: COMPANY_PROFILE_ACTION_PREFIX } },
        // Iki firmali admin mudahalesi (siparis iptali, baglanti daveti):
        // ikinci taraf `metadata.counterpartyCompanyId` ile yazilir — o
        // firmanin sekmesinde de gorunur (arayuz testi api2-02 yeniden
        // dogrulama).
        {
          actorType: "admin",
          metadata: { path: ["counterpartyCompanyId"], equals: term },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        // P12: tek alanlı sıralama eşit damgalarda sayfalar arası kayma
        // üretir (aynı satır iki sayfada / hiç görünmez) → id ile tie-break.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
