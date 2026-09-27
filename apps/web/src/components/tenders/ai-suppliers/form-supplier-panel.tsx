"use client";

import { Button } from "@/components/ui/button";
import { useInviteConnection } from "@/hooks/use-company-connections";
import {
  useExternalSupplierDiscovery,
  useSupplierDiscovery,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ExternalInviteTarget,
} from "@/hooks/use-supplier-discovery";
import { countryDisplayName } from "@/i18n/domain";
import { clearSession, readSession, writeSession } from "@/lib/tenders/quick-draft";
import { extractErrorMessage } from "@/lib/tenders/error";
import { recipientLocale, type Locale } from "@rothern/i18n";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CandidateList, isSelectable, type CandidateRow } from "./candidate-list";

/**
 * TALEP FORMU › KALEMLER › "BU KALEMLERİ KİM SATIYOR?" (2026-09-27, Faz 1;
 * kullanıcı: "alım talebi oluştururken kalemler kısmında AI ile tedarikçi bul
 * kısmını geliştir, çok daha iyi yap").
 *
 * - Pencere açmadan, kalem listesinin hemen altında çalışır.
 * - Kalemler girildikten sonra (5 sn sessizlik) arama KENDİLİĞİNDEN başlar;
 *   30-60 sn'lik web araması alıcı teslim yeri/tarihini doldururken geçer.
 *   Oturum başına bir kez otomatik — sonrası "Yeniden ara" / kalem başına
 *   "daha fazla bul" (maliyet alıcının AI bütçesinden, kullanıcı başlattı).
 * - Kategori ZORUNLU DEĞİL: kalem adlarıyla aranır.
 * - Talep tüm ülkelere açıksa yurt içi + yurt dışı; kısıtlıysa yalnız o ülkeler.
 * - Bulunanlar SEÇİLİ gelir; seçim formun dış davet listesine yazılır
 *   (`value`), davet talep YAYINLANINCA her firmanın kendi dilinde gider.
 * - Rothern üyeleri ayrı listede (kalemlerini satan / kategorisine uyan);
 *   onlara bağlantı daveti gönderilir.
 */
const RESULTS_KEY = "rothern:quick-ai-suppliers";
const AUTO_KEY = "rothern:quick-ai-suppliers:auto";
const AUTO_DELAY_MS = 5_000;

/** Talep yayınlanınca/temizlenince: sonraki talepte arama yeniden kendiliğinden başlasın. */
export function clearFormSupplierPanel(): void {
  clearSession(RESULTS_KEY);
  clearSession(AUTO_KEY);
}

interface Stored {
  searchKey: string;
  rows: CandidateRow[];
  members: DiscoveryCandidate[];
}

function toRow(c: ExternalCandidate): CandidateRow {
  return {
    key: (c.email ?? c.name).toLowerCase(),
    name: c.name,
    email: c.email,
    website: c.website,
    city: c.city,
    country: c.country ?? null,
    reason: c.reason,
    matchedItems: c.matchedItems ?? [],
    scope: c.scope ?? null,
    status: c.status ?? "SUGGESTED",
    recentlyInvited: c.recentlyInvited ?? false,
  };
}

function mergeRows(prev: CandidateRow[], next: CandidateRow[]): CandidateRow[] {
  const seen = new Set(prev.map((r) => r.key));
  const out = [...prev];
  for (const r of next) {
    if (seen.has(r.key)) {
      // Aynı firma başka kalem için de bulunduysa kalem listesi birleşir.
      const i = out.findIndex((x) => x.key === r.key);
      const merged = [...new Set([...(out[i]!.matchedItems ?? []), ...(r.matchedItems ?? [])])].sort((a, b) => a - b);
      out[i] = { ...out[i]!, matchedItems: merged };
      continue;
    }
    seen.add(r.key);
    out.push(r);
  }
  return out;
}

export function FormSupplierPanel({
  itemNames,
  categoryIds,
  targetCountries,
  buyerCountry,
  available,
  value,
  onChange,
}: {
  /** Adı girilmiş kalemler, formdaki sırayla (sıra no = aday `matchedItems`). */
  itemNames: string[];
  categoryIds: string[];
  targetCountries: string[];
  buyerCountry: string | null | undefined;
  /** Gold paket (API kapısı). */
  available: boolean;
  /** Yayında davet gidecek dış adresler (formun listesi). */
  value: ExternalInviteTarget[];
  onChange: (next: ExternalInviteTarget[]) => void;
}) {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  const uiLocale = useLocale() as Locale;
  const external = useExternalSupplierDiscovery();
  const platform = useSupplierDiscovery();
  const connect = useInviteConnection();
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [members, setMembers] = useState<DiscoveryCandidate[]>([]);
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  // Kullanıcının bilerek çıkardığı adaylar yeni aramada yeniden seçilmez.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const restored = useRef(false);
  // Arama ~1 dk sürer; bu arada kullanıcı seçimi değiştirebilir → güncel liste.
  const valueRef = useRef(value);
  valueRef.current = value;

  const currentKey = useMemo(
    () => JSON.stringify([itemNames.map((n) => n.trim().toLowerCase()), [...targetCountries].sort()]),
    [itemNames, targetCountries],
  );

  // Oturum içinde sonuçlar korunur (sayfa yenilense de liste kaybolmasın).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const s = readSession<Stored>(RESULTS_KEY);
    if (s) {
      setRows(s.rows ?? []);
      setMembers(s.members ?? []);
      setSearchKey(s.searchKey ?? null);
    }
  }, []);
  useEffect(() => {
    if (!restored.current || searchKey === null) return;
    writeSession(RESULTS_KEY, { searchKey, rows, members } satisfies Stored);
  }, [rows, members, searchKey]);

  const selectedKeys = useMemo(() => new Set(value.map((v) => v.email.toLowerCase())), [value]);
  const emit = (next: ExternalInviteTarget[]) => onChange(next);
  const targetOf = (r: CandidateRow): ExternalInviteTarget => ({
    email: r.email!.toLowerCase(),
    locale: recipientLocale({ country: r.country ?? null, email: r.email, website: r.website, fallback: uiLocale }),
    country: r.country ?? null,
  });

  /** Yeni bulunan seçilebilir adaylar SEÇİLİ gelir (kullanıcı kararı). */
  const preselect = (found: CandidateRow[]) => {
    const cur = valueRef.current;
    const have = new Set(cur.map((v) => v.email.toLowerCase()));
    const add = found.filter((r) => isSelectable(r) && !have.has(r.key) && !deselected.has(r.key)).map(targetOf);
    if (add.length > 0) emit([...cur, ...add]);
  };

  const runSearch = async (names: string[], opts: { merge: boolean }) => {
    if (!available || names.length === 0 || external.isPending) return;
    setFailed(false);
    const base = { type: "ALIM" as const, categoryIds, targetCountries };
    // Üyeler (hızlı, deterministik) ve web araması paralel.
    if (!opts.merge) {
      void platform
        .mutateAsync({ ...base, itemNames: names })
        .then(setMembers)
        .catch(() => undefined);
    }
    try {
      const res = await external.mutateAsync({ ...base, itemNames: names });
      // Kalem başına aramada sıra no o tek kalemin — formdaki sıraya çevir.
      const found = res
        .map(toRow)
        .map((r) =>
          names.length === 1
            ? { ...r, matchedItems: [itemNames.findIndex((n) => n === names[0]) + 1].filter((n) => n > 0) }
            : r,
        );
      const next = opts.merge ? mergeRows(rows, found) : found;
      setRows(next);
      setSearchKey(currentKey);
      preselect(found);
    } catch (err) {
      setFailed(true);
      toast.error(extractErrorMessage(err, t("failed")));
    }
  };

  // OTOMATİK BAŞLAT: kalemler girilip 5 sn değişmeyince, oturumda bir kez.
  useEffect(() => {
    if (!available || itemNames.length === 0 || searchKey !== null || external.isPending) return;
    if (readSession<boolean>(AUTO_KEY)) return;
    const timer = setTimeout(() => {
      writeSession(AUTO_KEY, true);
      void runSearch(itemNames, { merge: false });
    }, AUTO_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, currentKey, searchKey]);

  const toggle = (key: string) => {
    const r = rows.find((x) => x.key === key);
    if (!r || !isSelectable(r)) return;
    if (selectedKeys.has(key)) {
      setDeselected((s) => new Set(s).add(key));
      emit(value.filter((v) => v.email.toLowerCase() !== key));
    } else {
      setDeselected((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
      emit([...value, targetOf(r)]);
    }
  };
  const setMany = (keys: string[], on: boolean) => {
    const set = new Set(keys);
    if (on) {
      const add = rows.filter((r) => set.has(r.key) && isSelectable(r) && !selectedKeys.has(r.key)).map(targetOf);
      setDeselected((s) => new Set([...s].filter((k) => !set.has(k))));
      emit([...value, ...add]);
    } else {
      setDeselected((s) => new Set([...s, ...keys]));
      emit(value.filter((v) => !set.has(v.email.toLowerCase())));
    }
  };

  const findMore = async (name: string) => {
    setMoreBusy(name);
    try {
      await runSearch([name], { merge: true });
    } finally {
      setMoreBusy(null);
    }
  };

  const sendConnect = async (c: DiscoveryCandidate) => {
    if (!c.rothernId) return;
    try {
      await connect.mutateAsync(c.rothernId);
      setConnected((s) => new Set(s).add(c.companyId));
      toast.success(t("connectSentToast", { name: c.name }));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("connectFailed")));
    }
  };

  const covered = new Set(rows.flatMap((r) => r.matchedItems ?? []));
  const uncovered = searchKey !== null ? itemNames.filter((_, i) => !covered.has(i + 1)) : [];
  const selectedCount = rows.filter((r) => isSelectable(r) && selectedKeys.has(r.key)).length;
  const stale = searchKey !== null && searchKey !== currentKey;
  const restricted = targetCountries.length > 0;

  if (itemNames.length === 0) return null;

  return (
    <div id="ai-tedarikci" className="scroll-mt-24 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{t("panelTitle")}</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {t("panelLead")}{" "}
            {restricted
              ? t("panelLeadRestricted", {
                  countries: targetCountries.map((c) => countryDisplayName(c, uiLocale)).join(", "),
                })
              : null}
          </p>
          {!available ? <p className="mt-1 text-xs font-medium text-zinc-700">{t("goldOnly")}</p> : null}
        </div>
        {available && !external.isPending ? (
          <Button
            type="button"
            variant={searchKey === null ? "primary" : "secondary"}
            onClick={() => {
              clearSession(RESULTS_KEY);
              void runSearch(itemNames, { merge: false });
            }}
            iconLeft={searchKey === null ? <Sparkles /> : <RefreshCw />}
          >
            {searchKey === null ? t("findButton") : stale ? t("itemsChanged") : t("searchAgain")}
          </Button>
        ) : null}
      </div>

      {external.isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-700" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("searching")}
        </p>
      ) : null}

      {searchKey !== null && !external.isPending ? (
        <div className="mt-4 space-y-4">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-700">{failed ? t("failed") : t("noResults")}</p>
          ) : (
            <>
              <p className="text-xs font-medium text-zinc-700">
                {t("resultsSummary", { n: rows.length, covered: covered.size, total: itemNames.length })}
                {" · "}
                <span className="text-blue-800">{t("selectedSummary", { n: selectedCount })}</span>
              </p>
              <CandidateList
                candidates={rows}
                itemNames={itemNames}
                buyerCountry={buyerCountry}
                selected={selectedKeys}
                onToggle={toggle}
                onSetMany={setMany}
              />
            </>
          )}
          {uncovered.length > 0 ? (
            <div className="rounded-lg bg-white p-3 text-xs text-zinc-700 ring-1 ring-zinc-200">
              <p>{t("uncovered", { items: uncovered.join(", ") })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {uncovered.slice(0, 5).map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={moreBusy !== null || external.isPending}
                    onClick={() => void findMore(name)}
                    className="rounded-full bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {moreBusy === name ? <Loader2 className="inline h-3 w-3 animate-spin" aria-hidden /> : null}{" "}
                    {t("findMoreForItem", { item: name })}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {members.length > 0 && !external.isPending ? (
        <div className="mt-5 border-t border-blue-200 pt-4">
          <p className="text-sm font-semibold text-zinc-900">{t("membersTitle")}</p>
          <p className="mt-0.5 text-xs text-zinc-600">{t("membersLead")}</p>
          <ul className="mt-3 space-y-2">
            {members.map((m) => {
              const sent = connected.has(m.companyId) || m.connectionStatus === "PENDING";
              const items = (m.matchedItems ?? []).map((n) => itemNames[n - 1]).filter(Boolean).join(", ");
              return (
                <li key={m.companyId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-900">{m.name}</p>
                    <p className="text-xs text-zinc-600">
                      {[m.city, ...m.matchedCategories].filter(Boolean).join(" · ")}
                    </p>
                    {items ? <p className="text-xs font-medium text-zinc-800">{t("inCatalog", { items })}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={sent || connect.isPending || !m.rothernId}
                    onClick={() => void sendConnect(m)}
                  >
                    {sent ? t("connectSent") : t("connect")}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
