"use client";

import { InfoChip } from "@/components/ihale/IhaleListRow";
import { EmptyState } from "@/components/list";
import { ListingCard } from "@/components/marketplace/listing-card";
import { ProductCard } from "@/components/marketplace/product-card";
import {
  useDiscoverListings,
  useDiscoverProducts,
  type DiscoverProduct,
} from "@/hooks/use-portal-discovery";
import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import { SECTOR_EDIT_HREF } from "@/lib/company/portals";
import { deriveSellerTenderState } from "@/lib/tenders/seller-state";
import { ArrowRight, Package, Tag } from "lucide-react";
import Link from "next/link";

/**
 * SATINALMA PANOSU — "SİZE UYGUN" SEÇKİSİ (v2 denetimi, 2026-09-03).
 *
 * "Anasayfa özet, alt sayfa liste": eski keşif kartı Satın Al + Ürün Ara
 * sayfalarının kopyasıydı (arama kutusu, sekmeler, sektör kutuları, ikinci
 * "Talep aç"). Şimdi iki küçük blok:
 *   · "Size özel ilanlar" — en fazla 3 satış ilanı (davetli/eşleşen önce,
 *     sıralama sunucuda); kapak varsa 4:3, yoksa kompakt kart (ListingCard).
 *   · "Size uygun ürünler" — en fazla 3 ürün (ProductCard, görselli).
 * Her bloğun tek çıkışı var ("Tüm ilanlar →", "Tüm ürünler →"). Arama,
 * sekme, süzgeç ve CTA yok; kullanıcı aramak isterse alt sayfaya gider.
 *
 * Veri panelin KENDİ auth'lu uçlarından (maskeleme/davet/bağlantı kuralları
 * korunur); pazar yerinin herkese açık uçları burada kullanılmaz. Satış
 * panosunun karşılığı `matched-requests-widget.tsx`.
 */
export const DISCOVERY_LIMIT = 3;

const LISTINGS_HREF = "/company/satinalma/satin-al";
const PRODUCTS_HREF = "/company/satinalma/urunler";

export function PortalDiscovery() {
  // Satınalma ALIYOR → karşı taraf SATIŞ ilanı açar. Yön tersine dönerse
  // kullanıcı kendi tarafındaki kayıtları "fırsat" sanır.
  const listings = useDiscoverListings("SATIS", DISCOVERY_LIMIT);
  const products = useDiscoverProducts({ limit: DISCOVERY_LIMIT }, true);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Block
        title="Size özel ilanlar"
        allHref={LISTINGS_HREF}
        allLabel="Tüm ilanlar"
        loading={listings.isLoading}
        count={listings.data?.length ?? 0}
        empty={
          <EmptyState
            icon={Tag}
            title="Size özel ilan yok."
            description="Eşleşme, alış kategorilerinize göre yapılır."
            className="py-8"
            action={
              <Link
                href={SECTOR_EDIT_HREF}
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Alış kategorilerini düzenle
              </Link>
            }
          />
        }
      >
        <div className={`grid grid-cols-1 gap-4 ${gridCols(listings.data?.length ?? 0)}`}>
          {(listings.data ?? []).map((r) => (
            <ListingTile key={r.id} row={r} />
          ))}
        </div>
      </Block>

      <Block
        title="Size uygun ürünler"
        allHref={PRODUCTS_HREF}
        allLabel="Tüm ürünler"
        loading={products.isLoading}
        count={products.data?.length ?? 0}
        empty={
          <EmptyState
            icon={Package}
            title="Eşleşen ürün yok."
            description="Tedarikçiler ürünlerini yayımladıkça burada görünür."
            className="py-8"
            action={
              <Link
                href={PRODUCTS_HREF}
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Ürün Ara
              </Link>
            }
          />
        }
      >
        <div className={`grid grid-cols-1 gap-4 ${gridCols(products.data?.length ?? 0)}`}>
          {(products.data ?? []).map((p: DiscoverProduct) => (
            <ProductCard
              key={`${p.company.slug}/${p.slug}`}
              product={p}
              company={p.company}
              // PANEL rotası — herkese açık `/firma/...` sayfası DEĞİL: public
              // layout oturumu okumaz, giriş yapmış kullanıcı duvara çarpardı.
              href={`${PRODUCTS_HREF}/${p.company.slug}/${p.slug}`}
            />
          ))}
        </div>
      </Block>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Block({
  title,
  allHref,
  allLabel,
  loading,
  count,
  empty,
  children,
}: {
  title: string;
  allHref: string;
  allLabel: string;
  loading: boolean;
  count: number;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6"
    >
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{title}</h2>
      <div className="mt-4 flex-1">
        {loading ? <StripSkeleton /> : count === 0 ? empty : children}
      </div>
      <div className="mt-4 flex justify-end">
        <Link
          href={allHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
        >
          {allLabel}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}

function StripSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {Array.from({ length: DISCOVERY_LIMIT }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}

/** Envanter azken hayalet ızgara çizme — pazar yerindeki kararın aynısı. */
function gridCols(n: number): string {
  if (n >= 3) return "sm:grid-cols-3";
  if (n === 2) return "sm:grid-cols-2";
  return "sm:max-w-sm";
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
