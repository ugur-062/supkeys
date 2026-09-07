import { signupHref } from "@/lib/public/visibility";
import { ArrowRightIcon, CheckIcon } from "@heroicons/react/20/solid";
import { ClipboardList, Lock, Table2 } from "lucide-react";
import Link from "next/link";

/**
 * "TALEP AÇ" BANNERI — Europages RFQ bannerı. Her zaman görünür; ürün
 * sayfasında ürün adı ön-doldurulur (`prefill`). İllüstrasyon ikon setinden,
 * stok fotoğraf yok.
 */
const POINTS = [
  { icon: ClipboardList, t: "Yalnız kategorinle eşleşen tedarikçiler" },
  { icon: Lock, t: "Teklifler birbirini görmez — kapalı zarf" },
  { icon: Table2, t: "Karşılaştırma tablosu, tek ekranda kazandırma" },
] as const;

/**
 * İKİ YÜZ (2026-09-08): herkese açık sayfada KAYIT hunisi (monokrom),
 * PANELDE doğrudan talep sihirbazı (mavi — satınalma portalının rengi;
 * kullanıcı kuralı: satınalmada siyah yok). Ayrı bir bileşen açılmadı:
 * metin ve düzen tek yerde kalsın, yalnız hedef ve renk değişsin.
 */
export function RfqBanner({
  prefill,
  variant = "public",
}: {
  prefill?: string;
  variant?: "public" | "panel";
}) {
  const panelHref = `/company/satinalma/taleplerim/yeni${prefill ? `?q=${encodeURIComponent(prefill)}` : ""}`;
  const href =
    variant === "panel"
      ? panelHref
      : signupHref("talep", prefill ? panelHref : undefined);
  const blue = variant === "panel";
  return (
    <section className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
      <div className="grid gap-8 rounded-3xl bg-zinc-50 p-8 ring-1 ring-zinc-950/5 lg:grid-cols-[18rem_1fr] lg:items-center lg:p-10">
        <div aria-hidden className="relative mx-auto hidden h-40 w-40 lg:block">
          <span className={`absolute inset-0 rounded-full ${blue ? "bg-blue-100" : "bg-emerald-100"}`} />
          <span className="absolute inset-4 flex items-center justify-center rounded-full bg-white ring-1 ring-zinc-950/5">
            <ClipboardList className="size-14 text-zinc-800" strokeWidth={1.25} />
          </span>
          <span
            className={`absolute -right-2 -bottom-1 flex size-12 items-center justify-center rounded-full text-white shadow-lg ${
              blue ? "bg-blue-600" : "bg-zinc-950"
            }`}
          >
            <CheckIcon className="size-6" />
          </span>
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            Bir talep aç, birden fazla kapalı zarf teklif al
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-3">
            {POINTS.map((p) => (
              <li key={p.t} className="flex items-start gap-2 text-sm text-zinc-700">
                <p.icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${blue ? "text-blue-600" : "text-emerald-700"}`} />
                {p.t}
              </li>
            ))}
          </ul>
          <Link
            href={href}
            className={`mt-6 inline-flex items-center gap-1 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition ${
              blue ? "bg-blue-600 hover:bg-blue-700" : "bg-zinc-950 hover:bg-zinc-800"
            }`}
          >
            Talep aç
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
