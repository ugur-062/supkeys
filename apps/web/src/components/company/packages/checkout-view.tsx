"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatNumber } from "@/i18n/format";
import { Button } from "@/components/catalyst/button";
import { useCompanyMe, useUpgradePremium } from "@/hooks/use-company-auth";
import { OPERATOR } from "@/lib/company-info";
import type { PricingPlan } from "@/lib/pricing/plans";
import { usePricingPlans } from "@/lib/pricing/use-plans";
import { extractErrorMessage } from "@/lib/tenders/error";
import { tierAtLeast } from "@rothern/shared";
import { CheckIcon } from "@heroicons/react/20/solid";
import {
  ArrowLeftIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { VERIFICATION_HREF } from "./packages-view";

const PACKAGES_HREF = "/company/premium";

/**
 * SATIN ALMA EKRANI (2026-09-15, kullanıcı kararı: "doğrulanmışsa direkt satın
 * alma ekranı gelsin — ödeme altyapısı yok, kurulacak").
 *
 * Ekran ödeme sağlayıcısı (PayTR) gelince yalnız SAĞ KARTIN düğmesi değişecek
 * şekilde kuruldu: paket, dönem, fatura unvanı ve tutar bugünden gerçek.
 *
 * Bugün ödeme düğmesi YOK ve "ödeme yakında" türü bir yazı da YOK (kullanıcı
 * kararı); tek eylem — birincil renkte — destek ekibine hazır konulu e-posta: paket bugün admin tarafından açılıyor.
 * İstisna: backend `PREMIUM_SELF_UPGRADE_ENABLED` açıksa (yalnız GOLD'a
 * yükselten eski self-servis uç) Gold'da düğme o ucu çağırır.
 *
 * KAPILAR (sayfa doğrudan adresle açılabilir, kart tıklamasına güvenilmez):
 *  · geçersiz `paket` / ücretsiz paket → Paketler'e döner
 *  · doğrulanmamış → doğrulama sayfasına yönlenir
 *  · paket zaten sizde ya da kurucu değilsiniz → açıklama + geri dönüş
 * Asıl güvenlik sınırı sunucuda (`upgradeToPremium`: kurucu + VERIFIED).
 */
export function CheckoutView() {
  const t = useTranslations("web.panel.premium.checkoutView");
  const params = useSearchParams();
  const router = useRouter();
  const me = useCompanyMe();
  const upgrade = useUpgradePremium();
  // Paket metni katalogdan (`web.pricing.plans.*`, `usePricingPlans`); yapı `PRICING_PLANS`ten.
  const { plans } = usePricingPlans();
  const slug = params.get("paket")?.toLowerCase();
  const plan = plans.find((p) => p.slug === slug) ?? null;
  const invalid = !plan || plan.monthlyUsd === null;

  const company = me.data?.company;
  const loaded = !!me.data;
  const verified = company?.companyVerificationStatus === "VERIFIED";
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    if (invalid) {
      redirected.current = true;
      router.replace(PACKAGES_HREF);
      return;
    }
    if (loaded && !verified) {
      redirected.current = true;
      toast.info(t("paketSatinAlmadanOnceFirmanizi"));
      router.replace(VERIFICATION_HREF);
    }
  }, [invalid, loaded, verified, router, t]);

  if (!plan || invalid || !loaded || !verified) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-zinc-500" role="status">
        {t("yukleniyor")}
      </div>
    );
  }

  const alreadyHas = tierAtLeast(company!.tier, plan.tier);
  const isOwner = me.data!.user.isOwner;

  if (alreadyHas || !isOwner) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-zinc-950">
          {alreadyHas
            ? t("paketiZatenFirmanizda", { name: plan.name })
            : t("paketiFirmaKurucusuSatinAlabilir")}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {alreadyHas
            ? t("buPaketinButunOzellikleriHesabinizda")
            : t("paketVeFaturaIslemleriYalniz")}
        </p>
        <Button href={PACKAGES_HREF} outline className="mt-6">
          {t("paketlereDon")}
        </Button>
      </div>
    );
  }

  return <Checkout plan={plan} companyName={company!.name} upgrade={upgrade} selfUpgrade={me.data!.selfUpgradeEnabled} />;
}

function Checkout({
  plan,
  companyName,
  upgrade,
  selfUpgrade,
}: {
  plan: PricingPlan;
  companyName: string;
  upgrade: ReturnType<typeof useUpgradePremium>;
  selfUpgrade: boolean;
}) {
  const t = useTranslations("web.panel.premium.checkoutView");
  const locale = useLocale();
  const router = useRouter();
  /** "$1.920" — görüntüleme dilinin binlik ayracıyla, USD. */
  const usd = (n: number) => `$${formatNumber(n, locale)}`;
  const monthly = plan.monthlyUsd ?? 0;
  const yearly = monthly * 12;
  // Eski self-servis uç yalnız GOLD'a yükseltir; Silver'da kullanılamaz.
  const canPayNow = selfUpgrade && plan.tier === "GOLD";

  const mailto = `mailto:${OPERATOR.supportEmail}?subject=${encodeURIComponent(
    t("mailKonu", { name: plan.name, company: companyName }),
  )}&body=${encodeURIComponent(t("mailGovde", { name: plan.name, company: companyName }))}`;

  const payNow = async () => {
    try {
      await upgrade.mutateAsync();
      toast.success(t("paketiAcildi", { name: plan.name }));
      router.push("/company/satinalma");
    } catch (err) {
      toast.error(extractErrorMessage(err, t("paketAcilamadi")));
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <Link
        href={PACKAGES_HREF}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        {t("paketler")}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
        {t("paketiniSatinAl", { name: plan.name })}
      </h1>

      <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section aria-labelledby="co-paket" className="rounded-2xl bg-white p-6 ring-1 ring-zinc-950/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="co-paket" className="text-base font-semibold text-zinc-950">
                  {plan.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">{plan.tagline}</p>
              </div>
              <Link
                href={PACKAGES_HREF}
                className="shrink-0 text-sm font-medium text-blue-700 hover:text-blue-800"
              >
                {t("degistir")}
              </Link>
            </div>
            <ul role="list" className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-zinc-950/5 pt-5 text-sm/6 text-zinc-600 sm:grid-cols-2">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-x-2">
                  <CheckIcon aria-hidden className="h-6 w-5 flex-none text-blue-600" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="co-donem" className="rounded-2xl bg-white p-6 ring-1 ring-zinc-950/10">
            <h2 id="co-donem" className="text-base font-semibold text-zinc-950">
              {t("odemeDonemi")}
            </h2>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl p-4 ring-2 ring-blue-600">
              <div>
                <p className="text-sm font-semibold text-zinc-950">{t("yillikPesin")}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{t("n12AyKesintisizKullanim")}</p>
              </div>
              <p className="text-right text-sm text-zinc-700 tabular-nums">
                <span className="font-semibold text-zinc-950">{usd(monthly)}</span>{t("ay")}
              </p>
            </div>
          </section>

          <section aria-labelledby="co-fatura" className="rounded-2xl bg-white p-6 ring-1 ring-zinc-950/10">
            <h2 id="co-fatura" className="text-base font-semibold text-zinc-950">
              {t("faturaBilgileri")}
            </h2>
            <dl className="mt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">{t("unvan")}</dt>
                <dd className="text-right font-medium text-zinc-950">{companyName}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-zinc-500">
              {t("faturaUnvaniVeVergiKimligi")}{" "}
              <Link href="/company/ayarlar/firma" className="font-medium text-blue-700 hover:text-blue-800">
                {t("firmaBilgileri")}
              </Link>
            </p>
          </section>
        </div>

        <aside aria-labelledby="co-ozet" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/10 lg:sticky lg:top-20">
          <h2 id="co-ozet" className="text-base font-semibold text-zinc-950">
            {t("ozet")}
          </h2>
          <dl className="mt-4 space-y-2.5 text-sm tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">{t("yillik", { name: plan.name })}</dt>
              <dd className="text-zinc-950">
                {t("carpi12", { amount: usd(monthly) })}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">{t("kdv")}</dt>
              <dd className="text-zinc-600">{t("faturadaEklenir")}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-zinc-950/10 pt-3">
              <dt className="font-semibold text-zinc-950">{t("toplam")}</dt>
              <dd className="text-2xl font-semibold tracking-tight text-zinc-950">
                {usd(yearly)}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-zinc-500">{t("usdKdvHaric")}</p>

          {canPayNow ? (
            <Button
              color="blue"
              className="mt-6 w-full"
              disabled={upgrade.isPending}
              onClick={payNow}
            >
              <CreditCardIcon data-slot="icon" />
              {upgrade.isPending ? t("isleniyor") : t("satinAl")}
            </Button>
          ) : (
            // Ödeme altyapısı gelene dek TEK eylem talep. "Ödeme yakında"
            // gibi bir yazı ya da pasif düğme ÇİZİLMEZ (2026-09-15, kullanıcı
            // kararı).
            <Button href={mailto} color="blue" className="mt-6 w-full">
              {t("satinAlmaTalebiGonder")}
            </Button>
          )}

        </aside>
      </div>
    </div>
  );
}
