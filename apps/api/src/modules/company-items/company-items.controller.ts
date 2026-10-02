import { tApi } from "../../common/i18n/i18n.service";
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ArrayMaxSize,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  MAX_MONEY,
  MAX_PRODUCT_IMAGES,
  MIN_MONEY,
  UNITS,
  PRODUCT_MEDIA_TIER,
  BUYING_TIER,
  tierAtLeast,
} from "@rothern/shared";
import { Currency } from "@rothern/db";
import { Trim } from "../../common/decorators/trim.decorator";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { RequireTier } from "../company-auth/decorators/require-tier.decorator";
import { CompanyPaidTierGuard, tierRequiredError } from "../company-auth/guards/company-paid-tier.guard";
import { hasCompanyPermission } from "../company-auth/permissions/company-permissions.constants";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { CompanyItemsService, SHOWCASE_LIST_STATUSES, type ShowcaseListStatus } from "./company-items.service";

const UNIT_CODES = UNITS.map((u) => u.code);
// Para birimi TEK KAYNAK: Prisma `Currency` enum'ı. Elle liste yazmak
// enum büyüdüğünde sessizce eskirdi.
const CURRENCY_CODES = Object.values(Currency) as string[];

class CatalogItemDto {
  @IsOptional() @Trim() @IsString() @MaxLength(50) code?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) specification?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(20) unit!: string;
  @IsOptional() @IsString() @IsIn(UNIT_CODES, { message: () => tApi("api.dto.companyItems.gecersizOlcuBirimi") })
  unitCode?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(20) categoryId?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) brand?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) mpn?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Max(MAX_MONEY)
  targetPrice?: number;
}


/** Kademeli fiyat satırı — miktar arttıkça birim fiyat düşer. */
class PriceTierDto {
  @IsNumber() @Min(1) @Max(1_000_000_000) minQty!: number;
  // 0 fiyat YOK (derin denetim LU-08): "0 ₺ / adet" başlığı ve JSON-LD
  // Offer price=0 üretiyordu; fiyat vermek istemeyen ON_REQUEST seçer.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_MONEY, { message: () => tApi("api.dto.companyItems.fiyatSifirdanBuyukOlmali") })
  @Max(MAX_MONEY) unitPrice!: number;
}

class ProductDocDto {
  @Trim() @IsString() @MaxLength(500) url!: string;
  @Trim() @IsString() @MaxLength(200) title!: string;
}

/**
 * Vitrin alanları. Temel kalem alanlarından (ad/birim/kod) AYRI uç:
 * ikisi farklı ekranlarda düzenleniyor ve tek DTO'da toplamak, kalem
 * düzenlerken vitrin alanlarının sessizce sıfırlanmasına yol açardı.
 */
class ShowcaseDto {
  /**
   * Ad ve açıklama vitrin formundan yazılır (2026-09-03). Eskiden bu DTO'da
   * ikisi de yoktu: ürün ekranında açıklama alanı görünmüyordu ama yayın
   * kapısı ≥100 karakter açıklama istiyordu — kullanıcı çıkmaza giriyordu.
   */
  @IsOptional() @Trim() @IsString() @MinLength(1) @MaxLength(200) name?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(5000) description?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(20) categoryId?: string;

  /**
   * Satış birimi vitrin formundan da yazılır (2026-09-03): ürün sayfasındaki
   * fiyat/MOQ satırı bu birimle okunur, kullanıcı onu formda görmeli.
   */
  @IsOptional() @Trim() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsString() @IsIn(UNIT_CODES, { message: () => tApi("api.dto.companyItems.gecersizOlcuBirimi") })
  unitCode?: string;

  /** İLKİ KAPAK. Tavan `MAX_PRODUCT_IMAGES` (8) — galeri de aynı sabiti okur (O-100). */
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @IsString({ each: true }) @MaxLength(500, { each: true })
  images?: string[];

  /**
   * Video İZİNLİ LİSTESİ (YouTube/Vimeo) ve dış bağlantının https kuralı
   * SERVİSTE, yalnız DEĞİŞEN değerde (`assertShowcaseLinks`, Y-11 gözden
   * geçirme): DTO'da kalsaydı kural öncesinden kalmış eski değer (http://,
   * şemasız, Dailymotion) her kaydı 400'e düşürürdü — paketi düşmüş satıcı
   * gizli video alanını düzeltemediği için ürününü hiç kaydedemezdi.
   */
  @IsOptional() @Trim() @IsString() @MaxLength(500) videoUrl?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(500) externalUrl?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(5)
  @ValidateNested({ each: true }) @Type(() => ProductDocDto)
  documents?: ProductDocDto[];

  /**
   * 1-15 etiket. Üst sınır Europages ile aynı: daha fazlası etiket spamine
   * dönüşüyor ve aramayı bozuyor.
   */
  @IsOptional() @IsArray() @ArrayMaxSize(15)
  @IsString({ each: true }) @MaxLength(50, { each: true })
  keywords?: string[];

  /** Kategoriden MİRAS nitelikler; tanımsız anahtar serviste düşer. */
  @IsOptional() @IsObject() attributes?: Record<string, unknown>;

  @IsOptional() @IsIn(["FIXED", "TIERED", "ON_REQUEST"])
  priceMode?: "FIXED" | "TIERED" | "ON_REQUEST";

  /** 0 kabul edilmez — PriceTierDto.unitPrice ile aynı gerekçe. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_MONEY, { message: () => tApi("api.dto.companyItems.fiyatSifirdanBuyukOlmali") })
  @Max(MAX_MONEY)
  priceAmount?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => PriceTierDto)
  priceTiers?: PriceTierDto[];

  @IsOptional() @IsIn(CURRENCY_CODES) priceCurrency?: string;

  /** Tavan minQty/`moqMax` ile aynı — Decimal(18,3) taşması 500 veriyordu (LU-08). */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(1_000_000_000) moq?: number;
}

/** Yeni ürün — vitrin alanları (birim ShowcaseDto'da). */
class NewProductDto extends ShowcaseDto {}



/** Ürün görseli yükleme isteği — presigned PUT üretir. */
class ImageUploadDto {
  @Trim() @IsString() @MaxLength(200) fileName!: string;
  @Trim() @IsString() @MaxLength(100) mimeType!: string;
}

class ResolveImageDto {
  @Trim() @IsString() @MaxLength(500) key!: string;
}

class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

class MarkUsedDto {
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) ids!: string[];
}

/**
 * Kalem YAZMA yalnız `templates:manage` ile geliyorsa (satış ürün izni yok)
 * bu Şablonlar › Kalem Kataloğu yoludur → Şablonlar'ın paket kuralı (GOLD,
 * `listing-templates`/`supplier-templates`/`question-templates` ile aynı).
 * Satış yolu (`sell:product:manage`) her pakette açık kalır. Eskiden Gold
 * altında şablon yetkilisi API'den kalem ekleyip arşivleyebiliyordu, UI Gold
 * duvarı çizerken (arayüz testi T3).
 */
function assertCatalogWriteTier(user: AuthenticatedCompanyUser): void {
  if (hasCompanyPermission(user, "sell:product:manage")) return;
  if (!tierAtLeast(user.tier, BUYING_TIER)) throw tierRequiredError(BUYING_TIER);
}

/**
 * Kalem Kataloğu (Faz 2).
 *
 * Sınıf düzeyinde `CompanyPaidTierGuard` YOK — okuma her pakette açık, satış
 * ürünleri ücretsiz pakette de yönetilir. Yalnız şablon izniyle (satış izni
 * olmadan) kalem yazmak Şablonlar'ın paket kuralına (GOLD) girer:
 * `assertCatalogWriteTier`.
 *
 * Okuma her role açık. KALEM yazma (`POST /`, `PATCH :id`, arşivle/geri al)
 * `sell:product:manage` VEYA `templates:manage` kabul eder — satınalmadaki
 * Kalem Kataloğu şablon izniyle yönetilir (arayüz testi D-185, DN-12: yorum
 * bunu vaat ederken uç yalnız satış iznini istiyor, şablon yetkilisi 403
 * alıyordu). Vitrine dokunmuş ürünü (yayında/onayda/onaylı/reddedilmiş)
 * değiştirmek servis katmanında AYRICA `sell:product:manage` ister. Vitrin
 * uçları (`product`, `:id/showcase`, yayın, görsel/belge) yalnız satış izniyle.
 */
@Controller("company/items")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyItemsController {
  constructor(private readonly service: CompanyItemsService) {}

  @Get()
  @RequireCompanyPermission(["buy:view", "sell:view"])
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("categoryId") categoryId?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
    @Query("archived") archived?: string,
    @Query("status") status?: string,
    @Query("sort") sort?: string,
  ) {
    return this.service.list(user.companyId, {
      q,
      categoryId,
      tier: user.tier,
      archived: archived === "1" || archived === "true",
      status: SHOWCASE_LIST_STATUSES.includes(status as ShowcaseListStatus) ? (status as ShowcaseListStatus) : undefined,
      sort: sort === "recent" ? "recent" : "usage",
      take: take ? Number.parseInt(take, 10) || undefined : undefined,
      skip: skip ? Number.parseInt(skip, 10) || undefined : undefined,
    });
  }


  /* ---------------------------------------------------------------- */
  /* VİTRİN (Faz 2)                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Bir kategorinin ETKİN nitelik seti — ata zincirinden miras.
   * Form kategori seçilir seçilmez bunu çağırır.
   *
   * ":id" rotalarından ÖNCE tanımlı olmalı (statik rota önceliği), aksi hâlde
   * "attributes" bir kalem kimliği sanılırdı.
   */

  /**
   * Ürün görseli — iki adım (profil görselleriyle AYNI akış):
   *   1. `images/upload-url` → presigned PUT, tarayıcı DOĞRUDAN R2'ye yükler
   *      (sunucudan geçmez, gövde sınırına takılmaz),
   *   2. `images/resolve`    → yükleneni DOĞRULAR (boyut + gerçek MIME) ve
   *      kalıcı CDN URL'i döner.
   * İkinci adım şart: presigned PUT ne boyutu ne içerik tipini imzalayabilir.
   */
  /**
   * Panel içi ürün keşfi — alıcı panelinin keşif şeridi ve "Ürünler" sayfası.
   *
   * Kendi kataloğun DEĞİL, başka firmaların yayımlanmış ürünleri. İzin
   * gerektirmez: keşif okuma, katalog yazma değil.
   */
  @Get("discover")
  @RequireCompanyPermission("buy:view")
  discover(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("limit") limit?: string,
  ) {
    const n = Number(limit);
    return this.service.discoverProducts(user, {
      q: q?.slice(0, 120),
      category: category?.slice(0, 8),
      limit: Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined,
    });
  }

  /** Ürün Ara — public `/urunler` ile aynı süzgeç/sıralama, sayfalı. */
  @Get("discover/search")
  @RequireCompanyPermission("buy:view")
  discoverSearch(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("city") city?: string,
    @Query("country") country?: string,
    @Query("activity") activity?: string,
    @Query("verified") verified?: string,
    @Query("price") price?: string,
    @Query("sort") sort?: string,
    @Query("page") page?: string,
    @Query("attr") attr?: string | string[],
    @Query("priceMin") priceMin?: string,
    @Query("priceMax") priceMax?: string,
    @Query("moqMax") moqMax?: string,
    @Query("priceUnpriced") priceUnpriced?: string,
    @Query("cert") cert?: string,
    @Query("employees") employees?: string,
    @Query("near") near?: string,
    @Query("radius") radius?: string,
    @Query("fastReply") fastReply?: string,
    @Query("pageSize") pageSize?: string,
    @Query("currency") currency?: string,
  ) {
    const n = Number(page);
    const ps = Number(pageSize);
    const num = (v?: string) => {
      const x = Number(v);
      return v != null && v !== "" && Number.isFinite(x) && x >= 0 ? Math.trunc(x) : undefined;
    };
    return this.service.discoverSearch(user, {
      q: q?.slice(0, 120),
      category: category && /^\d{8}$/.test(category) ? category : undefined,
      city: city?.slice(0, 400) || undefined,
      country: country?.slice(0, 200) || undefined,
      activity: activity?.slice(0, 200) || undefined,
      verified: verified === "1",
      price: price === "has" || price === "request" ? price : undefined,
      // Fiyat süzgecinin para birimi — tanınmayan kod servis tarafında firma
      // ülkesinin birimine düşer (`resolveCompanyCurrency`).
      currency: currency?.slice(0, 3) || undefined,
      priceMin: num(priceMin),
      priceMax: num(priceMax),
      moqMax: num(moqMax),
      priceUnpriced: priceUnpriced === "1",
      cert: cert?.slice(0, 400) || undefined,
      employees: employeeList(employees),
      near: near?.slice(0, 40) || undefined,
      radius: num(radius),
      fastReply: fastReply === "1",
      sort: sort === "newest" || sort === "price" || sort === "price_desc" ? sort : undefined,
      attr: attr == null ? undefined : (Array.isArray(attr) ? attr : [attr]).slice(0, 6),
      page: Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined,
      pageSize: Number.isFinite(ps) && ps > 0 ? Math.trunc(ps) : undefined,
    });
  }

  /** Süzgeç sayaçları — public facet ile aynı bağlama duyarlı sayım. */
  @Get("discover/facets")
  @RequireCompanyPermission("buy:view")
  discoverFacets(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("category") category?: string,
    @Query("q") q?: string,
    @Query("city") city?: string,
    @Query("country") country?: string,
    @Query("activity") activity?: string,
    @Query("verified") verified?: string,
    @Query("price") price?: string,
    @Query("cert") cert?: string,
    @Query("employees") employees?: string,
    @Query("near") near?: string,
    @Query("radius") radius?: string,
    @Query("fastReply") fastReply?: string,
    @Query("currency") currency?: string,
  ) {
    const num = (v?: string) => {
      const x = Number(v);
      return v != null && v !== "" && Number.isFinite(x) ? Math.trunc(x) : undefined;
    };
    return this.service.discoverFacets(user, {
      category: category && /^\d{8}$/.test(category) ? category : undefined,
      q: q?.slice(0, 120),
      city: city?.slice(0, 400) || undefined,
      country: country?.slice(0, 200) || undefined,
      activity: activity?.slice(0, 200) || undefined,
      verified: verified === "1",
      price: price === "has" || price === "request" ? price : undefined,
      // Sayaçlar BAĞLAMA DUYARLI: seçili her boyut buraya da gelmeli, yoksa
      // "sertifika seçiliyken şehir sayacı" tüm dizini sayar.
      cert: cert?.slice(0, 400) || undefined,
      employees: employeeList(employees),
      near: near?.slice(0, 40) || undefined,
      radius: num(radius),
      fastReply: fastReply === "1",
      currency: currency?.slice(0, 3) || undefined,
    });
  }

  /** Panel içi ürün sayfası — ÜYE katmanı (fiyat/MOQ dahil). */
  @Get("discover/:companySlug/:productSlug")
  @RequireCompanyPermission("buy:view")
  discoverProduct(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("companySlug") companySlug: string,
    @Param("productSlug") productSlug: string,
  ) {
    return this.service.discoverProduct(user, companySlug, productSlug);
  }

  @Post("images/upload-url")
  @RequireCompanyPermission("sell:product:manage")
  imageUploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ImageUploadDto,
  ) {
    return this.service.requestImageUpload(
      user.companyId,
      dto.fileName,
      dto.mimeType,
    );
  }

  @Post("images/resolve")
  @RequireCompanyPermission("sell:product:manage")
  imageResolve(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ResolveImageDto,
  ) {
    return this.service.resolveImage(user.companyId, dto.key);
  }

  /**
   * Ürün belgesi (PDF katalog/teknik föy) — görselle aynı iki adım. PAKETLİ
   * (`PRODUCT_MEDIA_TIER` = Silver+, 2026-09-06): ücretsiz firma belge
   * yükleyemez; `updateShowcase` da alanı dokunmadan bırakır.
   */
  @Post("documents/upload-url")
  @RequireCompanyPermission("sell:product:manage")
  @RequireTier(PRODUCT_MEDIA_TIER)
  @UseGuards(CompanyPaidTierGuard)
  documentUploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ImageUploadDto,
  ) {
    return this.service.requestDocumentUpload(
      user.companyId,
      dto.fileName,
      dto.mimeType,
    );
  }

  @Post("documents/resolve")
  @RequireCompanyPermission("sell:product:manage")
  @RequireTier(PRODUCT_MEDIA_TIER)
  @UseGuards(CompanyPaidTierGuard)
  documentResolve(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ResolveImageDto,
  ) {
    return this.service.resolveDocument(user.companyId, dto.key);
  }

  @Get("attributes/:categoryId")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  attributes(@Param("categoryId") categoryId: string) {
    return this.service.resolveAttributes(categoryId);
  }

  /** Vitrin alanlarını okur — önizleme (incelemedeki ürün) ve düzenleyici açılışı. */
  @Get(":id/showcase")
  @RequireCompanyPermission(["sell:view", "sell:product:manage"])
  getShowcase(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getShowcase(user, id);
  }

  @Patch(":id/showcase")
  @RequireCompanyPermission("sell:product:manage")
  updateShowcase(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ShowcaseDto,
  ) {
    return this.service.updateShowcase(user, id, dto);
  }

  @Post(":id/publish")
  @RequireCompanyPermission("sell:product:manage")
  publish(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.publish(user, id);
  }

  @Post(":id/unpublish")
  @RequireCompanyPermission("sell:product:manage")
  unpublish(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.unpublish(user, id);
  }

  /**
   * ÜRÜN OLUŞTUR — tek çağrı, tek form (ilan sihirbazının aksine).
   * Kayıt TASLAK doğar; yayımlamak ayrı adım.
   */
  @Post("product")
  @RequireCompanyPermission("sell:product:manage")
  createProduct(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: NewProductDto,
  ) {
    return this.service.createProduct(user, dto);
  }

  @Post()
  @RequireCompanyPermission(["sell:product:manage", "templates:manage"])
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CatalogItemDto,
  ) {
    assertCatalogWriteTier(user);
    return this.service.create(user, dto);
  }

  @Patch(":id")
  @RequireCompanyPermission(["sell:product:manage", "templates:manage"])
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: CatalogItemDto,
  ) {
    assertCatalogWriteTier(user);
    return this.service.update(user, id, dto);
  }

  /**
   * Silme YOK — arşivle/geri al. Satinalma portalindaki Kalem Katalogu
   * `templates:manage` ile yonetir; vitrin urunu icin servis ayrica
   * `sell:product:manage` ister (derin denetim S066).
   */
  @Patch(":id/active")
  @RequireCompanyPermission(["sell:product:manage", "templates:manage"])
  setActive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SetActiveDto,
  ) {
    assertCatalogWriteTier(user);
    return this.service.setActive(user, id, dto.isActive);
  }

  /** Ters yön: bir ilanın kalemlerini kataloğa al. */
  @Post("import-from-listing/:listingId")
  @RequireCompanyPermission("buy:listing:manage")
  importFromListing(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("listingId") listingId: string,
  ) {
    return this.service.importFromListing(user, listingId);
  }

  /** Katalogdan sihirbaza eklendi — "sık kullanılan" sıralamasını besler. */
  @Post("mark-used")
  @RequireCompanyPermission("buy:listing:manage")
  markUsed(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: MarkUsedDto,
  ) {
    return this.service.markUsed(user.companyId, dto.ids);
  }
}

/**
 * `?employees=10,50` → aynı biçimde temizlenmiş dize.
 *
 * Panel ham `@Query` kullanıyor (DTO yok) — `forbidNonWhitelisted` burada
 * devrede DEĞİL, bu yüzden temizlik elle. Yalnız sayı ve virgül geçer;
 * geçersiz kova anahtarlarını `employeeKeysOf` zaten düşürür.
 */
function employeeList(raw?: string): string | undefined {
  if (!raw) return undefined;
  const clean = raw.slice(0, 40).split(",").map((x) => x.trim()).filter((x) => /^\d{1,3}$/.test(x));
  return clean.length ? clean.join(",") : undefined;
}
