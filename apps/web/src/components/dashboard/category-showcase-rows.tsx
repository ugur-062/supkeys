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
 * kategori. Blok TÜM ana kategoriler bitene dek tekrarlanır (2026-09-08,
 * kullanıcı: "tüm ana kategoriler var mı?") — 58 segmentin hepsi anasayfada.
 *
 * RENK: promo kart MAVİ (2026-09-07, kullanıcı kararı). Kaynakta koyu yeşil
 * gradyan; burada satınalma portalının KENDİ vurgu rengi kullanılıyor —
 * `PanelHeroSearch accent="blue"`, Genel Bakış'taki satınalma satırı ve
 * pazar bağlantıları hep bu mavi. Yani yeni bir ton getirilmedi, panelin
 * mevcut portal rengi vitrine de taşındı (satış portalı yeşil kalır).
 *
 * Bu KAMUYA AÇIK yüzeyin monokrom kuralını bozmaz: orası ziyaretçi yüzeyi
 * ve siyah kalır; portal vurgu renkleri yalnız panelde yaşar.
 *
 * SAYI YALNIZ > 0 İSE: kaynakta her kartın altında "(164)" var; bizde
 * envanteri olmayan dalda parantez hiç basılmaz — "(0)" katalogun dolu
 * olmadığını duyurur (`buildShowcase` ile aynı kural).
 */
export interface ShowcaseRow {
  promo: ShowcaseCategory;
  items: ShowcaseCategory[];
}

/**
 * Düz listeyi satırlara böler: her satır 1 promo + `perRow` kategori.
 *
 * ARTAN KATEGORİLER DÜŞMEZ (2026-09-08, kullanıcı sorusu "tüm ana
 * kategoriler var mı?"): eskiden son blok tam dolmuyorsa BÜTÜNÜYLE
 * atılıyordu ve 58 segmentin sonundakiler anasayfada hiç görünmüyordu.
 * Artık artanlar SON bloğun ızgarasına eklenir — promo kartı `h-full`
 * olduğu için ızgara bir satır uzadığında düzen bozulmaz. Hiç tam blok
 * oluşmadıysa (çok küçük katalog) kısa blok yine de çizilir: boş bırakmak
 * yerine az kategoriyle göstermek doğru.
 */
export function toShowcaseRows(all: ShowcaseCategory[], rows = 3, perRow = 10): ShowcaseRow[] {
  const out: ShowcaseRow[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const promo = all[i];
    if (!promo) break;
    i += 1;
    const items = all.slice(i, i + perRow);
    i += items.length;
    if (items.length === 0) break;
    out.push({ promo, items });
  }
  // Satır tavanı dolduysa kalanları son ızgaraya ekle — kategori kaybolmasın.
  const last = out[out.length - 1];
  if (last && i < all.length) last.items = [...last.items, ...all.slice(i)];
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
      className="group flex h-full min-h-64 flex-col overflow-hidden rounded-2xl bg-gradient-to-b from-blue-700 to-blue-900 ring-1 ring-blue-950/10 transition hover:shadow-md"
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
        <span className="block flex-1 bg-blue-800" />
      )}
      <span className="block p-6">
        {c.count > 0 ? (
          <span className="tnum block text-sm text-blue-100">
            {c.count.toLocaleString("tr-TR")} {countNoun}
          </span>
        ) : null}
        <span className="mt-0.5 block text-lg font-semibold text-white">{c.name}</span>
        {/* Koyu zeminde eylem TERSİNE döner: beyaz dolgu, mavi metin. */}
        <span className="mt-3 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition group-hover:bg-blue-50">
          {ctaLabel}
        </span>
      </span>
    </Link>
  );
}
