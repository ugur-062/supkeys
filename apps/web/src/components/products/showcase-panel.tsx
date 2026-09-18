"use client";

import { ProductCard } from "@/components/marketplace/product-card";
import { ProductDetailBody } from "@/components/marketplace/product-detail";
import { MissingFields } from "@/components/ui/missing-fields";
import type { CatalogItem, ProductShowcase } from "@/hooks/use-company-items";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";
import { useState, type ReactNode } from "react";
import { useShowcaseView } from "./product-preview";

/**
 * VİTRİN PANELİ (2026-09-18, kullanıcı: "ikisi bir arada olan bir şey
 * yapalım"). Ürün düzenleyicinin SAĞINDA yapışkan durur; formun anlık hâlini
 * alıcının göreceği biçimde çizer ve kaydetmeden yansır. Üç katman:
 *  · Kart | Sayfa anahtarı — "Kart" ürünün dizinde/firma profilinde göründüğü
 *    GERÇEK kart (`ProductCard`), "Sayfa" herkese açık ürün sayfası
 *    (`ProductDetailBody`, küçültülmüş ve kendi kaydırma alanında).
 *  · Tamamlanma şeridi — yüzde + onay için gerekli eksikler (çipe tıklayınca
 *    ilgili form bölümüne kayar) + puanı artıracak maddeler.
 *  · Öneriler — arama görünürlüğü kartı (dışarıdan `recommendations`).
 * Form kontrolü YOK; ayrı önizleme şablonu da yok — iki yüzey aynı bileşen.
 */
export function ShowcasePanel({
  product,
  item,
  completion,
  blockers,
  onJump,
  recommendations,
  className,
}: {
  product: ProductShowcase;
  item: Pick<CatalogItem, "brand" | "mpn" | "specification">;
  completion: { score: number; missing: { key: string; label: string; points: number }[] };
  blockers: string[];
  /** Eksik çipine tıklanınca ilgili form bölümüne gitmek için. */
  onJump?: (sectionId: string) => void;
  recommendations?: ReactNode;
  className?: string;
}) {
  const { view, company } = useShowcaseView(product, item);
  const [mode, setMode] = useState<"card" | "page">("card");
  const tabId = "vitrin-onizleme";

  return (
    <div className={cn("space-y-4", className)}>
      <section aria-label="Vitrin önizlemesi" className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/5 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Alıcının gördüğü hâl</p>
            <p className="text-xs text-zinc-500">Yazdıkça güncellenir; kaydetmeden yansır.</p>
          </div>
          <div role="tablist" aria-label="Önizleme biçimi" className="inline-flex rounded-full bg-zinc-100 p-0.5 text-xs font-semibold">
            {(
              [
                ["card", "Kart"],
                ["page", "Sayfa"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={mode === k}
                aria-controls={tabId}
                onClick={() => setMode(k)}
                className={cn(
                  "rounded-full px-3 py-1 transition",
                  mode === k ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5" : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "card" ? (
          <div id={tabId} role="tabpanel" className="bg-zinc-100/70 p-5">
            {/* Dizin kartı — tıklama kapalı, yalnız görünüm. */}
            <div className="pointer-events-none mx-auto max-w-xs">
              <ProductCard product={view} company={company} showNew={false} className="bg-white" />
            </div>
            <p className="mt-3 text-center text-[11px] text-zinc-500">Ürünler dizininde ve firma profilinizde böyle görünür.</p>
          </div>
        ) : (
          <div id={tabId} role="tabpanel" className="max-h-[min(70vh,44rem)] overflow-y-auto px-4 pb-4 [zoom:.55]">
            <ProductDetailBody
              product={view}
              company={company}
              companyHref="/company/sirketim/profil"
              cta={
                <p className="rounded-xl bg-zinc-100 px-4 py-2.5 text-center text-sm text-zinc-500" aria-disabled>
                  Alıcı burada “Bilgi iste” düğmesini görür
                </p>
              }
            />
          </div>
        )}
      </section>

      <section aria-label="Tamamlanma" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-900">Tamamlanma</p>
          <p className="text-sm font-semibold tabular-nums text-zinc-950">%{completion.score}</p>
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
              Onaya göndermek için gerekli
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {blockers.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    onClick={() => onJump?.(sectionFor(b))}
                    className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-600/20 ring-inset hover:bg-amber-100"
                  >
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {completion.missing.length > 0 ? (
          <MissingFields className="mt-3" label="Puanını artırmak için" items={completion.missing.map((m) => `${m.label} (+${m.points})`)} max={4} />
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircleIcon aria-hidden className="size-4" /> Tüm alanlar dolu
          </p>
        )}
      </section>

      {recommendations ? (
        <details open className="group rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-950 marker:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between">
              Öneriler
              <span aria-hidden className="text-xs font-medium text-zinc-500 group-open:hidden">Göster</span>
              <span aria-hidden className="hidden text-xs font-medium text-zinc-500 group-open:inline">Gizle</span>
            </span>
          </summary>
          <div className="border-t border-zinc-950/5">{recommendations}</div>
        </details>
      ) : null}
    </div>
  );
}

/** Onay kapısı metni → form bölümü (`productPublishBlockers` sözcükleriyle). */
export function sectionFor(blocker: string): string {
  const b = blocker.toLowerCase();
  if (b.includes("görsel")) return "urun-gorsel";
  if (b.includes("anahtar") || b.includes("nitelik")) return "urun-ozellik";
  if (b.includes("fiyat")) return "urun-fiyat";
  return "urun-temel";
}
