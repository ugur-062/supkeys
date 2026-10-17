import { RequireTier } from "../../company-auth/decorators/require-tier.decorator";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { tApi } from "../../../common/i18n/i18n.service";
import { SupplierDiscoveryService } from "./supplier-discovery.service";

/**
 * Keşif girdisi (2026-09-27, Faz 1): kategori ARTIK ZORUNLU DEĞİL — talep
 * formunun kalemler bölümünde kategori seçilmeden kalem adlarıyla aranır.
 * İkisi de boşsa sonuç boş döner. Talepten açılışta (`listingId`) ülkeler
 * talepten okunur; formda `targetCountries` gelir (boş = tüm ülkeler).
 */
class DiscoveryDto {
  @IsIn(["ALIM"])
  type!: "ALIM";

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  itemNames?: string[];

  /** Kayıtlı talepten açılış — hedef ülkeler talepten okunur (firma kapsamlı). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  listingId?: string;

  /** Yayın öncesi form — talebin görünürlük ülkeleri (boş = tüm ülkeler). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^[A-Z]{2}$/, { each: true })
  targetCountries?: string[];
}

export class ExternalDiscoveryDto extends DiscoveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;

  /**
   * Only these search passes (round 5 review, R5-03): the retry of an
   * incomplete search sends the scopes that did not answer, so the pass that
   * did is not searched - and billed - a second time. Omitted = every pass.
   * NEW FIELD: an API without it rejects the body (`forbidNonWhitelisted`) -
   * deploy the API before the web that sends it.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  // The default-message translation has no pattern for this validator: without
  // a message of its own the field answered in raw English (AS-5).
  @ArrayUnique({ message: () => tApi("api.validation.arrayUnique") })
  @IsIn(["LOCAL", "ABROAD"], { each: true })
  scopes?: Array<"LOCAL" | "ABROAD">;
}

/** Status polls of the asynchronous web search allowed per minute and client address. */
export const SEARCH_STATUS_POLLS_PER_MINUTE = 600;

/**
 * "AI ile daha fazla tedarikçiye eriş" — dizin keşfi. Silver+ (ihale açan
 * zaten Silver+); yalnız firmaların kendi ilan ettiği profil alanları okunur.
 */
@Controller("company/ai/supplier-discovery")
@RequireTier("GOLD")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class SupplierDiscoveryController {
  constructor(private readonly service: SupplierDiscoveryService) {}

  @Post()
  @RequireCompanyPermission("buy:listing:manage")
  discover(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: DiscoveryDto,
  ) {
    return this.service.discoverRegistered(user, dto);
  }

  /**
   * Faz B — web araması (Google Search grounding, AI bütçesinden), TEK İSTEKTE.
   * Eski istemciler için durur: gündüz araştırma 70-80 sn sürdüğünde vekilin
   * 100 sn sınırına sığmıyor (canlı doğrulama 2026-10-09, N1). Pencere
   * aşağıdaki iki ucu kullanır.
   */
  @Post("external")
  @RequireCompanyPermission("buy:listing:manage")
  discoverExternal(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ExternalDiscoveryDto,
  ) {
    return this.service.discoverExternal(user, dto);
  }

  /**
   * ASYNCHRONOUS WEB SEARCH (N1) - start. Same body as `external`. Answers
   * 201 `{ searchId, elapsedMs }` at once; the search runs in the background
   * of the API process. What is known before the provider is called is
   * answered here as `external` does (400 validation, 403 permission /
   * verification / budget, 429 three searches of this user already running,
   * 503 AI not configured / registry full).
   *
   * `elapsedMs` (DISC-N2): 0 for a new search, the age of the running search
   * for a call that joined it - the same clock and the same meaning as in the
   * status answer below, so a second tab counts from the search's real start
   * without waiting for its first poll. `searchId` is unchanged; a client that
   * does not know the field ignores it.
   */
  @Post("external/start")
  @RequireCompanyPermission("buy:listing:manage")
  startExternal(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ExternalDiscoveryDto,
  ) {
    return this.service.startExternalSearch(user, dto);
  }

  /**
   * ASYNCHRONOUS WEB SEARCH (N1) - status, polled every 3 s by the window:
   * `{ status: RUNNING | DONE | FAILED, startedAt, elapsedMs, result?, error? }`;
   * `result` is the body of `external`. 404: unknown, forgotten (kept 15
   * minutes; lost on a restart) or another user's search.
   *
   * `elapsedMs` = how long ago the search was registered, measured on THIS
   * server's clock (review of AS-4). The window's "time elapsed" counter of a
   * tab that joined a running search starts from it. `startedAt` alone cannot
   * serve that: it is a moment on the server's clock, and a browser whose clock
   * is half a minute ahead or behind turns it into a wrong counter. A duration
   * needs no shared clock.
   *
   * Own rate limit: an in-memory read, polled by every open window - the
   * default 100/min per address is reached by a few users behind one office
   * address (each search polls 20 times a minute).
   *
   * The answer that carries a `result` of a saved request's search marks the
   * candidates the buyer has invited since as ALREADY_INVITED
   * (`externalSearchAnswer`, DISC-N3) - one database batch for that answer;
   * RUNNING stays an in-memory read.
   */
  @Get("external/searches/:searchId")
  @Throttle({ default: { limit: SEARCH_STATUS_POLLS_PER_MINUTE, ttl: 60_000 } })
  @RequireCompanyPermission("buy:listing:manage")
  async externalSearch(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Param("searchId") searchId: string) {
    const view = await this.service.externalSearchAnswer(user, searchId);
    return { ...view, elapsedMs: Math.max(0, Date.now() - Date.parse(view.startedAt)) };
  }
}
