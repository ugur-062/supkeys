import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { signupHref } from "@/lib/public/visibility";
import { CheckIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * Europages "Create profile / Request Hub" ikilisi.
 *
 * İKİ YÜZ (2026-09-07): public'te sayfanın üçüncü KAYIT CTA'sı; PANELDE
 * kayıt diye bir şey yok — aynı iki kart üyenin iki eylemine bağlanır
 * (talep aç · ürün ekle). Kopyayı `variant` seçer; düzen ve ton tek yerde
 * kalsın diye ayrı bir bileşen açılmadı.
 */
export function TwoCards({ variant = "public" }: { variant?: "public" | "panel" } = {}) {
  if (variant === "panel") return <PanelTwoCards />;
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-zinc-950 p-8 text-white">
          <h2 className="text-2xl font-semibold tracking-tight">Firmanı listele, ürünlerini vitrine çıkar</h2>
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            {["Ücretsiz profil", "Yapay zekâ ile profil ve katalog doldurma", "Kategorinle eşleşen talep bildirimi"].map((t) => (
              <li key={t} className="flex gap-2"><CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-400" />{t}</li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={signupHref("vitrin")} className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200">
              Ücretsiz profil oluştur
            </Link>
            <Link href="/nasil-calisir#fiyatlar" className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-900">
              Premium&apos;u gör
            </Link>
          </div>
        </div>
        <div className="rounded-3xl bg-zinc-50 p-8 ring-1 ring-zinc-950/5">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Alım taleplerini takip et</h2>
          <p className="mt-3 text-sm/6 text-zinc-600">
            Kategorinle eşleşen açık talepler e-postana gelsin; kapalı zarf teklifini panelden ver, karşılaştırmayı alıcı yapsın.
          </p>
          <Link
            href={MARKETPLACE_ROUTES.demands}
            className="mt-6 inline-flex rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Alım taleplerini gör
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * PANEL ikilisi — kayıt yerine EYLEM. Koyu kart satınalma tarafının birincil
 * işi (talep aç), açık kart satış tarafının (ürün ekle): firma tek hesapta
 * iki tarafı da yürütür, anasayfa ikisini de hatırlatır.
 */
function PanelTwoCards() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl bg-gradient-to-br from-blue-700 to-blue-900 p-8 text-white">
          <h2 className="text-2xl font-semibold tracking-tight">Aradığını bulamadın mı? Talep aç</h2>
          <ul className="mt-5 space-y-2 text-sm text-blue-100">
            {[
              "Kategorinle eşleşen tedarikçilere duyurulur",
              "Teklifler kapalı zarf — teklifçiler birbirini görmez",
              "Kazandır, sipariş kendiliğinden oluşsun",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-blue-200" />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/company/satinalma/taleplerim/yeni"
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-blue-900 transition hover:bg-blue-50"
            >
              Talep aç
            </Link>
            <Link
              href="/company/satinalma/taleplerim"
              className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Taleplerim
            </Link>
          </div>
        </div>
        <div className="rounded-3xl bg-zinc-50 p-8 ring-1 ring-zinc-950/5">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Sen de sat: ürünlerini vitrine çıkar</h2>
          <p className="mt-3 text-sm/6 text-zinc-600">
            Vitrinindeki ürünler bu sayfada, dizinde ve herkese açık pazar yerinde görünür; alıcılar
            doğrudan bilgi ister.
          </p>
          <Link
            href="/company/satis/urunlerim"
            className="mt-6 inline-flex rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Ürünlerim
          </Link>
        </div>
      </div>
    </section>
  );
}
