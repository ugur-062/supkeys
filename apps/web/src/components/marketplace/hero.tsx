import { SearchForm } from "./search-form";
import { Heading } from "@/components/catalyst/heading";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Pazar yeri hero'su — AÇIK zemin.
 *
 * Tailwind Plus "Marketing / Heroes / simple centered" düzeni: beyaz zemin +
 * arkada yumuşak bir gradient leke. Koyu banttan buraya döndük çünkü koyu
 * zemin sayfanın geri kalanıyla (beyaz envanter kartları) çarpışıyordu ve
 * ürün kararı açık kalması yönünde.
 *
 * Leke `clipPath` ile kesilen tek bir div; renk PALET SINIFINDAN geliyor
 * (repo ham hex'i yasaklıyor — eslint no-restricted-syntax). Orijinal örnek
 * pembe/mor kullanıyor; marka monokrom olduğu için zinc→emerald tonuna
 * çevrildi ve opaklık düşürüldü, arka plan gürültüsü olmaktan çıktı.
 *
 * SAYAÇ IZGARASI KALDIRILDI (kullanıcı kararı): "Satılık ilan 1" gibi bir
 * kutu envanteri duyurmuyor, aksine ne kadar az olduğunu ilan ediyordu;
 * "Kategori 158.018 / Sektör 58 / Komisyon %0" ise ziyaretçinin o an sorduğu
 * soruya ("burada ne var") yanıt vermeyen kurum içi rakamlardı.
 */
export function MarketplaceHero() {
  return (
    <div className="relative isolate overflow-hidden bg-white">
      <GradientBlob className="-top-40 sm:-top-80" position="left" />

      <div className="mx-auto max-w-7xl px-6 pt-32 pb-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-8 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm/6 font-medium text-zinc-700 ring-1 ring-zinc-950/10 backdrop-blur">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Herkese açık pazar yeri
            </div>
          </div>

          <Heading
            level={1}
            className="text-4xl font-semibold tracking-tight text-balance !text-zinc-950 sm:text-6xl"
          >
            Alım talebini bul, teklifini ver
          </Heading>
          <p className="mx-auto mt-6 max-w-2xl text-lg/8 text-pretty text-zinc-500">
            Firmaların herkese açık alım taleplerini ve satılık ilanlarını
            inceleyin. Görmek için üyelik gerekmez; teklif vermek ücretsiz
            hesapla.
          </p>

          <div className="mx-auto mt-9 max-w-2xl">
            <SearchForm action={MARKETPLACE_ROUTES.demands} size="lg" />
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

function HeroLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-semibold text-zinc-900 transition hover:text-zinc-600"
    >
      {label}
      <ArrowRightIcon aria-hidden className="size-4" />
    </Link>
  );
}
