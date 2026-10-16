import { useFormatter, useTranslations } from "next-intl";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { Link } from "@/i18n/navigation";
import { TabScrollRow } from "./tab-scroll-row";

/**
 * ARAMA SONUCU SEKMELERİ — "aynı sorgu, öteki yüzey" (2026-09-07).
 *
 * Europages spec §8.2'nin karşılığı. Orada ayrı bir `/arama` rotası var;
 * BİZDE AYRI ROTA AÇILMADI — `/urunler?q=` ile aynı içeriği ikinci bir
 * adreste sunmak yinelenen içerik (SEO) demek olurdu ve URL şemasını sabit
 * tutma kararına aykırı. Kazanç aynı: kullanıcı bir kez arıyor, sonucu üç
 * yüzeyde de görebiliyor.
 *
 * SAYAÇ YALNIZ ARAMA VARKEN. Aramasız gezinen kullanıcı için "Firmalar 20"
 * bir bilgi değil gürültü; ayrıca her liste sayfasında iki ek istek demek
 * olurdu. Sayacı bilinmeyen sekme sayısız çizilir — 0 BASILMAZ, çünkü "0"
 * ile "bilmiyorum" farklı şeyler (aynı kural panel sekmelerinde de var).
 */
export type SearchSurface = "products" | "companies" | "listings";

export function PublicSearchTabs({
  active,
  q,
  counts,
}: {
  active: SearchSurface;
  /** Arama terimi — sekmeye taşınır, kullanıcı yeniden yazmasın. */
  q?: string;
  /** Yüzey başına toplam. Yalnız `q` varken doldurulur. */
  counts?: Partial<Record<SearchSurface, number>>;
}) {
  const t = useTranslations("web.marketplace.searchTabs");
  const tl = useTranslations("web.marketplace.labels");
  const fmt = useFormatter();
  const href = (path: string) => (q ? `${path}?q=${encodeURIComponent(q)}` : path);
  // PORTAL RENGİ (2026-09-18, kullanıcı: "sekmeler siyah olmasın, renge göre"):
  // alım talepleri = tedarikçi yüzü → yeşil; ürünler/firmalar → mavi. Sunucu
  // bileşeni bağlam okuyamaz, yüzeyden türetilir.
  const green = active === "listings";
  const onCls = green ? "border-emerald-600 text-emerald-700" : "border-blue-600 text-blue-700";
  const onBadge = green ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800";
  const tabs: { key: SearchSurface; label: string; href: string }[] = [
    { key: "products", label: tl("products"), href: href(MARKETPLACE_ROUTES.products) },
    { key: "companies", label: tl("companies"), href: href(MARKETPLACE_ROUTES.companies) },
    { key: "listings", label: tl("demands"), href: href(MARKETPLACE_ROUTES.demands) },
  ];
  return (
    <nav aria-label={t("label")} className="mt-6 border-b border-zinc-200">
      {/* TEK SATIR (mobil denetim g02-06): sayaçlarla 360 px'e sığmayınca
          sarıyordu — etkin çizgi 1. satırda, alt çizgi 2. satırın altında
          kalıyordu. Artık sığmazsa yatay kayar (etkin sekme görünür alana
          alınır, devamı kenarda solar); `sm`den sonra eski aralık. */}
      <TabScrollRow className="-mb-px flex gap-x-4 overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] sm:gap-x-6 [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = t.key === active;
          // Kural bileşende uygulanır (arayüz testi D-327): çağıranlar etkin
          // sekmenin toplamını her zaman geçiyordu; aramasız `/urunler`de yalnız
          // "Ürünler 190" rozeti çıkıyor, öteki sekmeler sayısız kalıyordu.
          const n = q ? counts?.[t.key] : undefined;
          return (
            <li key={t.key} className="shrink-0">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                // Odak çerçevesi İÇE çizilir: kayan satır (`overflow-x-auto`)
                // dikeyde de kırpar; dışa taşan 2+2 px'lik global çerçeve
                // üstten, alttan ve ilk sekmede soldan kesiliyordu.
                className={`inline-flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition focus-visible:-outline-offset-2 ${
                  on
                    ? onCls
                    : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                }`}
              >
                {t.label}
                {n != null ? (
                  <span
                    className={`tnum rounded-full px-2 py-0.5 text-xs font-semibold ${
                      on ? onBadge : "bg-zinc-200 text-zinc-700"
                    }`}
                  >
                    {fmt.number(n)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </TabScrollRow>
    </nav>
  );
}
