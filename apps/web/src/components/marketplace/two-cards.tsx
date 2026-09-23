import { useTranslations } from "next-intl";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { CheckIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";

/** Europages "Create profile / Request Hub" ikilisi — sayfadaki üçüncü kayıt CTA'sı. */
export function TwoCards() {
  const t = useTranslations("web.marketing.twoCards");
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-zinc-950 p-8 text-white">
          <h2 className="text-2xl font-semibold tracking-tight">{t("sellTitle")}</h2>
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            {[t("sellPoint1"), t("sellPoint2"), t("sellPoint3")].map((point) => (
              <li key={point} className="flex gap-2"><CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-400" />{point}</li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={signupHref("vitrin")} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200">
              {t("createProfile")}
            </Link>
            <Link href="/nasil-calisir#fiyatlar" className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-900">
              {t("seePremium")}
            </Link>
          </div>
        </div>
        <div className="rounded-3xl bg-zinc-50 p-8 ring-1 ring-zinc-950/5">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">{t("buyTitle")}</h2>
          <p className="mt-3 text-sm/6 text-zinc-600">{t("buyBody")}</p>
          <Link
            href={MARKETPLACE_ROUTES.demands}
            className="mt-6 inline-flex rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t("seeDemands")}
          </Link>
        </div>
      </div>
    </section>
  );
}
