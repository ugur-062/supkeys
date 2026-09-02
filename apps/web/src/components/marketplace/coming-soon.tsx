import { RothernLogo } from "@/components/brand/logo";

/**
 * Yayın öncesi kök sayfa. Eskiden `app/page.tsx` içinde gömülüydü; pazar yeri
 * anahtarı (`MARKETPLACE_LIVE`) eklenince kendi dosyasına ayrıldı — anasayfa
 * artık iki farklı sayfayı taşıyor ve ikisinin de tek dosyada durması okumayı
 * zorlaştırıyordu. İçerik BİREBİR korundu.
 */
export function ComingSoon() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <RothernLogo variant="full-light" size="lg" priority />
        <div className="mt-10 inline-flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1 text-sm/6 font-medium text-zinc-600 ring-1 ring-zinc-950/10">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Geliştirme aşamasında
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-5xl">
          Çok yakında sizlerleyiz
        </h1>
        <p className="mt-4 max-w-md text-base/7 text-pretty text-zinc-600">
          Rothern, alıcı ve tedarikçiyi tek hesapta birleştiren B2B ticaret
          platformu. Şu anda son hazırlıkları yapıyoruz; en yakın zamanda
          buradayız.
        </p>
        <p className="mt-8 text-sm/6 text-zinc-500">
          Sorularınız için{" "}
          <a
            href="mailto:destek@rothern.com"
            className="font-semibold text-zinc-950 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-950"
          >
            destek@rothern.com
          </a>
        </p>
      </main>
      <footer className="pb-8 text-center text-xs text-zinc-400">
        © 2026 Rothern
      </footer>
    </div>
  );
}
