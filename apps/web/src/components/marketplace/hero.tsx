"use client";

import { AudienceSwitch, useAudience } from "./audience-switch";
import { SearchTypeahead } from "./search-typeahead";
import { TrustStrip } from "./trust-strip";
import { Heading } from "@/components/catalyst/heading";
import { categoryPath } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Pazar yeri hero'su — v2 (2026-09-04, Europages kalıbı) + ALICIYIM /
 * TEDARİKÇİYİM anahtarı (2026-09-07, kullanıcı kararı).
 *
 * Anahtar başlığın HEMEN ÜSTÜNDE; seçilen taraf başlığı, arama kapsamını ve
 * alttaki şeridi birlikte değiştirir — alıcıya ürün, tedarikçiye açık talep.
 * Yarım çevirmek (yalnız aramayı değiştirmek) "ürünü bul" başlığıyla talep
 * arayan bir tedarikçiyi karşı karşıya bırakırdı.
 *
 * Sunucu HER ZAMAN alıcı yüzünü basar (hidrasyon kuralı); tercih istemcide.
 */
export function MarketplaceHero({
  popular = [],
}: {
  /** Arama kutusunun altındaki hızlı çipler — ürün sayısı en yüksek alt kategoriler. */
  popular?: { id: string; name: string; count: number }[];
} = {}) {
  const { audience } = useAudience();
  const supplier = audience === "supplier";
  return (
    <div className="relative isolate overflow-hidden bg-white">
      <GradientBlob className="-top-40 sm:-top-80" position="left" />

      <div className="mx-auto max-w-7xl px-6 pt-32 pb-10 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <AudienceSwitch className="mb-6" />
          <Heading
            level={1}
            className="text-4xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-5xl xl:text-6xl"
          >
            {supplier
              ? "Alıcılar ne arıyor gör, teklifini kapalı zarfta ver."
              : "Ürünü bul, tedarikçiyle konuş, teklifi kapalı zarfta al."}
          </Heading>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-500">
            Türkiye&apos;nin alıcı ve tedarikçiyi tek hesapta buluşturan B2B pazar yeri.
          </p>

          {/* `data-hero-search`: header ve yüzen CTA bu kutuyu gözler — kutu
              görünümden çıkınca kompakt arama ve "Talep aç" belirir (B8). */}
          <div data-hero-search className="mx-auto mt-9 max-w-2xl">
            {/* Kapsam taraftan gelir: alıcı ürün/firma arar, tedarikçi TALEP.
                `key` ile sıfırlanır — taraf değişince kutuda önceki tarafın
                yazdığı sorgu ve önerileri kalmasın. */}
            <SearchTypeahead
              key={audience}
              size="lg"
              scopes={supplier ? ["listings", "companies"] : ["products", "companies"]}
              defaultScope={supplier ? "listings" : "products"}
            />
          </div>

          {popular.length > 0 && !supplier ? (
            <nav aria-label="Popüler kategoriler" className="mx-auto mt-4 flex max-w-2xl flex-wrap items-center justify-center gap-x-1.5 gap-y-1.5 text-xs">
              <span className="text-zinc-500">Popüler:</span>
              {popular.slice(0, 6).map((c) => (
                <Link
                  key={c.id}
                  href={categoryPath(c.id, c.name)}
                  className="max-w-[14rem] truncate rounded-full bg-zinc-100 px-2.5 py-1 font-medium text-zinc-700 transition hover:bg-zinc-950 hover:text-white"
                >
                  {c.name}
                </Link>
              ))}
            </nav>
          ) : null}

          {/* Şerit — alıcıda RFQ ("Post your request"), tedarikçide vitrin. */}
          <p className="mx-auto mt-6 inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-zinc-50 px-4 py-2 text-sm text-zinc-600 ring-1 ring-zinc-950/5">
            <span>{supplier ? "Sana uygun talep yok mu?" : "Aradığını bulamadın mı?"}</span>
            <Link
              href={signupHref(supplier ? "vitrin" : "talep")}
              className="inline-flex items-center gap-1 font-semibold text-zinc-950 hover:text-zinc-600"
            >
              {supplier ? "Ürünlerini listele" : "Talep aç"}
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
            <span>{supplier ? "alıcılar seni bulsun." : "doğrulanmış tedarikçiler teklif versin."}</span>
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
