import Link from "next/link";

/**
 * TEK BOŞ DURUM — bütün herkese açık listeler (2026-09-04).
 *
 * Denetim: üç sayfada üç farklı metin vardı ve boş sayfa boş sayfaya
 * bağlantı veriyordu (`/satilik` → "Alım taleplerine bak" → o da boş).
 * Şablon tek: "{Tür} bulunamadı." + "Filtreleri temizle" (süzgeç varsa) +
 * "Kategorilere göz at" (anasayfa kategori ızgarası — her zaman dolu).
 */
export function PublicEmptyState({
  noun,
  clearHref,
}: {
  /** "Ürün", "Alım talebi", "Satılık ilan", "Firma" */
  noun: string;
  /** Süzgeç aktifken temizleme hedefi; yoksa düğme basılmaz. */
  clearHref?: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center">
      <p className="text-base font-semibold text-zinc-900">{noun} bulunamadı.</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        {clearHref ? (
          <Link
            href={clearHref}
            className="rounded-full bg-zinc-950 px-4 py-2 font-semibold text-white transition hover:bg-zinc-800"
          >
            Filtreleri temizle
          </Link>
        ) : null}
        <Link
          href="/#kategoriler"
          className="rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white"
        >
          Kategorilere göz at
        </Link>
      </div>
    </div>
  );
}
