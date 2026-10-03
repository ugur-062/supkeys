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
 * Gruplar: ROTHERN ÜYELERİ (en üstte; 2026-09-28, kullanıcı: "sistemimize
 * kayıtlıysa ayrıca gösterelim, kategori ya da kalem eşleşmesi var diye") ·
 * alıcının ülkesi · yurt dışı · (bilinmeyen) diğer. Üye e-posta değil
 * DOĞRUDAN TALEBE davet edilir — adresi olmasa da seçilebilir.
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
  /** Kayıtlı üye (platform dizini ya da web adresi eşleşti). */
  memberCompanyId?: string | null;
  /** Üyenin eşleştiği kategori adları (gerekçe). */
  matchedCategories?: string[];
  /** Web aramasında da bulundu (üye). */
  alsoOnWeb?: boolean;
}

/** Satır üye grubunda mı (davet edilmiş/davetli üyeler de orada kalır). */
export function isMemberRow(c: CandidateRow): boolean {
  return !!c.memberCompanyId && c.status !== "CONSENT_REQUIRED";
}

export function isSelectable(c: CandidateRow): boolean {
  const status = c.status ?? "SUGGESTED";
  if (status === "MEMBER") return !!c.memberCompanyId;
  return status === "SUGGESTED" && !!c.email;
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
  const members = candidates.filter(isMemberRow);
  const rest = candidates.filter((c) => !isMemberRow(c));
  const groups: Array<{ id: string; label: string; lead?: string; rows: CandidateRow[] }> = [
    { id: "MEMBER", label: t("groupMembers"), lead: t("groupMembersLead"), rows: members },
    {
      id: "LOCAL",
      label: buyerCountry ? countryDisplayName(buyerCountry, locale) : t("groupOther"),
      rows: rest.filter((c) => c.scope === "LOCAL"),
    },
    { id: "ABROAD", label: t("groupAbroad"), rows: rest.filter((c) => c.scope === "ABROAD") },
    { id: "OTHER", label: t("groupOther"), rows: rest.filter((c) => c.scope !== "LOCAL" && c.scope !== "ABROAD") },
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
              <div className="min-w-0">
                <h4
                  className={cn(
                    "text-xs font-semibold tracking-wide uppercase",
                    g.id === "MEMBER" ? "text-blue-800" : "text-zinc-700",
                  )}
                >
                  {g.label} <span className="font-normal text-zinc-500">· {g.rows.length}</span>
                </h4>
                {g.lead ? <p className="mt-0.5 text-xs text-zinc-600">{g.lead}</p> : null}
              </div>
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
                const member = isMemberRow(c);
                const categories = (c.matchedCategories ?? []).join(", ");
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
                          {status !== "SUGGESTED" && status !== "MEMBER" ? (
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
                          {c.email && !member ? <span className="break-all">{c.email}</span> : null}
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
                        {member && (items || categories || c.alsoOnWeb) ? (
                          <p className="mt-1.5 flex flex-wrap gap-1.5">
                            {items ? (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 ring-1 ring-blue-600/20">
                                {t("memberItems", { items })}
                              </span>
                            ) : null}
                            {categories ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-600/10">
                                {t("memberCategories", { categories })}
                              </span>
                            ) : null}
                            {c.alsoOnWeb ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-600/10">
                                {t("memberAlsoWeb")}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                        {c.reason ? <p className="mt-1 text-xs text-zinc-700">{c.reason}</p> : null}
                        {items && !member ? <p className="mt-1 text-xs font-medium text-zinc-800">{t("canSupply", { items })}</p> : null}
                        {c.recentlyInvited && selectable && !member ? (
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
