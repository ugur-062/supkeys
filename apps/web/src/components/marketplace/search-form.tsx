import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";

/**
 * Arama — DÜZ HTML FORM, client JS yok.
 *
 * `method="get"` ile tarayıcı alanları kendi query string'ine çevirir; sayfa
 * sunucuda yeniden render edilir. Bunu bilinçli seçtim: pazar yerinin ilk
 * ekranı statik/ISR üretilebilsin ve arama JavaScript kapalıyken de çalışsın
 * (tarayıcı botları da öyle gezer).
 *
 * Görünüm Application UI "Forms / Input groups" deseni: `ring-1 ring-inset`
 * + `focus-within:ring-2`. Sarmalayıcıya odak halkası vermek, ikon ve alanın
 * TEK bir kontrol gibi okunmasını sağlıyor.
 */
export function SearchForm({
  action,
  defaultValue,
  placeholder = "Ne arıyorsunuz? (ürün, hizmet, malzeme)",
  hidden,
  hiddenList,
  size = "md",
}: {
  action: string;
  defaultValue?: string;
  placeholder?: string;
  /** Aramada korunması gereken mevcut süzgeçler (kategori/şehir). */
  hidden?: Record<string, string | undefined>;
  /**
   * Tekrarlanabilen süzgeçler (nitelik). Ayrı prop çünkü tek anahtar altında
   * BİRDEN ÇOK değer var; `Record<string,string>` bunu taşıyamaz ve arama
   * yapan ziyaretçi seçtiği nitelikleri sessizce kaybederdi.
   */
  hiddenList?: Record<string, string[]>;
  /** `lg` = hero (daha yüksek ve gölgeli). */
  size?: "md" | "lg";
}) {
  const lg = size === "lg";
  return (
    <form action={action} method="get" role="search" className="w-full">
      {Object.entries(hidden ?? {}).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      {Object.entries(hiddenList ?? {}).flatMap(([k, list]) =>
        list.map((v) => (
          <input key={`${k}:${v}`} type="hidden" name={k} value={v} />
        )),
      )}
      <div className="flex items-stretch gap-2">
        <div
          className={`relative flex flex-1 items-center rounded-full bg-white ring-1 ring-zinc-950/10 ring-inset transition focus-within:ring-2 focus-within:ring-zinc-950 ${
            lg ? "shadow-lg shadow-zinc-950/5" : "shadow-sm"
          }`}
        >
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute left-4 size-5 text-zinc-400"
          />
          <input
            type="search"
            name="q"
            defaultValue={defaultValue}
            placeholder={placeholder}
            aria-label="Pazar yerinde ara"
            className={`w-full rounded-full bg-transparent pr-4 pl-11 text-base text-zinc-950 outline-none placeholder:text-zinc-400 ${
              lg ? "h-14" : "h-12"
            }`}
          />
        </div>
        <button
          type="submit"
          className={`shrink-0 rounded-full bg-zinc-950 font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 ${
            lg ? "h-14 px-7 text-sm" : "h-12 px-6 text-sm"
          }`}
        >
          Ara
        </button>
      </div>
    </form>
  );
}
