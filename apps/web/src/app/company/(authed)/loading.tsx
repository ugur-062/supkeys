/**
 * P3 (frontend denetimi §11) — rota geçişinde anlık iskelet. Sayfa
 * bileşenleri kendi veri-iskeletlerini zaten çizer; bu dosya, prefetch
 * kapalıyken (P0 kararı) rota chunk'ı yüklenirken görülen boş beyaz
 * ekranı kapatır. Nötr blok deseni tüm authed rotalara yeter.
 */
export default function AuthedLoading() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-8 w-1/3 animate-pulse rounded bg-zinc-100" />
      <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
      <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
    </div>
  );
}
