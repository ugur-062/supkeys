import Link from "next/link";

/**
 * KAPANIŞ CTA — sayfadaki ÜÇÜNCÜ ve son kayıt çağrısı (header, hero altı,
 * burası). "Talep aç / İlan aç / Vitrin aç" tek grup: hepsi kayda gider,
 * `?intent=` kayıt sonrası ilgili sihirbazı açar (kayıt formu okur).
 */
const INTENTS = [
  { intent: "talep", label: "Talep aç" },
  { intent: "ilan", label: "İlan aç" },
  { intent: "vitrin", label: "Vitrin aç" },
] as const;

export function ClosingCta() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <div className="flex flex-col gap-6 rounded-3xl bg-zinc-950 px-8 py-10 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Firmanı Rothern&apos;e taşı
          </h2>
          <p className="mt-2 max-w-xl text-sm/6 text-zinc-300">
            Tek hesapla hem alım talebi aç hem ürün ve ilan yayımla. Kaydolmak
            ücretsiz, komisyon yok.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {INTENTS.map((i) => (
              <li key={i.intent}>
                <Link
                  href={`/company/kayit?intent=${i.intent}`}
                  className="text-zinc-300 underline underline-offset-4 transition hover:text-white"
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link
            href="/company/kayit"
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Ücretsiz kaydol
          </Link>
          <Link
            href="/nasil-calisir#fiyatlar"
            className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-900"
          >
            Fiyatları gör
          </Link>
        </div>
      </div>
    </section>
  );
}
