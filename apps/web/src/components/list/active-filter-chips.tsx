"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/**
 * P2 (frontend denetimi §10.2) — aktif filtreler kaldırılabilir chip'ler +
 * "Tümünü temizle". Hangi filtrelerin devrede olduğu yalnız select'lerin
 * koyulaşmasından okunmuyordu; chip satırı filtre durumunu açıkça söyler
 * ve tek tıkla geri alınır. Filtre yoksa hiç render edilmez.
 */
export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilterChips({
  filters,
  onClearAll,
}: {
  filters: ActiveFilter[];
  onClearAll: () => void;
}) {
  const t = useTranslations("web.panel.shell.activeFilterChips");
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 py-1 pr-1 pl-2.5 text-xs font-medium text-zinc-700"
        >
          {/* Uzun arama metni çipi değil satırı kırar (360 px'te yatay taşma yok). */}
          <span className="min-w-0 [overflow-wrap:anywhere]">{f.label}</span>
          {/* Telefonda × 24 px (çip 32 px), dokunma alanı görünmez katmanla
              40×32 px — sağa çipin kenarını 4 px aşar, yandaki çipe (8 px
              boşluk) değmez; alt satırla çakışmaz (mobil denetim 2026-10
              g06/g07: 16×16 px idi). `sm` ve üstünde görünüm aynı (16 px). */}
          <button
            type="button"
            onClick={f.onRemove}
            aria-label={t("filtresiniKaldir", { label: f.label })}
            className="relative flex size-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition after:absolute after:-inset-x-2 after:-inset-y-1 hover:bg-zinc-200 hover:text-zinc-700 sm:size-4"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      {filters.length > 1 ? (
        // Metin düğmesi 16 px; dokunma alanı görünmez katmanla 32 px yükseklik
        // (çip satırıyla aynı), sola yalnız 4 px uzanır (son çipin × alanına
        // değer, çakışmaz).
        <button
          type="button"
          onClick={onClearAll}
          className="relative text-xs font-semibold text-zinc-500 underline transition after:absolute after:-inset-x-1 after:-inset-y-2 hover:text-zinc-900"
        >
          {t("tumunuTemizle")}
        </button>
      ) : null}
    </div>
  );
}
