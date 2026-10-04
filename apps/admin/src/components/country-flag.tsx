import { countryName, countryShort } from "@/lib/country";
import { cn } from "@/lib/utils";

const SIZE = { sm: { w: 16, h: 12 }, md: { w: 20, h: 15 } } as const;

/**
 * Bayrak dosyasının yolu. Admin `@rothern/shared`e bağlı değil; dosya seti web
 * ile aynı (tabloda `XN` dışındaki her kod — sözleşme `country-flag.test`),
 * DB'deki kodlar da o tablodan geldiği için iki harf + `XN` değil yeter.
 */
export function flagSrc(code: string | null | undefined): string | null {
  const cc = (code ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) && cc !== "XN" ? `/flags/4x3/${cc.toLowerCase()}.svg` : null;
}

/**
 * KÜÇÜK ÜLKE BAYRAĞI (2026-10-04, kullanıcı: "TR AZ DE yerine küçük bayraklar").
 * Emoji bayrağı Windows çizmez (iki harf basar); bayraklar projeye kopyalanmış
 * flag-icons (MIT) SVG'leri: `public/flags/4x3/<kod>.svg`, dış istek yok. Web'in
 * `components/ui/country-flag.tsx` ile aynı biçim; admin tek dilli (TR ad).
 *
 * - `decorative`: ülke adı yanında yazıyor → `alt=""` + `aria-hidden`.
 * - Aksi hâlde erişilebilir ad = Türkçe ülke adı (`alt` + `title`).
 * - Dosyası olmayan kod (KKTC `XN`, bilinmeyen kod) kısa METNE düşer ("KKTC").
 */
export function CountryFlag({
  code,
  size = "sm",
  decorative = false,
  className,
}: {
  code: string | null | undefined;
  size?: keyof typeof SIZE;
  decorative?: boolean;
  className?: string;
}) {
  if (!code) return null;
  const name = countryName(code);
  const src = flagSrc(code);
  if (!src) {
    return (
      <span
        className={cn(
          "inline-block shrink-0 rounded-[2px] bg-zinc-100 px-0.5 align-[-1px] font-mono text-[9px] leading-3 font-semibold text-zinc-600",
          className,
        )}
        title={decorative ? undefined : name}
        aria-hidden={decorative || undefined}
      >
        {countryShort(code)}
      </span>
    );
  }
  const { w, h } = SIZE[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- küçük statik SVG; next/image optimizasyonu gereksiz
    <img
      src={src}
      width={w}
      height={h}
      alt={decorative ? "" : name}
      title={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      loading="lazy"
      decoding="async"
      className={cn(
        "inline-block shrink-0 rounded-[2px] object-cover align-[-1px] ring-1 ring-zinc-950/10",
        className,
      )}
      style={{ width: w, height: h }}
    />
  );
}
