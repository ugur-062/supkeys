import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type CompanyItemPriceMode, type Currency } from "@rothern/db";
import { foldSearchText, getUnit, normalizeUnit, slugifyText } from "@rothern/shared";
import { resolveCategoryAttributes } from "../../common/company/category-attributes";
import {
  requestPublicImageUpload,
  resolvePublicImage,
} from "../../common/company/public-image-upload";
import { StorageService } from "../storage/storage.service";
import {
  productCompletion,
  productPublishBlockers,
  type ProductLike,
} from "../../common/company/product-completion";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/** Katalog boyutu tavanı — sınırsız büyüme depolama/arama maliyeti üretir. */
const MAX_CATALOG_ITEMS = 5000;
/** Tek seferde kataloğa alınabilecek kalem sayısı (ihaleden içe aktarma). */
const MAX_BULK_IMPORT = 200;

/**
 * Vitrin yanıtı — AÇIK tip. Prisma'nın `JsonValue` tipleri controller
 * imzasına sızarsa TS "taşınabilir değil" diyor (TS2742); JSON alanları
 * dışarıya `unknown` olarak veriliyor, istemci zaten kendi tipini biliyor.
 */
export interface ProductShowcase {
  id: string;
  name: string;
  slug: string | null;
  isPublic: boolean;
  publishedAt: string | null;
  categoryId: string | null;
  description: string | null;
  images: string[];
  videoUrl: string | null;
  externalUrl: string | null;
  documents: unknown;
  keywords: string[];
  attributes: unknown;
  priceMode: string;
  priceAmount: string | null;
  priceTiers: unknown;
  priceCurrency: string;
  moq: string | null;
  completion: { score: number; missing: { key: string; label: string; points: number }[] };
  publishBlockers: string[];
  attributeDefs: {
    key: string;
    nameTr: string;
    type: string;
    options: string[];
    unit: string | null;
    isRequired: boolean;
    definedAt: string;
  }[];
}

/** Vitrin alanları — temel kalem alanlarından AYRI güncellenir. */
export interface ShowcaseInput {
  categoryId?: string | null;
  images?: string[];
  videoUrl?: string | null;
  externalUrl?: string | null;
  documents?: { url: string; title: string }[] | null;
  keywords?: string[];
  attributes?: Record<string, unknown>;
  priceMode?: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount?: number | null;
  priceTiers?: { minQty: number; unitPrice: number }[] | null;
  priceCurrency?: string;
  moq?: number | null;
}

/** İçe aktarma satırı — şablon sözleşmesinin servis karşılığı. */
export interface ProductImportInput {
  name: string;
  code?: string | null;
  description?: string | null;
  categoryId?: string | null;
  unit: string;
  brand?: string | null;
  mpn?: string | null;
  keywords?: string[];
  priceMode?: "FIXED" | "TIERED" | "ON_REQUEST";
  price?: number | null;
  currency?: string | null;
  moq?: number | null;
}

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
  // DİKKAT (rig stub gotcha, CLAUDE.md): `storage` SONA eklendi. Araya
  // sokulsaydı elle kurulan test rig'lerinde audit ile yer değiştirir ve hata
  // ancak storage'a ULAŞAN bir testte, sessizce ortaya çıkardı.
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
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

  /** Verilen kodlardan katalogda GERÇEKTEN olanlar (tek sorgu). */
  private async knownCategoryIds(
    raw: (string | null | undefined)[],
  ): Promise<Set<string>> {
    const codes = [...new Set(raw.filter((c): c is string => !!c))];
    if (codes.length === 0) return new Set();
    const rows = await this.prisma.category.findMany({
      where: { id: { in: codes }, isActive: true },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

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

  /**
   * İçe aktarma önizlemesini KATALOĞA YAZAR (Faz 4).
   *
   * Stok kodu verilmişse UPSERT: aynı kod ikinci kez yüklenince kopya
   * oluşmaz, mevcut ürün güncellenir. Kodsuz satırlar her zaman YENİ kayıt —
   * ada göre eşleştirmek "Çelik Boru" gibi tekrar eden adlarda yanlış ürünü
   * ezerdi.
   *
   * Ürünler TASLAK doğar (`isPublic` varsayılan false): 500 satır tek tıkla
   * vitrine düşmez, görsel eklenip yayımlanması bilinçli bir adım kalır.
   */
  async importRows(
    user: AuthenticatedCompanyUser,
    rows: ProductImportInput[],
  ) {
    await this.assertCapacity(user.companyId, rows.length);
    // Önizlemeyi atlayıp doğrudan commit'e istek atan bir istemci katalogda
    // olmayan bir kod yollayabilir — yazma yolunda da süzülür (önizleme
    // uyarısı UX, bu satır garanti).
    const known = await this.knownCategoryIds(rows.map((r) => r.categoryId));
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      const base = this.normalize({
        code: r.code,
        name: r.name,
        description: r.description,
        unit: r.unit,
        categoryId: r.categoryId && known.has(r.categoryId) ? r.categoryId : null,
        brand: r.brand,
        mpn: r.mpn,
      });
      const showcase = {
        keywords: r.keywords ?? [],
        priceMode: (r.priceMode ?? "ON_REQUEST") as CompanyItemPriceMode,
        priceAmount:
          r.priceMode === "FIXED" && r.price != null
            ? new Prisma.Decimal(r.price)
            : null,
        ...(r.currency ? { priceCurrency: r.currency as Currency } : {}),
        moq: r.moq == null ? null : new Prisma.Decimal(r.moq),
        searchText: foldSearchText(
          [r.name, r.brand, r.mpn, ...(r.keywords ?? [])].filter(Boolean).join(" "),
        ),
      };

      const existing = base.code
        ? await this.prisma.companyItem.findFirst({
            where: { companyId: user.companyId, code: base.code },
            select: { id: true },
          })
        : null;

      if (existing) {
        await this.prisma.companyItem.update({
          where: { id: existing.id },
          data: { ...base, ...showcase },
        });
        updated += 1;
      } else {
        await this.prisma.companyItem.create({
          data: {
            ...base,
            ...showcase,
            companyId: user.companyId,
            createdById: user.userId,
          },
        });
        created += 1;
      }
    }
    void this.audit.log({
      action: "company.product.imported",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: user.companyId,
      metadata: { created, updated },
    });
    return { created, updated };
  }

  /* ================================================================== */
  /* VİTRİN (Faz 2) — kalemi herkese açık ÜRÜNE çeviren katman             */
  /* ================================================================== */

  /**
   * Bir kategorinin ETKİN nitelik seti — ata zincirinden miras.
   * Mantık `common/company/category-attributes.ts`de TEK KAYNAK; herkese açık
   * ürün sayfası da aynı çözümleyiciden okuyor (panelde sorulan nitelik ile
   * vitrinde gösterilen etiket ayrışmasın).
   */
  async resolveAttributes(categoryId: string | null | undefined) {
    return resolveCategoryAttributes(this.prisma, categoryId);
  }

  /**
   * Ürün görseli için presigned PUT. Mantık profil görselleriyle AYNI
   * kaynaktan (`public-image-upload.ts`): benzersiz anahtar, IDOR kontrolü,
   * yükleme sonrası otoritatif boyut/MIME doğrulaması, CDN'siz fail-closed.
   */
  async requestImageUpload(
    companyId: string,
    fileName: string,
    mimeType: string,
  ) {
    return requestPublicImageUpload(
      this.storage,
      companyId,
      "product",
      fileName,
      mimeType,
    );
  }

  /** Yükleme bitince key → kalıcı public URL (DB'ye YAZMAZ). */
  async resolveImage(companyId: string, key: string) {
    return resolvePublicImage(this.storage, companyId, key);
  }

  /** Ürünün vitrin alanlarını günceller (görsel, fiyat, nitelik, etiket…). */
  async updateShowcase(
    user: AuthenticatedCompanyUser,
    id: string,
    input: ShowcaseInput,
  ) {
    const before = await this.requireOwn(user.companyId, id);
    const patch = await this.normalizeShowcase(before, input);
    const row = await this.prisma.companyItem
      .update({ where: { id }, data: patch })
      .catch((e: unknown) => {
        throw this.mapDuplicate(e, before.code);
      });
    void this.audit.log({
      action: "company.product.updated",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: id,
      metadata: { name: row.name, isPublic: row.isPublic },
    });
    return this.serializeShowcase(row);
  }

  /**
   * Vitrine çıkar. Kapı `productPublishBlockers` — TEK KAYNAK; skor kapı
   * DEĞİL (gerekçe o dosyada).
   */
  async publish(user: AuthenticatedCompanyUser, id: string) {
    const row = await this.requireOwn(user.companyId, id);
    const blockers = productPublishBlockers(this.toProductLike(row));
    if (blockers.length > 0) {
      throw new BadRequestException(
        `Yayımlanamadı — ${blockers.join(", ")}`,
      );
    }
    const slug = await this.ensureSlug(user.companyId, id, row.name, row.slug);
    const updated = await this.prisma.companyItem.update({
      where: { id },
      data: { isPublic: true, publishedAt: row.publishedAt ?? new Date(), slug },
    });
    void this.audit.log({
      action: "company.product.published",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: id,
      metadata: { name: updated.name, slug },
    });
    return this.serializeShowcase(updated);
  }

  /** Vitrinden çeker. Kayıt SİLİNMEZ; slug korunur (geri açılınca aynı URL). */
  async unpublish(user: AuthenticatedCompanyUser, id: string) {
    await this.requireOwn(user.companyId, id);
    const updated = await this.prisma.companyItem.update({
      where: { id },
      data: { isPublic: false },
    });
    void this.audit.log({
      action: "company.product.unpublished",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: id,
      metadata: { name: updated.name },
    });
    return this.serializeShowcase(updated);
  }

  /**
   * Firma içinde tekil slug. Ad değişse bile MEVCUT slug korunur — yayımlanmış
   * bir ürünün URL'ini başlık düzeltmesi yüzünden kırmak, gelen bağlantıyı ve
   * arama motoru sıralamasını çöpe atmak demek.
   */
  private async ensureSlug(
    companyId: string,
    id: string,
    name: string,
    current: string | null,
  ): Promise<string> {
    if (current) return current;
    const base = slugifyText(name) || "urun";
    for (let i = 0; i < 100; i += 1) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const clash = await this.prisma.companyItem.findFirst({
        where: { companyId, slug: candidate, NOT: { id } },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    // 100 denemede bulunamadıysa kayıt kimliğine düş — çakışma imkânsız.
    return `${base}-${id.slice(-6)}`;
  }

  private async normalizeShowcase(
    before: { categoryId: string | null },
    input: ShowcaseInput,
  ) {
    const images = (input.images ?? []).map((u) => u.trim()).filter(Boolean);
    const keywords = [
      ...new Set((input.keywords ?? []).map((k) => k.trim()).filter(Boolean)),
    ];
    const categoryId = input.categoryId?.trim() || before.categoryId;

    // Nitelikler: yalnız o kategoride TANIMLI anahtarlar geçer. Tanımsız
    // anahtar sessizce düşer — istemcinin uydurduğu alan veriyi kirletmesin.
    const defs = await this.resolveAttributes(categoryId);
    const allowed = new Set(defs.map((d) => d.key));
    const attributes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.attributes ?? {})) {
      if (allowed.has(k) && v != null && v !== "") attributes[k] = v;
    }

    return {
      ...(input.categoryId !== undefined ? { categoryId } : {}),
      images,
      keywords,
      attributes:
        Object.keys(attributes).length > 0
          ? (attributes as Prisma.InputJsonValue)
          : Prisma.DbNull,
      videoUrl: input.videoUrl?.trim() || null,
      externalUrl: input.externalUrl?.trim() || null,
      documents: input.documents ? (input.documents as Prisma.InputJsonValue) : Prisma.DbNull,
      priceMode: input.priceMode ?? "ON_REQUEST",
      priceAmount:
        input.priceMode === "FIXED" && input.priceAmount != null
          ? new Prisma.Decimal(input.priceAmount)
          : null,
      priceTiers:
        input.priceMode === "TIERED" && input.priceTiers?.length
          ? (input.priceTiers as Prisma.InputJsonValue)
          : Prisma.DbNull,
      ...(input.priceCurrency
        ? { priceCurrency: input.priceCurrency as Currency }
        : {}),
      moq: input.moq == null ? null : new Prisma.Decimal(input.moq),
    };
  }

  private toProductLike(r: {
    name: string;
    categoryId: string | null;
    description: string | null;
    images: string[];
    keywords: string[];
    priceMode: string;
    priceAmount: Prisma.Decimal | null;
    priceTiers: Prisma.JsonValue | null;
    moq: Prisma.Decimal | null;
    attributes: Prisma.JsonValue | null;
  }): ProductLike {
    return {
      name: r.name,
      categoryId: r.categoryId,
      description: r.description,
      images: r.images,
      keywords: r.keywords,
      priceMode: r.priceMode as ProductLike["priceMode"],
      priceAmount: r.priceAmount,
      priceTiers: r.priceTiers,
      moq: r.moq,
      attributes: (r.attributes as Record<string, unknown> | null) ?? null,
    };
  }

  private async serializeShowcase(r: Parameters<typeof this.toProductLike>[0] & {
    id: string;
    isPublic: boolean;
    publishedAt: Date | null;
    slug: string | null;
    videoUrl: string | null;
    externalUrl: string | null;
    documents: Prisma.JsonValue | null;
    priceCurrency: string;
  }): Promise<ProductShowcase> {
    const like = this.toProductLike(r);
    const defs = await this.resolveAttributes(r.categoryId);
    const completion = productCompletion(like, {
      requiredAttributeKeys: defs.filter((d) => d.isRequired).map((d) => d.key),
    });
    // Skor DB'ye de yazılır (sıralama/rapor için); yanıt taze hesaptan döner.
    void this.prisma.companyItem
      .update({ where: { id: r.id }, data: { completionScore: completion.score } })
      .catch(() => undefined);
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      isPublic: r.isPublic,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      categoryId: r.categoryId,
      description: r.description,
      images: r.images,
      videoUrl: r.videoUrl,
      externalUrl: r.externalUrl,
      documents: r.documents,
      keywords: r.keywords,
      attributes: r.attributes,
      priceMode: r.priceMode,
      priceAmount: r.priceAmount?.toString() ?? null,
      priceTiers: r.priceTiers,
      priceCurrency: r.priceCurrency,
      moq: r.moq?.toString() ?? null,
      completion,
      publishBlockers: productPublishBlockers(like),
      attributeDefs: defs,
    };
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
