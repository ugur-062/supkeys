"use client";

import { Button } from "@/components/catalyst/button";
import { useCompanyMe } from "@/hooks/use-company-auth";
import type { CompanyTier } from "@/lib/company-auth/types";
import {
  PRICING_NOTE,
  PRICING_PLANS,
  type PricingPlan,
} from "@/lib/pricing/plans";
import { tierAtLeast } from "@rothern/shared";
import { CheckIcon } from "@heroicons/react/20/solid";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Doğrulama sayfası — satın almadan önce buraya yönlenir. */
export const VERIFICATION_HREF = "/company/ayarlar/dogrulama";

export const checkoutHref = (plan: PricingPlan) =>
  `/company/premium/satin-al?paket=${plan.slug}`;

/** Paket rozeti tonu — pazarlama sayfasındaki kimlikle aynı aile. */
const PILL: Record<CompanyTier, string> = {
  STANDART: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  SILVER: "bg-slate-100 text-slate-700 ring-slate-300",
  GOLD: "bg-yellow-50 text-yellow-800 ring-yellow-300",
};

/**
 * PAKETLER — PANEL İÇİ (2026-09-15, kullanıcı kararı: "sadece paketlerde
 * gözüksün, şık bir şekilde; önce doğrulamaya yönlendirsin, doğrulanmışsa
 * direkt satın alma ekranı gelsin").
 *
 * Eski ekran (`PremiumGate`) tek kart içinde uzun bir "neler açılır" listesi,
 * doğrulama kutusu ve "Gold manuel onayla veriliyor" notu taşıyordu. Artık
 * yalnız üç paket kartı; açıklama metni yok.
 *
 * AKIŞ — kararın yeri SATIN AL tıklaması:
 *  · doğrulanmamış → doğrulama sayfası (toast neden yönlendirildiğini söyler)
 *  · doğrulanmış   → satın alma ekranı (`/company/premium/satin-al`)
 * Doğrulama kartta ÖNCEDEN söylenir (küçük satır), sürpriz yönlendirme olmasın.
 * Paket işlemi yalnız KURUCUDA (`billing:manage` sahibe özel; backend
 * `upgradeToPremium` aynı kural) — diğer üyede düğme pasif ve nedenini yazar.
 *
 * `requiredTier`: kilitli bir sayfadan gelindiyse o paket vurgulanır ve başlık
 * hangi paketin gerektiğini TEK cümlede söyler.
 */
export function PackagesView({ requiredTier }: { requiredTier?: "SILVER" | "GOLD" }) {
  const me = useCompanyMe();
  const router = useRouter();

  const company = me.data?.company;
  const currentTier: CompanyTier = company?.tier ?? "STANDART";
  const verified = company?.companyVerificationStatus === "VERIFIED";
  const isOwner = me.data?.user.isOwner === true;

  // Vurgulanan kart: kilitli sayfanın istediği paket; yoksa bir üst paket.
  const highlight: CompanyTier | null =
    requiredTier && !tierAtLeast(currentTier, requiredTier)
      ? requiredTier
      : currentTier === "STANDART"
        ? "SILVER"
        : currentTier === "SILVER"
          ? "GOLD"
          : null;

  const buy = (plan: PricingPlan) => {
    if (!verified) {
      toast.info("Paket satın almadan önce firmanızı doğrulayın. Doğrulama ücretsizdir.");
      router.push(VERIFICATION_HREF);
      return;
    }
    router.push(checkoutHref(plan));
  };

  const requiredName = requiredTier
    ? PRICING_PLANS.find((p) => p.tier === requiredTier)?.name
    : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-4xl">
          Paketler
        </h1>
        <p className="mt-3 text-base text-pretty text-zinc-600">
          {requiredName && highlight === requiredTier
            ? `Bu sayfa ${requiredName} paketiyle açılır.`
            : "Görünmek ücretsiz, öne çıkmak paketli."}
        </p>
      </header>

      <ul
        role="list"
        className="mx-auto mt-10 grid max-w-md grid-cols-1 items-stretch gap-5 lg:max-w-none lg:grid-cols-3"
      >
        {PRICING_PLANS.map((plan) => {
          const current = plan.tier === currentTier;
          const included = !current && tierAtLeast(currentTier, plan.tier);
          const upgrade = !current && !included;
          const lifted = plan.tier === highlight;

          return (
            <li
              key={plan.tier}
              aria-label={`${plan.name} paketi`}
              className={cn(
                "relative flex flex-col rounded-2xl bg-white p-6 sm:p-7",
                lifted
                  ? "shadow-lg ring-2 ring-blue-600"
                  : "ring-1 ring-zinc-950/10",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
                    PILL[plan.tier],
                  )}
                >
                  {plan.name}
                </span>
                {current ? (
                  <span className="text-xs font-semibold text-zinc-600">
                    Mevcut paketiniz
                  </span>
                ) : null}
              </div>

              <p className="mt-5 flex items-baseline gap-x-1.5">
                {plan.monthlyUsd === null ? (
                  <span className="text-4xl font-semibold tracking-tight text-zinc-950">
                    Ücretsiz
                  </span>
                ) : (
                  <>
                    <span className="text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums">
                      ${plan.monthlyUsd}
                    </span>
                    <span className="text-sm text-zinc-500">/ay</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {plan.monthlyUsd === null ? "Süresiz" : "Yıllık ödemede, KDV hariç"}
              </p>

              <p className="mt-4 text-sm/6 text-zinc-700">{plan.tagline}</p>

              <ul
                role="list"
                className="mt-5 flex-1 space-y-2.5 border-t border-zinc-950/5 pt-5 text-sm/6 text-zinc-600"
              >
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-x-2.5">
                    <CheckIcon
                      aria-hidden
                      className={cn(
                        "h-6 w-5 flex-none",
                        lifted ? "text-blue-600" : "text-zinc-400",
                      )}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-7">
                {upgrade ? (
                  <>
                    {lifted ? (
                      <Button
                        color="blue"
                        className="w-full"
                        disabled={!isOwner}
                        onClick={() => buy(plan)}
                      >
                        {plan.name} satın al
                      </Button>
                    ) : (
                      <Button
                        outline
                        className="w-full"
                        disabled={!isOwner}
                        onClick={() => buy(plan)}
                      >
                        {plan.name} satın al
                      </Button>
                    )}
                    <p className="mt-2.5 flex min-h-5 items-center justify-center gap-1.5 text-center text-xs text-zinc-500">
                      {!isOwner ? (
                        "Paketi firma kurucusu satın alabilir"
                      ) : !verified ? (
                        <>
                          <ShieldCheckIcon aria-hidden className="size-4 shrink-0" />
                          Önce ücretsiz doğrulama
                        </>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <p className="flex h-9 items-center justify-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-600">
                    {current ? "Kullanıyorsunuz" : "Paketinize dahil"}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-zinc-500">
        {PRICING_NOTE}
      </p>
    </div>
  );
}
