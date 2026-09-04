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
import { MAX_MONEY, UNITS } from "@rothern/shared";
import { Currency } from "@rothern/db";
import { Trim } from "../../common/decorators/trim.decorator";
import { CurrentCompanyUser } from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { CompanyItemsService } from "./company-items.service";

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
  @IsOptional() @IsString() @IsIn(UNIT_CODES, { message: "Geçersiz ölçü birimi" })
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
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY) unitPrice!: number;
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
  @IsOptional() @IsString() @IsIn(UNIT_CODES, { message: "Geçersiz ölçü birimi" })
  unitCode?: string;

  /** İLKİ KAPAK. Tavan 8 — daha fazlası kart/galeri düzenini bozar. */
  @IsOptional() @IsArray() @ArrayMaxSize(8)
  @IsString({ each: true }) @MaxLength(500, { each: true })
  images?: string[];

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

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_MONEY)
  priceAmount?: number;

  @IsOptional() @IsArray() @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => PriceTierDto)
  priceTiers?: PriceTierDto[];

  @IsOptional() @IsIn(CURRENCY_CODES) priceCurrency?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) moq?: number;
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
 * Kalem Kataloğu (Faz 2).
 *
 * `CompanyPaidTierGuard` KULLANILMIYOR — tedarikçi şablonları premium bir
 * özellik, ama kalem kataloğu ihale AÇMANIN temel ergonomisi. Paketsiz firma
 * zaten ihale açamıyor (tier kapısı orada); kataloğu ayrıca kapatmak yalnız
 * kullanıcıyı zorlaştırırdı.
 *
 * Okuma her role açık, yazma `templates:manage` ister — şablon modülleriyle
 * aynı kural (kullanıcı için tek bir zihinsel model).
 */
@Controller("company/items")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyItemsController {
  constructor(private readonly service: CompanyItemsService) {}

  @Get()
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("categoryId") categoryId?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
    @Query("archived") archived?: string,
  ) {
    return this.service.list(user.companyId, {
      q,
      categoryId,
      archived: archived === "1" || archived === "true",
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
  discoverSearch(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("city") city?: string,
    @Query("activity") activity?: string,
    @Query("verified") verified?: string,
    @Query("price") price?: string,
    @Query("sort") sort?: string,
    @Query("page") page?: string,
    @Query("attr") attr?: string | string[],
  ) {
    const n = Number(page);
    return this.service.discoverSearch(user, {
      q: q?.slice(0, 120),
      category: category && /^\d{8}$/.test(category) ? category : undefined,
      city: city?.slice(0, 60) || undefined,
      activity: activity?.slice(0, 40) || undefined,
      verified: verified === "1",
      price: price === "has" || price === "request" ? price : undefined,
      sort: sort === "newest" || sort === "price" ? sort : undefined,
      attr: attr == null ? undefined : (Array.isArray(attr) ? attr : [attr]).slice(0, 6),
      page: Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined,
    });
  }

  @Get("discover/facets")
  discoverFacets(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.discoverFacets(user);
  }

  /** Panel içi ürün sayfası — ÜYE katmanı (fiyat/MOQ dahil). */
  @Get("discover/:companySlug/:productSlug")
  discoverProduct(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("companySlug") companySlug: string,
    @Param("productSlug") productSlug: string,
  ) {
    return this.service.discoverProduct(user, companySlug, productSlug);
  }

  @Post("images/upload-url")
  @RequireCompanyPermission("templates:manage")
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
  @RequireCompanyPermission("templates:manage")
  imageResolve(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ResolveImageDto,
  ) {
    return this.service.resolveImage(user.companyId, dto.key);
  }

  /** Ürün belgesi (PDF katalog/teknik föy) — görselle aynı iki adım. */
  @Post("documents/upload-url")
  @RequireCompanyPermission("templates:manage")
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
  @RequireCompanyPermission("templates:manage")
  documentResolve(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ResolveImageDto,
  ) {
    return this.service.resolveDocument(user.companyId, dto.key);
  }

  @Get("attributes/:categoryId")
  attributes(@Param("categoryId") categoryId: string) {
    return this.service.resolveAttributes(categoryId);
  }

  @Patch(":id/showcase")
  @RequireCompanyPermission("templates:manage")
  updateShowcase(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: ShowcaseDto,
  ) {
    return this.service.updateShowcase(user, id, dto);
  }

  @Post(":id/publish")
  @RequireCompanyPermission("templates:manage")
  publish(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.publish(user, id);
  }

  @Post(":id/unpublish")
  @RequireCompanyPermission("templates:manage")
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
  @RequireCompanyPermission("templates:manage")
  createProduct(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: NewProductDto,
  ) {
    return this.service.createProduct(user, dto);
  }

  @Post()
  @RequireCompanyPermission("templates:manage")
  create(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: CatalogItemDto,
  ) {
    return this.service.create(user, dto);
  }

  @Patch(":id")
  @RequireCompanyPermission("templates:manage")
  update(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: CatalogItemDto,
  ) {
    return this.service.update(user, id, dto);
  }

  /** Silme YOK — arşivle/geri al. */
  @Patch(":id/active")
  @RequireCompanyPermission("templates:manage")
  setActive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.service.setActive(user, id, dto.isActive);
  }

  /** Ters yön: bir ilanın kalemlerini kataloğa al. */
  @Post("import-from-listing/:listingId")
  @RequireCompanyPermission("templates:manage")
  importFromListing(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("listingId") listingId: string,
  ) {
    return this.service.importFromListing(user, listingId);
  }

  /** Katalogdan sihirbaza eklendi — "sık kullanılan" sıralamasını besler. */
  @Post("mark-used")
  markUsed(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: MarkUsedDto,
  ) {
    return this.service.markUsed(user.companyId, dto.ids);
  }
}
