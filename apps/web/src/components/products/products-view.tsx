"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useSearchParams } from "next/navigation";

import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { ImportDialog } from "./import-dialog";
import { ProductShowcaseForm } from "./product-showcase-form";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import {
  useCatalogItems,
  useUpdateShowcase,
  type CatalogItem,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { Badge } from "@/components/catalyst/badge";
import { EmptyState } from "@/components/list";
import { ProductCard } from "@/components/marketplace/product-card";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { formatDate } from "@/lib/format-date";
import { ArrowLeftIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Package } from "lucide-react";
import { useMemo, useState } from "react";

/** Fiyat modu → kısa etiket (form seçenekleriyle aynı sözcükler). */
const PRICE_MODE_LABEL: Record<CatalogItem["priceMode"], string> = {
  FIXED: "Sabit fiyat",
  TIERED: "Kademeli",
  ON_REQUEST: "Teklif isteyin",
};

type ProductTab = "all" | "published" | "draft";

/**
 * ÜRÜNLERİM — firmanın herkese açık vitrini.
 *
 * Kalem kataloğuyla AYNI kayıtlar: ilan açarken yazdığınız kalem, birkaç alan
 * doldurulunca vitrine çıkabilen bir ürüne dönüşür. Ayrı bir "ürün" varlığı
 * açmadık — aynı ürünü iki yerde güncelleme borcu üretirdi.
 *
 * Liste ile form aynı sayfada, tek seferde tek ürün düzenlenir: ürün formu
 * uzun (görsel, nitelik, fiyat kademeleri) ve modal içine sığmıyor.
 */
/** Boş vitrin kaydı — "yeni ürün" formunun başlangıç değeri. */
const EMPTY_PRODUCT: ProductShowcase = {
  id: "",
  name: "",
  slug: null,
  isPublic: false,
  publishedAt: null,
  categoryId: null,
  description: null,
  images: [],
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: [],
  attributes: null,
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  unitCode: "PCE",
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
};

export function ProductsView() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ProductTab>("all");
  const [importOpen, setImportOpen] = useState(false);
  // Ürün ekleme/yayın = "Ürün ve vitrin yönetimi" işlem izni (API aynası).
  const canManage = useHasCompanyPermission("sell:product:manage");
  /**
   * Yeni ürün: AYNI tek-sayfa form, boş kayıtla. `?yeni=1` ile açılır —
   * kayıt niyeti "Vitrin aç" ve pano CTA'sı buraya düşer.
   */
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(searchParams?.get("yeni") === "1");
  const [editing, setEditing] = useState<{
    item: CatalogItem;
    showcase: ProductShowcase;
  } | null>(null);
  const { data, isLoading } = useCatalogItems(q);
  const save = useUpdateShowcase();
  const items = useMemo(() => data?.items ?? [], [data]);
  // Sekme süzgeci istemcide (liste zaten geldi); SAYAÇLAR sunucudan ve firma
  // geneli — arama daraltınca sekme sayısı değişmez, panoyla aynı sayı.
  // Hook'lar erken dönüşlerden (yeni/düzenle görünümleri) ÖNCE.
  const visible = useMemo(
    () =>
      tab === "all"
        ? items
        : items.filter((i) => (tab === "published" ? i.isPublic : !i.isPublic)),
    [items, tab],
  );

  /**
   * Vitrin alanları liste yanıtında YOK (kalem listesi dar tutuldu). Düzenlemeye
   * geçerken boş bir `showcase` PATCH'i atıp güncel durumu alıyoruz — ayrı bir
   * GET ucu açmak yerine mevcut ucu kullanmak, iki yerde aynı yansıtmayı
   * sürdürme borcunu ortadan kaldırıyor.
   */
  const openEditor = async (item: CatalogItem) => {
    try {
      const showcase = await save.mutateAsync({ id: item.id, patch: {} });
      setEditing({ item, showcase });
    } catch {
      /* hata toast'ı mutation'da */
    }
  };

  // Ücretsiz paket YAYINDA ürün tavanı (API `productLimit`, `PRODUCT_LIMITS`
  // aynası): sayaç "N/10", form "Kaydet ve yayınla"yı kilitler. null = limitsiz.
  const productLimit = data?.productLimit ?? null;
  const publishedCount = data?.counts.published ?? 0;
  const publishLimitReached = productLimit != null && publishedCount >= productLimit;

  if (creating) {
    return (
      <PageContainer>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Ürünlere dön
        </button>
        <PageHeader
          title="Yeni ürün"
          description="Tek sayfa: adı, kategorisi, açıklaması, görselleri ve fiyatı. Kaydedince taslak olarak durur; yayımlamak ayrı bir adım."
        />
        <div className="mt-8">
          <ProductShowcaseForm
            mode="new"
            product={EMPTY_PRODUCT}
            unit="adet"
            publishLimitReached={publishLimitReached}
            onClose={() => setCreating(false)}
            onCreated={(created) => {
              // Kayıt oluştu → düzenleme moduna geç: kullanıcı aynı formda
              // kalır, ikinci kaydetme artık güncelleme olur.
              setCreating(false);
              setEditing({
                item: {
                  id: created.id,
                  name: created.name,
                  unit: "adet",
                } as CatalogItem,
                showcase: created,
              });
            }}
          />
        </div>
      </PageContainer>
    );
  }

  if (editing) {
    return (
      <PageContainer>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Ürünlere dön
        </button>
        <PageHeader
          title={editing.item.name}
          description="Vitrin bilgilerini doldurun; tamamlanma skoru sağda canlı güncellenir."
        />
        <div className="mt-8">
          <ProductShowcaseForm
            product={editing.showcase}
            unit={editing.item.unit}
            publishLimitReached={publishLimitReached}
            onClose={() => setEditing(null)}
          />
        </div>
      </PageContainer>
    );
  }

  const counts = data?.counts;
  const tabs: { key: ProductTab; label: string; count?: number }[] = [
    { key: "all", label: "Tümü", count: counts ? counts.published + counts.draft : undefined },
    { key: "published", label: "Yayında", count: counts?.published },
    { key: "draft", label: "Taslak", count: counts?.draft },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Ürünlerim"
        // "Arama motorlarında görünür" SÖZÜ pazar yeri anahtarına bağlı:
        // ürün sayfası anahtar kapalıyken de AÇIK (görünürlük ≠ indekslenme,
        // 2026-09-03) ama `noindex` alır ve sitemap'e girmez. Anahtar kapalıyken
        // o cümle yalan olur — kullanıcı ürününü Google'da arar, bulamaz.
        description={
          MARKETPLACE_LIVE
            ? "Firmanızın herkese açık vitrini. Ürünleriniz firma profilinizde ve arama motorlarında görünür."
            : "Firmanızın herkese açık vitrini. Ürünleriniz firma profilinizde görünür; arama motorlarına açılma pazar yeri yayınıyla başlar."
        }
        action={
          !canManage ? undefined : <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Toplu ekle
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Yeni ürün
            </button>
          </div>
        }
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />


      <div className="relative mt-6 max-w-md">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün ara"
          className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </div>

      {/* Sekmeler: Tümü / Yayında / Taslak — sayaç firma geneli. */}
      <div className="mt-4 inline-flex gap-1 rounded-xl bg-zinc-100 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t.label}
            {t.count != null ? (
              <span className="ml-1.5 text-xs font-medium tabular-nums text-zinc-400">
                {t.key === "published" && productLimit != null ? `${t.count}/${productLimit}` : t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {productLimit != null ? (
        <p
          className={`mt-3 max-w-2xl rounded-lg px-3 py-2 text-sm ${
            publishLimitReached ? "bg-amber-50 text-amber-900 ring-1 ring-amber-600/20" : "bg-zinc-50 text-zinc-600"
          }`}
        >
          Ücretsiz pakette en fazla {productLimit} ürün yayında olabilir ({publishedCount}/{productLimit}
          {" "}kullanıldı). Taslak sınırsız.{" "}
          <a href="/nasil-calisir#fiyatlar" className="font-medium text-zinc-900 underline">
            Silver ile sınırsız ürün, belge ve video
          </a>
          .
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-8 text-sm text-zinc-500">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        /* Ortak EmptyState (1d): ikon + başlık + tek satır + TEK eylem.
           "Toplu ekle" başlıkta zaten var; burada ikinci kez sunulmaz. */
        <EmptyState
          icon={Package}
          title={
            q
              ? "Eşleşen ürün yok."
              : tab === "published"
                ? "Yayında ürün yok."
                : tab === "draft"
                  ? "Taslak ürün yok."
                  : "Henüz ürün yok."
          }
          description={
            q
              ? "Aramayı değiştirip tekrar deneyin."
              : tab === "published"
                ? "Taslak ürünleri düzenleyip 'Kaydet ve yayınla' ile vitrine çıkarın."
                : "Vitrininize eklediğiniz ürünler firma sayfanızda görünür ve açık talep eşleşmesini besler."
          }
          variant={q || tab !== "all" ? "no-results" : "no-data"}
          className="mt-4"
          action={
            q || tab !== "all" || !canManage ? undefined : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Yeni ürün ekle
              </button>
            )
          }
        />
      ) : (
        <ProductRows items={visible} onOpen={(item) => void openEditor(item)} />
      )}

      {data?.truncated ? (
        <p className="mt-4 text-xs text-zinc-500">
          Sonuçlar kırpıldı — aramayı daraltın.
        </p>
      ) : null}
    </PageContainer>
  );
}

/**
 * Satırlar: küçük görsel · ad · kategori · durum rozeti · fiyat modu · son
 * güncelleme. Eskiden yalnız "ad · birim · Düzenle" vardı — taslak mı
 * yayında mı, fiyatı var mı listeden okunamıyordu.
 */
function ProductRows({
  items,
  onOpen,
}: {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const ids = useMemo(
    () => [...new Set(items.map((i) => i.categoryId).filter((c): c is string => !!c))],
    [items],
  );
  const cats = useCategoriesByIds(ids);
  const catName = (id: string | null) =>
    id ? (cats.data?.find((c) => c.id === id)?.nameTr ?? null) : null;

  return (
    <ul className="mt-6 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
      {items.map((item) => (
        <li key={item.id}>
          {/* Tek kart ailesi: pazar yeri/Ürün Ara'daki ProductCard'ın `row`
              varyantı — küçük resim Thumb'dan (beyaz boş kutu yok). */}
          <ProductCard
            variant="row"
            product={{
              slug: item.id,
              name: item.name,
              images: item.thumbnailUrl ? [item.thumbnailUrl] : [],
              categoryId: item.categoryId,
              unit: item.unit,
              priceMode: item.priceMode,
            }}
            onClick={() => onOpen(item)}
            badge={
              <Badge color={item.isPublic ? "emerald" : "zinc"}>
                {item.isPublic ? "Yayında" : "Taslak"}
              </Badge>
            }
            meta={`${catName(item.categoryId) ?? "Kategori seçilmedi"} · ${
              PRICE_MODE_LABEL[item.priceMode] ?? item.priceMode
            } · ${item.unit}`}
            trailing={formatDate(item.updatedAt, "short")}
          />
        </li>
      ))}
    </ul>
  );
}
