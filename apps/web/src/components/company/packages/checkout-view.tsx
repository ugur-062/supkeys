"use client";

import { Button } from "@/components/catalyst/button";
import { useCompanyMe, useUpgradePremium } from "@/hooks/use-company-auth";
import { OPERATOR } from "@/lib/company-info";
import { formatUsd, planBySlug, type PricingPlan } from "@/lib/pricing/plans";
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
  const params = useSearchParams();
  const router = useRouter();
  const me = useCompanyMe();
  const upgrade = useUpgradePremium();
  const plan = planBySlug(params.get("paket"));

  const company = me.data?.company;
  const loaded = !!me.data;
  const verified = company?.companyVerificationStatus === "VERIFIED";
  const redirected = useRef(false);

  useEffect(() => {
    if (redirected.current) return;
    if (!plan || plan.monthlyUsd === null) {
      redirected.current = true;
      router.replace(PACKAGES_HREF);
      return;
    }
    if (loaded && !verified) {
      redirected.current = true;
      toast.info("Paket satın almadan önce firmanızı doğrulayın. Doğrulama ücretsizdir.");
      router.replace(VERIFICATION_HREF);
    }
  }, [plan, loaded, verified, router]);

  if (!plan || plan.monthlyUsd === null || !loaded || !verified) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-zinc-500" role="status">
        Yükleniyor…
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
            ? `${plan.name} paketi zaten firmanızda`
            : "Paketi firma kurucusu satın alabilir"}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          {alreadyHas
            ? "Bu paketin bütün özellikleri hesabınızda açık."
            : "Paket ve fatura işlemleri yalnız firma kurucusunun hesabından yapılır."}
        </p>
        <Button href={PACKAGES_HREF} outline className="mt-6">
          Paketlere dön
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
  const router = useRouter();
  const monthly = plan.monthlyUsd ?? 0;
  const yearly = monthly * 12;
  // Eski self-servis uç yalnız GOLD'a yükseltir; Silver'da kullanılamaz.
  const canPayNow = selfUpgrade && plan.tier === "GOLD";

  const mailto = `mailto:${OPERATOR.supportEmail}?subject=${encodeURIComponent(
    `${plan.name} paket satın alma — ${companyName}`,
  )}&body=${encodeURIComponent(
    `Merhaba,\n\n${companyName} için ${plan.name} paketini yıllık dönemle satın almak istiyoruz.\n\n`,
  )}`;

  const payNow = async () => {
    try {
      await upgrade.mutateAsync();
      toast.success(`${plan.name} paketi açıldı`);
      router.push("/company/satinalma");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Paket açılamadı"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <Link
        href={PACKAGES_HREF}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950"
      >
        <ArrowLeftIcon aria-hidden className="size-4" />
        Paketler
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
        {plan.name} paketini satın al
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
                Değiştir
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
              Ödeme dönemi
            </h2>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-xl p-4 ring-2 ring-blue-600">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Yıllık, peşin</p>
                <p className="mt-0.5 text-xs text-zinc-500">12 ay kesintisiz kullanım</p>
              </div>
              <p className="text-right text-sm text-zinc-700 tabular-nums">
                <span className="font-semibold text-zinc-950">{formatUsd(monthly)}</span>/ay
              </p>
            </div>
          </section>

          <section aria-labelledby="co-fatura" className="rounded-2xl bg-white p-6 ring-1 ring-zinc-950/10">
            <h2 id="co-fatura" className="text-base font-semibold text-zinc-950">
              Fatura bilgileri
            </h2>
            <dl className="mt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Unvan</dt>
                <dd className="text-right font-medium text-zinc-950">{companyName}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-zinc-500">
              Fatura unvanı ve vergi kimliği Firma Bilgileri’nden alınır.{" "}
              <Link href="/company/ayarlar/firma" className="font-medium text-blue-700 hover:text-blue-800">
                Firma Bilgileri
              </Link>
            </p>
          </section>
        </div>

        <aside aria-labelledby="co-ozet" className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/10 lg:sticky lg:top-20">
          <h2 id="co-ozet" className="text-base font-semibold text-zinc-950">
            Özet
          </h2>
          <dl className="mt-4 space-y-2.5 text-sm tabular-nums">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">{plan.name} · yıllık</dt>
              <dd className="text-zinc-950">
                {formatUsd(monthly)} × 12
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-600">KDV</dt>
              <dd className="text-zinc-600">Faturada eklenir</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-zinc-950/10 pt-3">
              <dt className="font-semibold text-zinc-950">Toplam</dt>
              <dd className="text-2xl font-semibold tracking-tight text-zinc-950">
                {formatUsd(yearly)}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-zinc-500">USD, KDV hariç</p>

          {canPayNow ? (
            <Button
              color="blue"
              className="mt-6 w-full"
              disabled={upgrade.isPending}
              onClick={payNow}
            >
              <CreditCardIcon data-slot="icon" />
              {upgrade.isPending ? "İşleniyor…" : "Satın al"}
            </Button>
          ) : (
            // Ödeme altyapısı gelene dek TEK eylem talep. "Ödeme yakında"
            // gibi bir yazı ya da pasif düğme ÇİZİLMEZ (2026-09-15, kullanıcı
            // kararı).
            <Button href={mailto} color="blue" className="mt-6 w-full">
              Satın alma talebi gönder
            </Button>
          )}

        </aside>
      </div>
    </div>
  );
}
