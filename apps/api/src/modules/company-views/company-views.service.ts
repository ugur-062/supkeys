import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { tierAtLeast } from "@rothern/shared";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/**
 * ZİYARET EDENLER + İŞ ANALİZİ (2026-09-05, Europages "Your Visitors" /
 * "Business Insights" kalıbı, kullanıcı kararı).
 *
 * Kayıt iki yüzeyden gelir:
 *  · PANEL — giriş yapmış üye başkasının profilini/ürününü açtı: kimlikli.
 *    Ziyaretçi "ziyaretlerim görünmesin" dediyse anonimleştirilir (sayı
 *    doğru kalır, kimlik yazılmaz).
 *  · PUBLIC — herkese açık sayfa beacon'ı: anonim (ip+ua+gün hash). IP'den
 *    firma TAHMİNİ YAPILMAZ (KVKK; Europages "Website Leads" bilinçli kapsam
 *    dışı). Bot ajanları sayılmaz.
 * Tekilleştirme: aynı ziyaretçi, aynı gün, aynı sayfa → tek satır
 * (`dedupeKey` + unique; `createMany skipDuplicates` yarışa dayanıklı).
 * Kendi görüntülemesi kaydedilmez. 180 gün sonra silinir (cron).
 * Kayıt asla isteği düşürmez: hata loglanır, okuma devam eder.
 */
const BOT_UA =
  /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests|axios|node-fetch|httpclient|pingdom|uptime|monitor/i;
export const VIEW_RETENTION_DAYS = 180;
const VISITORS_PAGE_SIZE = 20;
const SCAN_CAP = 5000;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const hash = (s: string) =>
  createHash("sha256")
    .update(`${process.env.VIEW_HASH_SALT ?? process.env.JWT_SECRET ?? "rothern"}|${s}`)
    .digest("hex")
    .slice(0, 24);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export interface VisitorItem {
  company: {
    id: string;
    rothernId: string | null;
    name: string;
    slug: string | null;
    city: string | null;
    activities: string[];
    verified: boolean;
    logoUrl: string | null;
  };
  visits: number;
  lastViewedAt: string;
  profileViews: number;
  products: { id: string; name: string; slug: string | null }[];
  connected: boolean;
}

@Injectable()
export class CompanyViewsService {
  private readonly logger = new Logger(CompanyViewsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /** Panel: üye başkasının profilini/ürününü açtı. Fire-and-forget çağrılır. */
  async recordPanelView(
    viewer: { companyId: string; id?: string },
    target: { companyId: string; productId?: string | null },
  ): Promise<void> {
    if (!viewer.companyId || viewer.companyId === target.companyId) return;
    try {
      const v = await this.prisma.company.findUnique({
        where: { id: viewer.companyId },
        select: { visitsVisible: true },
      });
      const visible = v?.visitsVisible !== false;
      const day = dayKey(new Date());
      const subject = target.productId ?? "profile";
      await this.prisma.companyView.createMany({
        data: [
          {
            targetCompanyId: target.companyId,
            viewerCompanyId: visible ? viewer.companyId : null,
            viewerUserId: visible ? (viewer.id ?? null) : null,
            productId: target.productId ?? null,
            surface: "PANEL",
            dedupeKey: `${visible ? `c:${viewer.companyId}` : `o:${hash(viewer.companyId)}`}:${subject}:${day}`,
          },
        ],
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.warn(`Görüntülenme kaydı atlandı: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Herkese açık sayfa beacon'ı — anonim, günlük tekil (ip + ua + gün). */
  async recordPublicView(input: {
    type: "profile" | "product";
    companySlug: string;
    productSlug?: string | null;
    ip: string;
    userAgent: string;
  }): Promise<{ recorded: boolean }> {
    if (!input.userAgent || BOT_UA.test(input.userAgent)) return { recorded: false };
    const company = await this.prisma.company.findUnique({
      where: { slug: input.companySlug },
      select: { id: true, publicEnabled: true, isActive: true, isBlocked: true },
    });
    if (!company || !company.publicEnabled || !company.isActive || company.isBlocked) return { recorded: false };
    let productId: string | null = null;
    if (input.type === "product") {
      if (!input.productSlug) return { recorded: false };
      const p = await this.prisma.companyItem.findFirst({
        where: { companyId: company.id, slug: input.productSlug, isPublic: true },
        select: { id: true },
      });
      if (!p) return { recorded: false };
      productId = p.id;
    }
    const day = dayKey(new Date());
    const anon = hash(`${input.ip}|${input.userAgent}|${day}`);
    const res = await this.prisma.companyView.createMany({
      data: [
        {
          targetCompanyId: company.id,
          productId,
          surface: "PUBLIC",
          dedupeKey: `a:${anon}:${productId ?? "profile"}:${day}`,
        },
      ],
      skipDuplicates: true,
    });
    return { recorded: res.count > 0 };
  }

  /**
   * Ziyaret Edenler. Sayılar herkese; KİMLİKLİ liste Bronz+ (Europages'te
   * ödemeli). Standart pakette `locked` + kaç firma olduğu döner (satır yok).
   */
  async visitors(user: AuthenticatedCompanyUser, opts: { days?: number; page?: number } = {}) {
    const days = clampDays(opts.days);
    const page = Math.max(1, opts.page ?? 1);
    const since = daysAgo(days);
    const rows = await this.prisma.companyView.findMany({
      where: { targetCompanyId: user.companyId, viewedAt: { gte: since } },
      select: { viewerCompanyId: true, productId: true, viewedAt: true },
      orderBy: { viewedAt: "desc" },
      take: SCAN_CAP,
    });
    const total = rows.length;
    const profileViews = rows.filter((r) => !r.productId).length;
    type G = { visits: number; last: Date; profileViews: number; productIds: Set<string> };
    const groups = new Map<string, G>();
    for (const r of rows) {
      if (!r.viewerCompanyId) continue;
      const g = groups.get(r.viewerCompanyId) ?? { visits: 0, last: r.viewedAt, profileViews: 0, productIds: new Set<string>() };
      g.visits += 1;
      if (r.viewedAt > g.last) g.last = r.viewedAt;
      if (r.productId) g.productIds.add(r.productId);
      else g.profileViews += 1;
      groups.set(r.viewerCompanyId, g);
    }
    const identified = groups.size;
    const anonymous = rows.filter((r) => !r.viewerCompanyId).length;
    const locked = !tierAtLeast(user.tier, "BRONZ");
    const base = { days, total, profileViews, productViews: total - profileViews, identified, anonymous, locked, page, pageSize: VISITORS_PAGE_SIZE };
    if (locked || identified === 0) return { ...base, totalItems: identified, items: [] as VisitorItem[] };

    const ordered = [...groups.entries()].sort((a, b) => b[1].last.getTime() - a[1].last.getTime());
    const slice = ordered.slice((page - 1) * VISITORS_PAGE_SIZE, page * VISITORS_PAGE_SIZE);
    const ids = slice.map(([id]) => id);
    const productIds = [...new Set(slice.flatMap(([, g]) => [...g.productIds]))];
    const [companies, products, conns] = await Promise.all([
      this.prisma.company.findMany({
        where: { id: { in: ids } },
        select: { id: true, rothernId: true, name: true, slug: true, city: true, activities: true, companyVerificationStatus: true, logoUrl: true },
      }),
      productIds.length
        ? this.prisma.companyItem.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, slug: true } })
        : Promise.resolve([]),
      this.prisma.companyConnection.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { inviterCompanyId: user.companyId, inviteeCompanyId: { in: ids } },
            { inviteeCompanyId: user.companyId, inviterCompanyId: { in: ids } },
          ],
        },
        select: { inviterCompanyId: true, inviteeCompanyId: true },
      }),
    ]);
    const byId = new Map(companies.map((c) => [c.id, c] as const));
    const productById = new Map(products.map((p) => [p.id, p] as const));
    const connected = new Set(conns.map((c) => (c.inviterCompanyId === user.companyId ? c.inviteeCompanyId : c.inviterCompanyId)));
    const items: VisitorItem[] = slice.flatMap(([id, g]) => {
      const c = byId.get(id);
      if (!c) return [];
      return [
        {
          company: {
            id: c.id,
            rothernId: c.rothernId,
            name: c.name,
            slug: c.slug,
            city: c.city,
            activities: c.activities as string[],
            verified: c.companyVerificationStatus === "VERIFIED",
            logoUrl: c.logoUrl,
          },
          visits: g.visits,
          lastViewedAt: g.last.toISOString(),
          profileViews: g.profileViews,
          products: [...g.productIds].map((pid) => productById.get(pid)).filter((p): p is NonNullable<typeof p> => !!p).slice(0, 5),
          connected: connected.has(id),
        },
      ];
    });
    return { ...base, totalItems: identified, items };
  }

  /** İş Analizi — Silver+ (Raporlar kapısıyla aynı). Dönem ve önceki dönem karşılaştırmalı. */
  async insights(user: AuthenticatedCompanyUser, opts: { days?: number } = {}) {
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw new ForbiddenException("İş Analizi Silver ve üzeri paketlerde.");
    }
    const days = clampDays(opts.days);
    const now = new Date();
    const since = daysAgo(days);
    const prevSince = daysAgo(days * 2);
    const me = user.companyId;
    const cnt = (where: object) => this.prisma.companyView.count({ where });
    const [profileCur, profilePrev, productCur, productPrev, identCur, identPrev, topRaw, inquiries, conns, invites, bids] =
      await Promise.all([
        cnt({ targetCompanyId: me, productId: null, viewedAt: { gte: since } }),
        cnt({ targetCompanyId: me, productId: null, viewedAt: { gte: prevSince, lt: since } }),
        cnt({ targetCompanyId: me, productId: { not: null }, viewedAt: { gte: since } }),
        cnt({ targetCompanyId: me, productId: { not: null }, viewedAt: { gte: prevSince, lt: since } }),
        this.prisma.companyView.findMany({
          where: { targetCompanyId: me, viewerCompanyId: { not: null }, viewedAt: { gte: since } },
          select: { viewerCompanyId: true },
          distinct: ["viewerCompanyId"],
        }),
        this.prisma.companyView.findMany({
          where: { targetCompanyId: me, viewerCompanyId: { not: null }, viewedAt: { gte: prevSince, lt: since } },
          select: { viewerCompanyId: true },
          distinct: ["viewerCompanyId"],
        }),
        this.prisma.companyView.groupBy({
          by: ["productId"],
          where: { targetCompanyId: me, productId: { not: null }, viewedAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { productId: "desc" } },
          take: 5,
        }),
        this.prisma.publicInquiry.findMany({
          where: { companyId: me, createdAt: { gte: since }, OR: [{ verifiedAt: { not: null } }, { claimedCompanyId: { not: null } }] },
          select: { createdAt: true, replies: { select: { createdAt: true }, orderBy: { createdAt: "asc" }, take: 1 } },
        }),
        this.prisma.companyConnection.findMany({
          where: { inviteeCompanyId: me, createdAt: { gte: since } },
          select: { status: true },
        }),
        this.prisma.listingInvitation.count({ where: { invitedCompanyId: me, createdAt: { gte: since } } }),
        this.prisma.listingBid.findMany({
          where: { bidderCompanyId: me, submittedAt: { gte: since } },
          select: { status: true },
        }),
      ]);
    const productIds = topRaw.map((t) => t.productId).filter((x): x is string => !!x);
    const products = productIds.length
      ? await this.prisma.companyItem.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, slug: true } })
      : [];
    const pmap = new Map(products.map((p) => [p.id, p] as const));
    const viewerIds = identCur.map((r) => r.viewerCompanyId).filter((x): x is string => !!x);
    const viewerCompanies = viewerIds.length
      ? await this.prisma.company.findMany({ where: { id: { in: viewerIds } }, select: { city: true } })
      : [];
    const cityCounts = new Map<string, number>();
    for (const c of viewerCompanies) if (c.city) cityCounts.set(c.city, (cityCounts.get(c.city) ?? 0) + 1);
    const replyHours = inquiries
      .filter((i) => i.replies[0])
      .map((i) => (i.replies[0]!.createdAt.getTime() - i.createdAt.getTime()) / 3_600_000)
      .sort((a, b) => a - b);
    const median = replyHours.length ? replyHours[Math.floor(replyHours.length / 2)]! : null;
    return {
      days,
      generatedAt: now.toISOString(),
      views: {
        profile: { current: profileCur, previous: profilePrev },
        product: { current: productCur, previous: productPrev },
        identifiedVisitors: { current: identCur.length, previous: identPrev.length },
      },
      topProducts: topRaw.flatMap((t) => {
        const p = t.productId ? pmap.get(t.productId) : undefined;
        return p ? [{ id: p.id, name: p.name, slug: p.slug, views: t._count._all }] : [];
      }),
      viewerCities: [...cityCounts.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr"))
        .slice(0, 8),
      inquiries: {
        received: inquiries.length,
        replied: inquiries.filter((i) => i.replies.length > 0).length,
        medianFirstReplyHours: median != null ? Math.round(median * 10) / 10 : null,
      },
      connections: {
        invitesReceived: conns.length,
        accepted: conns.filter((c) => c.status === "ACTIVE").length,
      },
      listingInvitations: invites,
      bids: {
        submitted: bids.length,
        won: bids.filter((b) => b.status === "WON" || b.status === "AWARDED_PARTIAL").length,
      },
    };
  }

  /** Cron: 180 günden eski görüntülemeler silinir. */
  async purgeExpired(): Promise<number> {
    const res = await this.prisma.companyView.deleteMany({ where: { viewedAt: { lt: daysAgo(VIEW_RETENTION_DAYS) } } });
    return res.count;
  }
}

function clampDays(v: number | undefined): number {
  const n = Number(v);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}
