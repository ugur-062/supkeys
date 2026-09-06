import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Image from "next/image";
import Link from "next/link";

/**
 * KATEGORİ KARTI — TEK bileşen (kart sistemi PROMPT 5, 2026-09-06).
 *
 * Anasayfadaki `CategoryGrid` ile paneldeki `CategoryShowcasePanel` aynı
 * anatomiyi iki dosyada ayrı ayrı yazıyordu (16:10 fotoğraf üstte, ad + sayı
 * altta); fark yalnız hedef ve sayının birimiydi. Artık ikisi de burayı
 * çağırır — kart bir daha ayrışamaz.
 *
 * Fotoğraflar `category-photos.ts` (58/58 segment, CC0); yoksa tonlu segment
 * ikonu. Gerçek fotoğraf YALNIZ ürün ve kategoride kullanılır — satın alma
 * talebi fotoğraf taşımaz (2026-09-04 kullanıcı kararı).
 */
export function CategoryTile({
  category: c,
  href,
  countNoun = "ürün",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
}: {
  category: ShowcaseCategory;
  href: string;
  /** "ürün" / "açık talep" — sayının birimi. */
  countNoun?: string;
  sizes?: string;
}) {
  const { icon: Icon, tone } = categoryVisual([c.id]);
  const t = TONE_CLASS[tone];
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
