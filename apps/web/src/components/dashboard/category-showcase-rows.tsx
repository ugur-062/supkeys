"use client";

import { CategoryTile } from "@/components/marketplace/category-tile";
import type { ShowcaseCategory } from "@/lib/public/category-showcase";
import { categoryVisual } from "@/lib/public/category-visual";
import { useSegmentTagline } from "@/i18n/domain";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { isHiddenCategory } from "@rothern/shared";
import { cn } from "@/lib/utils";

/**
 * KATEGORİ VİTRİNİ — promo kart + iki satırlık ızgara, blok blok (2026-09-07).
 *
 * Europages'in ana keşif bloğunun Rothern karşılığı (kullanıcı ekran
 * görüntüsü): solda sabit genişlikte tanıtım kartı, sağında iki satır
 * kategori. Blok TÜM ana kategoriler bitene dek tekrarlanır (2026-09-08,
 * kullanıcı: "tüm ana kategoriler var mı?") — görünür segmentlerin hepsi
 * anasayfada; bloklar dengelidir (`toShowcaseRows`), sütun sayısı bloğun kart
 * sayısından gelir (`showcaseGridShape`).
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
 * Düz listeyi bloklara böler: her blok 1 promo + en çok `perRow` kategori.
 *
 * BLOKLAR DENGELİ (canlı doğrulama 2026-10-09, PUB-01). Eskiden bloklar sırayla
 * tam doldurulur, artan son bloğa kalırdı: liste kısalınca vitrin 11 + 11 + 5
 * bölündü — son blokta beş sütunlu ızgarada dört kart, bir boş yuva ve tanıtım
 * kartının yüksekliğine gerilmiş kartlar. Artık blok SAYISI aynı kurala göre
 * seçilir (gereken en az blok, `rows` tavanıyla), kartlar ise bloklara EŞİT
 * dağıtılır: iki blok arasındaki fark en çok bir karttır, fazlalık baştaki
 * bloklara gider. Örnek: aynı liste üç blok × (1 promo + 8 kart) olur.
 *
 * EŞİT BLOK TERCİH EDİLİR (2026-10-10). Gereken en az blok listeyi eşit
 * bölmüyorsa ve BİR blok fazlası eşit bölüyorsa (blok tavanı aşılmadan) bir
 * blok fazlası seçilir. 28 görünür sektör üç blokta 10 + 9 + 9 bölünüyordu:
 * ilk blokta beş sütunda dokuz kart (bir boş yuva, dar kartlar — Rusça adlar
 * 1024–1072 px'te sözcük ortasından bölünüyordu), öteki ikisi 4 × 2. Artık
 * dört blok × (1 promo + 6 kart), her biri 3 × 2. Bir blok fazlası da eşit
 * bölmüyorsa en az blokta kalınır (26 → 9 + 9 + 8, 29 → 10 + 10 + 9); zaten
 * eşit bölünen sayı değişmez (27 → 3 × 9, 30 → 3 × 10). Kural yalnız BİR blok
 * ileri bakar: 25 sektör beş blokta eşit bölünür (5 × 5) ama iki blok ileride
 * olduğu için 9 + 8 + 8 kalır — vitrin küçük bloklara ufalanmaz.
 *
 * TEK SATIRA DÜŞÜRMEZ: eşit bloklar ızgarayı tek satıra indirecekse (blokta 4
 * kart ve altı — `showcaseGridShape` o satırı tanıtım kartının boyuna germez)
 * blok eklenmez. 15 sektör üç eşit blokta 1 promo + 4 kart olurdu: 312–368
 * px'lik tanıtım kartının yanında 156 px'lik tek satır, altı boş (Chromium'da
 * ölçüldü, 1366 px). 15 iki blokta kalır (7 + 6 kart, ikisi de iki satır).
 * Çağıranların verdiği tavanla (6 blok, blokta 10 kart) kuralın blok eklediği
 * sayılar: 21, 28, 32, 35, 48, 54 (`category-showcase-rows.test`).
 *
 * HİÇBİR SEGMENT DÜŞMEZ (2026-09-08, kullanıcı sorusu "tüm ana kategoriler var
 * mı?"; 2026-10-09 sahip kararı "anasayfada olmayan kategori başka yerde de
 * gösterilmesin" bu listeye dayanır):
 *  - blok tavanı (`rows`) dolduysa kartlar yine eşit dağıtılır, blok başına
 *    kart sayısı `perRow`u aşar — kategori atılmaz;
 *  - tek segmentli vitrin promo kartı olarak tek başına çizilir;
 *  - gizli kategori (`isHiddenCategory`: gizli segment ya da görünür segmentin
 *    gizli dalı) girdide gelse bile blok ya da kart olmaz (`buildShowcase` de
 *    süzer; burası çizimden önceki son kat).
 */
export function toShowcaseRows(input: ShowcaseCategory[], rows = 3, perRow = 10): ShowcaseRow[] {
  const all = input.filter((c) => !isHiddenCategory(c.id));
  if (all.length === 0 || rows < 1) return [];
  const minBlocks = Math.min(rows, Math.ceil(all.length / (Math.max(1, perRow) + 1)));
  // Eşit blok tercihi: en az blok eşit bölmüyor, bir fazlası (tavanın içinde)
  // bölüyorsa — ve o eşit bloklar (1 promo düşülür) iki satırlık ızgarayı
  // koruyorsa (`stretch`: kartlar tek satıra sığmıyor).
  const oneMoreIsEqual = minBlocks < rows && all.length % minBlocks !== 0 && all.length % (minBlocks + 1) === 0;
  const addBlock = oneMoreIsEqual && showcaseGridShape(all.length / (minBlocks + 1) - 1).stretch;
  const blockCount = addBlock ? minBlocks + 1 : minBlocks;
  const base = Math.floor(all.length / blockCount);
  const extra = all.length % blockCount;
  const out: ShowcaseRow[] = [];
  let i = 0;
  for (let b = 0; b < blockCount; b++) {
    const size = base + (b < extra ? 1 : 0);
    const [promo, ...items] = all.slice(i, i + size);
    i += size;
    if (promo) out.push({ promo, items });
  }
  return out;
}

/* Tailwind sınıfları kaynak metinden taranır → sütun sınıfı birleştirilerek
   üretilmez, tablodan seçilir. */
const SM_COLUMNS = { 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" } as const;
const LG_COLUMNS = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" } as const;
/** Görsel `sizes` ipucu: sütun sayısı → kartın yaklaşık görünüm genişliği payı. */
const SM_TILE_VW = { 3: 30, 4: 23, 5: 18 } as const;
const LG_TILE_VW = { 3: 22, 4: 17, 5: 14 } as const;

/** `cols` sütunlu ızgarada son satırda boş kalan yuva sayısı. */
function emptySlots(tiles: number, cols: number): number {
  return (cols - (tiles % cols)) % cols;
}

/**
 * BİR BLOĞUN IZGARA BİÇİMİ — kart sayısından (PUB-01).
 *
 *  - `lg` (tanıtım kartı solda, ızgara sağında): kartlar İKİ satıra bölünür —
 *    sütun = kart sayısının yarısı (yukarı yuvarlanır), 3 ile 5 arasında:
 *    5–6 kart 3 sütun, 7–8 kart 4 sütun (4 × 2), 9–10 kart 5 sütun (5 × 2);
 *    son satırda en çok bir yuva boş kalır. Sabit 5 sütun, 8 kartlı blokta
 *    5 + 3 bölünüyordu. Tek satıra sığan (4 karta kadar) blok 4 sütunda durur.
 *  - `sm` (640–1023 px, ızgara kartın altında): son satırda EN AZ boş yuva
 *    bırakan sütun sayısı (8 kart 4 + 4, 9 kart 3 × 3, 10 kart 5 + 5); eşitlikte
 *    az sütun (kart daha geniş). 5 sütun yalnız kartları iki satıra bölüyorsa
 *    adaydır (6+ kart): beş kart tek sırada beş dar kart değil, `lg`deki gibi
 *    3 + 2 durur. Gözden geçirme R6-03: seçim yalnız 3 ile 4 arasındaydı ve 10
 *    kartlı blok eşitlikte 3 sütuna düşüp 3 + 3 + 3 + 1 bölünüyordu (iki boş
 *    yuva, tek başına kalan kart). Birden çok satırlı blokta artık son satırda
 *    en çok bir yuva boş kalır; tek satıra sığan 1–2 kartlı blok (toplam 2–3
 *    sektör; `lg`de 1–3 kart) sola yaslı kısa satırdır — kart büyütülmez.
 *  - Dar ekranda her zaman 2 sütun.
 *  - `stretch`: geniş ekranda ızgara tanıtım kartı kadar yüksektir ve satırları
 *    o yüksekliği paylaşır. İki satırlık blokta kart yarım yükseklik alır (dolu
 *    bloktaki görünüm). Kartları TEK satıra sığan blokta aynı kural tek satırı
 *    kartın bütün yüksekliğine geriyordu (176 px yerine 344 px, etiketin altı
 *    boş) → orada satır kendi yüksekliğinde kalır.
 */
export function showcaseGridShape(tiles: number): { sm: 3 | 4 | 5; lg: 3 | 4 | 5; stretch: boolean } {
  const lg = tiles <= 4 ? 4 : (Math.min(5, Math.max(3, Math.ceil(tiles / 2))) as 3 | 4 | 5);
  // Az sütundan çoğa: eşitlikte ilk (en geniş kartlı) aday kalır.
  const smCandidates: readonly (3 | 4 | 5)[] = tiles > 5 ? [3, 4, 5] : [3, 4];
  const sm = smCandidates.reduce((best, cols) => (emptySlots(tiles, cols) < emptySlots(tiles, best) ? cols : best));
  return { sm, lg, stretch: tiles > lg };
}

export function CategoryShowcaseRows({
  rows,
  hrefFor,
  ctaLabel,
  visual = "icon",
}: {
  rows: ShowcaseRow[];
  hrefFor: (c: ShowcaseCategory) => string;
  /** Promo kartın düğmesi — "Şimdi tedarikçi bulun". */
  ctaLabel: string;
  /**
   * `"icon"` (varsayılan): fotoğraf YOK, çizgisel segment ikonu — kartta tonlu
   * zeminde, promo kartta mavi zeminde beyaz. İKİ vitrin de böyle çizilir:
   * herkese açık anasayfa (2026-09-21, kullanıcı kararı) ve satınalma paneli
   * `/company/satinalma` (2026-10-10, sahip: "satınalma sayfasında
   * kategorilerde fotoğraflar var, halbuki değiştirmiştik, fotoğraf değil
   * ikonlar vardı"). 2026-09-21 değişikliği yalnız herkese açık anasayfaya
   * uygulanmış, panel varsayılanla fotoğraf çizmeyi sürdürmüştü; varsayılan bu
   * yüzden "icon"a çevrildi — `visual` vermeyi unutan çağıran fotoğrafa dönmez.
   *
   * `"photo"`: segment fotoğrafı. 2026-10-10'dan beri hiçbir sayfa istemiyor
   * (yalnız sınamalar çizer); kod silinmedi.
   */
  visual?: "photo" | "icon";
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
          <PromoCard category={row.promo} href={hrefFor(row.promo)} ctaLabel={ctaLabel} visual={visual} />
          {/* Tek segmentli vitrinde ızgara boştur — boş liste çizilmez. */}
          {row.items.length > 0 ? <ShowcaseGrid items={row.items} hrefFor={hrefFor} visual={visual} /> : null}
        </section>
      ))}
    </div>
  );
}

/** Bloğun kart ızgarası — sütun sayısı ve satır yüksekliği kart sayısından (`showcaseGridShape`). */
function ShowcaseGrid({
  items,
  hrefFor,
  visual,
}: {
  items: ShowcaseCategory[];
  hrefFor: (c: ShowcaseCategory) => string;
  visual: "photo" | "icon";
}) {
  const shape = showcaseGridShape(items.length);
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-4",
        SM_COLUMNS[shape.sm],
        LG_COLUMNS[shape.lg],
        !shape.stretch && "lg:content-start",
      )}
    >
      {items.map((c) => (
        <li key={c.id}>
          <CategoryTile
            category={c}
            href={hrefFor(c)}
            variant="square"
            visual={visual}
            sizes={`(max-width: 640px) 45vw, (max-width: 1024px) ${SM_TILE_VW[shape.sm]}vw, ${LG_TILE_VW[shape.lg]}vw`}
          />
        </li>
      ))}
    </ul>
  );
}

/* UZUN SÖZCÜK KARTIN İÇ BOŞLUĞUNA TAŞMAZ (son canlı kontrol 2026-10-10,
   NEW-02). 1024–1295 px'te tanıtım sütunu 272 px, başlık kutusu 224 px; Rusça
   "Производственные" 237 px tutuyor, bölünemediği için sağ iç boşluğa giriyordu
   (24 yerine 11 px). Kural kare kartın etiketiyle aynı (`category-tile.tsx`
   `TILE_LABEL_WRAP`): sığmayan sözcük bölünür; Rusçada yalnız uzun sözcük (14+
   harf) hece sınırından tire ile, tirenin iki yanında en az 4 harf (kapanış
   kontrolü CL-03: "Производствен-ные комплектую-щие" → "Производ-ственные
   комплектующие") — kısa sözcüklü başlıkların satırları değişmez, kartın
   yüksekliği de (ölçüldü: 388 px, önce ve sonra). */
const PROMO_TITLE_WRAP = "break-words [hyphenate-limit-chars:14_4_4] [&:lang(ru)]:hyphens-auto";

/**
 * Sol tanıtım kartı. İki vitrin de (herkese açık anasayfa, satınalma paneli)
 * İKONLU kartı çizer: mavi gradyan, büyük çizgisel ikon, sayı + ad + slogan +
 * eylem. Fotoğraflı kart (`visual="photo"`: büyük fotoğraf üstte, altta koyu
 * blokta sayı + ad + eylem) 2026-10-10'dan beri hiçbir sayfada çizilmiyor.
 */
function PromoCard({
  category: c,
  href,
  ctaLabel,
  visual,
}: {
  category: ShowcaseCategory;
  href: string;
  ctaLabel: string;
  visual: "photo" | "icon";
}) {
  const { icon: Icon } = categoryVisual([c.id]);
  const tagline = useSegmentTagline();
  const tt = useTranslations("web.marketplace.categoryTile");
  if (visual === "icon") {
    /* İKONLU TANITIM KARTI (2026-09-21, kullanıcı mockup'ı): mavi gradyan,
       sol üstte büyük çizgisel ikon, arkada dalga + silik dev ikon dekoru,
       altta sayı · başlık · slogan · tam genişlik beyaz düğme. */
    return (
      <Link
        href={href}
        className="group relative flex h-full min-h-72 flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 p-6 text-white ring-1 ring-blue-950/10 transition hover:shadow-md"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <svg className="absolute inset-x-0 bottom-0 h-44 w-full text-white/10" viewBox="0 0 320 176" preserveAspectRatio="none" fill="currentColor">
            <path d="M0 96C64 40 128 152 200 104S288 40 320 72V176H0Z" />
          </svg>
          <Icon
            strokeWidth={0.75}
            className="absolute -right-8 top-16 size-48 text-white/10 transition duration-500 group-hover:scale-105 motion-reduce:transition-none"
          />
        </span>
        <Icon aria-hidden strokeWidth={1} className="relative size-16 shrink-0" />
        <span className="relative mt-auto block pt-10">
          {c.count > 0 ? (
            <span className="tnum block text-sm text-blue-100">
              {tt("productCount", { n: c.count })}
            </span>
          ) : null}
          <span className={`mt-1 block text-2xl/8 font-bold text-balance ${PROMO_TITLE_WRAP}`}>{c.name}</span>
          <span className="mt-2 block text-sm/6 text-blue-100">{tagline(c.id)}</span>
          <span className="mt-5 flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-blue-800 transition group-hover:bg-blue-50">
            {ctaLabel}
            <ArrowRight aria-hidden className="size-4" />
          </span>
        </span>
      </Link>
    );
  }
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
            {tt("productCount", { n: c.count })}
          </span>
        ) : null}
        <span className={`mt-0.5 block text-lg font-semibold text-white ${PROMO_TITLE_WRAP}`}>{c.name}</span>
        {/* Koyu zeminde eylem TERSİNE döner: beyaz dolgu, mavi metin. */}
        <span className="mt-3 inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition group-hover:bg-blue-50">
          {ctaLabel}
        </span>
      </span>
    </Link>
  );
}
