// Sunucu VE istemci uyumlu: tek hook `useTranslations` (next-intl ikisinde de
// çalışır); `hrefBuilder` sunucu bileşeninden, `onChange` istemci bileşeninden
// gelir (product-index sunucu, galeri istemci).
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { scrollToListStart } from "@/components/list/scroll-to-list-start";

/**
 * 7 YUVALI sayfa aralığı: toplam ≤ 7 → hepsi; aksi hâlde her zaman 7 yuva
 * (1 … 4 5 6 … 20 / 1 2 3 4 5 … 20 / 1 … 16 17 18 19 20) — düğme sayısı
 * değişmediği için sayfalar arası düzen zıplamaz.
 */
export function pageSlots(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

/**
 * SAYFALAMA — `hrefBuilder` verilirse gerçek bağlantılar (SEO: bot yalnız
 * <a href> izler, `rel=prev/next`), yoksa `onChange` ile buton. Tek sayfada
 * çizilmez. Aktif sayfa siyah, `aria-current="page"`.
 *
 * MOBİL (mobil denetim 2026-10, g05): 9 yuva × 36 px + boşluklar 356 px
 * tutuyor, 360 px telefonda 328 px'lik içeriği taşırıp sayfayı yana
 * kaydırıyordu (sabit üst çubuk ve alttan açılan süzgeç düğmesi de ekran
 * dışına kayıyordu). Telefonda yuvalar 32 px, boşluk 2 px, üç noktalı yuva
 * 24 px → "1 … 101 102 103 … 200" bile ~292 px. Dokunma alanı görünmez bir
 * katmanla 44 px yüksekliğe çıkar (yan yana yuvalar çakışmasın diye yalnız
 * dikeyde). `sm` ve üstü değişmedi. `onChange` kipinde (istemci listesi)
 * sayfa değişince görünüm listenin başına döner (`scrollToListStart`);
 * bağlantı kipinde gezinme zaten sayfanın başını açar.
 */
export function Pagination({
  page,
  total,
  pageSize,
  hrefBuilder,
  onChange,
  className,
}: {
  page: number;
  total: number;
  pageSize: number;
  hrefBuilder?: (page: number) => string;
  onChange?: (page: number) => void;
  className?: string;
}) {
  // Erişilebilir adlar okuyucunun dilinde (herkese açık yüzeyde de çizilir →
  // `web.shared`, panel ad alanı DEĞİL).
  const t = useTranslations("web.shared.ui");
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last <= 1) return null;
  const slots = pageSlots(page, last);
  const item = (p: number, label: React.ReactNode, opts: { rel?: "prev" | "next"; ariaLabel?: string; active?: boolean } = {}) => {
    const cls = cn(
      "tnum relative inline-flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-sm font-medium transition sm:h-9 sm:min-w-9 sm:px-2",
      // Görünmez dokunma alanı: telefonda 32 → 44 px yükseklik, genişlik aynı.
      "after:absolute after:inset-x-0 after:-inset-y-1.5 sm:after:inset-y-0",
      opts.active ? "bg-zinc-100 text-zinc-950 ring-1 ring-zinc-300" : "text-zinc-700 hover:bg-zinc-100",
    );
    if (hrefBuilder) {
      return (
        <Link href={hrefBuilder(p)} rel={opts.rel} aria-label={opts.ariaLabel} aria-current={opts.active ? "page" : undefined} className={cls}>
          {label}
        </Link>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          if (p === page) return;
          // Konum ESKİ düzende ölçülür: liste başının yeri sayfa değişiminden
          // etkilenmez, yeni sayfa yüklenirken sayfalama DOM'dan kalkabilir.
          scrollToListStart(e.currentTarget);
          onChange?.(p);
        }}
        aria-label={opts.ariaLabel}
        aria-current={opts.active ? "page" : undefined}
        className={cls}
      >
        {label}
      </button>
    );
  };
  return (
    // `flex-wrap` yalnız son çare: bugünkü ölçülerle 320 px'te bile tek satıra
    // sığar; sığmazsa sayfa yatay kaymaz, yuvalar alt satıra iner.
    <nav data-pagination-root="" aria-label={t("pagination")} className={cn("flex flex-wrap items-center justify-center gap-0.5 sm:gap-1", className)}>
      {page > 1 ? item(page - 1, <ChevronLeft aria-hidden className="size-4" />, { rel: "prev", ariaLabel: t("previousPage") }) : <span className="size-8 sm:size-9" aria-hidden />}
      {slots.map((s, i) =>
        s === "…" ? (
          <span key={`e${i}`} aria-hidden className="inline-flex h-8 min-w-6 items-center justify-center text-sm text-zinc-400 sm:h-9 sm:min-w-9">
            …
          </span>
        ) : (
          <span key={s}>{item(s, s, { active: s === page, ariaLabel: t("pageN", { n: s }) })}</span>
        ),
      )}
      {page < last ? item(page + 1, <ChevronRight aria-hidden className="size-4" />, { rel: "next", ariaLabel: t("nextPage") }) : <span className="size-8 sm:size-9" aria-hidden />}
    </nav>
  );
}
