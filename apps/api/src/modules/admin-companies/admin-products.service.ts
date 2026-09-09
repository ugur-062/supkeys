import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, type ProductReviewStatus } from "@rothern/db";
import { productPath } from "@rothern/shared";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { resolveCategoryAttributes } from "../../common/company/category-attributes";
import { AuditService } from "../audit/audit.service";
import { SeoIndexService } from "../seo-index/seo-index.service";
import { AdminCompaniesService } from "./admin-companies.service";

/**
 * ÜRÜN MODERASYONU — admin kuyruğu (2026-09-09, kullanıcı kararı: her ürün
 * vitrine çıkmadan onaydan geçer).
 *
 * Tek gerçek: `isPublic` YALNIZ burada true olur (`approve`). Firma tarafı
 * (`CompanyItemsService.publish`) ürünü PENDING'e alır, yayın kapısını ve paket
 * tavanını orada uygular; burada içerik kararı verilir.
 *
 * Yayındaki ürünün içerik düzenlemesi de PENDING'e düşer ama vitrinde KALIR
 * (isPublic korunur) — reddedilirse çekilir. Kuyruk en ESKİ gönderim önce.
 */
const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  code: true,
  description: true,
  images: true,
  keywords: true,
  attributes: true,
  brand: true,
  mpn: true,
  categoryId: true,
  priceMode: true,
  priceAmount: true,
  priceTiers: true,
  priceCurrency: true,
  moq: true,
  unit: true,
  videoUrl: true,
  externalUrl: true,
  documents: true,
  isPublic: true,
  isActive: true,
  publishedAt: true,
  reviewStatus: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedByAdminId: true,
  rejectReason: true,
  completionScore: true,
  createdAt: true,
  updatedAt: true,
  company: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      country: true,
      tier: true,
      companyVerificationStatus: true,
      isBlocked: true,
    },
  },
} satisfies Prisma.CompanyItemSelect;

type Row = Prisma.CompanyItemGetPayload<{ select: typeof PRODUCT_SELECT }>;

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string | null;
  cover: string | null;
  imageCount: number;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus: ProductReviewStatus;
  isPublic: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  rejectReason: string | null;
  updatedAt: string;
  company: {
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    tier: string;
    verification: string;
    isBlocked: boolean;
  };
}

export interface AdminProductDetail extends AdminProductRow {
  images: string[];
  code: string | null;
  description: string | null;
  keywords: string[];
  brand: string | null;
  mpn: string | null;
  priceMode: string;
  priceAmount: string | null;
  priceTiers: unknown;
  priceCurrency: string;
  moq: string | null;
  unit: string;
  videoUrl: string | null;
  externalUrl: string | null;
  documents: unknown;
  completionScore: number | null;
  attributeList: { key: string; label: string; value: string; unit: string | null }[];
  company: AdminProductRow["company"] & { publicUrl: string | null };
  publicUrl: string | null;
  createdAt: string;
}

export interface AdminProductListQuery {
  status?: ProductReviewStatus | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly audit: AuditService,
    private readonly companies: AdminCompaniesService,
    @Optional() private readonly seo?: SeoIndexService,
  ) {}

  async list(q: AdminProductListQuery): Promise<{ items: AdminProductRow[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(Math.max(q.pageSize ?? 25, 1), 100);
    const status = q.status && q.status !== "ALL" ? q.status : undefined;
    const term = q.q?.trim();
    const where: Prisma.CompanyItemWhereInput = {
      isActive: true,
      ...(status ? { reviewStatus: status } : { reviewStatus: { not: "DRAFT" } }),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { company: { name: { contains: term, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.companyItem.findMany({
        where,
        select: PRODUCT_SELECT,
        // Kuyruk: en eski gönderim ÖNCE (SLA); diğer sekmelerde en yeni karar önce.
        orderBy:
          status === "PENDING"
            ? [{ submittedAt: "asc" }, { id: "asc" }]
            : [{ reviewedAt: { sort: "desc", nulls: "last" } }, { submittedAt: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.companyItem.count({ where }),
    ]);
    const catNames = await this.categoryNames(rows.map((r) => r.categoryId));
    return {
      items: rows.map((r) => this.toRow(r, catNames)),
      total,
      page,
      pageSize,
    };
  }

  async stats() {
    const [pending, oldest, rejected] = await Promise.all([
      this.prisma.companyItem.count({ where: { isActive: true, reviewStatus: "PENDING" } }),
      this.prisma.companyItem.findFirst({
        where: { isActive: true, reviewStatus: "PENDING" },
        select: { submittedAt: true },
        orderBy: { submittedAt: "asc" },
      }),
      this.prisma.companyItem.count({ where: { isActive: true, reviewStatus: "REJECTED" } }),
    ]);
    return { pending, rejected, oldestPendingSince: oldest?.submittedAt?.toISOString() ?? null };
  }

  async detail(id: string): Promise<AdminProductDetail> {
    const r = await this.require(id);
    const catNames = await this.categoryNames([r.categoryId]);
    // Nitelik etiketleri: kategori matrisinden (miraslı) — admin ham anahtar
    // değil "Koruma sınıfı (IP): 54" görsün.
    const defs = r.categoryId ? await this.attributeDefs(r.categoryId) : new Map<string, { label: string; unit: string | null }>();
    const attrs = (r.attributes && typeof r.attributes === "object" && !Array.isArray(r.attributes) ? r.attributes : {}) as Record<string, unknown>;
    return {
      ...this.toRow(r, catNames),
      images: r.images,
      code: r.code,
      description: r.description,
      keywords: r.keywords,
      brand: r.brand,
      mpn: r.mpn,
      priceMode: r.priceMode,
      priceAmount: r.priceAmount?.toString() ?? null,
      priceTiers: r.priceTiers,
      priceCurrency: r.priceCurrency,
      moq: r.moq?.toString() ?? null,
      unit: r.unit,
      videoUrl: r.videoUrl,
      externalUrl: r.externalUrl,
      documents: r.documents,
      completionScore: r.completionScore,
      attributeList: Object.entries(attrs)
        .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : v != null && v !== ""))
        .map(([k, v]) => ({
          key: k,
          label: defs.get(k)?.label ?? k,
          value: Array.isArray(v) ? v.join(", ") : String(v),
          unit: defs.get(k)?.unit ?? null,
        })),
      company: {
        ...this.toRow(r, catNames).company,
        publicUrl: r.company.slug ? `/firma/${r.company.slug}` : null,
      },
      publicUrl: r.company.slug && r.slug ? productPath(r.company.slug, r.slug) : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** ONAYLA — PENDING → APPROVED + vitrine çıkar. Tek gerçek: isPublic burada true olur. */
  async approve(id: string, adminId: string) {
    const r = await this.require(id);
    if (r.reviewStatus !== "PENDING") throw new BadRequestException("Yalnız onay bekleyen ürün onaylanabilir");
    if (!r.slug) throw new BadRequestException("Ürünün URL parçası (slug) yok — firma yeniden göndermeli");
    const now = new Date();
    const done = await this.prisma.companyItem.updateMany({
      where: { id, reviewStatus: "PENDING" },
      data: {
        reviewStatus: "APPROVED",
        isPublic: true,
        publishedAt: r.publishedAt ?? now,
        reviewedAt: now,
        reviewedByAdminId: adminId,
        rejectReason: null,
      },
    });
    if (done.count !== 1) throw new BadRequestException("Ürün durumu değişti — sayfayı yenileyin");
    await this.audit.log({
      action: "admin.product.approved",
      actorType: "admin",
      actorId: adminId,
      tenantId: r.company.id,
      entityType: "company_item",
      entityId: id,
      critical: true,
      metadata: { name: r.name, wasPublic: r.isPublic },
    });
    this.seo?.productChanged(id);
    const path = r.company.slug ? productPath(r.company.slug, r.slug) : "/company/satis/urunlerim";
    void this.companies.notifyCompany(
      r.company.id,
      r.isPublic ? "Ürün güncellemeniz onaylandı" : "Ürününüz yayına alındı",
      [
        "Merhaba,",
        r.isPublic
          ? `"${r.name}" ürününüzdeki değişiklik incelendi ve onaylandı; vitrindeki hâli güncel.`
          : `"${r.name}" ürününüz incelendi ve vitrinde yayına alındı. Alıcılar artık ürün sayfanızı görebilir ve bilgi talebi gönderebilir.`,
      ],
      "product_approved",
      { label: "Ürünü gör", path },
    );
    return { ok: true };
  }

  /** REDDET — gerekçe zorunlu; yayındaysa vitrinden ÇEKİLİR. Firma düzenleyip yeniden gönderir. */
  async reject(id: string, reason: string, adminId: string) {
    const r = await this.require(id);
    if (r.reviewStatus !== "PENDING") throw new BadRequestException("Yalnız onay bekleyen ürün reddedilebilir");
    const clean = reason.trim();
    const done = await this.prisma.companyItem.updateMany({
      where: { id, reviewStatus: "PENDING" },
      data: {
        reviewStatus: "REJECTED",
        isPublic: false,
        reviewedAt: new Date(),
        reviewedByAdminId: adminId,
        rejectReason: clean,
      },
    });
    if (done.count !== 1) throw new BadRequestException("Ürün durumu değişti — sayfayı yenileyin");
    await this.audit.log({
      action: "admin.product.rejected",
      actorType: "admin",
      actorId: adminId,
      tenantId: r.company.id,
      entityType: "company_item",
      entityId: id,
      critical: true,
      metadata: { name: r.name, reason: clean, wasPublic: r.isPublic },
    });
    if (r.isPublic) this.seo?.productChanged(id);
    void this.companies.notifyCompany(
      r.company.id,
      "Ürününüz onaylanmadı",
      [
        "Merhaba,",
        `"${r.name}" ürününüz incelendi ve bu hâliyle yayına alınmadı.${r.isPublic ? " Ürün vitrinden çekildi." : ""} Gerekçe: ${clean}`,
        "Ürünü düzenleyip yeniden onaya gönderebilirsiniz.",
      ],
      "product_rejected",
      { label: "Ürünü düzenle", path: "/company/satis/urunlerim?sekme=rejected" },
    );
    return { ok: true };
  }

  /* ---------------------------------------------------------------- */

  private async require(id: string): Promise<Row> {
    const r = await this.prisma.companyItem.findUnique({ where: { id }, select: PRODUCT_SELECT });
    if (!r) throw new NotFoundException("Ürün bulunamadı");
    return r;
  }

  private toRow(r: Row, catNames: Map<string, string>): AdminProductRow {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      cover: r.images[0] ?? null,
      imageCount: r.images.length,
      categoryId: r.categoryId,
      categoryName: r.categoryId ? (catNames.get(r.categoryId) ?? null) : null,
      reviewStatus: r.reviewStatus,
      isPublic: r.isPublic,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewedByAdminId: r.reviewedByAdminId,
      rejectReason: r.rejectReason,
      updatedAt: r.updatedAt.toISOString(),
      company: {
        id: r.company.id,
        name: r.company.name,
        slug: r.company.slug,
        city: r.company.city,
        tier: r.company.tier,
        verification: r.company.companyVerificationStatus,
        isBlocked: r.company.isBlocked,
      },
    };
  }

  private async categoryNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const rows = await this.prisma.category.findMany({ where: { id: { in: unique } }, select: { id: true, nameTr: true } });
    return new Map(rows.map((c) => [c.id, c.nameTr]));
  }

  /** Miraslı nitelik tanımları — `category-attributes.ts` ile aynı ata zinciri. */
  private async attributeDefs(categoryId: string): Promise<Map<string, { label: string; unit: string | null }>> {
    try {
      const defs = await resolveCategoryAttributes(this.prisma, categoryId);
      return new Map(defs.map((d) => [d.key, { label: d.nameTr, unit: d.unit ?? null }]));
    } catch {
      return new Map();
    }
  }
}
