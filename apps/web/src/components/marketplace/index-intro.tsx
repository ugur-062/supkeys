import { companyActivityLabel } from "@rothern/shared";
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
  const cities = facets.cities.filter((c) => c.count > 0).slice(0, 4);
  const activities = facets.activities.filter((a) => a.count > 0).slice(0, 3);
  const cats = facets.categories.filter((c) => c.count > 0).slice(0, 4);
  const priced = facets.price?.has ?? 0;
  const verified = facets.verified ?? 0;

  const sentences: string[] = [];
  if (total > 0) {
    sentences.push(
      kind === "category"
        ? `Rothern'de ${subject} kategorisinde ${total.toLocaleString("tr-TR")} ürün listeli.`
        : `${subject} merkezli firmaların Rothern vitrinlerinde ${total.toLocaleString("tr-TR")} ürün listeli.`,
    );
  }
  if (kind === "category" && cities.length > 0) {
    sentences.push(
      `Ürünlerin bulunduğu iller: ${cities.map((c) => `${c.city} (${c.count})`).join(", ")}.`,
    );
  }
  if (kind === "city" && cats.length > 0) {
    sentences.push(
      `En çok ürün bulunan kategoriler: ${cats.map((c) => `${c.name} (${c.count})`).join(", ")}.`,
    );
  }
  if (activities.length > 0) {
    /* SAYI YAZILMIYOR: bir firma en çok üç faaliyet tipi beyan edebilir,
       dolayısıyla facet sayıları ÜST ÜSTE BİNER ve toplamları ürün sayısını
       aşar ("5 ürün" altında "4 + 2" okunurdu). Tip listesi bilgiyi verir,
       sayı yanıltırdı. */
    sentences.push(
      `Ürünleri listeleyen firmalar arasında ${activities
        .map((a) => companyActivityLabel(a.activity).toLocaleLowerCase("tr"))
        .join(", ")} bulunuyor.`,
    );
  }
  if (priced > 0) {
    sentences.push(
      priced >= total
        ? "Ürünlerin tamamında fiyat açık yazılı."
        : `${priced} üründe fiyat açık yazılı; kalanı için satıcıdan teklif isteyebilirsiniz.`,
    );
  }
  if (verified > 0) {
    sentences.push(
      verified >= total
        ? "Ürünlerin tamamı doğrulanmış firmalara ait."
        : `${verified} ürün doğrulanmış firmalara ait.`,
    );
  }

  if (sentences.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
      <p className="max-w-3xl text-sm/6 text-zinc-600">{sentences.join(" ")}</p>
    </section>
  );
}
