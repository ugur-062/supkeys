import { PublicLayout } from "@/components/marketplace/public-layout";
import { OPERATOR } from "@/lib/company-info";
import { buildMetadata } from "@/lib/seo/meta";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbNode, graph } from "@/lib/seo/jsonld";
import Link from "next/link";

/* Başlıkta "— Rothern" YOK: kök `layout.tsx` şablonu zaten `%s · Rothern`
   ekliyordu, canlıda "Hakkımızda — Rothern · Rothern" çıkıyordu (2026-09-09).
   Açıklama da sayfaya özel — eskiden kökün genel cümlesi mirasla geliyordu ve
   arama sonucunda bu sayfa anasayfayla aynı metni gösteriyordu. */
export const metadata = buildMetadata({
  title: "Hakkımızda",
  description:
    "Rothern kimdir, nasıl bir platformdur ve kim işletir: alıcı ile tedarikçiyi tek hesapta birleştiren, kapalı zarf teklif usulüyle çalışan B2B tedarik platformu.",
  path: "/hakkimizda",
});

export default function Page() {
  return (
    <PublicLayout>
      <JsonLd
        data={graph([
          breadcrumbNode([
            { name: "Anasayfa", path: "/" },
            { name: "Hakkımızda", path: "/hakkimizda" },
          ]),
        ])}
      />
      <div className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="text-2xl font-bold text-zinc-900">Hakkımızda</h1>
        <p className="mt-3 text-base/7 text-zinc-700">
          <strong>Rothern</strong>, alıcı ve tedarikçi firmaları tek hesapta
          birleştiren Türkiye merkezli bir B2B tedarik pazar yeridir. Firmalar
          Rothern üzerinde ürün vitrini yayımlar, satın alma talebi açar,
          kapalı zarf usulüyle teklif toplar, pazarlık yürütür, kazandırma
          yapar ve sipariş sürecini teslimata kadar tek panelden takip eder.
        </p>

        <div className="mt-10 space-y-8 text-sm/6 text-zinc-700">
          <section>
            <h2 className="text-base font-semibold text-zinc-950">Ne yapıyoruz</h2>
            <p className="mt-2">
              Endüstriyel alımda süreç hâlâ büyük ölçüde e-posta, telefon ve
              Excel üzerinden yürüyor: alıcı tedarikçi listesini kendi
              defterinden çıkarıyor, teklifleri elle karşılaştırıyor, kimin ne
              zaman ne teklif ettiği tek bir yerde durmuyor. Rothern bu akışı
              tek panele taşıyor — talep açmaktan siparişin teslimine kadar
              her adım aynı kayıt üzerinde yaşıyor ve kimin neyi ne zaman
              yaptığı denetlenebilir kalıyor.
            </p>
            <p className="mt-3">
              Tedarikçi tarafında ise mesele görünürlük: ürününü listeleyen bir
              firma, kendisini hiç tanımayan bir alıcının açtığı talebe teklif
              verebiliyor. Eşleşme, dört seviyeli uluslararası kategori ağacı
              ve firmaların beyan ettiği faaliyet tipleri üzerinden kuruluyor.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-950">
              Tek hesap, iki taraf
            </h2>
            <p className="mt-2">
              Bir firma çoğu zaman hem alıcıdır hem satıcı. Rothern&apos;de tek
              firma hesabı iki paneli birden açar: satın alma tarafında talep
              açıp teklif toplarsınız, satış tarafında başkalarının taleplerine
              teklif verir ve ürün vitrininizi yönetirsiniz. Ekipteki her
              kişinin hangi tarafta ne yapabileceği tik tablosuyla ayrı ayrı
              belirlenir; yalnız onaylayan bir yönetici, teklif veremeyen bir
              görüntüleyici ya da yalnız satış tarafında çalışan bir satışçı
              tanımlanabilir.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-950">İlkelerimiz</h2>
            <dl className="mt-3 space-y-4">
              <div>
                <dt className="font-semibold text-zinc-950">Kapalı zarf gerçekten kapalıdır.</dt>
                <dd className="mt-1">
                  Teklif verenler birbirinin teklifini göremez; teklif SAYISI
                  bile yayımlanmaz. Rekabeti görünür kılan bir “kaç teklif
                  var” sayacı, fiyatı aşağı çekmek için kullanılabilecek bir
                  baskı aracıdır — bu yüzden yok.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-950">Alıcının kimliği alıcıya aittir.</dt>
                <dd className="mt-1">
                  Herkese açık talep sayfalarında alıcı firmanın adı gösterilmez:
                  ne aradığınız, üretim planınız hakkında rakiplerinize bilgi
                  vermemelidir. Görünen şey kimlik değil niteliktir — şehir,
                  ülke, sektör, faaliyet tipi.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-950">Görünmek ücretsizdir.</dt>
                <dd className="mt-1">
                  Profil açmak, dizinde yer almak ve ürün yayımlamak için ödeme
                  gerekmez. Ücretli paketlerin karşılığı görünürlüğün kendisi
                  değil önceliğidir: sıralama, sınırsız ürün, belge ve video,
                  herkese açık taleplere erişim.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-zinc-950">Sayı uydurmayız.</dt>
                <dd className="mt-1">
                  Ölçmediğimiz hiçbir şeyi göstermeyiz. “Şu ürünü 40 tedarikçi
                  inceledi” türü sayaçlar, arkasında gerçek bir ölçüm olmadığı
                  sürece sitede yer almaz; bir alan boşsa boş görünür.
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-950">
              Ticarete aracılık etmiyoruz
            </h2>
            <p className="mt-2">
              Rothern üzerinden satılan tek şey üyelik paketleridir. Firmalar
              arasındaki mal ve hizmet bedeline platform aracılık etmez, parayı
              taşımaz; sözleşme ve ödeme taraflar arasında doğrudan yürür.
              Sipariş ekranındaki ödeme adımları, tarafların birbirine yaptığı
              bildirimlerin kaydıdır.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-950">Kimler kullanabilir</h2>
            <p className="mt-2">
              Şu anda Türkiye, KKTC, Rusya, Azerbaycan, Kazakistan, Özbekistan,
              Çin ve Birleşik Arap Emirlikleri&apos;nden firma kaydı alınıyor.
              Her ülkenin kendi belge kümesi var; doğrulama istisnasız insan
              eliyle yapılıyor, otomatik onay yolu bulunmuyor. Ayrıntılar için{" "}
              <Link href="/sss" className="underline hover:text-zinc-900">
                sık sorulan sorular
              </Link>{" "}
              ve{" "}
              <Link href="/nasil-calisir" className="underline hover:text-zinc-900">
                Nasıl Çalışır
              </Link>{" "}
              sayfalarına bakabilirsiniz.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-950">İşletmeci</h2>
            <p className="mt-2">
              Platform, <strong>{OPERATOR.legalName}</strong> tarafından
              işletilmektedir ({OPERATOR.address} · {OPERATOR.taxOffice} — Vergi
              No: {OPERATOR.taxNo}). Bize{" "}
              <a href={`mailto:${OPERATOR.supportEmail}`} className="underline hover:text-zinc-900">
                {OPERATOR.supportEmail}
              </a>{" "}
              adresinden ulaşabilir, tam künye için{" "}
              <Link href="/iletisim" className="underline hover:text-zinc-900">
                İletişim ve Künye
              </Link>{" "}
              sayfamıza bakabilirsiniz.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
