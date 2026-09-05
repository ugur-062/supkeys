import { Injectable, Optional, Logger } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { RealtimeService } from "../realtime/realtime.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";
import {
  hasCompanyPermission,
  type PermissionSubject,
} from "../company-auth/permissions/company-permissions.constants";

export type NotificationPortal = "satinalma" | "satis";

/** In-app bildirim içeriği (e-posta ile paralel kanal). */
export interface InAppPayload {
  type: string;
  title: string;
  body: string;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  listingId?: string | null;
  /**
   * Bildirimin ait olduğu portal. Verilirse alıcılar o portalı GÖRÜNTÜLEME
   * izni taşıyanlarla süzülür (satış bildirimi saf satın almacıya hiç
   * yazılmaz, ve tersine). Belirtilmezse ORTAK (null) — her iki portalda
   * görünür (ör. bağlantı istekleri); kimin alacağını `audience` söyler.
   */
  portal?: NotificationPortal;
  /**
   * Yetki tablosu (2026-09-05): portal-dışı bildirimin alıcı kümesi — bu
   * izinlerden HERHANGİ BİRİNİ taşıyan aktif üyeler (kurucu örtük izinleri
   * dahil). Verilmezse ve portal da yoksa firmanın TÜM aktif üyeleri alır
   * (yalnız hesap/güvenlik sınıfı bildirimler böyle olmalı — onaylayıcı-only
   * üye pazar bildirimi almasın).
   */
  audience?: readonly string[];
}

/** Portalın görüntüleme izni — fan-out + e-posta alıcı seçimi (tek kaynak). */
export function viewPermissionForPortal(portal: NotificationPortal): string {
  return portal === "satis" ? "sell:view" : "buy:view";
}

/**
 * Bir bildirim yazımı, referans verilen alıcı satırının (companyUser) okuma ile
 * yazma arasında kaybolmasından mı düştü? In-app bildirim en-iyi-çabadır; alıcı
 * kullanıcı yarış içinde silinmişse (FK ihlali / kayıt yok) sessizce atlanır.
 * companyUserId'ler daima kendi sorgumuzdan geldiği için bu kod-hatası değil,
 * yalnız eşzamanlılık yarışıdır. (Prod'da kullanıcı soft-delete edilir → pratikte
 * olmaz; teardown/hard-delete testlerinde görülür.)
 */
function isMissingRecipientError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2003" || err.code === "P2025")
  );
}

/** Firma e-posta alıcısı — billingEmail ya da izinli ilk aktif üye. */
export interface CompanyRecipient {
  email: string;
  name: string;
  /** null = firma fatura adresi (kullanıcı tercihi uygulanmaz). */
  prefs: Record<string, boolean> | null;
}

type RecipientCandidate = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  notificationPrefs: unknown;
  permissions: string[];
  roles: string[];
};

/**
 * Firmaların e-posta alıcısını çözer (N+1 yerine 2 sorgu): `billingEmail`
 * olanlar doğrudan; olmayanlarda `preferAnyOf` izinlerinden birini taşıyan
 * en eski aktif üye, o da yoksa `fallbackAnyOf` (ör. önce gönderme izni, sonra
 * görüntüleme). İzin listesi `null` → ilk aktif üye (kısıtsız).
 */
export async function pickCompanyRecipients(
  prisma: PrismaService,
  companyIds: readonly string[],
  preferAnyOf: readonly string[] | null,
  fallbackAnyOf: readonly string[] | null = null,
): Promise<Map<string, CompanyRecipient>> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  const out = new Map<string, CompanyRecipient>();
  if (ids.length === 0) return out;
  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, billingEmail: true, ownerUserId: true },
  });
  const ownerOf = new Map(companies.map((c) => [c.id, c.ownerUserId]));
  const needUser: string[] = [];
  for (const c of companies) {
    if (c.billingEmail)
      out.set(c.id, { email: c.billingEmail, name: c.name, prefs: null });
    else needUser.push(c.id);
  }
  if (needUser.length === 0) return out;
  const users: RecipientCandidate[] = await prisma.companyUser.findMany({
    where: { companyId: { in: needUser }, isActive: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      companyId: true,
      email: true,
      firstName: true,
      lastName: true,
      notificationPrefs: true,
      permissions: true,
      roles: true,
    },
  });
  const subject = (u: RecipientCandidate): PermissionSubject => ({
    isOwner: ownerOf.get(u.companyId) === u.id,
    permissions: u.permissions,
    roles: u.roles,
  });
  const pick = (anyOf: readonly string[] | null) => {
    for (const u of users) {
      if (out.has(u.companyId)) continue;
      if (anyOf && !hasCompanyPermission(subject(u), anyOf)) continue;
      out.set(u.companyId, {
        email: u.email,
        name: `${u.firstName} ${u.lastName}`.trim(),
        prefs: u.notificationPrefs as Record<string, boolean> | null,
      });
    }
  };
  pick(preferAnyOf);
  if (fallbackAnyOf) pick(fallbackAnyOf);
  return out;
}

/**
 * Okuma tarafı süzgeci: istenen portal (+ ORTAK) ∩ kişinin GÖREBİLDİĞİ
 * portallar. Rol/izin değişince eski satırlar görünmez olur (silinmez).
 */
function portalReadFilter(
  viewer: PermissionSubject | undefined,
  portal?: NotificationPortal,
): Prisma.NotificationWhereInput {
  const allowed: NotificationPortal[] = viewer
    ? (["satinalma", "satis"] as const).filter((p) =>
        hasCompanyPermission(viewer, viewPermissionForPortal(p)),
      )
    : ["satinalma", "satis"];
  const visible = portal ? allowed.filter((p) => p === portal) : allowed;
  return { OR: [{ portal: null }, { portal: { in: visible } }] };
}

/**
 * Uygulama-içi bildirim servisi — KULLANICI bazında. Bir firmaya bildirim, o
 * firmanın YALNIZCA ilgili portalı görebilen (ya da `audience` iznini taşıyan)
 * aktif kullanıcılarına fan-out edilir. Her kullanıcının `notificationPrefs`
 * tercihi ayrı kontrol edilir; transactional tipler her zaman gider. E-posta
 * gönderimi ayrı kanaldır (EmailService).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Tek firmanın (izinli) aktif kullanıcılarına in-app bildirim. */
  async pushToCompany(companyId: string, payload: InAppPayload): Promise<number> {
    return this.pushToCompanies([companyId], payload);
  }

  /** Belirli bir kullanıcıya in-app bildirim (aktifse + tercihi açıksa). */
  async pushToUser(
    companyUserId: string,
    payload: InAppPayload,
  ): Promise<number> {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: companyUserId },
      select: {
        id: true,
        companyId: true,
        isActive: true,
        deletedAt: true,
        notificationPrefs: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) return 0;
    if (
      !isNotificationEnabled(
        user.notificationPrefs as Record<string, boolean> | null,
        payload.type,
      )
    ) {
      return 0;
    }
    try {
      await this.prisma.notification.create({
        data: {
          companyUserId: user.id,
          companyId: user.companyId,
          type: payload.type,
          portal: payload.portal ?? null,
          title: payload.title,
          body: payload.body,
          ctaUrl: payload.ctaUrl ?? null,
          ctaLabel: payload.ctaLabel ?? null,
          listingId: payload.listingId ?? null,
        },
      });
    } catch (err) {
      if (isMissingRecipientError(err)) {
        this.logger.debug(
          `In-app bildirim atlandı (alıcı kayboldu): ${payload.type}`,
        );
        return 0;
      }
      throw err;
    }
    this.realtime?.pingNotification(user.companyId);
    return 1;
  }

  /**
   * Çok firmanın aktif kullanıcılarına in-app bildirim (2 sorgu, fan-out).
   * Alıcı kümesi: `audience` verildiyse o izinlerden birini taşıyanlar; yoksa
   * `portal` verildiyse o portalı görüntüleyenler; ikisi de yoksa herkes.
   */
  async pushToCompanies(
    companyIds: string[],
    payload: InAppPayload,
  ): Promise<number> {
    const ids = [...new Set(companyIds.filter(Boolean))];
    if (ids.length === 0) return 0;
    const required: readonly string[] | null =
      payload.audience ??
      (payload.portal ? [viewPermissionForPortal(payload.portal)] : null);
    const [users, companies] = await Promise.all([
      this.prisma.companyUser.findMany({
        where: { companyId: { in: ids }, isActive: true, deletedAt: null },
        select: {
          id: true,
          companyId: true,
          notificationPrefs: true,
          permissions: true,
          roles: true,
        },
      }),
      required
        ? this.prisma.company.findMany({
            where: { id: { in: ids } },
            select: { id: true, ownerUserId: true },
          })
        : Promise.resolve([] as { id: string; ownerUserId: string | null }[]),
    ]);
    const ownerOf = new Map(companies.map((c) => [c.id, c.ownerUserId]));
    const rows = users
      .filter(
        (u) =>
          !required ||
          hasCompanyPermission(
            {
              isOwner: ownerOf.get(u.companyId) === u.id,
              permissions: u.permissions,
              roles: u.roles,
            },
            required,
          ),
      )
      .filter((u) =>
        isNotificationEnabled(
          u.notificationPrefs as Record<string, boolean> | null,
          payload.type,
        ),
      )
      .map((u) => ({
        companyUserId: u.id,
        companyId: u.companyId,
        type: payload.type,
        portal: payload.portal ?? null,
        title: payload.title,
        body: payload.body,
        ctaUrl: payload.ctaUrl ?? null,
        ctaLabel: payload.ctaLabel ?? null,
        listingId: payload.listingId ?? null,
      }));
    if (rows.length === 0) return 0;
    try {
      await this.prisma.notification.createMany({ data: rows });
    } catch (err) {
      // Alıcı satırlarından biri okuma↔yazma arasında kaybolduysa (FK ihlali)
      // toplu insert atomik olduğundan tümü düşer — en-iyi-çaba: sessizce atla.
      if (isMissingRecipientError(err)) {
        this.logger.debug(
          `In-app bildirim atlandı (alıcı kayboldu): ${payload.type}`,
        );
        return 0;
      }
      throw err;
    }
    // WS: zil anında güncellensin (bildirim yazılan her firmaya sinyal).
    for (const c of new Set(rows.map((r) => r.companyId))) {
      this.realtime?.pingNotification(c);
    }
    return rows.length;
  }

  /**
   * Kullanıcının bildirimleri (görebildiği portallar + ortak; en yeni önce).
   * `viewer` verilirse portal süzgeci kişinin GÜNCEL izinleriyle kesişir.
   */
  listForUser(
    userId: string,
    opts: {
      unreadOnly?: boolean;
      take?: number;
      portal?: NotificationPortal;
      /** Bu satırdan ESKİsini getir (sayfalama imleci). */
      before?: { createdAt: Date; id: string };
    } = {},
    viewer?: PermissionSubject,
  ) {
    const take = Math.min(Math.max(opts.take ?? 30, 1), 100);
    // Dalga B (P7): `before` imleci eklendi. Eskiden yalnız son 30 satır
    // dönüyordu ve daha eskisine ULAŞACAK hiçbir yüzey yoktu — bildirim
    // kalıcı bir kayıt olmasına rağmen 31. satırdan itibaren erişilemezdi.
    // İmleç (createdAt, id) çiftinden ilerler: eşit damgalarda id ile kırılır,
    // yoksa aynı satır iki sayfada görünür ya da hiç görünmez.
    return this.prisma.notification.findMany({
      where: {
        companyUserId: userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
        ...portalReadFilter(viewer, opts.portal),
        ...(opts.before
          ? {
              OR: [
                { createdAt: { lt: opts.before.createdAt } },
                {
                  createdAt: opts.before.createdAt,
                  id: { lt: opts.before.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
  }

  async unreadCount(
    userId: string,
    portal?: NotificationPortal,
    viewer?: PermissionSubject,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        companyUserId: userId,
        readAt: null,
        ...portalReadFilter(viewer, portal),
      },
    });
  }

  /** Verilen (ve kullanıcıya ait) bildirimleri okundu işaretle. */
  async markRead(userId: string, ids: string[]): Promise<number> {
    const clean = [...new Set((ids ?? []).filter(Boolean))];
    if (clean.length === 0) return 0;
    const res = await this.prisma.notification.updateMany({
      where: { companyUserId: userId, id: { in: clean }, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  /** Tümünü okundu — portal verilirse yalnız o portal (+ ortak) kapsamında. */
  async markAllRead(
    userId: string,
    portal?: NotificationPortal,
    viewer?: PermissionSubject,
  ): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: {
        companyUserId: userId,
        readAt: null,
        ...portalReadFilter(viewer, portal),
      },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
