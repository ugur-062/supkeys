import { useTranslations } from "next-intl";
import { useCityLabel } from "@/i18n/domain";
import { cityCompanyPath, cityProductPath } from "@/lib/public/city";
import { Link } from "@/i18n/navigation";

/**
 * ŞEHİR BAĞLANTI ŞERİDİ — iç bağlantı ağı (2026-09-09, Parça 3).
 *
 * Şehir sayfalarının var olması yetmez; tarayıcının onlara ULAŞMASI gerekir.
 * Sitemap keşfi sağlar, iç bağlantı OTORİTE aktarır — ikisi ayrı işlerdir.
 *
 * Yalnız VERİSİ OLAN şehirler basılır (`cities` facet sayımından gelir):
 * sıfır sonuçlu bağlantı hem kullanıcıyı boş sayfaya götürür hem tarama
 * bütçesini yer. Facet yoksa şerit HİÇ çizilmez.
 *
 * DÜNYA GENELİ (2026-09-27): `city` şehrin kalıcı adresi ("bursa",
 * "de-munich"), `name` okuyucunun dilinde ad — eskiden yalnız 81 il.
 */
export function CityLinks({
  cities,
  kind,
  activeCity,
}: {
  cities: { city: string; name?: string; count: number }[];
  kind: "products" | "companies";
  activeCity?: string;
}) {
  const t = useTranslations("web.marketplace.cityLinks");
  const cityLabel = useCityLabel();
  const list = cities
    .filter((c) => c.count > 0 && c.city !== activeCity)
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);
  if (list.length === 0) return null;

  const href = kind === "products" ? cityProductPath : cityCompanyPath;
  const heading = kind === "products" ? t("products") : t("companies");

  return (
    <section className="mx-auto mt-10 max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
      <h2 className="text-sm font-semibold text-zinc-900">{heading}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.map((c) => (
          <li key={c.city}>
            <Link
              href={href(c.city)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm text-zinc-700 ring-1 ring-zinc-950/10 ring-inset transition hover:text-zinc-950 hover:ring-zinc-950/20"
            >
              {c.name ?? cityLabel(c.city)}
              <span className="text-xs text-zinc-500 tabular-nums">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
