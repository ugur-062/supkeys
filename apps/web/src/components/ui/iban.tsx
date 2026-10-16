"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

/**
 * P2 (frontend denetimi §9) — TEK IBAN gösterimi. Varsayılan maskeli
 * (`TR17 •••• •••• 8381`), "Göster" ile 4'lü gruplu tam IBAN; yanında
 * Kopyala (toast'lı — panoya HAM değer gider, boşluksuz). Her iki hâl
 * tabular-nums. Zaman çizelgesi gibi log yüzeylerinde IBAN hiç yazılmaz —
 * bu bileşen yalnız hesap gösterim yüzeyleri için.
 */
function grouped(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** Görünmez dokunma alanı: 22 px düğme → 38 px. */
const HIT = "relative after:absolute after:-inset-2";

function maskedForm(iban: string): string {
  const raw = iban.replace(/\s+/g, "");
  if (raw.length < 8) return raw;
  return `${raw.slice(0, 4)} •••• •••• ${raw.slice(-4)}`;
}

export function Iban({
  value,
  masked = true,
  className,
}: {
  value: string;
  /** false → daima açık (ör. hesabın sahibi kendi ayar sayfasında). */
  masked?: boolean;
  className?: string;
}) {
  const t = useTranslations("web.shared.iban");
  const [shown, setShown] = useState(!masked);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s+/g, ""));
      toast.success(t("ibanKopyalandi"));
    } catch {
      toast.error(t("kopyalanamadi"));
    }
  };
  return (
    // Dokunma alanları (mobil denetim 2026-10 g07/g08/g11): düğmeler görünüşte
    // 22 px kalır (`p-1 -m-1` + 14 px ikon), görünmez katman alanı 38 px'e
    // çıkarır. İki düğmenin alanı çakışmasın diye kopyala düğmesi `ml-3` alır
    // (görünen kutular arası 16 px, merkezler 38 px ayrık → alanlar yalnız
    // birbirine değer, çakışmaz); eskiden alanlar BİTİŞİKTİ (gap-2,
    // -m-1'lerle sıfırlanıyordu). `flex-wrap`: açık IBAN dar kartta sığmazsa
    // düğmeler alt satıra iner, kart yatay taşmaz.
    <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${className ?? ""}`}>
      <span className=" tabular-nums">
        {shown ? grouped(value) : maskedForm(value)}
      </span>
      {masked ? (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t("ibaniGizle") : t("ibaniGoster")}
          title={shown ? t("gizle") : t("goster")}
          className={`${HIT} -m-1 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700`}
        >
          {shown ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={copy}
        aria-label={t("ibaniKopyala")}
        title={t("kopyala")}
        className={`${HIT} -m-1 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 ${masked ? "ml-3" : ""}`}
      >
        <Copy className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
