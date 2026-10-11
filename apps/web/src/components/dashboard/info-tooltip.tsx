"use client";

import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  content: ReactNode;
  /** İkon boyutu (default sm = 14px) */
  size?: "sm" | "md";
}

/** Balonun görüntü alanı kenarına bırakacağı en az boşluk (px). */
export const TOOLTIP_EDGE_GAP = 8;

/**
 * Balonu görüntü alanının içinde tutan YATAY kaydırma (px; eksi = sola).
 *
 * `box`: balonun KAYDIRILMAMIŞ (ikona ortalı) sol / sağ kenarının görüntü
 * alanındaki yeri. Sağdan taşan balon sola, soldan taşan sağa çekilir; balon
 * görüntü alanından genişse sol kenar kazanır (metnin başı görünür kalır).
 * Sonuç içeri doğru tam piksele yuvarlanır. Görüntü alanı ölçülemiyorsa
 * (genişlik 0) kaydırma yapılmaz.
 */
export function tooltipShift(
  box: { left: number; right: number },
  viewportWidth: number,
  gap = TOOLTIP_EDGE_GAP,
): number {
  if (!(viewportWidth > 0)) return 0;
  let shift = 0;
  if (box.right > viewportWidth - gap) shift = Math.floor(viewportWidth - gap - box.right);
  if (box.left + shift < gap) shift = Math.ceil(gap - box.left);
  return shift;
}

/**
 * V2-6 Dashboard — küçük (i) info ikonu + tooltip.
 * Hover/focus'ta açılan açıklama balonu (Radix'siz). Genelde KPI
 * başlıklarının yanında kullanılır.
 *
 * BALON KAPALIYKEN YERLEŞİME GİRMEZ, AÇIKKEN GÖRÜNTÜ ALANINDA KALIR
 * (2026-10-10). Eskiden saf CSS'ti: balon her zaman çiziliyor, yalnız
 * `opacity-0` ile saklanıyordu ve ikona ortalı 320 px'lik kutusu ikonun iki
 * yanına 160 px taşıyordu. 390 px'lik telefonda Şirketim › Genel Bakış ›
 * Tasarruf sekmesinde "En Yüksek Tasarruflu 5 Satın Alma Talebim" başlığının
 * yanındaki ikon sağ kenara yakın durduğu için GÖRÜNMEYEN balon sayfayı 504
 * px'e genişletiyordu (yatay kaydırma); soldaki ikonlarda (metrikler) açılan
 * balonun başı ekranın dışında kalıyordu.
 *  - Kapalıyken `hidden` (`display: none`): yerleşime girmez, sayfayı
 *    genişletemez. Açıklama ekran okuyucuya `aria-describedby` ile gider
 *    (gizli öğe de açıklama olarak okunur).
 *  - Genişlik tavanı görüntü alanına bağlı: `min(20rem, 100vw − 2rem)` — 320
 *    px'lik ekranda 320 px'lik balon hiçbir kaydırmayla sığmazdı.
 *  - Açılınca ölçülür ve taşan kenar kadar yana kaydırılır (`tooltipShift`):
 *    yer varsa balon eskisi gibi ikona ortalıdır, masaüstü görünümü değişmez.
 *    Ölçü tarayıcı yerleşimine dayanır; CSS tek başına ikonun ekrandaki yerini
 *    bilemez.
 *  - Açma / kapama: fare üstünde ya da odakta açık (eski `group-hover` /
 *    `group-focus-within` ile aynı); Escape ve dışarıya dokunma kapatır
 *    (dokunmatikte "üstünde" hâli yapışır, balon açık kalırdı).
 */
export function InfoTooltip({ content, size = "sm" }: Props) {
  const t = useTranslations("web.panel.shell.infoTooltip");
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused;

  // Yer: balon çizildikten SONRA, boyanmadan önce ölçülür; pencere boyutu
  // değişirse yeniden. Ölçüm kaydırmasız kutuyu okur (önce sıfırlanır).
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const tip = tipRef.current;
      if (!tip) return;
      tip.style.marginLeft = "";
      const shift = tooltipShift(tip.getBoundingClientRect(), document.documentElement.clientWidth);
      if (shift !== 0) tip.style.marginLeft = `${shift}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Dışarıya dokunma / tıklama kapatır. Yakalama aşamasında dinlenir: olayın
  // yayılmasını durduran bir bileşene dokunulsa da balon kapanır.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setHovered(false);
      setFocused(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const px = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        setHovered(false);
        setFocused(false);
      }}
    >
      <button
        type="button"
        className="text-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:text-zinc-700"
        aria-label={t("bilgi")}
        aria-describedby={id}
      >
        <Info className={px} />
      </button>
      <span
        ref={tipRef}
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg",
          !open && "hidden",
        )}
      >
        {content}
      </span>
    </span>
  );
}
