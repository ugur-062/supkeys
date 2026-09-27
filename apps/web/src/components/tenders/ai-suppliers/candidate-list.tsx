"use client";

import type { CandidateStatus } from "@/hooks/use-supplier-discovery";
import { countryDisplayName } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import { countryFlag } from "@rothern/shared";
import type { Locale } from "@rothern/i18n";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/**
 * AI TEDARİKÇİ ADAY LİSTESİ — paylaşılan (2026-09-27, Faz 1): talep formunun
 * kalemler paneli, yayın paneli ve talep sayfasındaki öneri bandı AYNI listeyi
 * çizer. Kullanıcı kararı: "aday seçme şansı olsun ama otomatik seçili olsun;
 * davetli olanlara bir daha gitmesin" — SUGGESTED satırlar seçilebilir (çağıran
 * başlangıçta hepsini seçer), diğer durumlar kilitli ve nedenini söyler.
 * Gruplar: alıcının ülkesi · yurt dışı · (bilinmeyen) diğer.
 */
export interface CandidateRow {
  key: string;
  name: string;
  email: string | null;
  website: string | null;
  city: string | null;
  country?: string | null;
  reason: string | null;
  matchedItems?: number[];
  scope?: "LOCAL" | "ABROAD" | null;
  status?: CandidateStatus;
  recentlyInvited?: boolean;
}

export function isSelectable(c: CandidateRow): boolean {
  return (c.status ?? "SUGGESTED") === "SUGGESTED" && !!c.email;
}

function safeHref(url: string): string | null {
  const raw = url.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function CandidateList({
  candidates,
  itemNames,
  buyerCountry,
  selected,
  onToggle,
  onSetMany,
  disabled,
}: {
  candidates: CandidateRow[];
  /** Talep kalemleri (sıra no → ad) — "Sağlayabileceği kalemler". */
  itemNames: string[];
  buyerCountry: string | null | undefined;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onSetMany: (keys: string[], on: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  const locale = useLocale() as Locale;
  const groups: Array<{ id: string; label: string; rows: CandidateRow[] }> = [
    {
      id: "LOCAL",
      label: buyerCountry ? countryDisplayName(buyerCountry, locale) : t("groupOther"),
      rows: candidates.filter((c) => c.scope === "LOCAL"),
    },
    { id: "ABROAD", label: t("groupAbroad"), rows: candidates.filter((c) => c.scope === "ABROAD") },
    { id: "OTHER", label: t("groupOther"), rows: candidates.filter((c) => c.scope !== "LOCAL" && c.scope !== "ABROAD") },
  ].filter((g) => g.rows.length > 0);

  const itemLabel = (nums: number[] | undefined) =>
    (nums ?? [])
      .map((n) => itemNames[n - 1])
      .filter((n): n is string => !!n)
      .join(", ");

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const keys = g.rows.filter(isSelectable).map((r) => r.key);
        const allOn = keys.length > 0 && keys.every((k) => selected.has(k));
        return (
          <section key={g.id} aria-label={g.label}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold tracking-wide text-zinc-700 uppercase">
                {g.label} <span className="font-normal text-zinc-500">· {g.rows.length}</span>
              </h4>
              {keys.length > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSetMany(keys, !allOn)}
                  className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                >
                  {allOn ? t("clearAll") : t("selectAll")}
                </button>
              ) : null}
            </div>
            <ul className="space-y-2">
              {g.rows.map((c) => {
                const selectable = isSelectable(c);
                const flag = c.country ? countryFlag(c.country) : null;
                const place = [c.city, c.country ? countryDisplayName(c.country, locale) : null].filter(Boolean).join(", ");
                const items = itemLabel(c.matchedItems);
                const href = c.website ? safeHref(c.website) : null;
                const status = c.status ?? "SUGGESTED";
                return (
                  <li
                    key={c.key}
                    className={cn(
                      "rounded-xl border bg-white p-3 transition",
                      selectable && selected.has(c.key) ? "border-blue-300 ring-1 ring-blue-200" : "border-zinc-200",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-zinc-300"
                        checked={selectable && selected.has(c.key)}
                        disabled={!selectable || disabled}
                        onChange={() => onToggle(c.key)}
                        aria-label={t("select", { name: c.name })}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-zinc-900">
                          <span className="min-w-0 break-words">{c.name}</span>
                          {status !== "SUGGESTED" ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                status === "INVITED" || status === "ALREADY_INVITED"
                                  ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-600/20"
                                  : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-600/10",
                              )}
                            >
                              {t(`status.${status}` as never)}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-600">
                          {place ? (
                            <span>
                              {flag ? <span aria-hidden>{flag} </span> : null}
                              {place}
                            </span>
                          ) : null}
                          {c.email ? <span className="break-all">{c.email}</span> : null}
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="inline-flex items-center gap-0.5 text-blue-700 hover:underline"
                            >
                              {t("website")}
                              <ExternalLink aria-hidden className="h-3 w-3" />
                            </a>
                          ) : null}
                        </p>
                        {c.reason ? <p className="mt-1 text-xs text-zinc-700">{c.reason}</p> : null}
                        {items ? <p className="mt-1 text-xs font-medium text-zinc-800">{t("canSupply", { items })}</p> : null}
                        {c.recentlyInvited && selectable ? (
                          <p className="mt-1 text-xs text-amber-800">{t("recentlyInvited")}</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
