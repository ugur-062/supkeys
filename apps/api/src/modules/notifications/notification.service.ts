import { Injectable, Optional, Logger } from "@nestjs/common";
import { CompanyRole, Prisma } from "@rothern/db";
import { RealtimeService } from "../realtime/realtime.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";

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
   * Bildirimin ait olduğu portal. Belirtilmezse ORTAK (null) — her iki portalda
   * görünür (ör. bağlantı istekleri). Portal verilirse yalnız o portala erişimi
   * olan roldeki kullanıcılara oluşturulur: satış bildirimi saf satın almacıya
   * hiç yazılmaz (ve tersine).
   */
  portal?: NotificationPortal;
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

/** Portala erişim veren roller — fan-out + e-posta alıcı filtresi (paylaşılan). */
export function rolesForPortal(portal: NotificationPortal): CompanyRole[] {
  return portal === "satis"
    ? [CompanyRole.SATISCI, CompanyRole.YONETICI]
    : [CompanyRole.SATIN_ALMACI, CompanyRole.YONETICI];
}

/** Okuma tarafı: aktif portal + ORTAK (null) bildirimler. */
function portalReadFilter(
  portal?: NotificationPortal,
): Prisma.NotificationWhereInput {
  if (!portal) return {}; // portal verilmezse hepsi (geriye uyum)
  return { OR: [{ portal }, { portal: null }] };
}

/**
 * Uygulama-içi bildirim servisi — KULLANICI bazında. Bir firmaya bildirim, o
 * firmanın YALNIZCA ilgili portala erişimi olan aktif kullanıcılarına fan-out
 * edilir (satış/satınalma ayrımı). Her kullanıcının `notificationPrefs` tercihi
 * ayrı kontrol edilir; transactional tipler her zaman gider. E-posta gönderimi
 * ayrı kanaldır (EmailService).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Tek firmanın (portala erişimli) aktif kullanıcılarına in-app bildirim. */
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
   * Çok firmanın (portala erişimli) aktif kullanıcılarına in-app bildirim
   * (2 sorgu, fan-out). Portal verilmişse alıcı rolleri o portala göre süzülür.
   */
  async pushToCompanies(
    companyIds: string[],
    payload: InAppPayload,
  ): Promise<number> {
    const ids = [...new Set(companyIds.filter(Boolean))];
    if (ids.length === 0) return 0;
    const users = await this.prisma.companyUser.findMany({
      where: {
        companyId: { in: ids },
        isActive: true,
        deletedAt: null,
        // Portal verildiyse yalnız o portala erişimi olan roldeki kullanıcılar.
        ...(payload.portal
          ? { roles: { hasSome: rolesForPortal(payload.portal) } }
          : {}),
      },
      select: { id: true, companyId: true, notificationPrefs: true },
    });
    const rows = users
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

  /** Kullanıcının bildirimleri (aktif portal + ortak; en yeni önce). */
  listForUser(
    userId: string,
    opts: {
      unreadOnly?: boolean;
      take?: number;
      portal?: NotificationPortal;
    } = {},
  ) {
    const take = Math.min(Math.max(opts.take ?? 30, 1), 100);
    return this.prisma.notification.findMany({
      where: {
        companyUserId: userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
        ...portalReadFilter(opts.portal),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async unreadCount(
    userId: string,
    portal?: NotificationPortal,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        companyUserId: userId,
        readAt: null,
        ...portalReadFilter(portal),
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
  ): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: {
        companyUserId: userId,
        readAt: null,
        ...portalReadFilter(portal),
      },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
