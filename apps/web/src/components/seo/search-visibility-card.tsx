"use client";

import type { AiSeoEnrichResult, SeoCheck, SeoReadiness } from "@rothern/shared";
import {
  COMPANY_SEO_ABOUT,
  PRODUCT_SEO_ATTRIBUTES,
  PRODUCT_SEO_DESCRIPTION,
  PRODUCT_SEO_IMAGES,
  PRODUCT_SEO_KEYWORDS,
} from "@rothern/shared";
import { CheckCircleIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ARAMA GÖRÜNÜRLÜĞÜ KARTI — ürün formu, Profilim ve talep sihirbazı (Parça 8).
 *
 * Üç şey gösterir: (1) puan + eksikler (ne yapmalı, tek cümle), (2) Google
 * parçacığı önizlemesi — sayfanın GERÇEK şablonunun üreteceği başlık/açıklama
 * (`lib/seo/entities.ts`, aynı fonksiyon), (3) isteğe bağlı "AI ile
 * güçlendir": taslak gelir, kullanıcı uygular ya da atar.
 *
 * Yönlendirir, ZORLAMAZ: yayın kapısı burada değil. Renk ÇAĞIRANDAN gelir
 * (`accent`): satınalma mavi, diğerleri siyah — bileşen portal bilmez.
 *
 * AD ALANI: `web.shared.*` — dosya `components/seo` altında ve o dizin
 * herkese açık yüzeyle paylaşılan sayılıyor (`client-messages.test`),
 * bu yüzden `web.panel` OKUNAMAZ.
 */

export interface SnippetPreview {
  title: string;
  description: string;
  url: string;
}

export interface EnrichControls {
  run: () => Promise<AiSeoEnrichResult>;
  apply: (r: AiSeoEnrichResult) => void;
  /** Silver+ ve koltuk izni; değilse düğme pasif + gerekçe. */
  available: boolean;
  unavailableReason?: string;
}

const LEVEL_KEY: Record<SeoReadiness["level"], "levelWeak" | "levelFair" | "levelGood"> = {
  weak: "levelWeak",
  fair: "levelFair",
  good: "levelGood",
};

/**
 * Madde metinleri `@rothern/shared` `seo-readiness.ts` içinde KODLA üretilir
 * (eşik sayıları oradan gelir). Kart onları `key` üzerinden katalogda arar;
 * anahtar yoksa shared'in Türkçe metnine düşer — böylece yeni bir madde
 * eklendiğinde ekran boş kalmaz. Eşikler ANAHTARA göre geçilir: aynı `{n}`
 * yer tutucusu maddeden maddeye farklı sabiti gösterir.
 *
 * NOT: burada yalnız ÜRÜN ve FİRMA maddeleri var — kartı çizen tek yer bu
 * ikisi (`product-showcase-form`, `profile-editor`). Alım talebi maddeleri
 * kendi yüzeyinde (`quick-request` → `kaliteIpucu.<key>`) çevrilir; oradaki
 * `title`/`description`/`category` anahtarları BAŞKA metinlerdir.
 */
const CHECK_N: Record<string, number> = {
  description: PRODUCT_SEO_DESCRIPTION,
  images: PRODUCT_SEO_IMAGES,
  keywords: PRODUCT_SEO_KEYWORDS,
  attributes: PRODUCT_SEO_ATTRIBUTES,
  about: COMPANY_SEO_ABOUT,
};

export function SearchVisibilityCard({
  readiness,
  snippet,
  enrich,
  accent = "zinc",
  className,
}: {
  readiness: SeoReadiness;
  snippet: SnippetPreview;
  enrich?: EnrichControls;
  accent?: "zinc" | "blue";
  className?: string;
}) {
  const t = useTranslations("web.shared.searchVisibilityCard");
  const tc = useTranslations("web.domain.seoReadiness");
  const [draft, setDraft] = useState<AiSeoEnrichResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bar = accent === "blue" ? "bg-blue-600" : "bg-zinc-900";
  const button =
    accent === "blue"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : "bg-zinc-900 text-white hover:bg-zinc-800";

  const checkText = (m: SeoCheck, field: "label" | "hint"): string => {
    const key = `${m.key}.${field}`;
    return tc.has(key as never) ? tc(key as never, { n: CHECK_N[m.key] ?? 0 } as never) : m[field];
  };

  const runEnrich = async () => {
    if (!enrich || busy) return;
    setBusy(true);
    setError(null);
    try {
      setDraft(await enrich.run());
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(", ") : msg || t("enrichError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t("title")}
      className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">{t("title")}</h3>
        <p className="text-sm text-zinc-600">
          <span className="text-lg font-semibold text-zinc-950">{t("yuzde", { n: readiness.score })}</span> ·{" "}
          {t(LEVEL_KEY[readiness.level])}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        <div className={cn("h-full rounded-full transition-[width] duration-500", bar)} style={{ width: `${readiness.score}%` }} />
      </div>
      <p className="mt-2 text-xs/5 text-zinc-500">{t("lead")}</p>

      {readiness.missing.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {(showAll ? readiness.missing : readiness.missing.slice(0, 4)).map((m) => (
            <li key={m.key} className="text-sm">
              <p className="font-medium text-zinc-900">
                {checkText(m, "label")} <span className="text-xs font-normal text-zinc-500">+{m.points}</span>
              </p>
              <p className="text-xs/5 text-zinc-600">{checkText(m, "hint")}</p>
            </li>
          ))}
          {readiness.missing.length > 4 ? (
            /* "+N madde daha" eskiden düz metindi — kullanıcı tıklayıp göremiyordu
               (2026-09-10). Şimdi aç/kapa düğmesi; liste yerinde aşağı açılır. */
            <li>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
              >
                {showAll ? t("showLess") : t("showMore", { n: readiness.missing.length - 4 })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircleIcon aria-hidden className="size-4" />
          {t("ready")}
        </p>
      )}

      {/* Parçacık önizlemesi — sayfanın gerçek şablonundan (aynı fonksiyon). */}
      <div className="mt-5 border-t border-zinc-950/5 pt-4">
        <p className="text-xs font-medium text-zinc-600">{t("snippetTitle")}</p>
        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="truncate text-xs text-emerald-800">{snippet.url}</p>
          <p className="mt-0.5 line-clamp-2 text-base/6 text-blue-800">{snippet.title}</p>
          <p className="mt-0.5 line-clamp-3 text-sm/5 text-zinc-700">{snippet.description}</p>
        </div>
      </div>

      {enrich ? (
        <div className="mt-5 border-t border-zinc-950/5 pt-4">
          {draft ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-zinc-600">{t("draftTitle")}</p>
              {draft.titleSuggestion ? (
                <p className="text-sm text-zinc-800">
                  <span className="text-xs text-zinc-500">{t("nameSuggestion")}</span>{" "}
                  {draft.titleSuggestion}
                </p>
              ) : null}
              <p className="whitespace-pre-line rounded-xl bg-zinc-50 p-3 text-sm/6 text-zinc-800 ring-1 ring-zinc-200">
                {draft.description}
              </p>
              {draft.keywords.length ? (
                <p className="flex flex-wrap gap-1.5">
                  {draft.keywords.map((k) => (
                    <span key={k} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700">
                      {k}
                    </span>
                  ))}
                </p>
              ) : null}
              {draft.missingFacts.length ? (
                <p className="text-xs/5 text-zinc-600">
                  <span className="font-medium">{t("missingFacts")}</span> {draft.missingFacts.join(" · ")}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    enrich.apply(draft);
                    setDraft(null);
                  }}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", button)}
                >
                  {t("apply")}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void runEnrich()}
                disabled={!enrich.available || busy}
                title={enrich.available ? undefined : enrich.unavailableReason}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <SparklesIcon aria-hidden className="size-4" />}
                {busy ? t("drafting") : t("enrichCta")}
              </button>
              {!enrich.available && enrich.unavailableReason ? (
                <p className="mt-1.5 text-xs text-zinc-500">{enrich.unavailableReason}</p>
              ) : null}
              {error ? <p className="mt-1.5 text-xs text-red-700">{error}</p> : null}
              <p className="mt-1.5 text-xs/5 text-zinc-500">{t("enrichNote")}</p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
