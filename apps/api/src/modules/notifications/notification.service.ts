import { Injectable, Optional, Logger } from "@nestjs/common";
import { RealtimeService } from "../realtime/realtime.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";

/** In-app bildirim içeriği (e-posta ile paralel kanal). */
export interface InAppPayload {
  type: string;
  title: string;
  body: string;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  listingId?: string | null;
}

/**
 * Uygulama-içi bildirim servisi — KULLANICI bazında. Bir firmaya bildirim, o
 * firmanın tüm aktif kullanıcılarına fan-out edilir (her kullanıcının
 * `notificationPrefs` tercihi ayrı kontrol edilir; transactional tipler her
 * zaman gider). E-posta gönderimi ayrı kanaldır (EmailService) — bu servis
 * yalnız in-app kayıt tutar.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  /** Tek firmanın aktif kullanıcılarına in-app bildirim. Döner: yazılan satır. */
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
    this.realtime?.pingNotification(user.companyId);
    await this.prisma.notification.create({
      data: {
        companyUserId: user.id,
        companyId: user.companyId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        ctaUrl: payload.ctaUrl ?? null,
        ctaLabel: payload.ctaLabel ?? null,
        listingId: payload.listingId ?? null,
      },
    });
    return 1;
  }

  /**
   * Çok firmanın aktif kullanıcılarına in-app bildirim (2 sorgu, fan-out).
   * Aynı payload tüm alıcılara yazılır (ilan başına ortak metin).
   */
  async pushToCompanies(
    companyIds: string[],
    payload: InAppPayload,
  ): Promise<number> {
    const ids = [...new Set(companyIds.filter(Boolean))];
    if (ids.length === 0) return 0;
    const users = await this.prisma.companyUser.findMany({
      where: { companyId: { in: ids }, isActive: true, deletedAt: null },
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
        title: payload.title,
        body: payload.body,
        ctaUrl: payload.ctaUrl ?? null,
        ctaLabel: payload.ctaLabel ?? null,
        listingId: payload.listingId ?? null,
      }));
    if (rows.length === 0) return 0;
    await this.prisma.notification.createMany({ data: rows });
    // WS: zil anında güncellensin (bildirim yazılan her firmaya sinyal).
    for (const c of new Set(rows.map((r) => r.companyId))) {
      this.realtime?.pingNotification(c);
    }
    return rows.length;
  }

  /** Kullanıcının bildirimleri (en yeni önce). */
  listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; take?: number } = {},
  ) {
    const take = Math.min(Math.max(opts.take ?? 30, 1), 100);
    return this.prisma.notification.findMany({
      where: {
        companyUserId: userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { companyUserId: userId, readAt: null },
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

  async markAllRead(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { companyUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
