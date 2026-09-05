"use client";

import { AI_TENDER_DRAFT_KEY, intentChips } from "@/lib/company/ai-search";
import type { AiSearchIntentResult, AiSearchRelaxed } from "@rothern/shared";
import { SparklesIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * "AI şöyle anladı" bandı — AI aramasının yorumu + uygulanan süzgeç çipleri.
 * Çipler URL'den okunur: kaldırılan çip URL'den de kalkar (liste anında
 * güncellenir). Satınalmada "Bu tanımla talep aç" sihirbazı taslakla açar
 * (mevcut AI taslak köprüsü). Kara kutu yok: her parça görünür ve geri alınır.
 */
const RELAXED_LABEL: Record<AiSearchRelaxed, string> = {
  category: "kategori",
  priceMax: "fiyat tavanı",
  quantity: "adet",
  activity: "faaliyet tipi",
  verifiedOnly: "doğrulanmış firma",
  city: "şehir",
};

/** "Sonuç vermediği için kaldırıldı: kategori (Kompanzasyon panoları), şehir" */
export function relaxedNote(r: AiSearchIntentResult): string | null {
  if (!r.relaxed?.length) return null;
  const parts = r.relaxed.map((k) =>
    k === "category" && r.relaxedCategoryName ? `${RELAXED_LABEL[k]} (${r.relaxedCategoryName})` : RELAXED_LABEL[k],
  );
  return `Sonuç vermediği için kaldırıldı: ${parts.join(", ")}.`;
}

export function AiIntentBand({
  intent,
  onDismiss,
}: {
  intent: AiSearchIntentResult;
  onDismiss: () => void;
}) {
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
      aria-label="AI arama yorumu"
      className="rounded-2xl border border-blue-200/80 bg-blue-50/60 px-4 py-3 text-sm text-zinc-800"
    >
      <div className="flex items-start gap-3">
        <SparklesIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-medium text-zinc-950">{intent.summary}</p>
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Uygulanan süzgeçler:</span>
              {chips.map((c) => (
                <button
                  key={c.param}
                  type="button"
                  onClick={() => remove(c.param)}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-100"
                >
                  {c.label}
                  <XMarkIcon aria-hidden className="size-3.5" />
                  <span className="sr-only">süzgecini kaldır</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Uygulanan süzgeç kalmadı — liste tamamını gösteriyor.</p>
          )}
          {relaxedNote(intent) ? <p className="text-xs text-zinc-600">{relaxedNote(intent)}</p> : null}
          {intent.categoryHint && !intent.category && !intent.relaxed?.includes("category") ? (
            <p className="text-xs text-zinc-600">
              Kategori bulunamadı: &ldquo;{intent.categoryHint}&rdquo; — kenar süzgecinden seçebilirsiniz.
            </p>
          ) : null}
          {intent.warned ? (
            <p className="text-xs text-amber-700">AI bütçenizin %80&apos;i doldu — Ayarlar › AI Kullanımı.</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {intent.portal === "satinalma" && intent.draft ? (
            <button
              type="button"
              onClick={openDraft}
              className="rounded-full bg-zinc-950 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              Bu tanımla talep aç
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="AI yorumunu kapat"
            className="-m-1 rounded-full p-1 text-zinc-500 hover:bg-white hover:text-zinc-950"
          >
            <XMarkIcon aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
