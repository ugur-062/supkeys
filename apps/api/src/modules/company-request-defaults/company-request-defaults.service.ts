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
  DOMESTIC_ONLY_PAYMENT_CATEGORIES,
  INTERNATIONAL_ONLY_PAYMENT_CATEGORIES,
  REQUEST_CLOSE_DAYS_MAX,
  closeDaysBetween,
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
    isInternational: z.boolean(),
    visibility: z.nativeEnum(ListingVisibility),
    deliveryTerm: z.nativeEnum(ListingDeliveryTerm).nullable(),
    paymentCategory: z.nativeEnum(ListingPaymentCategory),
    paymentDays: z.number().int().min(1).max(365).nullable(),
    advancePercent: z.number().int().min(1).max(100).nullable(),
    lcType: z.nativeEnum(LcType).nullable(),
    primaryCurrency: z.nativeEnum(Currency),
    allowedCurrencies: z.array(z.nativeEnum(Currency)).min(1).max(8),
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
      ctx.addIssue({ code: "custom", path: ["allowedCurrencies"], message: "Ana para birimi izin verilenler arasında olmalı" });
    }
    if (!d.isInternational && (INTERNATIONAL_ONLY_PAYMENT_CATEGORIES as readonly string[]).includes(d.paymentCategory)) {
      ctx.addIssue({ code: "custom", path: ["paymentCategory"], message: "Bu ödeme şekli yalnız uluslararası talepte seçilebilir" });
    }
    if (d.isInternational && (DOMESTIC_ONLY_PAYMENT_CATEGORIES as readonly string[]).includes(d.paymentCategory)) {
      ctx.addIssue({ code: "custom", path: ["paymentCategory"], message: "Bu ödeme şekli yalnız yurtiçi talepte seçilebilir" });
    }
    if (["DEFERRED", "CHEQUE", "SENET"].includes(d.paymentCategory) && !d.paymentDays) {
      ctx.addIssue({ code: "custom", path: ["paymentDays"], message: "Vade gün sayısı zorunlu" });
    }
    if (d.paymentCategory === "LETTER_OF_CREDIT" && !d.lcType) {
      ctx.addIssue({ code: "custom", path: ["lcType"], message: "Akreditif alt tipini seçin" });
    }
    if (d.paymentCategory === "ADVANCE" && d.isInternational && (d.advancePercent ?? 100) !== 100) {
      ctx.addIssue({ code: "custom", path: ["advancePercent"], message: "Uluslararası talepte tam peşin" });
    }
  });

@Injectable()
export class CompanyRequestDefaultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(companyId: string): Promise<RequestDefaultsResponse> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { requestDefaults: true },
    });
    const saved = requestDefaultsSchema.safeParse(company?.requestDefaults ?? null);
    if (saved.success) {
      return { defaults: await this.withValidAddress(companyId, saved.data), source: "saved" };
    }
    const last = await this.prisma.listing.findFirst({
      where: { companyId, type: "ALIM", publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: {
        isInternational: true,
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
      isInternational: last.isInternational,
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
    return { defaults: ok.success ? await this.withValidAddress(companyId, ok.data) : null, source: ok.success ? "last_listing" : "none" };
  }

  async save(user: AuthenticatedCompanyUser, input: unknown): Promise<RequestDefaultsResponse> {
    const parsed = requestDefaultsSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const data = await this.withValidAddress(user.companyId, parsed.data);
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
      metadata: { changedFields: Object.keys(data) },
    });
    return { defaults: data, source: "saved" };
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
