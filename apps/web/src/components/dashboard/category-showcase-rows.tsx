"use client";

import { CategoryTile } from "@/components/marketplace/category-tile";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import Image from "next/image";
import Link from "next/link";

/**
 * KATEGORİ VİTRİNİ — promo kart + 5×2 ızgara, ÜÇ SATIR (2026-09-07).
 *
 * Europages'in ana keşif bloğunun Rothern karşılığı (kullanıcı ekran
 * görüntüsü): solda sabit genişlikte tanıtım kartı, sağında iki satır beşer
 * kategori. Blok üç kez tekrarlanır → 3 promo + 30 kategori = "burada her
 * şey var" algısı.
 *
 * RENK UYARLANDI: kaynakta promo kart koyu YEŞİL gradyan ve düğme yeşil.
 * Rothern teması monokrom siyah kalır (kayıtlı karar) — promo kartı panelin
 * kendi koyu bant dili (`MarketBand` ile aynı zinc-950), düğme o zeminin
 * tersi olarak beyaz. Tek eylem rengi kuralı korunur.
 *
 * SAYI YALNIZ > 0 İSE: kaynakta her kartın altında "(164)" var; bizde
 * envanteri olmayan dalda parantez hiç basılmaz — "(0)" katalogun dolu
 * olmadığını duyurur (`buildShowcase` ile aynı kural).
 */
export interface ShowcaseRow {
  promo: ShowcaseCategory;
  items: ShowcaseCategory[];
}

/** Düz listeyi satırlara böler: her satır 1 promo + `perRow` kategori. */
export function toShowcaseRows(all: ShowcaseCategory[], rows = 3, perRow = 10): ShowcaseRow[] {
  const out: ShowcaseRow[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const promo = all[i];
    if (!promo) break;
    i += 1;
    const items = all.slice(i, i + perRow);
    i += items.length;
    // Yarım satır çizilmez: ızgara eksik kalırsa blok bozuk görünür.
    if (items.length < perRow) break;
    out.push({ promo, items });
  }
  return out;
}

export function CategoryShowcaseRows({
  rows,
  hrefFor,
  countNoun = "ürün",
  ctaLabel,
}: {
  rows: ShowcaseRow[];
  hrefFor: (c: ShowcaseCategory) => string;
  countNoun?: string;
  /** Promo kartın düğmesi — "Şimdi tedarikçi bulun". */
  ctaLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-6">
      {rows.map((row) => (
        <section
          key={row.promo.id}
          aria-label={row.promo.name}
          /* Promo sütunu görüntü alanıyla birlikte 17-21 rem arasında esner,
             kalanı kategorilere gider (kaynaktaki `clamp(280px,22vw,340px)`). */
          className="grid gap-6 lg:grid-cols-[clamp(17rem,22vw,21rem)_1fr]"
        >
          <PromoCard category={row.promo} href={hrefFor(row.promo)} countNoun={countNoun} ctaLabel={ctaLabel} />
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {row.items.map((c) => (
              <li key={c.id}>
                <CategoryTile
                  category={c}
                  href={hrefFor(c)}
                  countNoun={countNoun}
                  variant="square"
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 14vw"
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Sol tanıtım kartı: büyük fotoğraf üstte, altta koyu blokta sayı + ad + eylem. */
function PromoCard({
  category: c,
  href,
  countNoun,
  ctaLabel,
}: {
  category: ShowcaseCategory;
  href: string;
  countNoun: string;
  ctaLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full min-h-64 flex-col overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-zinc-950/5 transition hover:shadow-md"
    >
      {c.imageSrc ? (
        <span className="relative block flex-1 overflow-hidden">
          <Image
            src={c.imageSrc}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 21rem"
            className="object-cover transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
          />
        </span>
      ) : (
        <span className="block flex-1 bg-zinc-800" />
      )}
      <span className="block p-6">
        {c.count > 0 ? (
          <span className="tnum block text-sm text-zinc-300">
            {c.count.toLocaleString("tr-TR")} {countNoun}
          </span>
        ) : null}
        <span className="mt-0.5 block text-lg font-semibold text-white">{c.name}</span>
        {/* Koyu zeminde tek eylem rengi TERSİNE döner: beyaz dolgu. */}
        <span className="mt-3 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-950 transition group-hover:bg-zinc-200">
          {ctaLabel}
        </span>
      </span>
    </Link>
  );
}
