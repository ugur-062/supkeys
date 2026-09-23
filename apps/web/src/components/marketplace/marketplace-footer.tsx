import { RothernLogo } from "@/components/brand/logo";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { useTranslations } from "next-intl";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { Link } from "@/i18n/navigation";

/**
 * Public sayfaların ortak alt bilgisi — SUNUCU bileşeni.
 *
 * SEO işlevi var: her public sayfadan pazar yerinin ana giriş noktalarına ve
 * yasal metinlere iç bağlantı verir. Tarayıcı botu derinlemesine gezerken bu
 * bağlantıları izler; onlarsız kategori/şehir kırılım sayfaları yalnız
 * sitemap üzerinden keşfedilir (daha yavaş, daha az güvenilir).
 */
export function MarketplaceFooter() {
  const t = useTranslations("web.marketing.footer");
  const tn = useTranslations("web.marketing.nav");
  const tl = useTranslations("web.marketplace.labels");
  // Yayın anahtarı kapalıyken pazar yeri sütunu HİÇ basılmaz — rotalar 404.
  const COLUMNS = [
    ...(MARKETPLACE_LIVE
      ? [
          {
            heading: t("marketplace"),
            links: [
              { label: tl("demands"), href: MARKETPLACE_ROUTES.demands },
              { label: tl("products"), href: MARKETPLACE_ROUTES.products },
              { label: tl("companies"), href: MARKETPLACE_ROUTES.companies },
              { label: t("categories"), href: "/#kategoriler" },
            ],
          },
        ]
      : []),
    {
      heading: t("rothern"),
      links: [
        { label: tn("howItWorks"), href: "/nasil-calisir" },
        { label: t("faq"), href: "/sss" },
        { label: tn("pricing"), href: "/nasil-calisir#fiyatlar" },
        { label: t("about"), href: "/hakkimizda" },
        { label: t("contact"), href: "/iletisim" },
      ],
    },
    {
      heading: t("legal"),
      links: [
        { label: t("userAgreement"), href: "/sozlesmeler/kullanici" },
        { label: t("mediation"), href: "/sozlesmeler/aracilik" },
        { label: t("privacy"), href: "/sozlesmeler/gizlilik" },
        { label: t("kvkk"), href: "/sozlesmeler/kvkk" },
        // Ön bilgilendirme yükümlülüğü (2026-09-22, kullanıcı kararı): iki sayfa
        // öksüzdü, yalnız sitemap'ten ulaşılıyordu.
        { label: t("distanceSales"), href: "/sozlesmeler/mesafeli-satis" },
        { label: t("refund"), href: "/sozlesmeler/iade" },
      ],
    },
  ];
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <RothernLogo variant="full-light" size="sm" />
            <p className="mt-4 max-w-xs text-sm/6 text-zinc-600">{t("tagline")}</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="text-sm font-semibold text-zinc-950">
                {col.heading}
              </h2>
              <ul className="mt-4 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm/6 text-zinc-600 hover:text-zinc-950"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-zinc-200 pt-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Rothern</p>
          <div className="flex gap-4">
            <Link href="/company/login" className="hover:text-zinc-950">
              {t("login")}
            </Link>
            <Link href="/company/kayit" className="hover:text-zinc-950">
              {t("signup")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
