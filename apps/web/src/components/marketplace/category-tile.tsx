import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Image from "next/image";
import Link from "next/link";

/**
 * KATEGORİ KARTI — TEK bileşen (kart sistemi PROMPT 5, 2026-09-06).
 *
 * Anasayfadaki `CategoryGrid` ile panel vitrini aynı anatomiyi iki dosyada
 * ayrı ayrı yazıyordu (16:10 fotoğraf üstte, ad + sayı altta); fark yalnız
 * hedef ve sayının birimiydi. Artık ikisi de burayı çağırır — kart bir daha
 * ayrışamaz. (Panelin eski sarmalayıcısı `CategoryShowcasePanel` 2026-09-07'de
 * silindi; yerine `CategoryShowcaseRows` geçti.)
 *
 * Fotoğraflar `category-photos.ts` (58/58 segment, CC0); yoksa tonlu segment
 * ikonu. Gerçek fotoğraf YALNIZ ürün ve kategoride kullanılır — satın alma
 * talebi fotoğraf taşımaz (2026-09-04 kullanıcı kararı).
 *
 * `variant`:
 *  · `wide` (varsayılan) — 16:10 fotoğraf, solda ad + sayı, sağda ok.
 *  · `square` — KARE fotoğraf, altında ORTALANMIŞ ad (2 satır) ve parantezli
 *    sayı. Satınalma anasayfasının vitrin ızgarası için (2026-09-07,
 *    kullanıcı ekran görüntüsü): 5 sütunlu sıkı ızgarada geniş kart adı tek
 *    satıra kırpıyor, kare kart iki satır veriyor ve göz sütunları tarayabiliyor.
 */
export function CategoryTile({
  category: c,
  href,
  countNoun = "ürün",
  variant = "wide",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  category: ShowcaseCategory;
  href: string;
  /** "ürün" / "açık talep" — sayının birimi. */
  countNoun?: string;
  variant?: "wide" | "square";
  sizes?: string;
}) {
  const { icon: Icon, tone } = categoryVisual([c.id]);
  const t = TONE_CLASS[tone];

  if (variant === "square") {
    return (
      <Link
        href={href}
        className="group flex h-full flex-col overflow-hidden rounded-xl bg-white p-2 shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/20 motion-reduce:transform-none"
      >
        {c.imageSrc ? (
          <span className="relative block aspect-square overflow-hidden rounded-lg bg-zinc-100">
            <Image
              src={c.imageSrc}
              alt=""
              fill
              sizes={sizes}
              className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
            />
          </span>
        ) : (
          <span className={`flex aspect-square items-center justify-center rounded-lg ${t.surface}`}>
            <Icon aria-hidden strokeWidth={1.25} className={`size-8 ${t.icon}`} />
          </span>
        )}
        <span className="flex flex-1 flex-col justify-start px-1 pt-3 pb-2 text-center">
          <span className="line-clamp-2 text-[13px]/5 font-semibold text-zinc-900 group-hover:text-zinc-600">
            {c.name}
          </span>
          {/* Sayı YALNIZ > 0 ise: "(0)" envanterin azlığını duyurur
              (`buildShowcase` ile aynı kural). */}
          {c.count > 0 ? (
            <span className="tnum mt-0.5 text-xs text-zinc-500">({c.count.toLocaleString("tr-TR")})</span>
          ) : null}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/20 motion-reduce:transform-none"
    >
      {/* Fotoğraf ÜSTTE, 16:10 — 48 px'lik yan küçük resim fotoğrafı okunmaz
          kılıyordu (kullanıcı: "yüksekliği çok düşük"). */}
      {c.imageSrc ? (
        <span className="relative block aspect-[16/10] overflow-hidden bg-zinc-100">
          <Image
            src={c.imageSrc}
            alt=""
            fill
            sizes={sizes}
            className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
          />
        </span>
      ) : (
        <span className={`flex aspect-[16/10] items-center justify-center ${t.surface}`}>
          <Icon aria-hidden strokeWidth={1.25} className={`size-10 ${t.icon}`} />
        </span>
      )}
      <span className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-900">{c.name}</span>
          <span className="tnum block text-xs text-zinc-500">
            {c.count > 0 ? `${c.count.toLocaleString("tr-TR")} ${countNoun}` : "Keşfet"}
          </span>
        </span>
        <ArrowRightIcon
          aria-hidden
          className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
        />
      </span>
    </Link>
  );
}
