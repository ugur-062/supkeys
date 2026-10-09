import { entitlementForbidden } from "../../common/company/entitlement-required";
import { i18nMessage } from "../../common/i18n/http-i18n";
import { tApi } from "../../common/i18n/i18n.service";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { mergeShowcaseInput } from "../../common/company/showcase-merge";
import { Prisma, type CompanyItemPriceMode, type Currency, type ProductReviewStatus } from "@rothern/db";
import {
  foldSearchText,
  getUnit,
  isCategoryCode,
  normalizeUnit,
  PAID_TIER,
  PRODUCT_LIMITS,
  PRODUCT_MEDIA_TIER,
  slugifyText,
  tierAtLeast,
  tokenizeQuery, categoryPrefix, type TierName,
  defaultCurrencyForCountry,
  isCurrencyCode,
  productPriceBase,
  isHttpsUrl,
  productVideoEmbedUrl,
  hiddenCategoryWhere,
  isHiddenCategory,
  visibleCategoryId,
  visibleCategoryIds } from "@rothern/shared";
import { fxRate, resolveCompanyCurrency } from "../../common/currency/fx-rates";
import {
  ATTRIBUTE_LIST_MAX_ITEMS,
  ATTRIBUTE_VALUE_MAX_CHARS,
  isValidAttributeValue,
  resolveCategoryAttributes,
} from "../../common/company/category-attributes";
import { catalogContentChanged, showcaseContentChanged } from "../../common/company/product-content-diff";
import { effectiveTier, isFreePeriod } from "../../common/company/effective-tier";
import { pickFreeSlug } from "../../common/company/company-slug";
import {
  hasPublicProfile,
  publicProductWhere,
} from "../../common/company/public-profile-gate";
import { labelAttributes } from "../../common/company/category-attributes";
import {
  PUBLIC_PRODUCT_SELECT,
  toPublicProduct,
} from "../public-profile/dto/public-product.projection";
import { PRODUCT_INDEX_SELECT, attachProductFeatures, toProductIndexCard } from "../public-marketplace/dto/public-product-index.projection";
import {
  PRODUCT_FACET_SCAN_CAP,
  PRODUCT_PAGE_SIZE,
  attributeFacets,
  contextualFacetCounts,
  employeeValuesQuery,
  productIndexOrderBy,
  productIndexWhere,
  productSearchClauses,
  subCategoryCounts,
  toFacetRow,
  type ProductIndexParams,
} from "../../common/company/product-index";
import {
  requestPublicDocumentUpload,
  requestPublicImageUpload,
  resolvePublicDocument,
  resolvePublicImage,
} from "../../common/company/public-image-upload";
import { StorageService } from "../storage/storage.service";
import { SeoIndexService } from "../seo-index/seo-index.service";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import { currentLocale } from "../../common/i18n/locale-context";
import { CATEGORY_NAME_SELECT, categoryName } from "../../common/company/category-name";
import {
  productCompletion,
  productPublishBlockerCodes,
  type ProductLike,
  type PublishBlocker,
} from "../../common/company/product-completion";
import { PrismaBypassService, PrismaService } from "../../common/prisma/prisma.service";
import { likeLiteral } from "../../common/prisma/like-literal";
import { runTenantTx } from "../../common/prisma/tenant-tx";
import { CompanyViewsService } from "../company-views/company-views.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/** Katalog boyutu tavanı — sınırsız büyüme depolama/arama maliyeti üretir. */
const MAX_CATALOG_ITEMS = 5000;
/** Tek çağrıda işlenecek kimlik sayısı (`mark-used`; DTO tavanıyla aynı). */
const MAX_BULK_IMPORT = 200;
/**
 * İlandan kataloğa tek seferde eklenebilecek YENİ kalem — ilan kalem tavanı
 * (500, `create-listing.dto.ts`) ile aynı: tek basış ilanın tamamını alır.
 * Eskiden 200'dü ve tekilleştirmeden ÖNCE kesiliyordu: 205 kalemli ilanda
 * +200 eklenip 5'i sessizce düşüyor, ikinci basış "zaten var" diyordu
 * (arayüz testi D-248).
 */
const MAX_LISTING_IMPORT = 500;
/** Aynı kişinin aynı adlı taslak/onaydaki ürünü bu pencerede mükerrer sayılır (FX-00 O-006). */
const PRODUCT_DUPLICATE_WINDOW_MS = 30_000;

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
  /** Moderasyon (2026-09-09): DRAFT | PENDING | APPROVED | REJECTED. */
  reviewStatus: ProductReviewStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
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
  unit: string;
  unitCode: string | null;
  /**
   * Kalemin kimlik alanları — vitrin önizlemesi (`ProductPreview`) bunları
   * herkese açık sayfadaki gibi basar. Yanıtta yoktu: `?urun=` derin
   * bağlantısıyla açılan ürünün önizlemesi marka/MPN/şartnameyi kaybediyordu
   * (arayüz testi webC-16, gözden geçirme).
   */
  brand: string | null;
  mpn: string | null;
  specification: string | null;
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
  /** Ürün adı — vitrin formundan da yazılabilir (2026-09-03). */
  name?: string;
  description?: string;
  /** Satış birimi — vitrin formundan da yazılabilir; `normalize` ile AYNI kural. */
  unit?: string;
  unitCode?: string | null;
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
/** Panel içi ürün keşfi satırı (kart). */
export interface DiscoverProductRow {
  slug: string;
  name: string;
  excerpt: string | null;
  images: string[];
  unit: string;
  categoryId: string | null;
  priceMode: string;
  priceAmount: string | null;
  priceTiers: unknown;
  priceCurrency: string;
  moq: string | null;
  company: {
    name: string;
    slug: string;
    city: string | null;
    /** KYC doğrulaması tamam — kartta "Doğrulanmış" rozeti (Europages'in Verified'ı). */
    verified: boolean;
    activities: string[];
  };
}

/** Ürünlerim sekmeleri (web `ProductTab`, "all" hariç). */
export type ShowcaseListStatus = "published" | "pending" | "rejected" | "draft";
export const SHOWCASE_LIST_STATUSES: readonly ShowcaseListStatus[] = ["published", "pending", "rejected", "draft"];
const SHOWCASE_STATUS_WHERE: Record<ShowcaseListStatus, Prisma.CompanyItemWhereInput> = {
  published: { isPublic: true },
  pending: { isPublic: false, reviewStatus: "PENDING" },
  rejected: { reviewStatus: "REJECTED" },
  draft: { isPublic: false, reviewStatus: { notIn: ["PENDING", "REJECTED"] } },
};

@Injectable()
export class CompanyItemsService {
  // DİKKAT (rig stub gotcha, CLAUDE.md): `storage` SONA eklendi. Araya
  // sokulsaydı elle kurulan test rig'lerinde audit ile yer değiştirir ve hata
  // ancak storage'a ULAŞAN bir testte, sessizce ortaya çıkardı.
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    /** Ziyaret Edenler kaydı — SONDA ve isteğe bağlı (elle kurulan test rig'leri kırılmasın). */
    @Optional() private readonly views?: CompanyViewsService,
    /** Yayın anı SEO bildirimi (IndexNow + web tazeleme) — SONDA ve isteğe bağlı. */
    @Optional() private readonly seo?: SeoIndexService,
    /**
     * RLS: ÇAPRAZ FİRMA OKUMALARI (2026-09-16). Keşif metotları başka firmaların
     * ürünlerini okur; `company_items` politikası yalnız bağlamdaki firmanın
     * satırına izin verdiği için staging'de RLS açılınca keşif BOŞ döndü. Herkese
     * açık pazar yeri servisiyle aynı yol: bypass client (RLS'siz, sahip rol).
     * Görünürlük kapısı yine `publicProductWhere` (tek kaynak). SONDA ve isteğe
     * bağlı: elle kurulan test rig'leri kırılmasın; yoksa ana client'a düşer.
     */
    @Optional() private readonly bypass?: PrismaBypassService,
    /** İçerik çevirisi (i18n Faz 1e): yayındaki ürünün metni değişince yeniden çevrilir; başka firmanın
     *  ürünü okuyucunun dilinde okunur — SONDA ve isteğe bağlı. */
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /** Çapraz firma okumaları için client — RLS altında bypass, rig'de ana client. */
  private get crossTenant(): PrismaService {
    return (this.bypass as unknown as PrismaService | undefined) ?? this.prisma;
  }

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
      /** Efektif paket — yayında ürün tavanını (`PRODUCT_LIMITS`) yanıta koymak için. */
      tier?: string;
      /**
       * Ürünlerim sekmesi — SUNUCUDA süzülür (yayın denetimi 2026-09-28 Bölüm 6):
       * eskiden web ilk 50 satırı alıp istemcide süzüyordu; 50'den fazla ürünü
       * olan firmada "Onay bekliyor (1)" sekmesi boş liste gösteriyordu.
       * Anlam web `productStatusKey` ile birebir (yayında+incelemede → published).
       */
      status?: ShowcaseListStatus;
      /** `recent` = en yeni üstte (Ürünlerim); varsayılan kullanım sıklığı (katalog seçici). */
      sort?: "usage" | "recent";
    } = {},
  ) {
    const take = Math.min(Math.max(opts.take ?? 50, 1), 200);
    const skip = Math.max(opts.skip ?? 0, 0);
    const q = opts.q?.trim();
    // TR-katlanmış arama: 'İ'/aksan sorunsuz (kategori aramasıyla aynı yol).
    const folded = q ? foldSearchText(q) : null;
    // A code under a hidden segment is not a filter anyone can pick: it
    // behaves as if no category filter was given (owner rule 2026-10-09).
    const categoryFilter = visibleCategoryId(opts.categoryId);
    const where: Prisma.CompanyItemWhereInput = {
      companyId,
      isActive: !opts.archived,
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
      ...(opts.status ? SHOWCASE_STATUS_WHERE[opts.status] : {}),
      ...(folded
        ? {
            OR: [
              // Katlanmış kol (derin denetim LU-08): ILIKE Postgres `lower()`
              // ile küçültür, 'ışık' 'Işık Direği'ni bulmazdı. `searchText`
              // ad/marka/MPN'den katlanır; ham kollar kod araması ve
              // searchText'i henüz dolmamış eski kayıtlar için kalır.
              // Aranan metin desene düz karakter olarak girer (`likeLiteral`):
              // stok kodu / MPN'deki "_" tek karakter jokeri, "%" her şey
              // demek DEĞİL ("AB_12" eskiden "AB-12" ve "ABX12"yi de buluyordu).
              { searchText: { contains: likeLiteral(folded) } },
              { name: { contains: likeLiteral(q!), mode: "insensitive" } },
              { code: { contains: likeLiteral(q!), mode: "insensitive" } },
              { brand: { contains: likeLiteral(q!), mode: "insensitive" } },
              { mpn: { contains: likeLiteral(q!), mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [rows, total, published, draft, pending, rejected, publishedInReview] = await Promise.all([
      this.prisma.companyItem.findMany({
        where,
        orderBy:
          opts.sort === "recent"
            ? [{ createdAt: "desc" }, { id: "asc" }]
            : [
                { usageCount: "desc" },
                { lastUsedAt: { sort: "desc", nulls: "last" } },
                { name: "asc" },
                { id: "asc" }, // tie-break — sayfalar arası kayma olmasın
              ],
        take,
        skip,
        // Ürünlerim tablosu (2026-09-18): görüntülenme sütunu — kayıtlı
        // ziyaret sayısı (company_views, ürün bazlı).
        include: { _count: { select: { views: true } } },
      }),
      this.prisma.companyItem.count({ where }),
      // Vitrin sayaçları SÜZGEÇTEN BAĞIMSIZ (firma geneli): pano "N yayında ·
      // M taslak" ve Ürünlerim sekme sayaçları aynı sayıyı göstermeli;
      // arama daraltınca sekme sayacı değişseydi kullanıcı ürününün
      // "kaybolduğunu" sanırdı.
      this.prisma.companyItem.count({
        where: { companyId, isActive: true, isPublic: true },
      }),
      // Taslak sayacı liste süzgeciyle AYNI koşul (derin denetim LU-08): paket
      // düşüşünde `enforceProductLimit` ürünü yalnız isPublic=false yapar
      // (reviewStatus APPROVED kalır); Taslak sekmesi onu listeliyor, eski
      // `reviewStatus: DRAFT` sayacı saymıyordu.
      this.prisma.companyItem.count({
        where: { companyId, isActive: true, ...SHOWCASE_STATUS_WHERE.draft },
      }),
      this.prisma.companyItem.count({
        where: { companyId, isActive: true, reviewStatus: "PENDING" },
      }),
      this.prisma.companyItem.count({
        where: { companyId, isActive: true, isPublic: false, reviewStatus: "REJECTED" },
      }),
      // Yayındayken yeniden incelenen — ücretsiz tavan göstergesi bunu iki kez
      // saymamak için ister (eskiden web kesik listeden sayıyordu).
      this.prisma.companyItem.count({
        where: { companyId, isActive: true, isPublic: true, reviewStatus: "PENDING" },
      }),
    ]);
    return {
      items: rows.map((r) => this.serialize(r)),
      total,
      // Sessiz tavan yok: kullanıcı kesildiğini görür.
      truncated: skip + rows.length < total,
      // `pending` yayında olup yeniden incelenenleri DE sayar (kuyrukta).
      counts: { published, draft, pending, rejected, publishedInReview },
      // Ücretsiz pakette yayında ürün tavanı (null = limitsiz) — Ürünlerim
      // "N/10 yayında" ve formdaki "Kaydet ve yayınla" kilidi buradan okur.
      productLimit: opts.tier ? (PRODUCT_LIMITS[opts.tier as TierName] ?? null) : null,
    };
  }

  async create(user: AuthenticatedCompanyUser, input: CatalogItemInput) {
    const data = this.normalize(input);
    await this.assertCategoryAllowed(data.categoryId, null);
    // Arama metni `update` ile AYNI formül — yoksa katlanmış arama yeni kalemi
    // ilk düzenlemeye kadar bulamazdı (derin denetim LU-08).
    const searchText = foldSearchText(
      [data.name, data.brand, data.mpn].filter(Boolean).join(" "),
    );
    // Tavan sayımı ve yazma aynı kilitte (FX-00).
    const row = await this.withCompanyItemLock(user.companyId, async (tx) => {
      await this.assertCapacity(user.companyId, 1, tx);
      return tx.companyItem.create({
        data: { ...data, searchText, companyId: user.companyId, createdById: user.userId },
      });
    }).catch((e: unknown) => {
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
    // Uç `templates:manage` de kabul eder (D-185); vitrine dokunmuş ürün yalnız
    // satış izniyle değişir — `setActive` ile aynı kural.
    this.assertCanTouchShowcase(user, before);
    this.assertNotInReview(before);
    const merged = { ...this.toInput(before), ...input };
    // LEGACY CATEGORY (owner rule 2026-10-09): a stored category under a
    // hidden segment is shown nowhere, so a form cannot send it back. An
    // EMPTY value for it is therefore not a decision to clear it: the stored
    // code stays (the showcase path does the same, `normalizeShowcase`), and
    // an unrelated edit of a published legacy product is not stopped by the
    // "category required" gate. Replacing it with a current category works.
    if (!merged.categoryId?.trim() && isHiddenCategory(before.categoryId)) {
      merged.categoryId = before.categoryId;
    }
    const patch = this.normalize(merged);
    await this.assertCategoryAllowed(patch.categoryId, before.categoryId);
    // MODERASYON (derin denetim Y-07, 2026-09-29): bu uç eskiden yalnız PENDING
    // kilidine bakıp yayındaki (APPROVED) ürünün adını/açıklamasını/kategorisini
    // admin görmeden değiştiriyordu — vitrin yolunu (`updateShowcase`) atlatmanın
    // arka kapısıydı. Artık AYNI kural: içerik değişince yeniden PENDING (vitrinde
    // kalır, red çeker). Şartname/marka/MPN de herkese açık sayfada göründüğü için
    // içerik sayılır (`catalogContentChanged`). Kod/birim/hedef fiyat içerik değil.
    //
    // Yalnız VİTRİNDEKİ (isPublic) onaylı ürün yeniden incelemeye girer (arayüz
    // testi O-009): paket düşüşünde taslağa çekilmiş (APPROVED, isPublic=false)
    // ürün ekranda "Taslak"tır; kaydı taslak kalır, kuyruğa `publish` ile
    // (tavan + kapı denetimiyle) girer.
    const contentChanged =
      before.isPublic && before.reviewStatus === "APPROVED" && catalogContentChanged(before, patch);
    // YAYIN KAPISI (O-009): yayındaki ürün eksik içerikle kaydedilemez —
    // `publish` ile AYNI 400. Eskiden yalnız `publish` denetliyordu; açıklaması
    // silinmiş, anahtar kelimesiz ürün incelemeye girip vitrinde kalıyordu.
    if (before.isPublic) {
      this.assertStaysPublishable(
        before,
        this.toProductLike({ ...before, name: patch.name, description: patch.description, categoryId: patch.categoryId }),
        contentChanged,
      );
    }
    // Arama metni ad/marka/mpn/etiketlerden türetilir (`normalizeShowcase` ile
    // aynı formül) — yenilenmezse ürün eski adıyla aranmaya devam ederdi.
    const searchText = foldSearchText(
      [patch.name, patch.brand, patch.mpn, ...(before.keywords ?? [])]
        .filter(Boolean)
        .join(" "),
    );
    const row = await this.prisma.companyItem
      .update({
        where: { id },
        data: {
          ...patch,
          searchText,
          ...(contentChanged
            ? { reviewStatus: "PENDING" as const, submittedAt: new Date(), rejectReason: null }
            : {}),
        },
      })
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
      metadata: { name: row.name, isPublic: row.isPublic, reReview: contentChanged },
    });
    if (row.isPublic) this.seo?.productChanged(id);
    // Vitrindeki ya da onay bekleyen ürünün metni değişti → yeniden çeviri
    // (kaynak aynıysa işlem yok) — `updateShowcase` ile aynı kural.
    if (row.isPublic || row.reviewStatus === "PENDING") void this.translations?.enqueue("PRODUCT", id);
    return this.serialize(row);
  }

  /**
   * Vitrine dokunmuş ürün (yayında / onayda / onaylı / reddedilmiş) yalnız
   * `sell:product:manage` ile değişir; kalem uçları `templates:manage` de
   * kabul ettiği için (satınalma Kalem Kataloğu) servis ayrıca denetler.
   */
  private assertCanTouchShowcase(
    user: AuthenticatedCompanyUser,
    before: { isPublic: boolean; reviewStatus: string },
  ) {
    const isShowcaseProduct = before.isPublic || before.reviewStatus !== "DRAFT";
    if (isShowcaseProduct && !hasCompanyPermission(user, "sell:product:manage")) {
      throw new ForbiddenException(i18nMessage("api.business.forbidden"));
    }
  }

  /**
   * Silme YOK — pasifleştirme. Geçmiş ilanlar kopya taşıdığı için etkilenmez;
   * kullanıcı yanlışlıkla kaldırdığını geri alabilmeli.
   */
  async setActive(user: AuthenticatedCompanyUser, id: string, isActive: boolean) {
    const before = await this.requireOwn(user.companyId, id, { anyState: true });
    // Uc `templates:manage` (satinalma Kalem Katalogu) VEYA `sell:product:manage`
    // kabul eder (derin denetim S066). Vitrine dokunmus bir urun (yayinda /
    // onayda / onayli / reddedilmis) yalniz satis izniyle arsivlenir: satinalma
    // tarafi katalogu temizlerken yayindaki vitrini dusurmemeli.
    this.assertCanTouchShowcase(user, before);
    // Ücretsiz paket tavanı ARŞİVDEN GERİ ALMADA da geçerli (denetim 2026-09-06
    // #2): arşivlenen ürün isPublic'i korur; tavan yalnız publish'te olsaydı
    // "10 yayımla → arşivle → 10 daha → geri al" 20 yayında ürün üretirdi.
    // Moderasyonla (2026-09-09) tavan "yayında + onay bekleyen" — `publish`
    // kapısıyla AYNI sayım; yalnız isPublic sayılsaydı 10 kuyruktaki + arşivden
    // dönen public ürün tavanı aşardı.
    //
    // Sayım ve geri alma `publish` ile AYNI advisory kilitte (arayüz testi
    // FX-00 O-070): eşzamanlı geri almalar eskiden ikisi de "yer var" görüp
    // tavanı aşıyordu (47/50 + 5 paralel → 52/50). Kilit altında arşivde mi
    // diye de yeniden okunur — zaten geri alınmış kayıt yeniden sayılmaz.
    const limit = PRODUCT_LIMITS[user.tier as TierName] ?? null;
    const gated =
      isActive && limit != null && (before.isPublic || before.reviewStatus === "PENDING");
    const row = gated
      ? await this.withCompanyItemLock(user.companyId, async (tx) => {
          const fresh = await tx.companyItem.findUnique({
            where: { id },
            select: { isActive: true },
          });
          if (fresh && !fresh.isActive) {
            const occupied = await tx.companyItem.count({
              where: {
                companyId: user.companyId,
                isActive: true,
                OR: [{ isPublic: true }, { reviewStatus: "PENDING" }],
              },
            });
            if (occupied >= limit) {
              throw entitlementForbidden(user.companyVerificationStatus, {
                key: "api.companyItems.urunTavaniGeriAlDogrulama",
                params: { limit: limit },
              });
            }
          }
          return tx.companyItem.update({ where: { id }, data: { isActive } });
        })
      : await this.prisma.companyItem.update({
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
    if (!listing) throw new NotFoundException(i18nMessage("api.companyItems.ilanBulunamadi"));
    const source = listing.items;
    if (source.length === 0) {
      return { added: 0, skipped: 0, truncated: 0 };
    }
    const importCategoryId = visibleCategoryIds(listing.categoryIds)[0] ?? null;
    // Okuma, tavan ve yazma TEK kilitte (arayüz testi FX-00 O-061): çift tık
    // iki isteği de boş kataloğu okuyup kalemleri iki kez yazıyordu (malzeme
    // kodu olmayan kalemi tekil anahtar korumuyor); eşzamanlı içe aktarmalar
    // 5000 tavanını da aşabiliyordu.
    const { toCreate, skipped, truncated } = await this.withCompanyItemLock(user.companyId, async (tx) => {
      const existing = await tx.companyItem.findMany({
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
          // Katlanmış arama metni (ad) — `create` ile aynı gerekçe.
          searchText: nameKey,
          description: it.description,
          unit: it.unit,
          // Tanınmazsa NULL — "PCE" varsaymak sessizce YANLIŞ birim üretirdi
          // (denetimin peşine düştüğü sınıf: uydurma varsayılan).
          unitCode: it.unitCode ?? normalizeUnit(it.unit),
          // İlanın ilk kategorisi makul bir varsayılan; kullanıcı düzeltebilir.
          // First VISIBLE one: a legacy request under a hidden segment must
          // not seed NEW catalogue items with its hidden code.
          categoryId: importCategoryId,
          targetPrice: it.targetPrice,
        });
      }
      // Tavan TEKİLLEŞTİRMEDEN SONRA (D-248): zaten katalogda olanlar yer tutmaz;
      // kesilen yeni kalem sayısı `truncated` ile döner (sessiz kayıp yok).
      const truncated = Math.max(0, toCreate.length - MAX_LISTING_IMPORT);
      if (truncated > 0) toCreate.length = MAX_LISTING_IMPORT;
      await this.assertCapacity(user.companyId, toCreate.length, tx);
      if (toCreate.length > 0) {
        await tx.companyItem.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
      }
      return { toCreate, skipped, truncated };
    });
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
      truncated,
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

  /**
   * PANEL "ÜRÜN ARA" — herkese açık `/urunler` ile AYNI süzgeç/sıralama
   * (`common/company/product-index.ts`); tek fark KENDİ ürünlerin hariç.
   * Sayfalı döner; pano şeridi eski `discoverProducts` (dizi) ile devam eder.
   */
  async discoverSearch(
    user: AuthenticatedCompanyUser,
    q: ProductIndexParams & { page?: number; pageSize?: number },
  ) {
    const page = Math.max(1, q.page ?? 1);
    const size = Math.min(Math.max(q.pageSize ?? PRODUCT_PAGE_SIZE, 1), 48);
    // Fiyat süzgecinin para birimi: seçilmediyse FİRMANIN ülkesinden.
    // `category`: a code under a hidden segment (hand-typed or bookmarked
    // `?category=`) behaves as if no category filter was given.
    q = {
      ...q,
      currency: resolveCompanyCurrency(q.currency, user.country),
      category: visibleCategoryId(q.category) ?? undefined,
    };
    const where = productIndexWhere(q, [{ companyId: { notIn: await this.hiddenCompanyIds(user.companyId) } }], {
      employeeValues: await employeeValuesQuery(this.prisma, q.employees),
    });
    const orderBy = productIndexOrderBy(q.sort);
    const skip = (page - 1) * size;
    // ALICIYA GÖRE UYGUNLUK (2026-09-05): sıralama seçilmemişse ("uygunluk")
    // firmanın ALIM kategorileriyle (ana + alt) örtüşen ürünler ÖNCE gelir —
    // "size uygun ürünler" ayrı bir blok değil, listenin varsayılan düzeni.
    // Açık sıralamada (en yeni / fiyat) karışmaz. Sayfalama iki kümenin
    // birleşimi üzerinden: önce eşleşenler tükenir, sonra kalanlar.
    const prefixes = q.sort ? [] : await this.buyerCategoryPrefixes(user.companyId);
    if (prefixes.length === 0) {
      const [total, rows] = await Promise.all([
        this.crossTenant.companyItem.count({ where }),
        this.crossTenant.companyItem.findMany({ where, select: PRODUCT_INDEX_SELECT, orderBy, skip, take: size }),
      ]);
      const items = await attachProductFeatures(this.prisma, rows, rows.map(toProductIndexCard));
      return { items: await this.localizeCards(items, rows), total, page, pageSize: size };
    }
    const matchClause: Prisma.CompanyItemWhereInput = {
      OR: prefixes.map((p) => ({ categoryId: { startsWith: p } })),
    };
    const matchWhere: Prisma.CompanyItemWhereInput = { AND: [where, matchClause] };
    const restWhere: Prisma.CompanyItemWhereInput = { AND: [where, { NOT: matchClause }] };
    const [total, matched] = await Promise.all([
      this.crossTenant.companyItem.count({ where }),
      this.crossTenant.companyItem.count({ where: matchWhere }),
    ]);
    const head =
      skip < matched
        ? await this.crossTenant.companyItem.findMany({
            where: matchWhere,
            select: PRODUCT_INDEX_SELECT,
            orderBy,
            skip,
            take: Math.min(size, matched - skip),
          })
        : [];
    const need = size - head.length;
    const tail =
      need > 0
        ? await this.crossTenant.companyItem.findMany({
            where: restWhere,
            select: PRODUCT_INDEX_SELECT,
            orderBy,
            skip: Math.max(0, skip - matched),
            take: need,
          })
        : [];
    const rows = [...head, ...tail];
    const cards = [
      ...head.map((r) => ({ ...toProductIndexCard(r), matchesProfile: true })),
      ...tail.map((r) => ({ ...toProductIndexCard(r), matchesProfile: false })),
    ];
    return { items: await this.localizeCards(await attachProductFeatures(this.prisma, rows, cards), rows), total, page, pageSize: size };
  }

  /** Firmanın ALIM kategorileri (L1 ana + L2-4 alt) → kod ön ekleri. */
  private async buyerCategoryPrefixes(companyId: string): Promise<string[]> {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { buyerCategoryIds: true, buyerSubCategoryIds: true },
    });
    const codes = [...(c?.buyerCategoryIds ?? []), ...(c?.buyerSubCategoryIds ?? [])];
    return [...new Set(codes.map((k) => categoryPrefix(k)).filter((p): p is string => !!p))].slice(0, 60);
  }

  /**
   * Ürün dizini süzgeç sayaçları — public `/urunler` ile AYNI bağlama duyarlı
   * sayım (`contextualFacetCounts`), tek fark kendi ürünlerin hariç.
   *
   * Nitelik facet'i ve alt kırılım da tek kaynaktan (`product-index.ts`):
   * buradaki kopya nitelik tipini "SELECT"/"MULTISELECT" diye yazıyordu,
   * Prisma enum'ı ise SINGLE_SELECT/MULTI_SELECT — hiç eşleşmediği için
   * panelin nitelik süzgeci sessizce HEP boş dönüyordu.
   */
  async discoverFacets(user: AuthenticatedCompanyUser, q: ProductIndexParams = {}) {
    // Histogram firmanın para biriminde (seçilmediyse ülkesinden) — liste
    // ucuyla AYNI çözüm, yoksa sınırlar bir birimde gösterilip ötekinde süzülürdü.
    // `category` under a hidden segment = no category filter (list endpoint
    // does the same): no `selectedCategory` name, no sub-branches, and the
    // counts are those of the unfiltered index.
    q = {
      ...q,
      currency: resolveCompanyCurrency(q.currency, user.country),
      category: visibleCategoryId(q.category) ?? undefined,
    };
    const raw = await this.crossTenant.companyItem.findMany({
      where: {
        ...publicProductWhere(),
        companyId: { notIn: await this.hiddenCompanyIds(user.companyId) },
        ...(q.q ? { AND: productSearchClauses(q.q) } : {}),
      },
      select: {
        categoryId: true,
        priceMode: true,
        attributes: true,
        moq: true,
        priceAmount: true,
        priceAmountBase: true,
        company: {
          select: {
            city: true,
            cityId: true,
            country: true,
            activities: true,
            companyVerificationStatus: true,
            certifications: true,
            employeeCount: true,
            medianReplyHours: true,
          },
        },
      },
      take: PRODUCT_FACET_SCAN_CAP + 1,
    });
    // Tavan aşıldı mı GERÇEKTEN ölçülür: eskiden `truncated: false` sabitti,
    // tam 5000'de sessizce eksik sayıyordu (public uç dürüst davranıyordu).
    const truncated = raw.length > PRODUCT_FACET_SCAN_CAP;
    const rows = truncated ? raw.slice(0, PRODUCT_FACET_SCAN_CAP) : raw;
    const prefix = q.category ? categoryPrefix(q.category) : null;
    const inCategory = prefix ? rows.filter((r) => (r.categoryId ?? "").startsWith(prefix)) : rows;
    const ctx = contextualFacetCounts(inCategory.map(toFacetRow), q);
    const catCounts = contextualFacetCounts(rows.map(toFacetRow), q).categories;
    const subCounts = subCategoryCounts(inCategory, q.category);
    /* SEÇİLİ KATEGORİ HER ZAMAN ÇÖZÜLÜR (2026-09-08, kullanıcı bulgusu):
       süzgeç çipi ve kategori sayfasının başlığı adı `categories` listesinde
       arıyordu; o liste yalnız L1 segmentleri ve YALNIZ ürünü olanları
       taşıyor. Sonuç: ürünü olmayan bir dal seçilince çipte ham kod
       ("45000000") yazıyor, L3 kategori sayfasında başlık iskelet olarak
       kalıyordu. Ad artık ayrı bir alanda döner — `categories` listesine
       eklemiyoruz, orası L1 süzgeç seçenekleri (araya L3 girerse süzgeçte
       öksüz bir satır belirirdi). */
    const ids = [
      ...new Set([
        ...catCounts.map(([id]) => id),
        ...subCounts.map(([id]) => id),
        ...(q.category ? [q.category] : []),
      ]),
    ];
    const cats = ids.length
      ? await this.prisma.category.findMany({
          // Names are resolved for visible codes only (single source).
          where: { id: { in: ids }, ...hiddenCategoryWhere() },
          select: { id: true, ...CATEGORY_NAME_SELECT, level: true },
        })
      : [];
    const byId = new Map(cats.map((c) => [c.id, c]));
    const named = (pairs: [string, number][]) =>
      pairs
        .map(([id, count]) => (byId.has(id) ? { id, name: categoryName(byId.get(id)!), level: byId.get(id)!.level, count } : null))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "tr"));
    const selected = q.category ? byId.get(q.category) : undefined;
    return {
      categories: named(catCounts),
      /** Seçili kategorinin bir alt seviyesi — kategori sayfasının çipleri. */
      subCategories: named(subCounts),
      /** Seçili kategorinin kendisi (ürünü olmasa da) — çip ve sayfa başlığı. */
      selectedCategory: selected
        ? { id: selected.id, name: categoryName(selected), level: selected.level }
        : null,
      cities: ctx.cities,
      // Satıcı ülkesi sayaçları (derin denetim MU-10: hesaplanıp düşüyordu).
      countries: ctx.countries,
      activities: ctx.activities,
      verified: ctx.verified,
      fastReply: ctx.fastReply,
      price: ctx.price,
      certifications: ctx.certifications,
      employees: ctx.employees,
      moq: ctx.moq,
      /** Histogramın (ve süzgeç sınırlarının) para birimi. */
      currency: q.currency,
      priceHistogram: ctx.priceHistogram,
      attributes: await attributeFacets(this.prisma, q.category, inCategory),
      truncated,
    };
  }

  /**
   * PANEL İÇİ ÜRÜN SAYFASI — ÜYE katmanı (görünürlük katmanı, 2026-09-04).
   *
   * Herkese açık uç (`public/companies/:slug/products/:slug`) artık fiyat,
   * kademe tablosu ve MOQ döndürmüyor — anonim ziyaretçi "Fiyat için giriş
   * yapın" görür. Panel eskiden AYNI ucu okuyordu; bu uç olmasaydı üye de
   * fiyatı kaybederdi. Kapı (`publicProductWhere` + firma profil kapısı)
   * public uçla AYNI kaynak: panelde görünen ürün profilde de var.
   */
  async discoverProduct(
    user: AuthenticatedCompanyUser,
    companySlug: string,
    productSlug: string,
  ) {
    const company = await this.prisma.company.findUnique({
      where: { slug: companySlug },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        country: true,
        logoUrl: true,
        industry: true,
        activities: true,
        website: true,
        publicEnabled: true,
        isActive: true,
        isBlocked: true,
        tier: true,
        membershipEndAt: true,
        companyVerificationStatus: true,
        /* Satıcı paneli (PROMPT 7) — public sayfayla AYNI alanlar. */
        foundedYear: true,
        employeeCount: true,
        certifications: true,
      },
    });
    if (!company || !hasPublicProfile(company)) {
      throw new NotFoundException(i18nMessage("api.companyItems.urunBulunamadi"));
    }
    // Engel karşılıklı görünmezliktir — panel firma profiliyle (`getProfile`)
    // AYNI kural: engel ilişkisindeki firmanın ürün sayfası panelde 404
    // (derin denetim LU-08; eskiden açılıp kimlikli ziyaret de yazıyordu).
    if (company.id !== user.companyId) {
      const block = await this.crossTenant.companyBlock.findFirst({
        where: {
          OR: [
            { blockerCompanyId: user.companyId, blockedCompanyId: company.id },
            { blockerCompanyId: company.id, blockedCompanyId: user.companyId },
          ],
        },
        select: { id: true },
      });
      if (block) throw new NotFoundException(i18nMessage("api.companyItems.urunBulunamadi"));
    }
    const row = await this.crossTenant.companyItem.findFirst({
      where: {
        ...publicProductWhere(),
        companyId: company.id,
        slug: productSlug,
      },
      select: {
        ...PUBLIC_PRODUCT_SELECT,
        id: true,
        priceAmount: true,
        priceTiers: true,
        priceCurrency: true,
        moq: true,
      },
    });
    if (!row) throw new NotFoundException(i18nMessage("api.companyItems.urunBulunamadi"));
    /* KATEGORİ ADI da çözülür (2026-09-08, kullanıcı bulgusu: "burada
       hangi kategori olduğunu göstermiyor"). Herkese açık uç bunu zaten
       döndürüyordu; panel ucu yalnız `categoryId` veriyordu, dolayısıyla
       panelde kırıntının kategori adımı ve başlığın üstündeki kategori hapı
       HİÇ çizilmiyordu — aynı gövde, iki yüzeyde farklı görünüyordu. */
    // HIDDEN SEGMENTS (owner rule 2026-10-09): a legacy product keeps its
    // stored category, but a category under a hidden segment is shown to
    // nobody - no name, no breadcrumb step, no pill, no raw code. Attribute
    // labels still come from the stored category (product data, not the
    // category itself).
    const shownCategoryId = visibleCategoryId(row.categoryId);
    const [attributeDefs, category] = await Promise.all([
      resolveCategoryAttributes(this.prisma, row.categoryId),
      shownCategoryId
        ? this.prisma.category.findUnique({
            where: { id: shownCategoryId },
            select: { id: true, ...CATEGORY_NAME_SELECT },
          })
        : null,
    ]);
    // Ziyaret Edenler: üye ürünü açtı — kimlikli görüntülenme (fire-and-forget).
    void this.views?.recordPanelView(user, { companyId: company.id, productId: row.id });
    const product = {
      ...toPublicProduct(row),
      categoryId: shownCategoryId,
      attributeList: labelAttributes(row.attributes, attributeDefs),
        category: category ? { id: category.id, name: categoryName(category) } : null,
        priceAmount: row.priceAmount?.toString() ?? null,
        priceTiers: row.priceTiers as unknown,
        priceCurrency: row.priceCurrency,
        moq: row.moq?.toString() ?? null,
    };
    // i18n Faz 1e: başkasının ürünü okuyucunun dilinde (ad, açıklama, anahtar kelime, nitelikler).
    const [localizedProduct] = this.translations
      ? await this.translations.localizeProducts([product], [row.id], currentLocale())
      : [product];
    const sellerCard = {
        name: company.name,
        slug: company.slug,
        city: company.city,
        country: company.country,
        logoUrl: company.logoUrl,
        industry: company.industry,
        activities: company.activities,
        verified: company.companyVerificationStatus === "VERIFIED",
        // Ücretsiz satıcı (2026-09-06): alıcıya gönderim anında dürüst not —
        // "soruyu görür, yanıtlamak için Silver'a geçmesi gerekir".
        freeMember: !tierAtLeast(effectiveTier(company.tier, company.membershipEndAt, company.companyVerificationStatus), PAID_TIER),
        // Ücretsiz dönemde paket alanı yanıta YAZILMAZ (sayfa kaynağında da paket adı olmasın, 2026-10-07).
        ...(isFreePeriod()
          ? {}
          : { gold: effectiveTier(company.tier, company.membershipEndAt, company.companyVerificationStatus) === "GOLD" }),
        foundedYear: company.foundedYear,
        employeeCount: company.employeeCount,
        certifications: company.certifications.slice(0, 4),
        // Üye katmanı: web sitesi bağlantısı (public sayfada kapılı).
        website: company.website,
    };
    const [seller] = this.translations
      ? await this.translations.localizeIndustry([sellerCard], [company.id], currentLocale())
      : [sellerCard];
    return { product: localizedProduct, company: seller };
  }

  /**
   * PANEL İÇİ ÜRÜN KEŞFİ — alıcı panelinin keşif şeridi (Faz C).
   *
   * Kapı `publicProductWhere()` TEK KAYNAĞINDAN gelir; panele özel gevşek bir
   * kural yazmadım çünkü iki kapı zamanla ayrışır ve "panelde görünen ama
   * profilinde 404 veren ürün" üretir. Tek fark: KENDİ ürünlerin hariç —
   * kendi vitrinini keşif şeridinde görmek gürültü.
   *
   * Kimlik AÇIK: panelde firma adı zaten görünür (dizin de öyle). İlan
   * anonimliği yalnız herkese açık sayfalarda geçerli — orada "kim alıyor"
   * rekabet istihbaratı, burada ise karşı taraf zaten üye.
   */
  async discoverProducts(
    user: AuthenticatedCompanyUser,
    opts: { q?: string; category?: string; limit?: number } = {},
  ): Promise<DiscoverProductRow[]> {
    const take = Math.min(Math.max(opts.limit ?? 12, 1), 48);
    const tokens = opts.q ? tokenizeQuery(opts.q) : [];
    // A code under a hidden segment is not a filter (owner rule 2026-10-09).
    const category = visibleCategoryId(opts.category);
    const rows = await this.crossTenant.companyItem.findMany({
      where: {
        ...publicProductWhere(),
        companyId: { notIn: await this.hiddenCompanyIds(user.companyId) },
        ...(category && isCategoryCode(category)
          ? { categoryId: { startsWith: categoryPrefix(category) as string } }
          : {}),
        ...(tokens.length
          ? // Joker yok (`likeLiteral`) — ürün dizini `productSearchClauses` ile aynı kural.
            { AND: tokens.map((t) => ({ searchText: { contains: likeLiteral(foldSearchText(t)) } })) }
          : {}),
      },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        images: true,
        unit: true,
        categoryId: true,
        priceMode: true,
        priceAmount: true,
        priceTiers: true,
        priceCurrency: true,
        moq: true,
        company: {
          select: {
            name: true,
            slug: true,
            city: true,
            companyVerificationStatus: true,
            activities: true,
          },
        },
      },
      orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
      take,
    });
    // i18n Faz 1e: keşif şeridi kartları okuyucunun dilinde (ad + özet).
    const localized: ((typeof rows)[number] & { translatedFrom?: string | null })[] = this.translations
      ? await this.translations.localizeProducts(rows, rows.map((r) => r.id), currentLocale())
      : rows;
    return localized.map((r) => {
      const flat = (r.description ?? "").replace(/\s+/g, " ").trim();
      return {
        slug: r.slug ?? "",
        name: r.name,
        translatedFrom: r.translatedFrom ?? null,
        excerpt: flat ? (flat.length <= 140 ? flat : `${flat.slice(0, 139)}…`) : null,
        images: r.images,
        unit: r.unit,
        // Display-only on the card (tone / photo): hidden code is not sent.
        categoryId: visibleCategoryId(r.categoryId),
        priceMode: r.priceMode,
        priceAmount: r.priceAmount?.toString() ?? null,
        priceTiers: r.priceTiers,
        priceCurrency: r.priceCurrency,
        moq: r.moq?.toString() ?? null,
        company: {
          name: r.company.name,
          slug: r.company.slug ?? "",
          city: r.company.city,
          verified: r.company.companyVerificationStatus === "VERIFIED",
          activities: r.company.activities,
        },
      };
    });
  }

  /**
   * Panel ürün listelerinde gösterilmeyecek firmalar: kendisi + herhangi yönde
   * engel ilişkisi olanlar (derin denetim LU-08 artığı). Engel karşılıklı
   * görünmezliktir — ürün sayfası (`discoverProduct`) zaten 404 veriyordu,
   * ama arama, facet sayaçları ve keşif şeridi engelli firmanın ürünlerini
   * listelemeye devam ediyordu. Kural `CompanyBlocksService.blockedCompanyIds`
   * ile aynı; çapraz-firma okuma olduğu için `crossTenant`.
   */
  private async hiddenCompanyIds(companyId: string): Promise<string[]> {
    const rows = await this.crossTenant.companyBlock.findMany({
      where: { OR: [{ blockerCompanyId: companyId }, { blockedCompanyId: companyId }] },
      select: { blockerCompanyId: true, blockedCompanyId: true },
    });
    const ids = new Set<string>([companyId]);
    for (const r of rows) ids.add(r.blockerCompanyId === companyId ? r.blockedCompanyId : r.blockerCompanyId);
    return [...ids];
  }

  /** i18n Faz 1e: başka firmanın ürün kartları okuyucunun dilinde (ad, özet, özellik satırları). */
  private async localizeCards<T extends { name: string }>(cards: T[], rows: { id: string }[]): Promise<T[]> {
    if (!this.translations) return cards;
    return this.translations.localizeProducts(cards, rows.map((r) => r.id), currentLocale());
  }

  // ── yardımcılar ─────────────────────────────────────────────────────────

  /**
   * İNCELEME KİLİDİ (2026-09-10, kullanıcı kararı): onaya gönderilen ürün
   * (PENDING) admin karar verene dek DEĞİŞTİRİLEMEZ — firma yalnız önizler.
   * Tek çıkış: admin onaylar (APPROVED) ya da gerekçeyle düzeltmeye gönderir
   * (REJECTED) → firma düzenler → yeniden gönderir. Firmanın kendi kendine
   * geri çekmesi bilinçli YOK. Yayındaki ürünü vitrinden çekmek (`unpublish`)
   * ve arşivlemek içerik değişikliği değildir, serbest.
   */
  private assertNotInReview(row: { reviewStatus: ProductReviewStatus }) {
    if (row.reviewStatus === "PENDING") {
      throw new ConflictException(i18nMessage("api.companyItems.urunIncelemedeEkibimizOnaylayanaYaDa", undefined, "PRODUCT_IN_REVIEW"));
    }
  }

  /** Vitrin alanlarını OKUR (önizleme / düzenleyici açılışı). `updateShowcase` ile AYNI projeksiyon. */
  async getShowcase(user: AuthenticatedCompanyUser, id: string) {
    const row = await this.requireOwn(user.companyId, id);
    return this.serializeShowcase(row);
  }

  private async requireOwn(
    companyId: string,
    id: string,
    opts: { anyState?: boolean } = {},
  ) {
    const row = await this.prisma.companyItem.findFirst({
      where: { id, companyId, ...(opts.anyState ? {} : { isActive: true }) },
    });
    if (!row) throw new NotFoundException(i18nMessage("api.companyItems.katalogKalemiBulunamadi"));
    return row;
  }

  /* ================================================================== */
  /* VİTRİN (Faz 2) — kalemi herkese açık ÜRÜNE çeviren katman             */
  /* ================================================================== */

  /**
   * Bir kategorinin ETKİN nitelik seti — ata zincirinden miras.
   * Mantık `common/company/category-attributes.ts`de TEK KAYNAK; herkese açık
   * ürün sayfası da aynı çözümleyiciden okuyor (panelde sorulan nitelik ile
   * vitrinde gösterilen etiket ayrışmasın).
   *
   * THE ATTRIBUTE FORM OF A HIDDEN CATEGORY IS NOT OFFERED (live re-check
   * 2026-10-09, CP-01). This is the resolver of the FORM: `GET
   * company/items/attributes/:categoryId`, the owner's showcase answer
   * (`attributeDefs`, the "required attributes" step) and the save path. A
   * steel pipe stored under a hidden segment was offered "live animal / feed /
   * fertilizer" fields, and the answer carried the hidden segment's code in
   * `definedAt`. For a category under a hidden segment the form has no
   * fields - the same answer as for a product without a category.
   *
   * The stored attribute VALUES of a legacy product stay (`normalizeShowcase`),
   * and the pages that only LABEL stored values keep reading the raw resolver
   * (`resolveCategoryAttributes`: public and panel product page).
   */
  async resolveAttributes(categoryId: string | null | undefined) {
    return resolveCategoryAttributes(this.prisma, visibleCategoryId(categoryId));
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

  async requestDocumentUpload(companyId: string, fileName: string, mimeType: string) {
    return requestPublicDocumentUpload(this.storage, companyId, fileName, mimeType);
  }

  async resolveDocument(companyId: string, key: string) {
    return resolvePublicDocument(this.storage, companyId, key);
  }

  /** Ürünün vitrin alanlarını günceller (görsel, fiyat, nitelik, etiket…). */
  async updateShowcase(
    user: AuthenticatedCompanyUser,
    id: string,
    input: ShowcaseInput,
  ) {
    const before = await this.requireOwn(user.companyId, id);
    this.assertNotInReview(before);
    await this.assertCategoryAllowed(input.categoryId, before.categoryId);
    // Belge (PDF) ve video PAKETLİ özellik (`PRODUCT_MEDIA_TIER`, 2026-09-06).
    // Ücretsiz firmada bu iki alan DOKUNULMADAN kalır: yeni eklenemez (yükleme
    // ucu da paket kapılı), paketi biten firmanın mevcut belgesi de kaydetme
    // sırasında sessizce silinmez — fail-closed ama yıkıcı değil. Web formu
    // alanları hiç çizmez.
    const mediaAllowed = tierAtLeast(user.tier, PRODUCT_MEDIA_TIER);
    // KISMİ PATCH (2026-09-19): gönderilmeyen alan mevcut değeriyle kalır —
    // eskiden yalnız açıklama gönderen istek görsel/anahtar/nitelik/fiyatı
    // siliyordu. Tek kaynak `showcase-merge.ts`.
    const merged = mergeShowcaseInput(before, input);
    this.assertShowcaseLinks(before, merged, mediaAllowed);
    const patch = await this.normalizeShowcase(
      before,
      mediaAllowed
        ? merged
        : {
            ...merged,
            videoUrl: before.videoUrl,
            documents: (before.documents as unknown as { url: string; title: string }[] | null) ?? null,
          },
    );
    // MODERASYON (2026-09-09): yayındaki ürünün İÇERİK alanları değişince
    // yeniden inceleme kuyruğuna girer ama vitrinde KALIR (yazım hatası
    // düzeltmek satıcıyı vitrinden düşürmesin); admin reddederse çekilir.
    // Fiyat/MOQ/doküman/video/bağlantı içerik sayılmaz.
    // Karşılaştırma kanonik (2026-09-19): eski JSON.stringify eşitliği DbNull
    // ve boş açıklamada yanlış pozitif veriyordu → değişmeyen kayıt bile
    // yeniden incelemeye düşüyordu. Tek kaynak `product-content-diff.ts`.
    // Yalnız VİTRİNDEKİ onaylı ürün yeniden incelemeye girer (O-009; `update`
    // ile aynı gerekçe — taslağa çekilmiş onaylı ürün taslak gibi kaydedilir).
    const contentChanged =
      before.isPublic && before.reviewStatus === "APPROVED" && showcaseContentChanged(before, patch);
    // YAYIN KAPISI (arayüz testi O-009): birleşik sonuç `publish` kapısından
    // geçmeli; taslak serbest.
    if (before.isPublic) {
      this.assertStaysPublishable(
        before,
        this.toProductLike({
          ...before,
          ...patch,
          // No `attributes` in the patch = the stored values stay (legacy
          // product under a hidden category, see `normalizeShowcase`).
          attributes:
            patch.attributes === undefined
              ? before.attributes
              : patch.attributes === Prisma.DbNull
                ? null
                : (patch.attributes as Prisma.JsonValue),
          priceTiers: patch.priceTiers === Prisma.DbNull ? null : (patch.priceTiers as Prisma.JsonValue),
        }),
        contentChanged,
      );
    }
    const row = await this.prisma.companyItem
      .update({
        where: { id },
        data: contentChanged ? { ...patch, reviewStatus: "PENDING", submittedAt: new Date(), rejectReason: null } : patch,
      })
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
    // Yayındaki ürünün sayfası değişti → motorlar ve web önbelleği. Taslakta
    // herkese açık adres yok; bildirim gereksiz.
    if (row.isPublic) this.seo?.productChanged(id);
    // Vitrindeki ya da onay bekleyen ürünün içeriği değişti → yeniden çeviri
    // (kaynak aynıysa işlem yok). Taslak çevrilmez: yalnız sahibi görür.
    if (row.isPublic || row.reviewStatus === "PENDING") void this.translations?.enqueue("PRODUCT", id);
    return this.serializeShowcase(row);
  }

  /**
   * ÜRÜN OLUŞTUR — tek çağrı (2026-09-03).
   *
   * "Ürün ekleme ilan açmaya benzemesin" (kullanıcı kararı): ilan bir sihirbaz
   * akışıdır (adımlar, miktar, teslim, kapanış), ürün ise TEK SAYFA bir
   * vitrin kaydıdır. Bu yüzden önce "kalem aç" sonra "vitrini doldur" diye iki
   * adıma bölmüyoruz — form bir kez gönderilir, kayıt bir kez oluşur.
   *
   * Ürün TASLAK doğar; yayımlamak ayrı ve bilinçli bir adım (`publish`).
   */
  async createProduct(user: AuthenticatedCompanyUser, input: ShowcaseInput & { unit?: string; unitCode?: string }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException(i18nMessage("api.companyItems.urunAdiZorunlu"));
    // Bağlantı kuralları kayıt AÇILMADAN (`updateShowcase` aynı denetimi yapar,
    // ama orada atılan 400 yetim taslak bırakır, yeniden deneme mükerrer
    // korumasına — DUPLICATE_PRODUCT — takılırdı).
    this.assertShowcaseLinks({ videoUrl: null, externalUrl: null }, input, tierAtLeast(user.tier, PRODUCT_MEDIA_TIER));
    // Category gate BEFORE the record is opened, for the same reason.
    await this.assertCategoryAllowed(input.categoryId, null);
    const base = this.normalize({
      name,
      unit: input.unit ?? "adet",
      unitCode: input.unitCode,
    });
    // Para birimi verilmediyse FİRMANIN ülkesinden (2026-09-27): yabancı
    // satıcının ürünü TRY ile doğmasın.
    const fallbackCurrency = defaultCurrencyForCountry(user.country);
    // Tavan + mükerrer denetimi + oluşturma aynı kilitte (arayüz testi FX-00
    // O-006): aynı kişinin az önce aynı adla açtığı taslak varsa ikinci kayıt
    // açılmaz (çift tık iki taslak / iki onay kuyruğu girdisi üretiyordu).
    const created = await this.withCompanyItemLock(user.companyId, async (tx) => {
      await this.assertCapacity(user.companyId, 1, tx);
      const duplicate = await tx.companyItem.findFirst({
        where: {
          companyId: user.companyId,
          createdById: user.userId,
          name: base.name,
          // "Onaya gönder" çift tıkında ilk kayıt bu arada PENDING'e geçmiş
          // olabilir — ikisi de mükerrer sayılır.
          reviewStatus: { in: ["DRAFT", "PENDING"] },
          createdAt: { gte: new Date(Date.now() - PRODUCT_DUPLICATE_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          i18nMessage("api.companyItems.ayniUrunAzOnceOlusturuldu", undefined, "DUPLICATE_PRODUCT"),
        );
      }
      return tx.companyItem.create({
        data: {
          ...base,
          priceCurrency: (isCurrencyCode(input.priceCurrency) ? input.priceCurrency : fallbackCurrency) as Currency,
          companyId: user.companyId,
          createdById: user.userId,
        },
      });
    }).catch((e: unknown) => {
      throw this.mapDuplicate(e, base.code);
    });
    // Vitrin alanları AYNI normalizasyondan geçer — iki yazma yolu olsaydı
    // biri nitelik süzgecini ya da searchText'i kaçırırdı.
    return this.updateShowcase(user, created.id, input);
  }

  /**
   * Vitrine çıkar. Kapı `productPublishBlockers` — TEK KAYNAK; skor kapı
   * DEĞİL (gerekçe o dosyada).
   */
  /**
   * ONAYA GÖNDER (2026-09-09, kullanıcı kararı: her ürün admin onayından
   * geçer). Yayın kapısı + paket tavanı burada; `isPublic` YALNIZ admin
   * `approve` ile true olur (`AdminProductsService`). Yayındaki (APPROVED)
   * ürün için çağrı = içerik güncellemesi sonrası yeniden inceleme; ürün
   * vitrinde KALIR.
   */
  async publish(user: AuthenticatedCompanyUser, id: string) {
    const row = await this.requireOwn(user.companyId, id);
    this.assertNotInReview(row);
    this.assertPublishable(productPublishBlockerCodes(this.publishGateLike(row)), this.hasOutdatedCategory(row));
    // Ücretsiz pakette YAYINDA + ONAY BEKLEYEN ürün tavanı (`PRODUCT_LIMITS`,
    // 2026-09-06). Zaten yayında/bekleyen ürünü yeniden göndermek sayılmaz;
    // taslak sınırsız — kapı yalnız kuyruğa GİRİŞ anında.
    const limit = PRODUCT_LIMITS[user.tier as TierName] ?? null;
    const countsAgainstLimit =
      limit != null && !row.isPublic && row.reviewStatus !== "PENDING";
    /**
     * TAVAN SAYIMI VE YAZMA AYNI İŞLEMDE (2026-09-12).
     *
     * Eskiden `count()` ve `update()` ayrıydı: aynı anda gelen iki "onaya
     * gönder" isteği de 9 sayıp ikisi de geçiyordu (TOCTOU) → ücretsiz pakette
     * 11 ürün kuyruğa girebiliyordu. Firma bazlı **işlem düzeyi** advisory
     * lock ile sıraya alınır; işlem bitince otomatik bırakılır (PgBouncer
     * işlem havuzuyla uyumlu — oturum düzeyi kilit orada güvenli değildi).
     */
    // Kilit artık HER gönderimde alınır ve slug kilit altında seçilir (arayüz
    // testi FX-00 O-006): aynı adlı iki ürün eşzamanlı gönderilince ikisi de
    // aynı boş slug'ı seçip tekil kısıtı bozuyor, biri ham 500 alıyordu; aynı
    // ürünün çift gönderimi de kilit altında yeniden okunup 409 alır.
    const { updated, slug } = await runTenantTx(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.companyId}))`;
      const fresh = await tx.companyItem.findUnique({
        where: { id },
        select: { reviewStatus: true },
      });
      if (fresh) this.assertNotInReview(fresh);
      const slug = await this.ensureSlug(user.companyId, id, row.name, row.slug, tx);
      if (countsAgainstLimit) {
        const occupied = await tx.companyItem.count({
          where: {
            companyId: user.companyId,
            isActive: true,
            OR: [{ isPublic: true }, { reviewStatus: "PENDING" }],
          },
        });
        if (occupied >= limit) {
          throw entitlementForbidden(user.companyVerificationStatus, {
            key: "api.companyItems.urunTavaniDogrulama",
            params: { limit: limit },
          });
        }
      }
      const updated = await tx.companyItem.update({
        where: { id },
        data: {
          slug,
          reviewStatus: "PENDING",
          submittedAt: new Date(),
          rejectReason: null,
        },
      });
      return { updated, slug };
    });
    void this.audit.log({
      action: "company.product.submitted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_item",
      entityId: id,
      metadata: { name: updated.name, slug, wasPublic: row.isPublic },
    });
    // Onaya gönderilen ürün ŞİMDİ çevrilir: admin onayladığı an EN/RU sayfa
    // çevrilmiş içerikle yayına çıkar (onayda çevirmek birkaç dakikalık
    // Türkçe-içerikli EN sayfa penceresi açıyordu). Onaydaki enqueue kaynak
    // aynıysa işlem yapmaz.
    void this.translations?.enqueue("PRODUCT", id);
    return this.serializeShowcase(updated);
  }

  /** Vitrinden çeker. Kayıt SİLİNMEZ; slug korunur (geri açılınca aynı URL). */
  async unpublish(user: AuthenticatedCompanyUser, id: string) {
    await this.requireOwn(user.companyId, id);
    const updated = await this.prisma.companyItem.update({
      where: { id },
      // Vitrinden çekilen ürün TASLAĞA döner: yeniden çıkmak yeniden onay
      // ister (moderasyon kararı 2026-09-09). Bekleyen inceleme de düşer.
      data: { isPublic: false, reviewStatus: "DRAFT", submittedAt: null },
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
    this.seo?.productChanged(id);
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
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    if (current) return current;
    // Çeviriyazısı olmayan ad (Çince, Arapça …) boş slug üretir → Türkçe
    // "urun" yerine kayıt kimliğine düş: dilden bağımsız ve zaten tekil.
    const base = slugifyText(name) || `product-${id.slice(-8).toLowerCase()}`;
    return pickFreeSlug(base, async (candidates) => {
      const rows = await db.companyItem.findMany({
        where: { companyId, slug: { in: candidates }, NOT: { id } },
        select: { slug: true },
      });
      return rows.map((r) => r.slug).filter((s): s is string => !!s);
    });
  }

  /**
   * BAĞLANTI KURALLARI (arayüz testi Y-11, gözden geçirme): video İZİNLİ
   * LİSTEDE (YouTube/Vimeo — web yalnız bunları gömer, `productVideoEmbedUrl`),
   * dış bağlantı yalnız https (`isHttpsUrl`). Denetim YALNIZ DEĞİŞEN değerde:
   * kural öncesinden kalmış eski değer (http://, şemasız adres, Dailymotion)
   * dokunulmadıkça kaydı düşürmez — form her kayıtta iki alanı da geri
   * gönderiyor; DTO'daki eski denetim satıcıyı ürününü (fiyat, açıklama…)
   * hiç kaydedemez hâle getiriyordu. Video paketin altındaysa (Silver altı)
   * alan zaten yazılmaz (`before.videoUrl` korunur) — denetlenmez.
   */
  private assertShowcaseLinks(
    before: { videoUrl: string | null; externalUrl: string | null },
    next: { videoUrl?: string | null; externalUrl?: string | null },
    mediaAllowed: boolean,
  ) {
    const changed = (a: string | null | undefined, b: string | null | undefined) => {
      const v = a?.trim() || null;
      return v !== null && v !== (b?.trim() || null) ? v : null;
    };
    const video = mediaAllowed ? changed(next.videoUrl, before.videoUrl) : null;
    if (video && productVideoEmbedUrl(video) === null) {
      throw new BadRequestException(i18nMessage("api.dto.companyItems.gecersizVideoBaglantisi"));
    }
    const external = changed(next.externalUrl, before.externalUrl);
    if (external && !isHttpsUrl(external)) {
      throw new BadRequestException(i18nMessage("api.dto.companyItems.gecersizDisBaglanti"));
    }
  }

  private async normalizeShowcase(
    before: { categoryId: string | null; name?: string; brand?: string | null; mpn?: string | null; priceCurrency?: string | null },
    input: ShowcaseInput,
  ) {
    const images = (input.images ?? []).map((u) => u.trim()).filter(Boolean);
    const keywords = [
      ...new Set((input.keywords ?? []).map((k) => k.trim()).filter(Boolean)),
    ];
    const categoryId = input.categoryId?.trim() || before.categoryId;
    // LEGACY PRODUCT UNDER A HIDDEN CATEGORY (CP-01): the form offers no
    // attribute fields for it (`resolveAttributes` is empty), so it cannot
    // send the stored values back. "No field is defined" must not read as
    // "delete them": the attribute column is left untouched while the product
    // stays under the hidden category. A change to a current category goes
    // through the normal rule below (only keys defined there are kept).
    const keepStoredAttributes = isHiddenCategory(categoryId);

    // Nitelikler: yalnız o kategoride TANIMLI anahtarlar geçer. Tanımsız
    // anahtar sessizce düşer — istemcinin uydurduğu alan veriyi kirletmesin.
    const defs = await this.resolveAttributes(categoryId);
    const allowed = new Set(defs.map((d) => d.key));
    const attributes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input.attributes ?? {})) {
      if (!allowed.has(k) || v == null || v === "") continue;
      if (!isValidAttributeValue(v)) {
        throw new BadRequestException(
          i18nMessage("api.companyItems.nitelikDegeriGecersiz", {
            max: ATTRIBUTE_VALUE_MAX_CHARS,
            items: ATTRIBUTE_LIST_MAX_ITEMS,
          }),
        );
      }
      attributes[k] = v;
    }

    // AD ve AÇIKLAMA da bu yoldan yazılır (2026-09-03). Eskiden ürün formunda
    // ikisi de YOKTU: kullanıcı ≥100 karakter açıklama isteyen yayın kapısını
    // ürün ekranından geçemiyordu — açıklamayı yazacak alan hiçbir yerde
    // görünmüyordu. Tek kayıt, tek form, tek kaydetme yolu.
    const name = input.name?.trim();
    const description =
      input.description === undefined ? undefined : input.description.trim() || null;

    // Birim: kalem yoluyla (`normalize`) AYNI kural — tanınan kodda katalog
    // adına normalize, tanınmayanda serbest metin aynen.
    let unitPatch: { unit: string; unitCode: string | null } | null = null;
    if (input.unit !== undefined || input.unitCode != null) {
      const unit = input.unit?.trim() || "adet";
      const unitCode = input.unitCode ?? normalizeUnit(unit);
      const known = getUnit(unitCode);
      unitPatch = { unit: known?.nameTr ?? unit, unitCode: known ? known.code : null };
    }

    return {
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(unitPatch ?? {}),
      ...(input.categoryId !== undefined ? { categoryId } : {}),
      images,
      keywords,
      // Arama metni ad/marka/mpn/etiketlerden TÜRETİLİR — ad değişince
      // yenilenmezse ürün eski adıyla aranmaya devam ederdi.
      searchText: foldSearchText(
        [name ?? before.name, before.brand, before.mpn, ...keywords]
          .filter(Boolean)
          .join(" "),
      ),
      ...(keepStoredAttributes
        ? {}
        : {
            attributes:
              Object.keys(attributes).length > 0 ? (attributes as Prisma.InputJsonValue) : Prisma.DbNull,
          }),
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
      // TRY karşılığı (ürün dizininin fiyat süzgeci/sıralaması) — yazımda
      // hesaplanır, günlük kur işi tazeler. Tek kural `productPriceBase`.
      priceAmountBase: this.priceBaseOf(input, before.priceCurrency),
      moq: input.moq == null ? null : new Prisma.Decimal(input.moq),
    };
  }

  private priceBaseOf(input: ShowcaseInput, beforeCurrency?: string | null): Prisma.Decimal | null {
    const base = productPriceBase(
      {
        priceMode: input.priceMode ?? "ON_REQUEST",
        priceAmount: input.priceMode === "FIXED" ? input.priceAmount : null,
        priceTiers: input.priceMode === "TIERED" ? input.priceTiers : null,
        priceCurrency: input.priceCurrency ?? beforeCurrency ?? "TRY",
      },
      fxRate,
    );
    return base == null ? null : new Prisma.Decimal(base.toFixed(2));
  }

  /**
   * Yayın kapısı eksiklerinin METNİ — kod paylaşılan paketten, metin
   * katalogdan (`api.companyItems.publishBlocker.<kod>`) ve İSTEK DİLİNDE.
   * Hem 400 gövdesi hem vitrin DTO'sundaki `publishBlockers` buradan geçer;
   * ayrışsalardı ekran bir dilde, hata başka dilde olurdu.
   */
  private publishBlockerTexts(blockers: PublishBlocker[], outdatedCategory = false): string[] {
    return blockers.map((b) =>
      // `outdatedCategory`: the product HAS a stored category, but under a
      // hidden segment - the text asks for a current one instead of saying
      // that none was chosen.
      b.code === "category" && outdatedCategory
        ? tApi("api.companyItems.publishBlocker.categoryNotCurrent")
        : tApi(`api.companyItems.publishBlocker.${b.code}` as "api.companyItems.publishBlocker.name", b.params),
    );
  }

  /** Yayın kapısı eksikleri varsa `publish` ile AYNI 400 (tek metin). */
  private assertPublishable(blockers: PublishBlocker[], outdatedCategory = false) {
    if (blockers.length > 0) {
      throw new BadRequestException(
        i18nMessage("api.companyItems.onayaGonderilemedi", {
          join: this.publishBlockerTexts(blockers, outdatedCategory).join(", "),
        }),
      );
    }
  }

  /**
   * PRODUCT CATEGORY GATE (owner rule 2026-10-09). A NEW or CHANGED category
   * must be an active code of the catalogue that is not under a hidden
   * segment. Before this gate the value was stored as sent (any string), so a
   * new product could still be saved, reviewed and published under a hidden
   * segment.
   *
   * Checked ONLY WHEN THE VALUE CHANGES: the forms send the stored value back
   * on every save, and a legacy product whose category was hidden later must
   * stay editable (price, description, re-review). Do not move this into the
   * shared publish gate (`productPublishBlockerCodes`): `assertStaysPublishable`
   * and the admin approval would then stop edits of legacy published products.
   */
  private async assertCategoryAllowed(
    next: string | null | undefined,
    stored: string | null | undefined,
  ): Promise<void> {
    const code = next?.trim();
    if (!code || code === stored) return;
    const known =
      isCategoryCode(code) &&
      !isHiddenCategory(code) &&
      (await this.prisma.category.count({
        where: { id: code, isActive: true, ...hiddenCategoryWhere() },
      })) === 1;
    if (!known) {
      throw new BadRequestException(
        i18nMessage("api.companyItems.kategoriGecersizYaDaGuncelDegil", undefined, "INVALID_CATEGORY"),
      );
    }
  }

  /** Not public yet AND the stored category is under a hidden segment. */
  private hasOutdatedCategory(r: { isPublic: boolean; categoryId: string | null }): boolean {
    return !r.isPublic && isHiddenCategory(r.categoryId);
  }

  /**
   * PUBLISH-GATE VIEW of a product. For a product that is NOT public yet, a
   * category under a hidden segment counts as no category: sending it for
   * review would put a brand-new product on the shop window under a category
   * nobody can see (the admin approval applies the same view). A product that
   * is ALREADY public keeps its stored category here, so nothing blocks the
   * edits and the re-review of a legacy published product.
   */
  private publishGateLike(r: Parameters<typeof this.toProductLike>[0] & { isPublic: boolean }): ProductLike {
    const like = this.toProductLike(r);
    return this.hasOutdatedCategory(r) ? { ...like, categoryId: null } : like;
  }

  /**
   * YAYINDAKİ ÜRÜNÜN KAYDI (arayüz testi O-009): içerik değiştiyse (ürün
   * yeniden incelemeye girecek) birleşik sonuç kapıdan TAM geçmeli. İçerik
   * dışı kayıt (fiyat/MOQ) yalnız YENİ bir eksik doğurursa reddedilir — kapı
   * kuralları sıkılaşmadan önce yayına çıkmış eski ürün fiyatını yine
   * güncelleyebilsin.
   */
  private assertStaysPublishable(
    before: Parameters<typeof this.toProductLike>[0],
    after: ProductLike,
    contentChanged: boolean,
  ) {
    const blockers = productPublishBlockerCodes(after);
    if (blockers.length === 0) return;
    if (!contentChanged) {
      const prev = new Set(productPublishBlockerCodes(this.toProductLike(before)).map((b) => b.code));
      if (blockers.every((b) => prev.has(b.code))) return;
    }
    this.assertPublishable(blockers);
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
    reviewStatus: ProductReviewStatus;
    submittedAt: Date | null;
    reviewedAt: Date | null;
    rejectReason: string | null;
    slug: string | null;
    videoUrl: string | null;
    externalUrl: string | null;
    documents: Prisma.JsonValue | null;
    priceCurrency: string;
    unit: string;
    unitCode: string | null;
    brand: string | null;
    mpn: string | null;
    specification: string | null;
  }): Promise<ProductShowcase> {
    // Checklist, score and blockers read the SAME view as `publish`: a draft
    // whose stored category is under a hidden segment shows the category step
    // as open, with a text that asks for a current category.
    const like = this.publishGateLike(r);
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
      reviewStatus: r.reviewStatus,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      rejectReason: r.rejectReason,
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
      unit: r.unit,
      unitCode: r.unitCode,
      brand: r.brand,
      mpn: r.mpn,
      specification: r.specification,
      completion,
      publishBlockers: this.publishBlockerTexts(productPublishBlockerCodes(like), this.hasOutdatedCategory(r)),
      attributeDefs: defs,
    };
  }

  /**
   * Firma bazlı İŞLEM düzeyi advisory kilit (`publish` ve admin onayıyla AYNI
   * anahtar `hashtext(companyId)`): sayıp sonra yazan katalog/vitrin yolları
   * (tavan, içe aktarma, arşivden geri alma) eşzamanlı isteklerde sıraya girer
   * (arayüz testi FX-00 O-061/O-070).
   */
  private withCompanyItemLock<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runTenantTx(this.prisma, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
      return fn(tx);
    });
  }

  private async assertCapacity(
    companyId: string,
    adding: number,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (adding <= 0) return;
    const count = await db.companyItem.count({ where: { companyId } });
    if (count + adding > MAX_CATALOG_ITEMS) {
      throw new BadRequestException(
        i18nMessage("api.companyItems.katalogEnFazlaKalemTasiyabilirKullanmadiklariniz", { MAXCATALOGITEMS: MAX_CATALOG_ITEMS }),
      );
    }
  }

  private normalize(input: CatalogItemInput) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException(i18nMessage("api.companyItems.kalemAdiZorunlu"));
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
        i18nMessage("api.companyItems.stokKoduKatalogdaZatenVarKod", { code: code ?? "" }),
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
    // Vitrin özeti — liste satırında durum rozeti / küçük görsel / fiyat modu
    // için (Ürünlerim listesi, 2026-09-03). Tam vitrin alanları PATCH/GET
    // yanıtında; burada yalnız satırın gösterdiği kadarı.
    isPublic: boolean;
    publishedAt: Date | null;
    reviewStatus: ProductReviewStatus;
    rejectReason: string | null;
    images: string[];
    priceMode: string;
    priceAmount?: Prisma.Decimal | null;
    priceCurrency?: string;
    moq?: Prisma.Decimal | null;
    createdAt?: Date;
    updatedAt: Date;
    _count?: { views: number };
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
      isPublic: r.isPublic,
      publishedAt: r.publishedAt,
      reviewStatus: r.reviewStatus,
      rejectReason: r.rejectReason,
      thumbnailUrl: r.images[0] ?? null,
      priceMode: r.priceMode,
      // Ürünlerim tablosu sütunları (2026-09-18): fiyat · min. sipariş ·
      // görüntülenme · eklenme tarihi.
      priceAmount: r.priceAmount == null ? null : r.priceAmount.toString(),
      priceCurrency: r.priceCurrency ?? null,
      moq: r.moq == null ? null : r.moq.toString(),
      viewCount: r._count?.views ?? null,
      createdAt: r.createdAt ?? null,
      updatedAt: r.updatedAt,
    };
  }
}
