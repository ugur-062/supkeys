"use client";

import { useTranslations } from "next-intl";
import { MissingFields } from "@/components/ui/missing-fields";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { MIN_DESCRIPTION, MIN_NAME, publishBlockerLabelTr, type PublishBlocker } from "@rothern/shared";
import type { ReactNode } from "react";

/**
 * Yayın kapısı eksiği: KOD (yeni yol, `productPublishBlockerCodes`) ya da düz
 * Türkçe metin (eski çağrı yerleri, API'den gelen `publishBlockers`).
 */
export type EditorRailBlocker = string | PublishBlocker;

/**
 * DÜZENLEYİCİ RAYI (2026-09-19): formun sağında yapışkan — tamamlanma yüzdesi,
 * onay için gerekli eksikler (çipe tıklayınca ilgili bölüme kayar) ve
 * katlanabilir öneriler (arama görünürlüğü kartı). Önizleme BURADA DEĞİL:
 * yayındaki ürün açılınca önce salt-okunur önizleme gelir, "Düzenle" forma
 * geçirir (kullanıcı kararı: "Kart/Sayfa panelini tamamen kaldır").
 */
export function EditorRail({
  completion,
  blockers,
  onJump,
  recommendations,
  className,
}: {
  completion: { score: number; missing: { key: string; label: string; points: number }[] };
  blockers: EditorRailBlocker[];
  onJump?: (sectionId: string) => void;
  recommendations?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("web.panel.trade.editorRail");
  const tb = useTranslations("web.domain.publishBlocker");
  /**
   * Eksik madde metni: `productCompletion` (shared) Türkçe etiket + KOD verir;
   * kod katalogda varsa okuyucunun dilinde, yoksa shared'ın etiketi.
   */
  const missingLabel = (m: { key: string; label: string }) =>
    t.has(`missing.${m.key}` as never)
      ? t(`missing.${m.key}` as never, { minName: MIN_NAME, minDescription: MIN_DESCRIPTION } as never)
      : m.label;
  /**
   * Yayın kapısı çipi: KOD geldiyse katalogdan (okuyucunun dili), düz metin
   * geldiyse olduğu gibi (API'nin çevirdiği metin ya da eski çağrı yeri).
   */
  const blockerLabel = (b: EditorRailBlocker) =>
    typeof b === "string"
      ? b
      : tb.has(b.code as never)
        ? tb(b.code as never, (b.params ?? {}) as never)
        : publishBlockerLabelTr(b);
  return (
    <div className={cn("space-y-4", className)}>
      <section aria-label={t("tamamlanma")} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-900">{t("tamamlanma")}</p>
          <p className="text-sm font-semibold tabular-nums text-zinc-950">{t("yuzde", { score: completion.score })}</p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", completion.score === 100 ? "bg-emerald-500" : "bg-zinc-900")}
            style={{ width: `${completion.score}%` }}
          />
        </div>
        {blockers.length > 0 ? (
          <div className="mt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <ExclamationTriangleIcon aria-hidden className="size-4" />
              {t("onayaGondermekIcinGerekli")}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {blockers.map((b) => (
                <li key={typeof b === "string" ? b : b.code}>
                  <button
                    type="button"
                    onClick={() => onJump?.(sectionFor(b))}
                    className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-600/20 ring-inset hover:bg-amber-100"
                  >
                    {blockerLabel(b)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {completion.missing.length > 0 ? (
          <MissingFields className="mt-3" label={t("puaniniArtirmakIcin")} items={completion.missing.map((m) => t("eksikPuan", { label: missingLabel(m), points: m.points }))} max={4} />
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircleIcon aria-hidden className="size-4" /> {t("tumAlanlarDolu")}
          </p>
        )}
      </section>

      {recommendations ? (
        <details open className="group rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-950 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between">
              {t("oneriler")}
              <span aria-hidden className="text-xs font-medium text-zinc-500 group-open:hidden">{t("goster")}</span>
              <span aria-hidden className="hidden text-xs font-medium text-zinc-500 group-open:inline">{t("gizle")}</span>
            </span>
          </summary>
          <div className="border-t border-zinc-950/5">{recommendations}</div>
        </details>
      ) : null}
    </div>
  );
}

/**
 * Onay kapısı eksiği → form bölümü. KOD geldiğinde eşleştirme DİLDEN BAĞIMSIZ
 * (`productPublishBlockerCodes`); düz metinde eski sözcük sezgiseli yedek
 * kalır (API'den gelen çevrilmiş metin ve eski çağrı yerleri için).
 */
export function sectionFor(blocker: EditorRailBlocker): string {
  if (typeof blocker !== "string") {
    switch (blocker.code) {
      case "images":
        return "urun-gorsel";
      case "keywords":
        return "urun-ozellik";
      case "price":
        return "urun-fiyat";
      default:
        return "urun-temel";
    }
  }
  const b = blocker.toLowerCase();
  if (b.includes("görsel")) return "urun-gorsel";
  if (b.includes("anahtar") || b.includes("nitelik")) return "urun-ozellik";
  if (b.includes("fiyat")) return "urun-fiyat";
  return "urun-temel";
}
