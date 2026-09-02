import { GridPattern } from "./grid-pattern";
import { SearchForm } from "./search-form";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Pazar yeri hero'su — KOYU.
 *
 * Beyaz üstüne ortalanmış başlıktan koyu bir banda geçtim: pazarlama sayfası
 * (`/nasil-calisir`) zaten bu dili konuşuyor (zinc-950 zemin, ızgara deseni,
 * emerald eyebrow) ve anasayfa ondan kopuk duruyordu. Ayrıca envanter azken
 * beyaz-üstüne-beyaz düzen sayfayı "boş" değil "bitmemiş" gösteriyordu; koyu
 * bant sayfaya ağırlık merkezi veriyor.
 *
 * Izgara deseni ve parıltı saf CSS (inline SVG data-uri YOK, harici görsel
 * YOK) — CSP `img-src`/`connect-src` kısıtlarına takılmaz ve statik HTML'de
 * ek istek üretmez.
 */
export function MarketplaceHero({
  stats,
}: {
  stats: { label: string; value: string }[];
}) {
  return (
    <section className="relative isolate overflow-hidden bg-zinc-950 px-6 pt-32 pb-16 lg:px-8">
      <GridPattern id="hero-grid" />
      {/* yumuşak parıltı */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 size-[44rem] -translate-x-1/2 rounded-full bg-gradient-to-tr from-emerald-500/10 via-white/5 to-transparent blur-3xl"
      />

      <div className="relative mx-auto max-w-4xl text-center">
        <p className="text-sm/6 font-semibold text-emerald-400">
          Herkese açık pazar yeri
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-white sm:text-6xl">
          Alım talebini bul, teklifini ver
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg/8 text-pretty text-zinc-400">
          Firmaların herkese açık alım taleplerini ve satılık ilanlarını
          inceleyin. Görmek için üyelik gerekmez; teklif vermek ücretsiz
          hesapla.
        </p>

        <div className="mx-auto mt-9 max-w-2xl">
          <SearchForm action={MARKETPLACE_ROUTES.demands} tone="dark" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
          <HeroLink
            href={MARKETPLACE_ROUTES.demands}
            label={MARKETPLACE_LABELS.demands}
          />
          <HeroLink
            href={MARKETPLACE_ROUTES.offers}
            label={MARKETPLACE_LABELS.offers}
          />
          <HeroLink
            href={MARKETPLACE_ROUTES.companies}
            label={MARKETPLACE_LABELS.companies}
          />
        </div>
      </div>

      {stats.length > 0 ? (
        <dl className="relative mx-auto mt-16 grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-zinc-950 px-5 py-6">
              <dt className="text-xs/5 text-zinc-500">{s.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-tight text-white">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function HeroLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-medium text-zinc-300 transition hover:text-white"
    >
      {label}
      <ArrowRightIcon aria-hidden className="size-4" />
    </Link>
  );
}
