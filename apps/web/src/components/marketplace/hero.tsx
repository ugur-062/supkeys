import { HeroSearch } from "./hero-search";
import { TrustStrip } from "./trust-strip";
import { Heading } from "@/components/catalyst/heading";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Pazar yeri hero'su — v2 (2026-09-04, Europages kalıbı).
 *
 * Başlık ürün→tedarikçi→teklif akışını söyler; arama İKİ sekme (Ürünler ·
 * Firmalar); altında "Talep aç" şeridi (RFQ) ve güven bandı. Sayfadaki kayıt
 * CTA'ları: header · bu şerit · iki-kart bölümü (en fazla 3).
 */
export function MarketplaceHero() {
  const tabs = [
    {
      key: "products" as const,
      label: MARKETPLACE_LABELS.products,
      action: MARKETPLACE_ROUTES.products,
      placeholder: "Ürün, marka veya parça numarası",
    },
    {
      key: "companies" as const,
      label: MARKETPLACE_LABELS.companies,
      action: MARKETPLACE_ROUTES.companies,
      placeholder: "Firma adı, sektör veya hizmet",
    },
  ];

  return (
    <div className="relative isolate overflow-hidden bg-white">
      <GradientBlob className="-top-40 sm:-top-80" position="left" />

      <div className="mx-auto max-w-7xl px-6 pt-32 pb-10 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Heading
            level={1}
            className="text-4xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-6xl"
          >
            Ürünü bul, tedarikçiyle konuş, teklifi kapalı zarfta al.
          </Heading>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-500">
            Türkiye&apos;nin alıcı ve tedarikçiyi tek hesapta buluşturan B2B pazar yeri.
          </p>

          <div className="mx-auto mt-9 max-w-2xl">
            <HeroSearch tabs={tabs} />
          </div>

          {/* RFQ şeridi — Europages "Post your request → Get quotes". */}
          <p className="mx-auto mt-6 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-zinc-50 px-4 py-2 text-sm text-zinc-600 ring-1 ring-zinc-950/5">
            <span>Aradığını bulamadın mı?</span>
            <Link
              href={signupHref("talep")}
              className="inline-flex items-center gap-1 font-semibold text-zinc-950 hover:text-zinc-600"
            >
              Talep aç
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
            <span>doğrulanmış tedarikçiler teklif versin.</span>
          </p>
        </div>
      </div>

      <TrustStrip />
      <GradientBlob className="top-[calc(100%-14rem)]" position="right" />
    </div>
  );
}

/** Arka plandaki yumuşak leke — radyal gradyan (blur filtresi LCP'yi geciktiriyordu). */
function GradientBlob({ className, position }: { className: string; position: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 h-[40rem] w-[60rem] rounded-full bg-[radial-gradient(closest-side,var(--color-emerald-200),transparent)] opacity-30 ${
        position === "left" ? "left-[calc(50%-40rem)]" : "left-[calc(50%-10rem)]"
      } ${className}`}
    />
  );
}
