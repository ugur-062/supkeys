"use client";

import { useTranslations } from "next-intl";
import { AI_TENDER_DRAFT_KEY, intentChips } from "@/lib/company/ai-search";
import type { AiSearchIntentResult, AiSearchRelaxed } from "@rothern/shared";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";

/**
 * "AI şöyle anladı" bandı — AI aramasının yorumu + uygulanan süzgeç çipleri.
 * Çipler URL'den okunur: kaldırılan çip URL'den de kalkar (liste anında
 * güncellenir). Satınalmada "Bu tanımla talep aç" sihirbazı taslakla açar
 * (mevcut AI taslak köprüsü). Kara kutu yok: her parça görünür ve geri alınır.
 */
const RELAXED_KEY: Record<AiSearchRelaxed, string> = {
  category: "relaxedCategory",
  priceMax: "relaxedPriceMax",
  quantity: "relaxedQuantity",
  activity: "relaxedActivity",
  verifiedOnly: "relaxedVerifiedOnly",
  city: "relaxedCity",
  query: "relaxedQuery",
};

/** "Sonuç vermediği için kaldırıldı: kategori (Kompanzasyon panoları), şehir" — dil bilen hook. */
export function useRelaxedNote(): (r: AiSearchIntentResult) => string | null {
  const t = useTranslations("web.panel.shell.aiIntentBand");
  return (r) => {
    if (!r.relaxed?.length) return null;
    const parts = r.relaxed.map((k) =>
      k === "category" && r.relaxedCategoryName
        ? t("relaxedKategoriAd", { name: r.relaxedCategoryName })
        : k === "query" && r.query
          ? t("relaxedQueryKaldi", { query: r.query })
          : t(RELAXED_KEY[k] as never),
    );
    return t("sonucVermedigiIcinKaldirildi", { parts: parts.join(", ") });
  };
}

export function AiIntentBand({
  intent,
  onDismiss,
}: {
  intent: AiSearchIntentResult;
  onDismiss: () => void;
}) {
  const relaxedNote = useRelaxedNote();
  const t = useTranslations("web.panel.shell.aiIntentBand");
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = sp ?? new URLSearchParams();
  const chips = intentChips(intent, params);

  const remove = (param: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete(param);
    if (param === "kategori") next.delete("nitelik");
    next.delete("sayfa");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const openDraft = () => {
    if (!intent.draft) return;
    sessionStorage.setItem(AI_TENDER_DRAFT_KEY, JSON.stringify(intent.draft));
    router.push("/company/satinalma/taleplerim/yeni?ai=1");
  };

  return (
    <div
      role="status"
      aria-label={t("aiAramaYorumu")}
      className="rounded-2xl border border-blue-200/80 bg-blue-50/60 px-4 py-3 text-sm text-zinc-800"
    >
      <div className="flex items-start gap-3">
        <SparklesIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-zinc-950">{intent.summary}</p>
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">{t("uygulananSuzgecler")}</span>
              {chips.map((c) => (
                <button
                  key={c.param}
                  type="button"
                  onClick={() => remove(c.param)}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100"
                >
                  {c.label}
                  <XMarkIcon aria-hidden className="size-3.5" />
                  <span className="sr-only">{t("suzgeciniKaldir")}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">{t("uygulananSuzgecKalmadiListeTamamini")}</p>
          )}
          {relaxedNote(intent) ? <p className="text-xs text-zinc-600">{relaxedNote(intent)}</p> : null}
          {intent.categoryHint && !intent.category && !intent.relaxed?.includes("category") ? (
            <p className="text-xs text-zinc-600">
              {t("kategoriBulunamadiKenar", { categoryHint: intent.categoryHint })}
            </p>
          ) : null}
          {intent.warned ? (
            <p className="text-xs text-amber-700">{t("aiButcenizin80Doldu")}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {intent.portal === "satinalma" && intent.draft ? (
            <button
              type="button"
              onClick={openDraft}
              className="rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              {t("buTanimlaTalepAc")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("aiYorumunuKapat")}
            className="-m-1 rounded-full p-1 text-zinc-500 hover:bg-white hover:text-zinc-950"
          >
            <XMarkIcon aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
