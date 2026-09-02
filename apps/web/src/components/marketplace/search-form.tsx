import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";

/**
 * Arama — DÜZ HTML FORM, client JS yok.
 *
 * `method="get"` ile tarayıcı alanları kendi query string'ine çevirir; sayfa
 * sunucuda yeniden render edilir. Bunu bilinçli seçtim: pazar yerinin ilk
 * ekranı statik/ISR üretilebilsin ve arama JavaScript kapalıyken de çalışsın
 * (tarayıcı botları da öyle gezer).
 */
export function SearchForm({
  action,
  defaultValue,
  placeholder = "Ne arıyorsunuz? (ürün, hizmet, malzeme)",
  hidden,
  tone = "light",
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  /** Aramada korunması gereken mevcut süzgeçler (kategori/şehir). */
  hidden?: Record<string, string | undefined>;
  /** `dark` = koyu hero üstünde (beyaz alan, beyaz buton). */
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <form action={action} method="get" role="search" className="w-full">
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            name="q"
            defaultValue={defaultValue}
            placeholder={placeholder}
            aria-label="Pazar yerinde ara"
            className={`w-full rounded-full border bg-white pr-4 pl-11 text-zinc-950 outline-none placeholder:text-zinc-400 ${
              dark
                ? "h-14 border-transparent text-base shadow-xl focus:ring-2 focus:ring-white/40"
                : "h-12 border-zinc-300 text-base shadow-sm focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
            }`}
          />
        </div>
        <button
          type="submit"
          className={`shrink-0 rounded-full font-semibold transition ${
            dark
              ? "h-14 bg-white px-7 text-sm text-zinc-950 hover:bg-zinc-200"
              : "h-12 bg-zinc-950 px-6 text-sm text-white hover:bg-zinc-800"
          }`}
        >
          Ara
        </button>
      </div>
    </form>
  );
}
