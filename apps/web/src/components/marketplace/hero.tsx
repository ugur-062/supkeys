import { HeroSearch } from "./hero-search";
import { Heading } from "@/components/catalyst/heading";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import Link from "next/link";

/**
 * Pazar yeri hero'su — AÇIK zemin, İKİ TARAFA seslenir (2026-09-04).
 *
 * Eski başlık ("Alım talebini bul, teklifini ver") yalnız satıcıya
 * konuşuyordu; Rothern'in farkı tek hesapta alıcı + satıcı. Hero altındaki
 * üç hızlı bağlantı KALKTI (header'da aynı beş bağlantı zaten var — aynı
 * bilgi üç yerde okunuyordu). Sayfadaki kayıt CTA'ları üçe indi: header,
 * hero altı, kapanış.
 *
 * Leke `clipPath` ile kesilen tek div; renk palet sınıfından (ham hex yasak).
 */
export function MarketplaceHero() {
  const tabs = [
    {
      key: "products",
      label: MARKETPLACE_LABELS.products,
      action: MARKETPLACE_ROUTES.products,
      placeholder: "Ürün, marka veya parça numarası",
    },
    {
      key: "demands",
      label: MARKETPLACE_LABELS.demands,
      action: MARKETPLACE_ROUTES.demands,
      placeholder: "Aranan malzeme veya hizmet",
    },
    {
      key: "offers",
      label: MARKETPLACE_LABELS.offers,
      action: MARKETPLACE_ROUTES.offers,
      placeholder: "Satılık ürün veya hizmet",
    },
    {
      key: "companies",
      label: MARKETPLACE_LABELS.companies,
      action: MARKETPLACE_ROUTES.companies,
      placeholder: "Firma adı, sektör veya hizmet",
    },
  ];

  return (
    <div className="relative isolate overflow-hidden bg-white">
      <GradientBlob className="-top-40 sm:-top-80" position="left" />

      <div className="mx-auto max-w-7xl px-6 pt-32 pb-14 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm/6 font-medium text-zinc-700 ring-1 ring-zinc-950/10 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Herkese açık B2B pazar yeri
            </div>
          </div>

          <Heading
            level={1}
            className="text-4xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-6xl"
          >
            Al, sat, tek hesap.
          </Heading>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-500">
            Alım taleplerini incele, ürünleri keşfet, kapalı zarf teklif ver.
            İncelemek ücretsiz; teklif vermek ve firma detayları için hesap
            gerekir.
          </p>

          <div className="mx-auto mt-9 max-w-2xl">
            <HeroSearch tabs={tabs} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
            <Link
              href="/company/kayit"
              className="rounded-full bg-zinc-950 px-5 py-2.5 font-semibold text-white transition hover:bg-zinc-800"
            >
              Ücretsiz kaydol
            </Link>
            <span className="text-zinc-500">
              Kredi kartı gerekmez · Komisyon yok
            </span>
          </div>
        </div>
      </div>

      <GradientBlob className="top-[calc(100%-14rem)]" position="right" />
    </div>
  );
}

/**
 * Arka plandaki yumuşak leke. `aspect-1155/678` + `clipPath` Tailwind Plus
 * örneğinden birebir; renkler palet sınıfı.
 */
function GradientBlob({
  className,
  position,
}: {
  className: string;
  position: "left" | "right";
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 -z-10 transform-gpu overflow-hidden blur-3xl ${className}`}
    >
      <div
        style={{
          clipPath:
            "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
        }}
        className={`relative aspect-1155/678 w-144.5 -translate-x-1/2 bg-gradient-to-tr from-emerald-200 to-zinc-300 opacity-25 sm:w-288.75 ${
          position === "left"
            ? "left-[calc(50%-11rem)] rotate-30 sm:left-[calc(50%-30rem)]"
            : "left-[calc(50%+3rem)] sm:left-[calc(50%+36rem)]"
        }`}
      />
    </div>
  );
}
