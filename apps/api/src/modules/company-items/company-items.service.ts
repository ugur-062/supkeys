import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { foldSearchText, normalizeUnit, getUnit } from "@rothern/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/** Katalog boyutu tavanı — sınırsız büyüme depolama/arama maliyeti üretir. */
const MAX_CATALOG_ITEMS = 5000;
/** Tek seferde kataloğa alınabilecek kalem sayısı (ihaleden içe aktarma). */
const MAX_BULK_IMPORT = 200;

export interface CatalogItemInput {
  code?: string | null;
  name: string;
  description?: string | null;
  specification?: string | null;
  unit: string;
  unitCode?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  mpn?: string | null;
  targetPrice?: number | null;
}

/**
 * Kalem Kataloğu (Faz 2).
 *
 * Katalog↔ilan kalemi arasında FK YOK: katalogdan ihaleye KOPYALANIR.
 * Bu bilinçli — FK olsaydı katalogdaki bir düzeltme yayınlanmış ihaleyi
 * geriye dönük değiştirirdi.
 */
@Injectable()
export class CompanyItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Arama + sayfalama. Sıralama: sık kullanılan ve yakında kullanılan üstte. */
  async list(
    companyId: string,
    opts: {
      q?: string;
      categoryId?: string;
      take?: number;
      skip?: number;
      /** true → yalnız ARŞİVLENMİŞ kalemler (yönetim ekranının arşiv sekmesi). */
      archived?: boolean;
    } = {},
  ) {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const skip = Math.max(opts.skip ?? 0, 0);
    const q = opts.q?.trim();
    // TR-katlanmış arama: 'İ'/aksan sorunsuz (kategori aramasıyla aynı yol).
    const folded = q ? foldSearchText(q) : null;
    const where: Prisma.CompanyItemWhereInput = {
      companyId,
      isActive: !opts.archived,
      ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      ...(folded
        ? {
            OR: [
              { name: { contains: q!, mode: "insensitive" } },
              { code: { contains: q!, mode: "insensitive" } },
              { brand: { contains: q!, mode: "insensitive" } },
              { mpn: { contains: q!, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.companyItem.findMany({
        where,
        orderBy: [
          { usageCount: "desc" },
          { lastUsedAt: { sort: "desc", nulls: "last" } },
          { name: "asc" },
          { id: "asc" }, // tie-break — sayfalar arası kayma olmasın
        ],
        take,
        skip,
      }),
      this.prisma.companyItem.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.serialize(r)),
      total,
      // Sessiz tavan yok: kullanıcı kesildiğini görür.
      truncated: skip + rows.length < total,
    };
  }

  async create(user: AuthenticatedCompanyUser, input: CatalogItemInput) {
    await this.assertCapacity(user.companyId, 1);
    const data = this.normalize(input);
    const row = await this.prisma.companyItem
      .create({
        data: { ...data, companyId: user.companyId, createdById: user.userId },
      })
      .catch((e: unknown) => {
        throw this.mapDuplicate(e, data.code);
      });
    void this.audit.log({
      action: "company.catalog_item.created",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: row.id,
      metadata: { name: row.name, code: row.code },
    });
    return this.serialize(row);
  }

  async update(
    user: AuthenticatedCompanyUser,
    id: string,
    input: Partial<CatalogItemInput>,
  ) {
    const before = await this.requireOwn(user.companyId, id);
    const patch = this.normalize({ ...this.toInput(before), ...input });
    const row = await this.prisma.companyItem
      .update({ where: { id }, data: patch })
      .catch((e: unknown) => {
        throw this.mapDuplicate(e, patch.code);
      });
    void this.audit.log({
      action: "company.catalog_item.updated",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: id,
      metadata: { name: row.name },
    });
    return this.serialize(row);
  }

  /**
   * Silme YOK — pasifleştirme. Geçmiş ilanlar kopya taşıdığı için etkilenmez;
   * kullanıcı yanlışlıkla kaldırdığını geri alabilmeli.
   */
  async setActive(user: AuthenticatedCompanyUser, id: string, isActive: boolean) {
    await this.requireOwn(user.companyId, id, { anyState: true });
    const row = await this.prisma.companyItem.update({
      where: { id },
      data: { isActive },
    });
    void this.audit.log({
      action: isActive
        ? "company.catalog_item.restored"
        : "company.catalog_item.archived",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: id,
      metadata: { name: row.name },
    });
    return this.serialize(row);
  }

  /**
   * TERS YÖN — bir ilanın kalemlerini kataloğa al (Faz 2'nin İLK parçası).
   *
   * Kullanıcıdan önce oturup katalog kurmasını istemek benimsemeyi öldürür;
   * katalog kendiliğinden dolmalı. Kod/ad eşleşen kalem ATLANIR (mükerrer
   * üretmez), yenileri eklenir.
   */
  async importFromListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: {
        id: true,
        categoryIds: true,
        items: {
          select: {
            name: true,
            description: true,
            unit: true,
            unitCode: true,
            materialCode: true,
            targetPrice: true,
          },
        },
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const source = listing.items.slice(0, MAX_BULK_IMPORT);
    if (source.length === 0) {
      return { added: 0, skipped: 0, truncated: 0 };
    }
    const existing = await this.prisma.companyItem.findMany({
      where: { companyId: user.companyId },
      select: { code: true, name: true },
    });
    const seenCode = new Set(
      existing.map((e) => e.code).filter((c): c is string => !!c),
    );
    const seenName = new Set(existing.map((e) => foldSearchText(e.name)));

    const toCreate: Prisma.CompanyItemCreateManyInput[] = [];
    let skipped = 0;
    for (const it of source) {
      const code = it.materialCode?.trim() || null;
      const nameKey = foldSearchText(it.name);
      if ((code && seenCode.has(code)) || seenName.has(nameKey)) {
        skipped++;
        continue;
      }
      if (code) seenCode.add(code);
      seenName.add(nameKey);
      toCreate.push({
        companyId: user.companyId,
        createdById: user.userId,
        code,
        name: it.name,
        description: it.description,
        unit: it.unit,
        // Tanınmazsa NULL — "PCE" varsaymak sessizce YANLIŞ birim üretirdi
        // (denetimin peşine düştüğü sınıf: uydurma varsayılan).
        unitCode: it.unitCode ?? normalizeUnit(it.unit),
        // İlanın ilk kategorisi makul bir varsayılan; kullanıcı düzeltebilir.
        categoryId: listing.categoryIds[0] ?? null,
        targetPrice: it.targetPrice,
      });
    }
    await this.assertCapacity(user.companyId, toCreate.length);
    if (toCreate.length > 0) {
      await this.prisma.companyItem.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }
    void this.audit.log({
      action: "company.catalog_item.bulk_imported",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listingId,
      metadata: { added: toCreate.length, skipped },
    });
    return {
      added: toCreate.length,
      skipped,
      truncated: listing.items.length - source.length,
    };
  }

  /**
   * Katalogdan ihaleye eklendi — kullanım sayacını artırır ("sık kullanılan
   * üstte" sıralamasının kaynağı). Eksik id'ler sessizce yok sayılır (katalog
   * kalemi bu arada arşivlenmiş olabilir; kullanıcı akışını kırmaz).
   */
  async markUsed(companyId: string, ids: string[]) {
    const unique = [...new Set(ids)].slice(0, MAX_BULK_IMPORT);
    if (unique.length === 0) return { updated: 0 };
    const res = await this.prisma.companyItem.updateMany({
      where: { companyId, id: { in: unique } },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    return { updated: res.count };
  }

  // ── yardımcılar ─────────────────────────────────────────────────────────

  private async requireOwn(
    companyId: string,
    id: string,
    opts: { anyState?: boolean } = {},
  ) {
    const row = await this.prisma.companyItem.findFirst({
      where: { id, companyId, ...(opts.anyState ? {} : { isActive: true }) },
    });
    if (!row) throw new NotFoundException("Katalog kalemi bulunamadı");
    return row;
  }

  private async assertCapacity(companyId: string, adding: number) {
    if (adding <= 0) return;
    const count = await this.prisma.companyItem.count({ where: { companyId } });
    if (count + adding > MAX_CATALOG_ITEMS) {
      throw new BadRequestException(
        `Katalog en fazla ${MAX_CATALOG_ITEMS} kalem taşıyabilir — kullanmadıklarınızı arşivleyin`,
      );
    }
  }

  private normalize(input: CatalogItemInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException("Kalem adı zorunlu");
    const unit = input.unit?.trim() || "adet";
    // İlan kalemiyle AYNI kural: kod verilmediyse metinden türet, tanınmazsa
    // NULL bırak ve serbest metni sakla. Katalogda birimi ZORUNLU tutmak
    // "bobin" yazan kullanıcıyı kalemini kaydedemez hâle getirirdi.
    const unitCode = input.unitCode ?? normalizeUnit(unit);
    const known = getUnit(unitCode);
    return {
      code: input.code?.trim() || null,
      name,
      description: input.description?.trim() || null,
      specification: input.specification?.trim() || null,
      // Tanınan birimde katalog adına normalize et (adet/Adet/ad → "adet");
      // tanınmayanda kullanıcının yazdığı metni AYNEN koru.
      unit: known?.nameTr ?? unit,
      unitCode: known ? known.code : null,
      categoryId: input.categoryId?.trim() || null,
      brand: input.brand?.trim() || null,
      mpn: input.mpn?.trim() || null,
      targetPrice:
        input.targetPrice == null
          ? null
          : new Prisma.Decimal(input.targetPrice),
    };
  }

  private toInput(row: {
    code: string | null;
    name: string;
    description: string | null;
    specification: string | null;
    unit: string;
    unitCode: string | null;
    categoryId: string | null;
    brand: string | null;
    mpn: string | null;
    targetPrice: Prisma.Decimal | null;
  }): CatalogItemInput {
    return {
      code: row.code,
      name: row.name,
      description: row.description,
      specification: row.specification,
      unit: row.unit,
      unitCode: row.unitCode,
      categoryId: row.categoryId,
      brand: row.brand,
      mpn: row.mpn,
      targetPrice: row.targetPrice == null ? null : Number(row.targetPrice),
    };
  }

  private mapDuplicate(e: unknown, code: string | null) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return new BadRequestException(
        `"${code}" stok kodu katalogda zaten var — kod firma içinde tekil olmalı`,
      );
    }
    return e as Error;
  }

  private serialize(r: {
    id: string;
    code: string | null;
    name: string;
    description: string | null;
    specification: string | null;
    unit: string;
    unitCode: string | null;
    categoryId: string | null;
    brand: string | null;
    mpn: string | null;
    targetPrice: Prisma.Decimal | null;
    isActive: boolean;
    usageCount: number;
    lastUsedAt: Date | null;
  }) {
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      specification: r.specification,
      unit: r.unit,
      unitCode: r.unitCode,
      categoryId: r.categoryId,
      brand: r.brand,
      mpn: r.mpn,
      targetPrice: r.targetPrice == null ? null : r.targetPrice.toString(),
      isActive: r.isActive,
      usageCount: r.usageCount,
      lastUsedAt: r.lastUsedAt,
    };
  }
}
