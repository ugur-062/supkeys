import { countryName, countryShort } from "@/lib/country";
import { cn } from "@/lib/utils";

const SIZE = { sm: { w: 16, h: 12 }, md: { w: 20, h: 15 } } as const;

/**
 * `public/flags/4x3/` altındaki dosyaların kodları (büyük harf). Admin
 * `@rothern/shared`e bağlı değil; bu liste dosya setinin AYNASI — sözleşme
 * `country-flag.test` (dizin listesiyle birebir). Listede olmayan kod (eski/bozuk
 * veri "ZZ", "UK", KKTC `XN`) kırık görsel yerine metin yedeğine düşer.
 */
export const FLAG_CODES: ReadonlySet<string> = new Set(
  `
  AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT
  BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH
  ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU
  ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS
  LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG
  NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD
  SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ
  UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`
    .trim()
    .split(/\s+/),
);

/** Bayrak dosyasının yolu; dosyası olmayan kodda `null`. */
export function flagSrc(code: string | null | undefined): string | null {
  const cc = (code ?? "").trim().toUpperCase();
  return FLAG_CODES.has(cc) ? `/flags/4x3/${cc.toLowerCase()}.svg` : null;
}

/**
 * KÜÇÜK ÜLKE BAYRAĞI (2026-10-04, kullanıcı: "TR AZ DE yerine küçük bayraklar").
 * Emoji bayrağı Windows çizmez (iki harf basar); bayraklar projeye kopyalanmış
 * flag-icons (MIT) SVG'leri: `public/flags/4x3/<kod>.svg`, dış istek yok. Web'in
 * `components/ui/country-flag.tsx` ile aynı biçim; admin tek dilli (TR ad).
 *
 * - `decorative`: ülke adı yanında yazıyor → `alt=""` + `aria-hidden`.
 * - Aksi hâlde erişilebilir ad = Türkçe ülke adı (`alt` + `title`).
 * - Dosyası olmayan kod (KKTC `XN`, bilinmeyen kod) kısa METNE düşer ("KKTC");
 *   dekoratif değilse `role="img"` + `aria-label` = ülke adı (web ile aynı).
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
          "inline-block shrink-0 rounded-[2px] bg-zinc-100 px-0.5 align-[-1px] text-[9px] leading-3 font-semibold text-zinc-600",
          className,
        )}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : name}
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
