"use client";

import { CategoryImage } from "@/components/marketplace/category-image";
import { productPrice } from "@/lib/public/product-price";
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
 * ── PORTAL YÖNÜ İÇERİĞİ BELİRLER ─────────────────────────────────────────
 * Satınalma firma ALIR → başkalarının SATIŞ ilanları + firmaların ürünleri.
 * Satış firma SATAR → başkalarının ALIM talepleri.
 * Kendi kayıtların şeritte YOK; onlar zaten KPI'larda ve "Taleplerim/
 * İlanlarım"da. Şerit dışarıyı gösterir.
 *
 * Veri panelin KENDİ auth'lu uçlarından (maskeleme/davet/bağlantı kuralları
 * korunur); pazar yerinin herkese açık uçları burada kullanılmaz.
 */

interface Props {
  portal: "satinalma" | "satis";
}

const COPY = {
  satinalma: {
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
  },
  satis: {
    heading: "Ne satıyorsunuz?",
    lead: "Alıcıların yayımladığı, teklif bekleyen açık talepler.",
    placeholder: "Talep, sektör veya alıcı arayın",
    listingsHref: "/company/satis/acik-talepler",
    productsHref: null,
    ctaLabel: "İlan aç",
    ctaHref: "/company/satis/ilanlarim/yeni",
    listingsTab: "Açık talepler",
    emptyTitle: "Şu an size uygun açık talep yok.",
    emptyHint: "Sektörlerinizi profilinizde güncelleyin; eşleşen talepler burada görünür.",
  },
} as const;

export function PortalDiscovery({ portal }: Props) {
  const copy = COPY[portal];
  // Satınalma ALIYOR → karşı taraf SATIŞ ilanı açar. Satış SATIYOR → karşı
  // taraf ALIM talebi açar. Yön tersine dönerse kullanıcı kendi tarafındaki
  // kayıtları "fırsat" sanır.
  const listingType = portal === "satinalma" ? "SATIS" : "ALIM";
  const [tab, setTab] = useState<"listings" | "products">("listings");
  const [q, setQ] = useState("");
  const router = useRouter();

  const listings = useDiscoverListings(listingType, 6);
  const facets = useDiscoverFacets(listingType);
  const products = useDiscoverProducts(
    { limit: 6 },
    portal === "satinalma" && tab === "products",
  );

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

      {/* Satınalmada iki akış: ilan SÜRELİ bir işlem, ürün KALICI bir vitrin
          kaydı. Tek listede karıştırmak "bu ne zaman kapanıyor?" sorusunu
          belirsizleştirirdi. */}
      {portal === "satinalma" ? (
        <div className="mt-5 inline-flex gap-1 rounded-xl bg-zinc-100 p-1">
          {(
            [
              ["listings", copy.listingsTab],
              ["products", "Ürünler"],
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
      ) : null}

      <div className="mt-5">
        {tab === "products" ? (
          <ProductStrip
            rows={products.data ?? []}
            loading={products.isLoading}
            emptyTitle="Vitrine çıkmış ürün yok."
            emptyHint="Firmalar ürünlerini yayımladıkça burada görünür."
          />
        ) : (
          <ListingStrip
            rows={rows}
            loading={listings.isLoading}
            emptyTitle={copy.emptyTitle}
            emptyHint={copy.emptyHint}
            portal={portal}
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
  portal,
}: {
  rows: SellerTenderRow[];
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
  portal: "satinalma" | "satis";
}) {
  if (loading) return <StripSkeleton />;
  if (rows.length === 0) return <EmptyStrip title={emptyTitle} hint={emptyHint} />;
  return (
    <div className={`grid grid-cols-1 gap-4 ${gridCols(rows.length)}`}>
      {rows.map((r) => (
        <ListingTile key={r.id} row={r} portal={portal} />
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

function ListingTile({
  row,
  portal,
}: {
  row: SellerTenderRow;
  portal: "satinalma" | "satis";
}) {
  const left = remaining(row.closesAt);
  return (
    <Link
      href={`/company/ilan/${row.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
    >
      <CategoryImage
        src={row.coverImageUrl}
        categoryIds={row.categories.map((c) => c.code)}
        alt={row.title}
        ratio="aspect-[16/9]"
        className="border-b border-zinc-950/5"
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {row.invited ? <Badge tone="blue">Size özel davet</Badge> : null}
          {row.myBidStatus ? <Badge tone="emerald">Teklif verdiniz</Badge> : null}
          {row.masked ? <Badge tone="amber">Paket gerekli</Badge> : null}
          {left ? <Badge tone="zinc">{left} kaldı</Badge> : null}
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm/5 font-semibold text-zinc-950">
          {row.title}
        </h3>
        <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
          {/* Maskeli kartta sahip adı YOK ama şehir var — kimlik değil nitelik. */}
          {row.owner?.name ?? (portal === "satinalma" ? "Satıcı firma" : "Alıcı firma")}
          {row.ownerCity ? ` · ${row.ownerCity}` : ""}
          {row.itemCount > 0 ? ` · ${row.itemCount} kalem` : ""}
        </p>
        {row.matchReason ? (
          <p className="mt-auto pt-3 text-xs text-zinc-400">{row.matchReason}</p>
        ) : null}
      </div>
    </Link>
  );
}

function ProductStrip({
  rows,
  loading,
  emptyTitle,
  emptyHint,
}: {
  rows: DiscoverProduct[];
  loading: boolean;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (loading) return <StripSkeleton />;
  if (rows.length === 0) return <EmptyStrip title={emptyTitle} hint={emptyHint} />;
  return (
    <div className={`grid grid-cols-1 gap-4 ${gridCols(rows.length)}`}>
      {rows.map((p) => {
        const price = productPrice(p);
        return (
          <Link
            key={`${p.company.slug}/${p.slug}`}
            href={`/firma/${p.company.slug}/urun/${p.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
          >
            <CategoryImage
              src={p.images[0]}
              categoryIds={p.categoryId ? [p.categoryId] : []}
              alt={p.name}
              ratio="aspect-[4/3]"
              className="border-b border-zinc-950/5"
            />
            <div className="flex flex-1 flex-col p-4">
              <h3 className="line-clamp-2 text-sm/5 font-semibold text-zinc-950">
                {p.name}
              </h3>
              <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                {p.company.name}
                {p.company.city ? ` · ${p.company.city}` : ""}
              </p>
              <p
                className={`mt-auto pt-3 text-sm font-semibold ${
                  price.hasPrice ? "text-zinc-950" : "text-zinc-500"
                }`}
              >
                {price.headline}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "blue" | "emerald" | "amber" | "zinc";
  children: React.ReactNode;
}) {
  const cls = {
    blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
    zinc: "bg-zinc-100 text-zinc-600 ring-zinc-950/5",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}
