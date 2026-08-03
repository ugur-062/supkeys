import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
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

@Controller("company/dashboard")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyDashboardController {
  constructor(
    private readonly service: CompanyDashboardService,
    private readonly timeSavings: TimeSavingsService,
    private readonly analytics: DashboardAnalyticsService,
    private readonly actionCenter: ActionCenterService,
  ) {}

  /** Aksiyon Merkezi — severity + zaman bilgili tek uyarı listesi (Faz 2). */
  @Get("action-center")
  actionCenterRows(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("portal") portal?: string,
  ) {
    return portal === "satis"
      ? this.actionCenter.satis(user.companyId)
      : this.actionCenter.satinalma(user.companyId);
  }

  /** Pano analitiği — panel başına TEK toplu yanıt (grafik/aksiyon serileri). */
  @Get("satinalma/analytics")
  satinalmaAnalytics(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("period") period?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const { p, range } = resolvePeriod(period, from, to);
    return this.analytics.satinalma(user.companyId, p, range);
  }

  @Get("satis/analytics")
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
  satinalma(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalma(user);
  }

  @Get("satis")
  satis(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satis(user);
  }

  @Get("satis/stats")
  satisStats(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satisStats(user);
  }

  @Get("satis/aktivite")
  satisAktivite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.service.satisAktivite(user, Number(limit) || 8, Number(page) || 1);
  }

  @Get("satinalma/tasarruf")
  satinalmaTasarruf(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalmaTasarruf(user);
  }

  @Get("satinalma/tedarikci")
  satinalmaTedarikci(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.satinalmaTedarikci(user);
  }
}
