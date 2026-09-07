import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { LockKeyhole, Search, Send } from "lucide-react";
import Link from "next/link";

/**
 * ALICI AKIŞI — üç adım, yatay (B3, 2026-09-04). "Talep aç" bannerının
 * YERİNE: hero şeridi zaten "Talep aç" diyordu, banner aynı CTA'yı ikinci
 * kez basıyordu. Bu bölüm CTA tekrarlamak yerine YOLU gösterir: Ara →
 * Teklif iste → Kapalı zarfta karşılaştır. Tek bağlantı, adımın içinde.
 * Tedarikçi akışı (Kaydol → Kapalı zarf teklif ver → Siparişe dönüştür)
 * aşağıdaki `TrustBand`da — iki bölüm iki tarafı anlatır, kopya değil.
 */
export interface FlowLinks {
  /** 1. adım: ürün listesi. */
  browse: string;
  /** 2. adım: talep aç (public'te kayıt, panelde sihirbaz). */
  create: string;
  /** 3. adım: nasıl çalışır. */
  help: string;
}

const PUBLIC_LINKS: FlowLinks = {
  browse: MARKETPLACE_ROUTES.products,
  create: signupHref("talep"),
  help: "/nasil-calisir",
};

const STEPS = [
  {
    icon: Search,
    title: "Ara",
    body: "Ürünü, firmayı veya kategoriyi bul. Fiyat ve minimum sipariş kartta yazar.",
    link: "browse" as const,
    linkLabel: "Ürünlere göz at",
  },
  {
    icon: Send,
    title: "Teklif iste",
    body: "Bulduysan firmaya bilgi talebi gönder; bulamadıysan talep aç, kategorinle eşleşen tedarikçiler teklif versin.",
    link: "create" as const,
    linkLabel: "Talep aç",
  },
  {
    icon: LockKeyhole,
    title: "Kapalı zarfta karşılaştır",
    body: "Teklifçiler birbirini görmez. Tek tabloda karşılaştır, kazandır; sipariş kendiliğinden oluşur.",
    link: "help" as const,
    linkLabel: "Nasıl çalışır",
  },
] as const;

export function HowItWorksFlow({ links = PUBLIC_LINKS }: { links?: FlowLinks } = {}) {
  return (
    <section aria-labelledby="alici-akisi" className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
      <h2 id="alici-akisi" className="sr-only">
        Alıcı için üç adım
      </h2>
      <ol className="grid gap-4 rounded-3xl bg-zinc-50 p-6 ring-1 ring-zinc-950/5 sm:grid-cols-3 sm:gap-0 sm:p-0">
        {STEPS.map((s, i) => (
          <li
            key={s.title}
            className="relative flex gap-4 sm:flex-col sm:gap-3 sm:px-8 sm:py-8 sm:not-first:border-l sm:not-first:border-zinc-950/5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-zinc-900 ring-1 ring-zinc-950/10">
              <s.icon aria-hidden className="size-5" strokeWidth={1.75} />
            </span>
            {/* Adım oku — yalnız geniş ekranda, son adımda yok. */}
            {i < STEPS.length - 1 ? (
              <ArrowRightIcon
                aria-hidden
                className="absolute top-10 -right-3 hidden size-6 rounded-full bg-zinc-50 text-zinc-300 sm:block"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-base font-semibold text-zinc-950">
                <span className="mr-1.5 text-zinc-500 tabular-nums">{i + 1}.</span>
                {s.title}
              </p>
              <p className="mt-1 text-sm/6 text-zinc-600">{s.body}</p>
              <Link
                href={links[s.link]}
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-zinc-950 hover:text-zinc-600"
              >
                {s.linkLabel}
                <ArrowRightIcon aria-hidden className="size-4" />
              </Link>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
