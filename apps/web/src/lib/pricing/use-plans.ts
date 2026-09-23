import { PRODUCT_LIMITS } from "@rothern/shared";
import { useTranslations } from "next-intl";
import { PRICING_PLANS, type PricingPlan } from "./plans";

/**
 * Paket kartları — DİL BİLEN sürüm (i18n Faz 1). Yapı (kademe, slug, fiyat,
 * özellik SAYISI) `PRICING_PLANS`ten; metin (ad, slogan, özellik, çağrı)
 * katalogdan (`web.pricing.plans.<slug>.*`). Türkçe katalog ile `plans.ts`
 * metinlerinin birebir olduğunu `__tests__/plans-i18n.test.ts` kilitler —
 * panel Faz 2'de bu hook'a geçince `plans.ts`teki Türkçe metin düşer.
 */
export function usePricingPlans(): { plans: PricingPlan[]; note: string } {
  const t = useTranslations("web.pricing");
  const plans = PRICING_PLANS.map((p) => ({
    ...p,
    name: t(`plans.${p.slug}.name`),
    tagline: t(`plans.${p.slug}.tagline`),
    cta: t(`plans.${p.slug}.cta`),
    features: p.features.map((_, i) =>
      t(`plans.${p.slug}.f${i + 1}` as never, { n: PRODUCT_LIMITS.STANDART } as never),
    ),
  }));
  return { plans, note: t("note") };
}
