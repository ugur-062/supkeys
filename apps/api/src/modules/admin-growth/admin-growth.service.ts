import { Injectable } from "@nestjs/common";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { ExternalInviteDispatcher, INVITE_CONTEXT } from "../company-connections/services/external-invite-dispatcher.service";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * BÜYÜME ÖLÇÜMÜ (2026-09-27, Faz 4) — yönetici ekranı: kayıtsız adreslere
 * davet hunisi (davet → e-posta → teslim → tıklama → kayıt → teklif), iptal
 * nedenleri, kaynak/ülke/dil kırılımı, soğuk davet alan adı sağlığı (tavan,
 * şikâyet/geri dönme oranı), AI keşif turları ve günlük e-posta programı.
 * Salt okur; kişisel veri döndürmez (yalnız sayılar).
 */
@Injectable()
export class AdminGrowthService {
  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly dispatcher: ExternalInviteDispatcher,
  ) {}

  async inviteReport(days: number, now: Date = new Date()) {
    const since = new Date(now.getTime() - Math.min(Math.max(days, 1), 365) * DAY_MS);
    const week = new Date(now.getTime() - 7 * DAY_MS);
    const inviteWhere = { createdAt: { gte: since } };

    const [
      invited,
      emailed,
      cancelled,
      bySource,
      byCountry,
      byLocale,
      emails,
      delivered,
      clicked,
      accepted,
      complaints7d,
      bounces7d,
      sent7d,
      runs,
      candidates,
      programs,
      emailOptOuts,
      referralOptOuts,
      cap,
    ] = await Promise.all([
      this.prisma.externalListingInvite.count({ where: inviteWhere }),
      this.prisma.externalListingInvite.count({ where: { ...inviteWhere, state: "SENT" } }),
      this.prisma.externalListingInvite.groupBy({
        by: ["cancelReason"],
        where: { ...inviteWhere, state: "CANCELLED" },
        _count: { _all: true },
      }),
      this.prisma.externalListingInvite.groupBy({ by: ["source"], where: inviteWhere, _count: { _all: true } }),
      this.prisma.externalListingInvite.groupBy({ by: ["country"], where: inviteWhere, _count: { _all: true } }),
      this.prisma.externalListingInvite.groupBy({ by: ["locale"], where: inviteWhere, _count: { _all: true } }),
      this.prisma.emailLog.count({ where: { contextType: INVITE_CONTEXT, status: { not: "FAILED" }, queuedAt: { gte: since } } }),
      this.prisma.emailLog.count({ where: { contextType: INVITE_CONTEXT, deliveredAt: { not: null }, queuedAt: { gte: since } } }),
      this.prisma.companyReferralInvite.count({
        where: { lastClickedAt: { gte: since }, listingInvites: { some: {} } },
      }),
      this.prisma.companyReferralInvite.findMany({
        where: { status: "ACCEPTED", acceptedAt: { gte: since }, listingInvites: { some: {} } },
        select: { acceptedCompanyId: true, listingInvites: { select: { listingId: true } } },
      }),
      this.prisma.emailLog.count({ where: { contextType: INVITE_CONTEXT, complainedAt: { gte: week } } }),
      this.prisma.emailLog.count({ where: { contextType: INVITE_CONTEXT, bounceType: "hard", bouncedAt: { gte: week } } }),
      this.prisma.emailLog.count({ where: { contextType: INVITE_CONTEXT, status: { not: "FAILED" }, queuedAt: { gte: week } } }),
      this.prisma.supplierDiscoveryRun.groupBy({
        by: ["state"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { costUsd: true },
      }),
      this.prisma.supplierDiscoveryCandidate.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.emailLog.groupBy({
        by: ["contextType"],
        where: {
          queuedAt: { gte: since },
          status: { not: "FAILED" },
          OR: [
            { contextType: { startsWith: "lifecycle_" } },
            { contextType: { in: ["listing_category_digest", "listing_zero_bid", "ai_supplier_suggestions"] } },
          ],
        },
        _count: { _all: true },
      }),
      this.prisma.emailOptOut.count({ where: { createdAt: { gte: since } } }),
      this.prisma.referralOptOut.count({ where: { createdAt: { gte: since } } }),
      this.dispatcher.capStatus(now),
    ]);

    // Teklif veren: davetle kayıt olmuş firmanın, davet edildiği taleplerden
    // birine gönderilmiş (taslak olmayan) teklifi. FİRMA başına sayılır (derin
    // denetim LU-04): aynı adrese birden çok alıcı davet gönderdiyse kabulde
    // hepsi aynı firmaya bağlanır — davet başına sayım `quoted > signedUp`
    // üretiyordu. Firmanın tüm davet talepleri birleştirilip tek sorgu atılır.
    const listingsByCompany = new Map<string, Set<string>>();
    for (const a of accepted) {
      if (!a.acceptedCompanyId) continue;
      const set = listingsByCompany.get(a.acceptedCompanyId) ?? new Set<string>();
      for (const l of a.listingInvites) set.add(l.listingId);
      listingsByCompany.set(a.acceptedCompanyId, set);
    }
    const quotedFlags = await Promise.all(
      [...listingsByCompany].map(async ([companyId, listingIds]) => {
        const n = await this.prisma.listingBid.count({
          where: {
            bidderCompanyId: companyId,
            listingId: { in: [...listingIds] },
            status: { not: "DRAFT" },
          },
        });
        return n > 0;
      }),
    );
    const signedUp = listingsByCompany.size;
    const quoted = quotedFlags.filter(Boolean).length;
    const rate = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 10_000) / 100 : 0);

    return {
      period: { from: since.toISOString(), to: now.toISOString() },
      funnel: { invited, emailed, emails, delivered, clicked, signedUp, quoted },
      cancelled: Object.fromEntries(cancelled.map((c) => [c.cancelReason ?? "OTHER", c._count._all])),
      bySource: Object.fromEntries(bySource.map((c) => [c.source, c._count._all])),
      byCountry: byCountry
        // Ulkesi bilinmeyen davet `null` doner; arayuz "Bilinmiyor" yazar
        // (eskiden ham "??" basiliyordu — arayuz testi D-227).
        .map((c) => ({ country: c.country ?? null, invited: c._count._all }))
        .sort((a, b) => b.invited - a.invited)
        .slice(0, 20),
      byLocale: byLocale.map((c) => ({ locale: c.locale, invited: c._count._all })).sort((a, b) => b.invited - a.invited),
      health: {
        cap: cap.cap,
        braked: cap.braked,
        sentToday: cap.sentToday,
        sent7d,
        complaints7d,
        hardBounces7d: bounces7d,
        complaintRatePct: rate(complaints7d, sent7d),
        bounceRatePct: rate(bounces7d, sent7d),
      },
      discovery: {
        runs: Object.fromEntries(runs.map((r) => [r.state, r._count._all])),
        costUsd: Math.round(runs.reduce((s, r) => s + Number(r._sum.costUsd ?? 0), 0) * 100) / 100,
        candidates: Object.fromEntries(candidates.map((c) => [c.status, c._count._all])),
      },
      programs: Object.fromEntries(programs.map((p) => [p.contextType ?? "other", p._count._all])),
      optOuts: { email: emailOptOuts, invite: referralOptOuts },
    };
  }
}
