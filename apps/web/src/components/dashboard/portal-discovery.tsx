"use client";

import { ListingCard } from "@/components/marketplace/listing-card";
import { ProductCard } from "@/components/marketplace/product-card";
import { InfoChip } from "@/components/ihale/IhaleListRow";
import { deriveSellerTenderState } from "@/lib/tenders/seller-state";
import {
  useDiscoverFacets,
  useDiscoverListings,
  useDiscoverProducts,
  type DiscoverProduct,
} from "@/hooks/use-portal-discovery";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import { TONE_CLASS, categoryVisual } from "@/lib/public/category-visual";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/20/solid";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * PANO KEŞİF BLOĞU — "giriş yapınca pazar yeri hissi".
 *
 * ── NEYİ DEĞİŞTİRMEZ ──────────────────────────────────────────────────────
 * Pano silinmiyor: aksiyon merkezi, KPI'lar ve grafik sekmeleri yerinde.
 * Bu blok ONLARIN ARASINA girer. Sıra gerekçesi: "bugün ne yapmalıyım"
 * (kişisel, acil) → "piyasada ne var" (fırsat) → "nasıl gidiyorum" (geçmiş).
 * Keşfi en üste almak, kendi işini kaçıran kullanıcıya önce rakip ilanı
 * göstermek olurdu.
 *
 * ── YALNIZ SATINALMA PANOSU (2026-09-03) ────────────────────────────────
 * Satınalma firma ALIR → başkalarının SATIŞ ilanları + firmaların ürünleri.
 * Satış panosu bu bloğu artık KULLANMIYOR: orada arama kutulu kart Açık
 * Talepler sayfasının kopyasıydı; yerini özet widget'ı aldı
 * (`matched-requests-widget.tsx` — 3 talep, arama/süzgeç yok).
 * Kendi kayıtların şeritte YOK; onlar zaten KPI'larda ve "Taleplerim"de.
 * Şerit dışarıyı gösterir.
 *
 * Veri panelin KENDİ auth'lu uçlarından (maskeleme/davet/bağlantı kuralları
 * korunur); pazar yerinin herkese açık uçları burada kullanılmaz.
 */

const COPY = {
  heading: "Ne satın alıyorsunuz?",
  lead: "Tedarikçilerin satışa açtığı ilanlar ve vitrinlerindeki ürünler.",
  placeholder: "Ürün, malzeme veya hizmet arayın",
  listingsHref: "/company/satinalma/satin-al",
  productsHref: "/company/satinalma/urunler",
  ctaLabel: "Talep aç",
  ctaHref: "/company/satinalma/taleplerim/yeni",
  listingsTab: "Satılık ilanlar",
  emptyTitle: "Şu an size uygun satılık ilan yok.",
  emptyHint: "Sektör kutularından göz atabilir ya da kendi talebinizi açabilirsiniz.",
} as const;

/** Yalnız satınalma panosu — satış panosunun kendi özet widget'ı var. */
export function PortalDiscovery() {
  const copy = COPY;
  // Satınalma ALIYOR → karşı taraf SATIŞ ilanı açar. Yön tersine dönerse
  // kullanıcı kendi tarafındaki kayıtları "fırsat" sanır.
  const listingType = "SATIS" as const;
  const [tab, setTab] = useState<"listings" | "products">("listings");
  const [q, setQ] = useState("");
  const router = useRouter();

  const listings = useDiscoverListings(listingType, 6);
  const facets = useDiscoverFacets(listingType);
  const products = useDiscoverProducts({ limit: 6 }, tab === "products");

  const rows = listings.data ?? [];
  const segments = facets.data?.segments ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    const base =
      tab === "products" && copy.productsHref ? copy.productsHref : copy.listingsHref;
    router.push(term ? `${base}?q=${encodeURIComponent(term)}` : base);
  };

  const activeHref =
    tab === "products" && copy.productsHref ? copy.productsHref : copy.listingsHref;

  return (
    <section
      aria-label="Keşif"
      className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            {copy.heading}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">{copy.lead}</p>
        </div>
        <Link
          href={copy.ctaHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          <PlusIcon aria-hidden className="size-4" />
          {copy.ctaLabel}
        </Link>
      </div>

      {/* Arama — düz form; süzgeç sayfası aramayı URL'den okur, böylece
          buradan devredilen terim kaybolmaz. */}
      <form onSubmit={submit} role="search" className="mt-4">
        <div className="flex items-center rounded-full bg-white ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950">
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none ml-4 size-5 shrink-0 text-zinc-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
          />
          <button
            type="submit"
            className="mr-1.5 rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
          >
            Ara
          </button>
        </div>
      </form>

      {/* Sektör kutuları — sayaçlar LİSTEYLE aynı görünürlük kuralından gelir
          (sunucuda tek kaynak), yoksa kutuda 12 yazıp listede 5 çıkardı. */}
      {segments.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {segments.slice(0, 8).map((s) => {
            const v = categoryVisual([s.id]);
            const tone = TONE_CLASS[v.tone];
            const Icon = v.icon;
            return (
              <Link
                key={s.id}
                href={`${copy.listingsHref}?kategori=${s.id}`}
                className="group inline-flex items-center gap-2 rounded-xl bg-white py-1.5 pr-3 pl-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-950/5 transition hover:bg-zinc-50 hover:text-zinc-950"
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-lg ${tone.surface}`}
                >
                  <Icon aria-hidden className={`size-4 ${tone.icon}`} />
                </span>
                <span className="line-clamp-1">{s.name}</span>
                <span className="text-xs text-zinc-400">{s.count}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {/* İki akış: ilan SÜRELİ bir işlem, ürün KALICI bir vitrin kaydı. Tek
          listede karıştırmak "bu ne zaman kapanıyor?" sorusunu
          belirsizleştirirdi. */}
      <div className="mt-5 inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
        {(
          [
            ["listings", copy.listingsTab],
            ["products", "Tedarikçi ürünleri"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === key
                ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "products" ? (
          <ProductStrip
            rows={products.data ?? []}
            loading={products.isLoading}
            hrefBase={copy.productsHref ?? "/company/satinalma/urunler"}
            emptyTitle="Vitrine çıkmış ürün yok."
            emptyHint="Firmalar ürünlerini yayımladıkça burada görünür."
          />
        ) : (
          <ListingStrip
            rows={rows}
            loading={listings.isLoading}
            emptyTitle={copy.emptyTitle}
            emptyHint={copy.emptyHint}
          />
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          href={activeHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
        >
          Tümünü gör
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function StripSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}

/** Envanter azken hayalet ızgara çizme — pazar yerindeki kararın aynısı. */
function gridCols(n: number): string {
  if (n >= 3) return "sm:grid-cols-2 lg:grid-cols-3";
  if (n === 2) return "sm:grid-cols-2";
  return "sm:max-w-sm";
}

function EmptyStrip({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-5 py-6 ring-1 ring-zinc-950/5">
      <p className="text-sm font-semibold text-zinc-900">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{hint}</p>
    </div>
  );
}

function ListingStrip({
  rows,
  loading,
  emptyTitle,
  emptyHint,
}: {
  rows: SellerTenderRow[];
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (loading) return <StripSkeleton />;
  if (rows.length === 0) return <EmptyStrip title={emptyTitle} hint={emptyHint} />;
  return (
    <div className={`grid grid-cols-1 gap-4 ${gridCols(rows.length)}`}>
      {rows.map((r) => (
        <ListingTile key={r.id} row={r} />
      ))}
    </div>
  );
}

/** Kapanışa kalan süre — "3 gün" gibi kaba birim yeter, saniye sayacı değil. */
function remaining(closesAt: string | null): string | null {
  if (!closesAt) return null;
  const ms = new Date(closesAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} gün`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} saat`;
}

/**
 * Pano tile'ı — `ListingCard` tile ADAPTÖRÜ. Görsel kuralı kartta: satış
 * ilanı (kind="ilan") kapak varsa 4:3 kapak, yoksa kompakt; dev 16:9
 * placeholder yok.
 */
function ListingTile({ row }: { row: SellerTenderRow }) {
  const left = remaining(row.closesAt);
  const state = deriveSellerTenderState(row.status, row.myBidStatus, row.invited);
  return (
    <ListingCard
      variant="tile"
      data={{
        id: row.id,
        href: `/company/ilan/${row.id}`,
        number: row.number,
        title: row.title,
        kind: "ilan",
        coverImageUrl: row.coverImageUrl,
        categoryIds: row.categories.map((c) => c.code),
        status: { label: state.label, className: state.className },
        timeNote: left ? `${left} kaldı` : null,
        chips: (
          <>
            {row.invited ? <InfoChip tone="amber">Size özel davet</InfoChip> : null}
            {row.myBidStatus ? <InfoChip tone="emerald">Teklif verdiniz</InfoChip> : null}
            {row.categoryMatch ? <InfoChip tone="blue">Profilinizle eşleşti</InfoChip> : null}
            {row.masked ? <InfoChip tone="amber">Paket gerekli</InfoChip> : null}
          </>
        ),
        // Maskeli kartta sahip adı YOK ama şehir var — kimlik değil nitelik.
        subtitle: [
          row.owner?.name ?? "Satıcı firma",
          row.ownerCity,
          row.itemCount > 0 ? `${row.itemCount} kalem` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        facts: [],
      }}
    />
  );
}

/**
 * `hrefBase` PANEL rotasıdır, pazar yerinin herkese açık adresi değil.
 * Kart doğrudan `/firma/<slug>/urun/<slug>`e gitseydi giriş yapmış kullanıcı
 * paneli terk eder ve "Giriş Yap / Kaydol" duvarına çarpardı (o layout oturumu
 * hiç okumuyor). Aynı ürün içeriği panel kabuğunda gösterilir.
 */
function ProductStrip({
  rows,
  loading,
  hrefBase,
  emptyTitle,
  emptyHint,
}: {
  rows: DiscoverProduct[];
  loading: boolean;
  hrefBase: string;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (loading) return <StripSkeleton />;
  if (rows.length === 0) return <EmptyStrip title={emptyTitle} hint={emptyHint} />;
  return (
    <div className={`grid grid-cols-1 gap-4 ${gridCols(rows.length)}`}>
      {rows.map((p) => (
        <ProductCard
          key={`${p.company.slug}/${p.slug}`}
          product={p}
          company={p.company}
          href={`${hrefBase}/${p.company.slug}/${p.slug}`}
        />
      ))}
    </div>
  );
}
