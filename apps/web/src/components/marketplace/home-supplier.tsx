import { ListingTeaserCard } from "./listing-teaser-card";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { ArrowRightIcon, PlusIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

const MIN_DEMANDS = 3;

/**
 * ANASAYFANIN TEDARİKÇİ YÜZÜ — satış panosunun herkese açık hâli
 * (2026-09-08, kullanıcı kararı).
 *
 * Panelde bu bölüm `SellerTendersView`: kenar süzgeçli TAM liste, satırında
 * uygunluk (davetli / bağlantılı / ürününüzle eşleşti), teklif durumu ve
 * ücretsiz pakette kilit kartı. Hiçbiri anonimde HESAPLANAMAZ — üçü de
 * izleyen firmayı bilmeyi gerektiriyor. Bu yüzden burada listenin herkese
 * açık karşılığı var: teaser kartları (`ListingTeaserCard` — alıcı adı,
 * kalem adları ve şartname TAŞIMAZ) + tam listeye çıkış. Kenar süzgeçli tam
 * liste zaten `/alim-talepleri`'nde yaşıyor, ikinci bir kopya açılmadı.
 *
 * `SellerHealthCards` (profil/katalog sağlığı) ve KPI'lar da yok: tümüyle
 * üye verisi.
 *
 * Sıralama YAKINDA KAPANAN önce — aciliyet cezbeder; panelin ilgi
 * merdiveninin (davet › bağlantı › ürün eşleşmesi) anonim karşılığı yok.
 */
export function HomeSupplier({
  demands,
  total,
}: {
  demands: PublicListingCard[];
  total: number;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 pb-14 sm:px-6 lg:px-8">
      <section aria-labelledby="acik-talepler">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="acik-talepler" className="text-lg font-semibold tracking-tight text-zinc-950">
              Alıcılar şu an bunları arıyor
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-zinc-500">
              Miktar, kapsam ve kalan süre herkese açık. Alıcı adı, kalem adları ve şartname yalnız
              üyelere — kapalı zarf kuralı.
            </p>
          </div>
          {demands.length >= MIN_DEMANDS ? (
            <Link
              href={MARKETPLACE_ROUTES.demands}
              className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Tüm talepler{total > 0 ? ` (${total})` : ""}
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          ) : null}
        </div>

        {demands.length >= MIN_DEMANDS ? (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {demands.map((l) => (
              <li key={l.number}>
                <ListingTeaserCard listing={l} />
              </li>
            ))}
          </ul>
        ) : (
          /* Eşiğin altında ızgara çizilmez — üç karttan az bir "pazar" boş
             görünürdü. Tek satır, kaydolmaya çıkar. */
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
            Talepler, kaydolduktan sonra panelinizde kategorinize göre eşleşir.
            <Link
              href={signupHref("teklif")}
              className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
            >
              Ücretsiz kaydolun
            </Link>
          </p>
        )}
      </section>

      {/* Panelde bu şerit "Ürün ekle" sihirbazına gider; anonimde kayıt
          niyetiyle kayda gider ve onboarding sonrası aynı sihirbaza düşer. */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-emerald-50 px-6 py-5 ring-1 ring-emerald-600/10">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Ürününüz vitrinde mi?</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Ürünlerinizi fiyat ve minimum sipariş bilgisiyle yayımlayın; alıcılar bulsun, bilgi talebi
            göndersin. Vitrin ücretsiz pakette de açık.
          </p>
        </div>
        <Link
          href={signupHref("vitrin")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          <PlusIcon aria-hidden className="size-4" />
          Ürün ekle
        </Link>
      </section>
    </div>
  );
}
