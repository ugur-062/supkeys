import { i18nMessage } from "../../common/i18n/http-i18n";
import { tApi } from "../../common/i18n/i18n.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  Currency,
  LcType,
  ListingBidVisibility,
  ListingDeliveryTerm,
  ListingPaymentCategory,
  ListingVisibility,
  type Prisma,
} from "@rothern/db";
import {
  REQUEST_ALLOWED_CURRENCIES_MAX,
  REQUEST_CLOSE_DAYS_MAX,
  closeDaysBetween,
  REGISTRATION_BLOCKED,
  type RequestDefaults,
  type RequestDefaultsResponse,
} from "@rothern/shared";
import { z } from "zod";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

/**
 * TALEP ŞARTLARI — ticari profil (2026-09-09, hızlı talep).
 *
 * Kaynak sırası: (1) firmanın KAYDETTİĞİ şartlar, (2) yoksa son YAYIMLANAN
 * alım talebinin değerleri ("son talebinizdeki gibi"), (3) o da yoksa null —
 * web platform varsayılanına (`REQUEST_DEFAULTS_FALLBACK`) düşer ve ilk
 * talepte 3 soruluk kurulum kartı gösterir.
 *
 * Doğrulama Prisma enum'larıyla zod: ödeme kategorisi kapsamla tutarlı olmak
 * zorunda (yurtiçi/uluslararası kuralları `payment-plan.ts` ile aynı) —
 * profilde tutarsız şart saklanırsa her talep yayında patlardı.
 */
export const requestDefaultsSchema = z
  .object({
    // Görünürlük ülkeleri (2026-09-21): boş = tüm ülkeler. Eski kayıtlardaki
    // `isInternational` yalnız DÖNÜŞÜM için okunur (false → [firma ülkesi]).
    targetCountries: z.array(z.string().length(2)).max(200).optional(),
    isInternational: z.boolean().optional(),
    visibility: z.nativeEnum(ListingVisibility),
    deliveryTerm: z.nativeEnum(ListingDeliveryTerm).nullable(),
    paymentCategory: z.nativeEnum(ListingPaymentCategory),
    paymentDays: z.number().int().min(1).max(365).nullable(),
    advancePercent: z.number().int().min(1).max(100).nullable(),
    lcType: z.nativeEnum(LcType).nullable(),
    primaryCurrency: z.nativeEnum(Currency),
    allowedCurrencies: z.array(z.nativeEnum(Currency)).min(1).max(REQUEST_ALLOWED_CURRENCIES_MAX),
    isSealedBid: z.boolean(),
    bidVisibility: z.nativeEnum(ListingBidVisibility),
    requireAllItems: z.boolean(),
    requireBidDocument: z.boolean(),
    closeDays: z.number().int().min(1).max(REQUEST_CLOSE_DAYS_MAX),
    deliveryAddressId: z.string().max(64).nullable(),
    billingSameAsDelivery: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (!d.allowedCurrencies.includes(d.primaryCurrency)) {
      ctx.addIssue({ code: "custom", path: ["allowedCurrencies"], message: tApi("api.companyRequestDefaults.anaParaBirimiIzinVerilenlerde") });
    }
    if (["DEFERRED", "CHEQUE", "SENET"].includes(d.paymentCategory) && !d.paymentDays) {
      ctx.addIssue({ code: "custom", path: ["paymentDays"], message: tApi("api.companyRequestDefaults.vadeGunSayisiZorunlu") });
    }
    if (d.paymentCategory === "LETTER_OF_CREDIT" && !d.lcType) {
      ctx.addIssue({ code: "custom", path: ["lcType"], message: tApi("api.companyRequestDefaults.akreditifAltTipiniSecin") });
    }
    // buildPaymentPlan aynası (derin denetim MU-10): yayında 400 alacak her
    // şart burada reddedilir. CUSTOM not ister; profilde not alanı, hızlı
    // kartta not girişi yok → Talep Şartları'na kaydedilemez.
    if (d.paymentCategory === "ADVANCE" && d.advancePercent == null) {
      ctx.addIssue({ code: "custom", path: ["advancePercent"], message: tApi("api.companyRequestDefaults.pesinYuzdesiZorunlu") });
    }
    if (d.paymentCategory === "LETTER_OF_CREDIT" && d.lcType === "USANCE" && !d.paymentDays) {
      ctx.addIssue({ code: "custom", path: ["paymentDays"], message: tApi("api.companyRequestDefaults.usanceVadeGunZorunlu") });
    }
    if (d.paymentCategory === "CUSTOM") {
      ctx.addIssue({ code: "custom", path: ["paymentCategory"], message: tApi("api.companyRequestDefaults.ozelOdemeKaydedilemez") });
    }
  });

/**
 * Zod ihlali → katalog metni. `custom` ihlaller (superRefine) zaten istek
 * dilinde `tApi` ile yazılır; aralık/tip ihlalleri alan adına göre çevrilir.
 */
function localizedIssue(issue: z.ZodIssue): string {
  if (issue.code === "custom") return issue.message;
  switch (String(issue.path[0] ?? "")) {
    case "paymentDays":
      return tApi("api.companyRequestDefaults.vadeGunAraligi");
    case "advancePercent":
      return tApi("api.companyRequestDefaults.pesinYuzdesiAraligi");
    case "allowedCurrencies":
      return tApi("api.companyRequestDefaults.kabulEdilenBirimSayisi", { max: REQUEST_ALLOWED_CURRENCIES_MAX });
    case "closeDays":
      return tApi("api.companyRequestDefaults.teklifSuresiAraligi", { max: REQUEST_CLOSE_DAYS_MAX });
    default:
      return tApi("api.validation.invalid");
  }
}

/** Zod ihlalleri → `{ alan: katalog metni }` (alan başına ilk ihlal). */
function fieldErrorsOf(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= localizedIssue(issue);
  }
  return out;
}

@Injectable()
export class CompanyRequestDefaultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(companyId: string): Promise<RequestDefaultsResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { requestDefaults: true, country: true },
    });
    const saved = requestDefaultsSchema.safeParse(company?.requestDefaults ?? null);
    if (saved.success) {
      return {
        defaults: await this.withValidAddress(companyId, this.normalize(saved.data, company?.country ?? null)),
        source: "saved",
      };
    }
    const last = await this.prisma.listing.findFirst({
      where: { companyId, type: "ALIM", publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: {
        targetCountries: true,
        visibility: true,
        deliveryTerm: true,
        paymentCategory: true,
        paymentDays: true,
        advancePercent: true,
        lcType: true,
        primaryCurrency: true,
        allowedCurrencies: true,
        isSealedBid: true,
        bidVisibility: true,
        requireAllItems: true,
        requireBidDocument: true,
        publishedAt: true,
        closesAt: true,
        deliveryAddressId: true,
        billingAddressId: true,
      },
    });
    if (!last) return { defaults: null, source: "none" };
    const derived: RequestDefaults = {
      targetCountries: last.targetCountries,
      visibility: last.visibility,
      deliveryTerm: last.deliveryTerm,
      paymentCategory: last.paymentCategory,
      paymentDays: last.paymentDays,
      advancePercent: last.advancePercent,
      lcType: last.lcType,
      primaryCurrency: last.primaryCurrency,
      allowedCurrencies: last.allowedCurrencies.length ? last.allowedCurrencies : [last.primaryCurrency],
      isSealedBid: last.isSealedBid,
      bidVisibility: last.bidVisibility,
      requireAllItems: last.requireAllItems,
      requireBidDocument: last.requireBidDocument,
      closeDays: closeDaysBetween(last.publishedAt, last.closesAt),
      deliveryAddressId: last.deliveryAddressId,
      billingSameAsDelivery: !last.billingAddressId || last.billingAddressId === last.deliveryAddressId,
    };
    // Türetilen şart da tutarlı olmalı (eski ilan kuralı bozmuş olabilir).
    const ok = requestDefaultsSchema.safeParse(derived);
    return {
      defaults: ok.success
        ? await this.withValidAddress(companyId, this.normalize(ok.data, company?.country ?? null))
        : null,
      source: ok.success ? "last_listing" : "none",
    };
  }

  async save(user: AuthenticatedCompanyUser, input: unknown): Promise<RequestDefaultsResponse> {
    const parsed = requestDefaultsSchema.safeParse(input);
    if (!parsed.success) {
      // Her ihlal istek dilinde, alana özgü katalog metniyle (arayüz testi
      // D-007/D-046): zod'un ham İngilizce aralık mesajları kullanıcıya gitmez.
      const issues = [...new Set(parsed.error.issues.map(localizedIssue))];
      // Alan hataları (`errors: { closeDays: "…" }`) global ValidationPipe
      // şekliyle: istemci ilgili alanı işaretleyebilir ve interceptor ikinci
      // genel toast basmaz (arayüz testi kalanlar NUM — "12,50" gibi tam sayı
      // olmayan ya da 1…60 dışı teklif süresi alan bazında reddedilir).
      throw new BadRequestException({
        ...i18nMessage("api.companyRequestDefaults.talepSartlariGecersiz", {
          issues: issues.join(", "),
        }),
        errors: fieldErrorsOf(parsed.error.issues),
      });
    }
    const data = await this.withValidAddress(user.companyId, this.normalize(parsed.data, user.country ?? null));
    // Aktivite logu yalnız GERÇEKTEN değişen alanları yazar (arayüz testi
    // O-107): önceden her kayıtta şartın bütün anahtarları "değişti" sayılıyordu.
    const before = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { requestDefaults: true },
    });
    const prev = (before?.requestDefaults ?? null) as Record<string, unknown> | null;
    const changedFields = Object.keys(data).filter(
      (k) =>
        !prev ||
        JSON.stringify(prev[k] ?? null) !==
          JSON.stringify((data as unknown as Record<string, unknown>)[k] ?? null),
    );
    await this.prisma.company.update({
      where: { id: user.companyId },
      data: { requestDefaults: data as unknown as Prisma.InputJsonValue },
    });
    void this.audit.log({
      action: "company.request_defaults.updated",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company",
      entityId: user.companyId,
      metadata: { changedFields },
    });
    return { defaults: data, source: "saved" };
  }

  /**
   * Eski profil → yeni sözleşme: `isInternational` alanı kalktı (2026-09-21).
   * Saklı JSON'da hâlâ varsa ve `targetCountries` yoksa: yurtiçi → [firma
   * ülkesi], uluslararası → tüm ülkeler. Çıktı her zaman `targetCountries` taşır.
   *
   * Kayda kapalı ülke (`REGISTRATION_BLOCKED`) şartta KALMAZ (derin denetim
   * 2026-09-29 MU-09, gözden geçirme): talep yayını o ülkeyi 400
   * TARGET_COUNTRY_BLOCKED ile reddeder; eski talepten/saklı şarttan gelen ülke
   * formu önceden doldurup kullanıcının yaratmadığı bir hataya götürürdü.
   * Süzme listeyi boşaltırsa "tüm ülkeler"e GENİŞLEMEZ — firma ülkesine
   * (yurtiçi) daralır; firma ülkesi bilinmiyorsa boş (tüm ülkeler) kalır.
   */
  private normalize(d: z.infer<typeof requestDefaultsSchema>, country: string | null): RequestDefaults {
    const { isInternational, targetCountries, ...rest } = d;
    const blocked = (c: string) => REGISTRATION_BLOCKED.has(c.trim().toUpperCase());
    const home = country && !blocked(country) ? country : null;
    let tc =
      targetCountries !== undefined
        ? targetCountries
        : isInternational === false && home
          ? [home]
          : [];
    if (tc.length > 0) {
      const open = tc.filter((c) => !blocked(c));
      tc = open.length > 0 ? open : home ? [home] : [];
    }
    return { ...rest, targetCountries: tc };
  }

  /** Silinmiş adres profilde kalmasın — kapı: adres bu firmaya ait ve aktif. */
  private async withValidAddress(companyId: string, d: RequestDefaults): Promise<RequestDefaults> {
    if (!d.deliveryAddressId) return d;
    const addr = await this.prisma.companyAddress.findFirst({
      where: { id: d.deliveryAddressId, companyId },
      select: { id: true },
    });
    return addr ? d : { ...d, deliveryAddressId: null };
  }
}
