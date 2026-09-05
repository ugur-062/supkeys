import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { hasReadContext } from "../../common/company/full-read-context";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyDashboardService } from "./company-dashboard.service";
import {
  TimeSavingsService,
  type SavingsPeriod,
} from "./time-savings.service";
import { ActionCenterService } from "./action-center.service";
import {
  DashboardAnalyticsService,
  type PeriodRange,
} from "./dashboard-analytics.service";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dönem paramı çözümü (Faz 3): month|quarter|year veya custom+from&to.
 * Geçersiz/yarım custom sessizce year'a düşer (yarım aralıkla hesap yok).
 * `to` gün SONU dahil olsun diye +1 gün HARİÇ üst sınıra çevrilir.
 */
function resolvePeriod(
  period?: string,
  from?: string,
  to?: string,
): { p: SavingsPeriod; range?: PeriodRange } {
  if (period === "month" || period === "quarter") return { p: period };
  if (
    period === "custom" &&
    from && to &&
    DATE_RE.test(from) && DATE_RE.test(to) &&
    from <= to
  ) {
    const f = new Date(`${from}T00:00:00`);
    const t = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(+f) && !Number.isNaN(+t)) {
      return {
        p: "year",
        range: { from: f, to: new Date(t.getTime() + 86_400_000) },
      };
    }
  }
  return { p: "year" };
}

/**
 * Pano uçları — yetki tablosu 2026-09-05: satınalma panosu `buy:view`, satış
 * panosu `sell:view` (görüntüleme izni; koltuk gerekmez). Onaylayıcı-only ve
 * portalı olmayan üye 403 alır — eskiden yalnız giriş yetiyordu.
 */
@Controller("company/dashboard")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyDashboardController {
  constructor(
    private readonly service: CompanyDashboardService,
    private readonly timeSavings: TimeSavingsService,
    private readonly analytics: DashboardAnalyticsService,
    private readonly actionCenter: ActionCenterService,
  ) {}

  /** Aksiyon Merkezi — severity + zaman bilgili tek uyarı listesi (Faz 2). */
  @Get("action-center")
  @RequireCompanyPermission(["buy:view", "sell:view"])
  actionCenterRows(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("portal") portal?: string,
  ) {
    const side = portal === "satis" ? "sell" : "buy";
    if (!hasReadContext(user, side)) {
      throw new ForbiddenException("Bu panoyu görüntüleme yetkiniz yok");
    }
    return side === "sell"
      ? this.actionCenter.satis(user.companyId)
      : this.actionCenter.satinalma(user.companyId);
  }

  /** Pano analitiği — panel başına TEK toplu yanıt (grafik/aksiyon serileri). */
  @Get("satinalma/analytics")
  @RequireCompanyPermission("buy:view")
  satinalmaAnalytics(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const { p, range } = resolvePeriod(period, from, to);
    // Dar bağlam artık uca giremez (buy:view kapısı) → maske gerekmez.
    return this.analytics.satinalma(user.companyId, p, range, false);
  }

  @Get("satis/analytics")
  @RequireCompanyPermission("sell:view")
  satisAnalytics(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const { p, range } = resolvePeriod(period, from, to);
    return this.analytics.satis(user.companyId, p, range);
  }

  /** Zaman Tasarrufu — panel şeridi + Zaman alt bölümü için TEK toplu yanıt. */
  @Get("time-savings")
  @RequireCompanyPermission("buy:view")
  timeSavingsSummary(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const { p, range } = resolvePeriod(period, from, to);
    return this.timeSavings.forCompany(user.companyId, p, range);
  }

  @Get("satinalma")
  @RequireCompanyPermission("buy:view")
  satinalma(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalma(user);
  }

  @Get("satis/stats")
  @RequireCompanyPermission("sell:view")
  satisStats(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satisStats(user);
  }

  @Get("satis/aktivite")
  @RequireCompanyPermission("sell:view")
  satisAktivite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.service.satisAktivite(user, Number(limit) || 8, Number(page) || 1);
  }

  @Get("satinalma/tasarruf")
  @RequireCompanyPermission("buy:view")
  satinalmaTasarruf(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalmaTasarruf(user);
  }

  @Get("satinalma/tedarikci")
  @RequireCompanyPermission("buy:view")
  satinalmaTedarikci(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalmaTedarikci(user);
  }
}
