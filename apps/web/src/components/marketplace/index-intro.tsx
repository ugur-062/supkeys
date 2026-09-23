import { useActivityLabel } from "@/i18n/domain";
import { useLocale, useTranslations } from "next-intl";
import type { ProductFacets } from "@/lib/public/marketplace-api";

/**
 * VERİDEN TÜRETİLMİŞ GİRİŞ PARAGRAFI (2026-09-09, Parça 4: GEO).
 *
 * Kategori ve şehir sayfaları listeden ibaretti; üretken bir motorun
 * alıntılayabileceği TEK CÜMLE yoktu ve arama motoru için de içerikleri
 * inceydi. Bu paragraf listenin ÜSTÜNDE, tam cümlelerle, sayfanın kendi
 * verisini özetler.
 *
 * KURAL: her sayı facet'ten gelir; tahmin, yuvarlama ya da "yüzlerce ürün"
 * gibi doldurma YOKTUR. Veri yoksa o cümle hiç kurulmaz, paragraf kısalır;
 * hiçbir olgu kalmazsa bileşen HİÇ çizilmez. (Uydurma sinyal basmama
 * kuralının aynısı — "N tedarikçi inceledi" ile aynı gerekçe.)
 */
export function IndexIntro({
  subject,
  total,
  facets,
  kind,
}: {
  /** "Elektrik malzemeleri" ya da "İzmir" — cümlenin öznesi. */
  subject: string;
  total: number;
  facets: ProductFacets;
  kind: "category" | "city";
}) {
  const t = useTranslations("web.marketplace.indexIntro");
  const locale = useLocale();
  const activityLabel = useActivityLabel();
  const cities = facets.cities.filter((c) => c.count > 0).slice(0, 4);
  const activities = facets.activities.filter((a) => a.count > 0).slice(0, 3);
  const cats = facets.categories.filter((c) => c.count > 0).slice(0, 4);
  const priced = facets.price?.has ?? 0;

  const sentences: string[] = [];
  if (total > 0) {
    sentences.push(
      kind === "category"
        ? t("categoryTotal", { subject, total })
        : t("cityTotal", { subject, total }),
    );
  }
  if (kind === "category" && cities.length > 0) {
    sentences.push(
      t("cities", { list: cities.map((c) => `${c.city} (${c.count})`).join(", ") }),
    );
  }
  if (kind === "city" && cats.length > 0) {
    sentences.push(
      t("cats", { list: cats.map((c) => `${c.name} (${c.count})`).join(", ") }),
    );
  }
  if (activities.length > 0) {
    /* SAYI YAZILMIYOR: bir firma en çok üç faaliyet tipi beyan edebilir,
       dolayısıyla facet sayıları ÜST ÜSTE BİNER ve toplamları ürün sayısını
       aşar ("5 ürün" altında "4 + 2" okunurdu). Tip listesi bilgiyi verir,
       sayı yanıltırdı. */
    sentences.push(
      t("activities", {
        list: activities.map((a) => activityLabel(a.activity).toLocaleLowerCase(locale)).join(", "),
      }),
    );
  }
  if (priced > 0) {
    sentences.push(
      priced >= total
        ? t("allPriced")
        : t("somePriced", { priced }),
    );
  }
  // "…doğrulanmış firmalara ait" cümlesi KALDIRILDI (2026-09-19, kullanıcı:
  // kategori sayfasında "yarısı var yarısı yok" okunuyordu, kafa karıştırıcı).

  if (sentences.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <p className="max-w-3xl text-sm/6 text-zinc-600">{sentences.join(" ")}</p>
    </section>
  );
}
