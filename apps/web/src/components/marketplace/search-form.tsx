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
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  /** Aramada korunması gereken mevcut süzgeçler (kategori/şehir). */
  hidden?: Record<string, string | undefined>;
}) {
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
            className="h-12 w-full rounded-full border border-zinc-300 bg-white pr-4 pl-11 text-base text-zinc-950 shadow-sm outline-none placeholder:text-zinc-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
        <button
          type="submit"
          className="h-12 shrink-0 rounded-full bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Ara
        </button>
      </div>
    </form>
  );
}
