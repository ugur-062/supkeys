import { RothernLogo } from "@/components/brand/logo";
import { MARKETPLACE_LABELS, MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import Link from "next/link";

/**
 * Public sayfaların ortak alt bilgisi — SUNUCU bileşeni.
 *
 * SEO işlevi var: her public sayfadan pazar yerinin ana giriş noktalarına ve
 * yasal metinlere iç bağlantı verir. Tarayıcı botu derinlemesine gezerken bu
 * bağlantıları izler; onlarsız kategori/şehir kırılım sayfaları yalnız
 * sitemap üzerinden keşfedilir (daha yavaş, daha az güvenilir).
 */
const COLUMNS = [
  {
    heading: "Pazar yeri",
    links: [
      { label: MARKETPLACE_LABELS.demands, href: MARKETPLACE_ROUTES.demands },
      { label: MARKETPLACE_LABELS.offers, href: MARKETPLACE_ROUTES.offers },
      { label: MARKETPLACE_LABELS.companies, href: MARKETPLACE_ROUTES.companies },
    ],
  },
  {
    heading: "Rothern",
    links: [
      { label: "Nasıl çalışır", href: "/nasil-calisir" },
      { label: "Hakkımızda", href: "/hakkimizda" },
      { label: "İletişim", href: "/iletisim" },
    ],
  },
  {
    heading: "Sözleşmeler",
    links: [
      { label: "Kullanıcı Sözleşmesi", href: "/sozlesmeler/kullanici" },
      { label: "Aracılık Sözleşmesi", href: "/sozlesmeler/aracilik" },
      { label: "Gizlilik", href: "/sozlesmeler/gizlilik" },
      { label: "KVKK Aydınlatma", href: "/sozlesmeler/kvkk" },
    ],
  },
] as const;

export function MarketplaceFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <RothernLogo variant="full-light" size="sm" />
            <p className="mt-4 max-w-xs text-sm/6 text-zinc-600">
              Alıcı ve tedarikçiyi tek hesapta birleştiren B2B ticaret
              platformu.
            </p>
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
              Giriş yap
            </Link>
            <Link href="/company/kayit" className="hover:text-zinc-950">
              Ücretsiz kaydol
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
