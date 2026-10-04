import { flagAssetPath } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { useLocale } from "next-intl";
import { countryDisplayName } from "@/i18n/domain";
import { cn } from "@/lib/utils";

const SIZE = { sm: { w: 16, h: 12 }, md: { w: 20, h: 15 } } as const;
export type CountryFlagSize = keyof typeof SIZE;

/**
 * KÜÇÜK ÜLKE BAYRAĞI — TEK BİLEŞEN (2026-10-04, kullanıcı: "TR AZ DE yerine
 * küçük bayraklar koy"). Eskiden bayrak EMOJİSİYDİ (bölgesel gösterge çifti):
 * Windows bayrak emojisi çizmez, iki harf basar ("TR"), başsız Chromium kutu
 * basar. Şimdi projeye kopyalanmış flag-icons 7.5.0 (MIT) 4x3 SVG'leri:
 * `public/flags/4x3/<kod>.svg` — npm bağımlılığı ve dış istek YOK, her sayfa
 * yalnız gösterdiği bayrağı tembel yükler.
 *
 * - Boyut sabit (16×12 / 20×15) → yerleşim kaymaz; ince halka beyaz zeminli
 *   bayrakları (JP, KR…) görünür tutar.
 * - `decorative`: ülke adı yanında YAZILIYOR → `alt=""` + `aria-hidden`
 *   (ekran okuyucu adı iki kez okumasın). Aksi hâlde erişilebilir ad = ekran
 *   dilindeki ülke adı (`alt` + `title`).
 * - Dosyası olmayan kod (KKTC `XN`, tabloda olmayan kod) küçük METİN rozetine
 *   düşer ("KKTC" / kod); boş kod hiçbir şey basmaz.
 * - `label` verilirse ad onunla gelir (dil kancası çağrılamayan async sunucu
 *   bileşenleri `FlagImage`i doğrudan kullanır).
 * - E-posta şablonlarında KULLANILMAZ (e-posta istemcileri SVG çizmez).
 */
export function CountryFlag({
  code,
  size = "sm",
  decorative = false,
  className,
}: {
  code: string | null | undefined;
  size?: CountryFlagSize;
  decorative?: boolean;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  if (!code) return null;
  return <FlagImage code={code} size={size} decorative={decorative} label={countryDisplayName(code.trim().toUpperCase(), locale)} className={className} />;
}

/** Kancasız çekirdek: ad çağırandan gelir (bkz. `CountryFlag`). */
export function FlagImage({
  code,
  label,
  size = "sm",
  decorative = false,
  className,
}: {
  code: string;
  label: string;
  size?: CountryFlagSize;
  decorative?: boolean;
  className?: string;
}) {
  const src = flagAssetPath(code);
  if (!src) {
    const cc = code.trim().toUpperCase();
    return (
      <span
        className={cn(
          "inline-block shrink-0 rounded-[2px] bg-zinc-100 px-0.5 align-[-1px] text-[9px] leading-3 font-semibold text-zinc-600 ring-1 ring-zinc-950/10",
          className,
        )}
        title={decorative ? undefined : label}
        aria-hidden={decorative || undefined}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : label}
      >
        {cc === "XN" ? "KKTC" : cc}
      </span>
    );
  }
  const { w, h } = SIZE[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- küçük statik SVG; next/image optimizasyonu gereksiz, sabit boyutlu
    <img
      src={src}
      width={w}
      height={h}
      alt={decorative ? "" : label}
      title={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      loading="lazy"
      decoding="async"
      className={cn("inline-block shrink-0 rounded-[2px] object-cover align-[-1px] ring-1 ring-zinc-950/10", className)}
      style={{ width: w, height: h }}
    />
  );
}

/**
 * Bayrak + ekran dilindeki ülke adı ("🇹🇷 Türkiye" yerine `<img> Türkiye`):
 * alım talebinin hangi ülkeden açıldığı, firma ülkesi gibi satır içi metinler.
 */
export function CountryLabel({
  code,
  size = "sm",
  className,
}: {
  code: string | null | undefined;
  size?: CountryFlagSize;
  className?: string;
}) {
  const locale = useLocale() as Locale;
  if (!code) return null;
  const cc = code.trim().toUpperCase();
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <FlagImage code={cc} label="" size={size} decorative />
      <span className="truncate">{countryDisplayName(cc, locale)}</span>
    </span>
  );
}
