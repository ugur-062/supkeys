import { cn } from "@/lib/utils";
import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/**
 * "Otomatik çeviri" notu (i18n Faz 1e): herkese açık ürün/talep/firma
 * metni istek diline makineyle çevrildiyse kaynağın dilini söyler. Kaynak
 * dil = sayfa dili (ya da çeviri yok) → hiçbir şey çizmez. Dil adı
 * `Intl.DisplayNames` ile (üç dil × üç kaynak için katalog anahtarı yazmadan).
 */
export function AutoTranslatedNote({ from, className }: { from?: string | null; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("web.marketplace");
  if (!from || from === locale) return null;
  let lang: string | null = null;
  if (from !== "other") {
    try {
      lang = new Intl.DisplayNames([locale], { type: "language" }).of(from) ?? null;
    } catch {
      lang = null;
    }
  }
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-xs text-zinc-500", className)}>
      <Languages aria-hidden className="size-3.5" />
      {lang ? t("autoTranslated", { lang }) : t("autoTranslatedGeneric")}
    </p>
  );
}
