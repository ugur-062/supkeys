"use client";

import { CategoryImage } from "./category-image";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import { productPrice } from "@/lib/public/product-price";
import { countryFlag, countryName } from "@rothern/shared";
import type { ProductPriceFields, PublicProductCard } from "@/lib/public/marketplace-api";
import { cn } from "@/lib/utils";
import { ChevronRightIcon, MapPinIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * ÜRÜN KARTI — TEK bileşen, üç varyant (v2 denetimi 2026-09-03; kart sistemi
 * PROMPT 5, 2026-09-06).
 *
 *  · `tile` — Europages ürün kartı anatomisi: 4:3 kapak → ad (2 satır) →
 *    3 madde öne çıkan özellik (yoksa açıklamanın ilk 2 satırı) → firma
 *    satırı (avatar + ad + Doğrulanmış + şehir) → fiyat → MOQ → tek CTA.
 *  · `compact` — ikincil bağlamlar (benzer ürünler, firmanın diğerleri):
 *    aynı iskelet, madde/CTA yok, sıkı iç boşluk.
 *  · `row` — panel liste satırı: küçük resim (Thumb) · ad · meta · rozet.
 *  · `wide` — pazar LİSTE görünümü (2026-09-07): yatay kart — 4:3 kapak ·
 *    rozetler · ad · 3 madde · firma · sağda fiyat/MOQ/CTA. Aynı bilgiyi
 *    `tile` ile aynı kaynaklardan basar; ızgara/liste geçişi yalnız düzeni
 *    değiştirir, içeriği değil (kullanıcı "aynı kart mı?" diye şüphelenmesin).
 *
 * PROMPT 5 kararları: rozetler `ui/badge` (Doğrulanmış/Gold/Yeni tek yerde
 * tanımlı), firma logosu `ui/avatar` (yoksa monogram — beyaz boşluk yok),
 * FAALİYET TİPİ kartta YOK (ürün kararında rol oynamıyor; süzgeçte duruyor).
 * Kart bir `article`; bağlantı BAŞLIKTA ve `after:inset-0` ile kartın tamamına
 * yayılır — görsel ile CTA aynı bağlantının parçası olur, ikinci sekme durağı
 * açılmaz. (Eskiden kartın kendisi `<a>`, rozet ise konumlandırılmamış bir
 * atada `absolute` idi: panel rozeti kartın dışına düşüyordu.)
 *
 * Ürünün görseli ZORUNLU (yayın kapısı); kapak = ilk görsel. Kapak yoksa
 * (taslak/eski kayıt) nötr gri zemin — ürün görselinin yokluğu bir eksikliktir,
 * tonlu kutu onu saklardı.
 */
/**
 * ÜRÜN YENİ SEKMEDE AÇILIR (2026-09-07, kullanıcı kararı).
 *
 * Gerekçe pazar yeri davranışı: alıcı bir listede/vitrinde gezinirken tek tek
 * ürünleri açıp karşılaştırır; aynı sekmede açmak her seferinde listeye geri
 * dönmeyi (ve süzgeç/kaydırma konumunu yeniden kurmayı) gerektiriyordu.
 *
 * `rel` ŞART: `noopener` olmadan açılan sayfa `window.opener` üzerinden bu
 * sayfayı yönlendirebilir (tabnabbing). Ekran okuyucu için görünmez bir
 * "(yeni sekmede açılır)" notu eklenir — beklenmedik sekme açılması aksi
 * hâlde sessiz kalır.
 */
const NEW_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

function NewTabHint() {
  return <span className="sr-only"> (yeni sekmede açılır)</span>;
}

export type ProductCardProduct = Pick<
  PublicProductCard,
  "slug" | "name" | "images" | "categoryId" | "unit" | "priceMode"
> &
  Partial<Pick<PublicProductCard, "excerpt"> & ProductPriceFields> & {
    /** "Yeni" rozeti (≤7 gün) — dizin kartında dolu, firma altı listede yok. */
    publishedAt?: string | null;
  };

export interface ProductCardCompany {
  name: string;
  city?: string | null;
  /** ISO ülke kodu — bayrak için (KKTC/XN'de bayrak basılmaz, bkz. `countryFlag`). */
  country?: string | null;
  /** KYC doğrulaması tamam — "Doğrulanmış" rozeti. */
  verified?: boolean;
  /** Efektif GOLD — ÜRÜN kartında gösterilmez (firma kartı ve satıcı paneli). */
  gold?: boolean;
  logoUrl?: string | null;
  /** Süzgeçte kullanılır; kartta GÖSTERİLMEZ (PROMPT 5). */
  activities?: string[];
}

/** Yayın tarihi ≤ 7 gün → "Yeni". */
function isNew(publishedAt?: string | null): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= 7 * 86_400_000;
}

export function ProductCard({
  product,
  companySlug,
  companyName,
  companyCity,
  company,
  href,
  variant = "tile",
  features,
  cta,
  ctaHref,
  badge,
  compare = false,
  onCompare,
  showNew = true,
  accent = "default",
  meta,
  trailing,
  onClick,
  priority = false,
  className,
}: {
  product: ProductCardProduct;
  /** Herkese açık rota için (`/firma/<slug>/urun/<slug>`); `href` verilirse kullanılmaz. */
  companySlug?: string;
  /** Eski çağrı biçimi — dizinde firma adı; `company` verilmişse yok sayılır. */
  companyName?: string;
  companyCity?: string | null;
  company?: ProductCardCompany;
  /** Panel rotası gibi farklı hedef. */
  href?: string;
  variant?: "tile" | "compact" | "row" | "wide";
  /** Öne çıkan özellikler — ilk 3 madde. Yoksa `excerpt`. */
  features?: string[];
  /**
   * Tek CTA etiketi (tile) — "Bilgi iste". GERÇEK bağlantıdır ve kartın
   * yayılmış bağlantısından AYRI çalışır: kart ürün sayfasını, CTA aynı
   * sayfanın `#bilgi-iste` çapasını açar.
   */
  cta?: string;
  /** CTA'nın hedefi — verilmezse `<ürün sayfası>#bilgi-iste`. */
  ctaHref?: string;
  /**
   * Tile: kapağın sol üstündeki rozet — VERİLİRSE "Yeni"nin yerine geçer
   * (kapakta en fazla bir rozet). Row: durum rozeti (Taslak/Yayında).
   */
  badge?: ReactNode;
  /**
   * Kapağın sağ üstünde "Karşılaştır" kutusu (yalnız `tile`). Durum şimdilik
   * KARTIN İÇİNDE; karşılaştırma tablosu bağlanınca `onCompare` ile dışarı
   * taşınır. Varsayılan KAPALI — işlevi henüz olmayan bir kontrolü her
   * yüzeye basmamak için yalnız dizin/arama sonuçlarında açılır.
   */
  compare?: boolean;
  /** "Karşılaştır" değişimi — ileride karşılaştırma tablosunun girişi. */
  onCompare?: (on: boolean) => void;
  /** Row: ad altındaki meta satırı (kategori · fiyat modu · birim). */
  meta?: ReactNode;
  /** Row: sağ uç (son güncelleme vb.). */
  trailing?: ReactNode;
  /** Row: bağlantı yerine düğme (panel içi düzenleme). */
  onClick?: () => void;
  /**
   * "Yeni" rozeti basılsın mı. Zaten TAMAMI yeni ürünlerden oluşan bir
   * şeritte (ör. "Yeni eklenen ürünler") rozet her kartta çıkar ve hiçbir
   * şeyi ayırt etmez — orada `false` geçilir.
   */
  showNew?: boolean;
  /**
   * Birincil eylemin rengi. `default` = siyah (HERKESE AÇIK pazar yeri —
   * monokrom kuralı orada geçerli), `blue` = satınalma panelinin portal
   * rengi (2026-09-07, kullanıcı: "siyah ağırlıklı yapma"). Renk çağırandan
   * gelir; kart iki yüzeyde de aynı bileşen kalsın diye portal bilmez.
   */
  accent?: "default" | "blue";
  /** LCP: görünümdeki ilk kartların görseli öncelikli yüklensin. */
  priority?: boolean;
  className?: string;
}) {
  const target = href ?? (companySlug ? `/firma/${companySlug}/urun/${product.slug}` : undefined);
  const firm: ProductCardCompany | undefined =
    company ?? (companyName ? { name: companyName, city: companyCity } : undefined);

  if (variant === "row") {
    const inner = (
      <>
        <Thumb src={product.images[0]} alt="" size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-950">{product.name}</span>
            {badge}
          </span>
          {meta ? (
            <span className="mt-0.5 block truncate text-xs text-zinc-500">{meta}</span>
          ) : null}
        </span>
        {trailing ? (
          <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">{trailing}</span>
        ) : null}
      </>
    );
    const rowCls = cn(
      "flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-zinc-50",
      className,
    );
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={rowCls}>
          {inner}
        </button>
      );
    }
    return (
      <Link href={target ?? "#"} {...NEW_TAB} className={rowCls}>
        {inner}
        <NewTabHint />
      </Link>
    );
  }

  const price = productPrice({
    priceMode: product.priceMode,
    priceAmount: product.priceAmount ?? null,
    priceTiers: product.priceTiers ?? null,
    priceCurrency: product.priceCurrency ?? "TRY",
    unit: product.unit,
  });
  const compact = variant === "compact";
  const ctaCls =
    accent === "blue"
      ? "bg-blue-600 text-white hover:bg-blue-700 group-hover:bg-blue-700 focus-visible:ring-blue-600"
      : "bg-zinc-950 text-white hover:bg-zinc-800 group-hover:bg-zinc-800 focus-visible:ring-zinc-950";
  const bullets = compact ? [] : (features ?? []).filter(Boolean).slice(0, 3);
  const fresh = showNew && isNew(product.publishedAt);

  if (variant === "wide") {
    return (
      <article
        className={cn(
          "group relative flex gap-4 overflow-hidden rounded-lg bg-white p-3 ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-zinc-300 focus-within:ring-2 focus-within:ring-zinc-950 sm:gap-5 sm:p-4",
          className,
        )}
      >
        {/* Liste görünümünde kapak SABİT 160 px: kartlar aynı hizada okunur,
            metin sütunu kalan genişliği alır. */}
        <div className="relative w-28 shrink-0 sm:w-40">
          <CategoryImage
            src={product.images[0]}
            categoryIds={product.categoryId ? [product.categoryId] : []}
            alt={product.name}
            ratio="aspect-[4/3]"
            className="overflow-hidden rounded-md ring-1 ring-zinc-950/5"
            priority={priority}
            fallback="neutral"
          />
          {badge ? <span className="pointer-events-none absolute top-1.5 left-1.5 z-10">{badge}</span> : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5">
            {firm?.verified ? (
              <Badge tone="verified" size="sm">
                Doğrulanmış
              </Badge>
            ) : null}
            {fresh ? (
              <Badge tone="new" size="sm">
                Yeni
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px]/5 font-semibold tracking-tight text-zinc-950">
            <Link
              href={target ?? "#"}
              {...NEW_TAB}
              className="after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none"
            >
              {product.name}
              <NewTabHint />
            </Link>
          </h3>
          {bullets.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-xs/5 text-zinc-600">
              {bullets.map((f) => (
                <li key={f} className="flex gap-1.5">
                  <span aria-hidden className="text-zinc-300">
                    •
                  </span>
                  <span className="line-clamp-1">{f}</span>
                </li>
              ))}
            </ul>
          ) : product.excerpt ? (
            <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-500">{product.excerpt}</p>
          ) : null}
          {firm ? (
            <div className="mt-auto flex min-w-0 items-center gap-1.5 pt-2 text-xs text-zinc-500">
              <Avatar name={firm.name} src={firm.logoUrl} size={24} />
              <CountryFlag code={firm.country} />
              <span className="truncate font-medium text-zinc-700">{firm.name}</span>
              {firm.city ? (
                <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                  <MapPinIcon aria-hidden className="size-3.5 text-zinc-400" />
                  {firm.city}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* `sm` altı: aynı bilgi, gövdenin altında tek satır. */}
          <div className="mt-2 flex items-center justify-between gap-2 sm:hidden">
            <span>
              <span
                className={cn("tnum block text-sm font-semibold", price.hasPrice ? "text-zinc-950" : "text-zinc-500")}
              >
                {price.headline}
              </span>
              {product.moq ? (
                <span className="tnum block text-xs text-zinc-500">
                  {`Min. ${Number(product.moq).toLocaleString("tr-TR")} ${product.unit}`}
                </span>
              ) : null}
            </span>
            {cta ? (
              <span className={cn("inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold", ctaCls)}>
                {cta}
              </span>
            ) : null}
          </div>
        </div>

        {/* Sağ sütun: fiyat kararı bir arada. `sm` altında bu sütun sığmaz —
            fiyat/MOQ/CTA gövdenin altına akar (aşağıdaki `sm:hidden` blok).
            Eskiden yalnız gizleniyordu: dar ekranda liste görünümünde fiyat
            da CTA da hiç görünmüyordu. */}
        <div className="hidden w-40 shrink-0 flex-col justify-center border-l border-zinc-100 pl-4 text-right sm:flex">
          <p className={cn("tnum text-sm font-semibold", price.hasPrice ? "text-zinc-950" : "text-zinc-500")}>
            {price.headline}
          </p>
          <p className="tnum mt-0.5 text-xs text-zinc-500">
            {product.moq ? `Min. ${Number(product.moq).toLocaleString("tr-TR")} ${product.unit}` : "\u00A0"}
          </p>
          {cta ? (
            <span className={cn("mt-3 inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition", ctaCls)}>
              {cta}
            </span>
          ) : null}
        </div>
      </article>
    );
  }

  // KAPAK ROZETİ — EN FAZLA BİR TANE. Öncelik: çağıranın rozeti ("Alım
  // kategorinizle eşleşiyor" — o bağlamda karardaki en belirleyici bilgi) >
  // "Yeni". "Doğrulanmış" kapağa ÇIKMAZ: firma özelliğidir ve firma satırında
  // ikon olarak zaten duruyor; ikisini birden basmak aynı olguyu iki kez
  // yazmak olurdu (kaldırılan "Gold Üye" rozetiyle aynı gürültü).
  const coverBadge = badge ?? (fresh ? <Badge tone="new" size="sm">Yeni</Badge> : null);

  return (
    <article
      className={cn(
        // Pazar bölgesi "katalog" dili: küçük yarıçap, hairline çerçeve, GÖLGE
        // YOK (yalnız hover). Panel bölgesi yumuşak gölgeli kalır.
        "group relative flex h-full flex-col overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 transition duration-200 hover:shadow-md hover:ring-zinc-300 focus-within:ring-2 focus-within:ring-zinc-950",
        className,
      )}
    >
      <div className="relative overflow-hidden">
        <CategoryImage
          src={product.images[0]}
          categoryIds={product.categoryId ? [product.categoryId] : []}
          alt={product.name}
          ratio="aspect-[4/3]"
          // Hover'da hafif yakınlaşma. Sınıf KÖK sarmalayıcıya biner, yani
          // gerçek fotoğraf da yedek desen de aynı şekilde davranır; kırpma
          // yukarıdaki `overflow-hidden`dan gelir.
          className="border-b border-zinc-950/5 transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          priority={priority}
          fallback="neutral"
        />
        {coverBadge ? (
          <span className="pointer-events-none absolute top-2 left-2 z-10">{coverBadge}</span>
        ) : null}
        {compare && !compact ? <CompareToggle name={product.name} onChange={onCompare} /> : null}
      </div>

      <div className={cn("flex flex-1 flex-col", compact ? "p-3" : "p-4")}>
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "line-clamp-2 tracking-tight text-zinc-950",
              compact ? "text-[13px]/5 font-semibold" : "text-[15px]/5 font-medium",
            )}
          >
            {/* Gerçek bağlantı; `after:inset-0` ile tıklama alanı kartın
                tamamına yayılır. Vurgu `group-hover` — eskiden `hover:` idi
                ve yalnız başlığın ÜSTÜNDEYKEN yanıyordu: kartın gövdesinde
                gezinen kullanıcı hiçbir tepki görmüyor, kart geç yanıt
                veriyormuş gibi duruyordu. */}
            <Link
              href={target ?? "#"}
              {...NEW_TAB}
              className="after:absolute after:inset-0 after:content-[''] focus:outline-none group-hover:text-zinc-600"
            >
              {product.name}
              <NewTabHint />
            </Link>
          </h3>
          {cta || compact ? null : (
            <ChevronRightIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
            />
          )}
        </div>

        {/* AÇIKLAMA YUVASI — ürünün KENDİ nitelik tablosundan gelen 3 madde
            varsa onlar (aynı yerde, daha yoğun bilgi), yoksa açıklamanın ilk
            2 satırı. Açıklamadan madde AYIKLANMAZ (uydurma veri olurdu). */}
        {bullets.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-xs/5 text-zinc-600">
            {bullets.map((f) => (
              <li key={f} className="flex gap-1.5">
                <span aria-hidden className="text-zinc-300">
                  •
                </span>
                <span className="line-clamp-1">{f}</span>
              </li>
            ))}
          </ul>
        ) : !compact && product.excerpt ? (
          <p className="mt-1.5 line-clamp-3 text-sm/5 text-zinc-500">{product.excerpt}</p>
        ) : null}

        {firm ? (
          /* FİRMA BLOĞU = firmaya ait sinyallerin TEK yeri: avatar · ad ·
             Doğrulanmış · Gold · şehir.

             İKİ SATIR (tile): hepsi tek satırdayken 226 px'lik sütunda
             avatar + iki ikon + şehir yerin yarısını alıyor ve ad
             "Başke…"ye iniyordu — tedarikçi kararı için okunması gereken
             tek alan o. Ad artık üstte tek başına yarışıyor, şehir ikincil
             satırda tam okunuyor. `compact` da aynı bloğu kullanır: benzer
             ürün şeritlerindeki kartlar da ~200 px, aynı sıkışma orada da
             vardı. */
          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <Avatar name={firm.name} src={firm.logoUrl} size={24} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1">
                {/* ÜLKE BAYRAĞI (2026-09-07, Europages kalıbı): firma adının
                    önünde, adı okumadan menşei ayırt edilsin diye. Emoji
                    çözülemeyen kodda (KKTC/XN, bilinmeyen kod) HİÇ basılmaz —
                    tofu kutusu basmaktansa yok. Erişilebilirlik: ülke ADI
                    `title` + `sr-only` ile taşınır, emoji dekoratif. */}
                <CountryFlag code={firm.country} />
                <span className="truncate text-xs font-medium text-zinc-700">{firm.name}</span>
                {firm.verified ? (
                  <Badge tone="verified" size="sm" className="shrink-0 px-1">
                    <span className="sr-only">Doğrulanmış firma</span>
                  </Badge>
                ) : null}
                {/* "Gold Üye" METİN rozeti olarak KALDIRILMIŞTI (2026-09-07):
                    paketli firma çok, her kartta çıkıp ayırt ediciliğini
                    yitiriyordu. İkon olarak geri geldi — tarama sırasında
                    gürültü yapmıyor, "kimden alıyorum" sorusuna bakan
                    kullanıcı için okunur (etiketi ekran okuyucuda). */}
                {firm.gold ? (
                  <Badge tone="gold" size="sm" className="shrink-0 px-1">
                    <span className="sr-only">Gold Üye</span>
                  </Badge>
                ) : null}
              </span>
              {firm.city ? (
                <span className="mt-0.5 flex items-center gap-0.5 text-[11px] text-zinc-500">
                  <MapPinIcon aria-hidden className="size-3 shrink-0 text-zinc-400" />
                  <span className="truncate">{firm.city}</span>
                </span>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className={cn("mt-auto", compact ? "pt-2" : "pt-3")}>
          {/* FİYAT kartın en ağır satırı: firma adından ve MOQ'dan büyük.
              "Fiyat için teklif isteyin" AYNI yuvada, aynı ölçüde durur —
              fiyatlı ve fiyatsız kartlar yan yana hizalı okunsun. */}
          <p
            className={cn(
              "tnum font-semibold",
              compact ? "text-sm" : "text-base",
              price.hasPrice ? "text-zinc-950" : "text-zinc-500",
            )}
          >
            {price.headline}
          </p>
          {/* MOQ satırı MOQ yokken de yer kaplar: kartlar farklı yüksekliğe
              düşünce ızgara zıplıyordu ("teklif isteyin" ürünlerinin çoğunda
              MOQ yok). */}
          <p className="tnum mt-0.5 text-xs text-zinc-500">
            {product.moq
              ? `Min. ${Number(product.moq).toLocaleString("tr-TR")} ${product.unit}`
              : "\u00A0"}
          </p>
          {cta && !compact && target ? (
            /* BİRİNCİL EYLEM — kartın yayılmış bağlantısının ÜSTÜNDE (`z-10`)
               duran AYRI bir hedef: kart ürün sayfasını açar, bu düğme aynı
               sayfayı bilgi isteme kutusunda açar. `stopPropagation` tıklamanın
               karta sızmasını keser (bugün kartın kendi `onClick`i yok ama
               eklendiğinde iki eylem birden tetiklenirdi). */
            <Link
              href={ctaHref ?? `${target}#bilgi-iste`}
              {...NEW_TAB}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "relative z-10 mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                ctaCls,
              )}
            >
              {cta}
              <NewTabHint />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * Ülke bayrağı — çözülemeyen kodda hiç çizilmez (bkz. `countryFlag`).
 * Emoji dekoratif; anlamı `sr-only` ülke adı taşır.
 */
function CountryFlag({ code }: { code?: string | null }) {
  const flag = countryFlag(code);
  if (!flag) return null;
  return (
    <span className="shrink-0 text-sm leading-none" title={countryName(code as string)}>
      <span aria-hidden>{flag}</span>
      <span className="sr-only">{countryName(code as string)}</span>
    </span>
  );
}

/**
 * "Karşılaştır" — şimdilik YALNIZ yerel durum (kullanıcı kararı: karşılaştırma
 * tablosu sonra bağlanacak). `onChange` verilirse çağırana da bildirilir, o
 * gün kartı yeniden açmaya gerek kalmasın diye.
 *
 * Kartın yayılmış bağlantısının üstünde (`z-10`) durur ve tıklaması
 * `stopPropagation` ile kesilir — yoksa kutuyu işaretlemek ürün sayfasını
 * açardı. `opacity-0` ile gizlenir ama DOM'da ve odak sırasında KALIR
 * (`display:none` olsaydı klavyeyle erişilemezdi); odaklanınca ve işaretliyken
 * görünür.
 */
function CompareToggle({ name, onChange }: { name: string; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(false);
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute top-2 right-2 z-10 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-[11px] font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-950/10 transition",
        "opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[:checked]:opacity-100",
      )}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          onChange?.(e.target.checked);
        }}
        className="size-3.5 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
      />
      Karşılaştır
      <span className="sr-only">: {name}</span>
    </label>
  );
}
