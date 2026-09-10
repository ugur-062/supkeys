"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { useSearchParams } from "next/navigation";

import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { ImportDialog } from "./import-dialog";
import { ProductShowcaseForm } from "./product-showcase-form";
import { ProductPreview } from "./product-preview";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import {
  fetchProductShowcase,
  useCatalogItems,
  type CatalogItem,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { extractErrorMessage } from "@/lib/tenders/error";
import { toast } from "sonner";
import { Badge } from "@/components/catalyst/badge";
import { EmptyState } from "@/components/list";
import { ProductCard } from "@/components/marketplace/product-card";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { formatDate } from "@/lib/format-date";
import { PRODUCT_STATUS, productStatusKey } from "@/lib/company/product-status";
import { ArrowLeftIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

/** Fiyat modu → kısa etiket (form seçenekleriyle aynı sözcükler). */
const PRICE_MODE_LABEL: Record<CatalogItem["priceMode"], string> = {
  FIXED: "Sabit fiyat",
  TIERED: "Kademeli",
  ON_REQUEST: "Teklif isteyin",
};

type ProductTab = "all" | "published" | "pending" | "rejected" | "draft";
const TAB_KEYS: ProductTab[] = ["all", "published", "pending", "rejected", "draft"];

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
  reviewStatus: "DRAFT",
  submittedAt: null,
  reviewedAt: null,
  rejectReason: null,
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
  // `?sekme=rejected` — "düzeltme istendi" e-postasındaki CTA doğrudan o sekmeye açar.
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("sekme") as ProductTab | null;
  const [tab, setTab] = useState<ProductTab>(initialTab && TAB_KEYS.includes(initialTab) ? initialTab : "all");
  const [importOpen, setImportOpen] = useState(false);
  // Ürün ekleme/yayın = "Ürün ve vitrin yönetimi" işlem izni (API aynası).
  const canManage = useHasCompanyPermission("sell:product:manage");
  /**
   * Yeni ürün: AYNI tek-sayfa form, boş kayıtla. `?yeni=1` ile açılır —
   * kayıt niyeti "Vitrin aç" ve pano CTA'sı buraya düşer.
   */
  const [creating, setCreating] = useState(searchParams?.get("yeni") === "1");
  const [editing, setEditing] = useState<{
    item: CatalogItem;
    showcase: ProductShowcase;
  } | null>(null);
  const { data, isLoading } = useCatalogItems(q);
  const items = useMemo(() => data?.items ?? [], [data]);
  // Sekme süzgeci istemcide (liste zaten geldi); SAYAÇLAR sunucudan ve firma
  // geneli — arama daraltınca sekme sayısı değişmez, panoyla aynı sayı.
  // Hook'lar erken dönüşlerden (yeni/düzenle görünümleri) ÖNCE.
  const visible = useMemo(
    () =>
      tab === "all"
        ? items
        : items.filter((i) => {
            const k = productStatusKey(i);
            // MECE (2026-09-10, kullanıcı: "Tümü 1 · Yayında 1 · Onay bekliyor 1"
            // tutmuyordu): yayındayken yeniden incelenen ürün YALNIZ Yayında'da
            // (rozeti "Yayında · incelemede"); Onay bekliyor = henüz vitrine
            // çıkmamış olanlar. Sekme sayaçları toplamı = Tümü.
            if (tab === "published") return k === "published" || k === "published_pending";
            if (tab === "pending") return k === "pending";
            if (tab === "rejected") return k === "rejected";
            return k === "draft";
          }),
    [items, tab],
  );

  /**
   * Vitrin alanları liste yanıtında YOK (kalem listesi dar tutuldu); açılışta
   * `GET :id/showcase` okunur (aynı projeksiyon). Eskiden boş PATCH atılıyordu —
   * sunucu boş yamayı "hepsini sil" diye yorumluyordu (görsel/etiket/fiyat her
   * açılışta sıfırlanıyordu) ve inceleme kilidi PATCH'i zaten reddeder.
   *
   * İNCELEMEDEKİ (PENDING) ürün FORMLA AÇILMAZ — salt-okunur önizleme
   * (`ProductPreview`); tek çıkış admin kararı.
   */
  const openEditor = async (item: CatalogItem) => {
    try {
      const showcase = await fetchProductShowcase(item.id);
      setEditing({ item, showcase });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Ürün açılamadı"));
    }
  };

  // Ücretsiz paket YAYINDA ürün tavanı (API `productLimit`, `PRODUCT_LIMITS`
  // aynası): sayaç "N/10", form "Kaydet ve yayınla"yı kilitler. null = limitsiz.
  const productLimit = data?.productLimit ?? null;
  const publishedCount = data?.counts.published ?? 0;
  // Tavan yayında + (yayında olmayan) onay bekleyen — API ile aynı sayım:
  // kuyruktakiler de yer tutar; yayındayken yeniden incelenen iki kez sayılmaz.
  const pendingPublished = items.filter((i) => i.isPublic && i.reviewStatus === "PENDING").length;
  const occupied = publishedCount + Math.max(0, (data?.counts.pending ?? 0) - pendingPublished);
  const publishLimitReached = productLimit != null && occupied >= productLimit;
  // Vitrin kapısı profil yayınına bağlı (`publicProductWhere`): profil yayında
  // değilse yayımlanan ürün dizinde ve firma sayfasında GÖRÜNMEZ. Kullanıcı 10
  // ürün yayımlayıp kimsenin görmediğini fark etmesin — açıkça söyle.
  const profile = useCompanyProfile();
  const profileHidden = profile.data ? !profile.data.publicEnabled : false;

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
          description="Tek sayfa: adı, kategorisi, açıklaması, görselleri ve fiyatı. Kaydedince taslak olarak durur; onaya gönderdiğinizde ekibimiz inceler ve vitrine alır."
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
    const inReview = editing.showcase.reviewStatus === "PENDING";
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
          description={
            inReview
              ? "Ürün incelemede — ekibimiz karar verene kadar yalnız önizlenir."
              : "Vitrin bilgilerini doldurun; durum, tamamlanma ve arama görünürlüğü sağda canlı güncellenir."
          }
        />
        <div className="mt-8">
          {inReview ? (
            <ProductPreview product={editing.showcase} item={editing.item} onClose={() => setEditing(null)} />
          ) : (
            <ProductShowcaseForm
              product={editing.showcase}
              unit={editing.item.unit}
              publishLimitReached={publishLimitReached}
              onClose={() => setEditing(null)}
            />
          )}
        </div>
      </PageContainer>
    );
  }

  const counts = data?.counts;
  // Sunucunun `pending`i yayında olup yeniden incelenenleri DE sayar (kuyruk
  // ölçüsü); sekmede o ürünler Yayında'da olduğundan düşülür → sekmeler MECE,
  // Tümü = toplam.
  const pendingOnly = counts ? Math.max(0, counts.pending - pendingPublished) : undefined;
  const tabs: { key: ProductTab; label: string; count?: number }[] = [
    { key: "all", label: "Tümü", count: counts && pendingOnly != null ? counts.published + counts.draft + counts.rejected + pendingOnly : undefined },
    { key: "published", label: PRODUCT_STATUS.published.label, count: counts?.published },
    { key: "pending", label: PRODUCT_STATUS.pending.label, count: pendingOnly },
    { key: "rejected", label: PRODUCT_STATUS.rejected.label, count: counts?.rejected },
    { key: "draft", label: PRODUCT_STATUS.draft.label, count: counts?.draft },
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
            ? "Firmanızın herkese açık vitrini. Onaya gönderdiğiniz ürünler ekibimizce incelenir; onaylananlar firma profilinizde ve arama motorlarında görünür."
            : "Firmanızın herkese açık vitrini. Onaya gönderdiğiniz ürünler ekibimizce incelenir; onaylananlar firma profilinizde görünür, arama motorlarına açılma pazar yeri yayınıyla başlar."
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

      {/* Sekmeler — sayaç firma geneli, birbirini dışlar (toplam = Tümü).
          Sayaç ROZET olarak (2026-09-10): eskiden etiketin dibine yapışık
          soluk rakamdı ("Tümü1"), okunmuyordu. Boş sekme sönük, sayısı "0"
          değil boş. Mobilde yatay kaydırılır. */}
      <div className="mt-4 -mx-1 overflow-x-auto px-1">
        <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1" role="tablist">
          {tabs.map((t) => {
            const active = tab === t.key;
            const empty = t.count === 0;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
                  active ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5" : empty ? "text-zinc-400 hover:text-zinc-700" : "text-zinc-600 hover:text-zinc-950",
                )}
              >
                {t.label}
                {t.count != null && (!empty || t.key === "all") ? (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
                      active ? "bg-zinc-950 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-950/10",
                    )}
                  >
                    {t.key === "published" && productLimit != null ? `${t.count}/${productLimit}` : t.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {profileHidden ? (
        <p className="mt-3 max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/20">
          Firma profiliniz henüz herkese açık değil: ürünleriniz profil yayınlanana kadar dizinde ve
          firma sayfanızda görünmez.{" "}
          <a href="/company/sirketim/profil" className="font-medium underline">
            Profili yayınla
          </a>
          .
        </p>
      ) : null}

      {productLimit != null ? (
        <p
          className={`mt-3 max-w-2xl rounded-lg px-3 py-2 text-sm ${
            publishLimitReached ? "bg-amber-50 text-amber-900 ring-1 ring-amber-600/20" : "bg-zinc-50 text-zinc-600"
          }`}
        >
          Ücretsiz pakette en fazla {productLimit} ürün yayında ya da onayda olabilir ({occupied}/{productLimit}
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
                : tab === "pending"
                  ? "Onay bekleyen ürün yok."
                  : tab === "rejected"
                    ? "Düzeltme istenen ürün yok."
                    : tab === "draft"
                      ? "Taslak ürün yok."
                      : "Henüz ürün yok."
          }
          description={
            q
              ? "Aramayı değiştirip tekrar deneyin."
              : tab === "published"
                ? "Taslak ürünleri düzenleyip 'Onaya gönder' ile inceleme kuyruğuna alın; onaylananlar burada görünür."
                : tab === "pending"
                  ? "Onaya gönderdiğiniz ürünler inceleme boyunca burada durur; yayındayken yeniden incelenenler Yayında sekmesinde kalır."
                  : tab === "rejected"
                    ? "Düzeltme istenen ürün gerekçesiyle burada listelenir; düzenleyip yeniden gönderebilirsiniz."
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
              <Badge color={PRODUCT_STATUS[productStatusKey(item)].color}>
                {PRODUCT_STATUS[productStatusKey(item)].label}
              </Badge>
            }
            meta={`${catName(item.categoryId) ?? "Kategori seçilmedi"} · ${
              PRICE_MODE_LABEL[item.priceMode] ?? item.priceMode
            } · ${item.unit}${item.reviewStatus === "REJECTED" && item.rejectReason ? ` · Düzeltme: ${item.rejectReason}` : ""}`}
            trailing={formatDate(item.updatedAt, "short")}
          />
        </li>
      ))}
    </ul>
  );
}
