"use client";

import { Button } from "@/components/ui/button";
import {
  useExternalSupplierDiscovery,
  useSupplierDiscovery,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ExternalInviteTarget,
  type MemberInviteTarget,
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
 * - ROTHERN ÜYELERİ (2026-09-28, kullanıcı: "sistemimize kayıtlıysa ayrıca
 *   gösterelim, kategori ya da kalem eşleşmesi var diye; davet ederken en
 *   üstte seçili olur"): platform dizininden (kalemini vitrininde satan /
 *   kategorisine uyan) ve web aramasında adresi bir üyeyle eşleşenlerden
 *   oluşur, listenin EN ÜSTÜNDE ve SEÇİLİ gelir; seçim `members`a yazılır,
 *   yayında talebe DOĞRUDAN davet edilir (bağlantı şartı yok).
 */
// Firma verisi: önek tenant-storage.ts TENANT_SESSION_PREFIXES'te — çıkışta silinir.
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

const memberKey = (companyId: string) => `m:${companyId}`;

function memberFromPlatform(m: DiscoveryCandidate): CandidateRow {
  return {
    key: memberKey(m.companyId),
    name: m.name,
    email: null,
    website: null,
    city: m.city,
    country: m.country ?? null,
    reason: null,
    matchedItems: m.matchedItems ?? [],
    scope: null,
    status: m.alreadyInvited ? "ALREADY_INVITED" : "MEMBER",
    memberCompanyId: m.companyId,
    matchedCategories: m.matchedCategories,
  };
}

/**
 * Üyeler (platform + web'de adresi üyeyle eşleşenler) EN ÜSTTE, sonra web
 * adayları. Web'de de bulunan üye tek satırda birleşir ("web'de de bulundu").
 */
export function combineRows(platform: DiscoveryCandidate[], web: CandidateRow[]): CandidateRow[] {
  const members = platform.map(memberFromPlatform);
  const byId = new Map(members.map((m) => [m.memberCompanyId!, m]));
  const external: CandidateRow[] = [];
  for (const r of web) {
    if (!r.memberCompanyId || r.status === "CONSENT_REQUIRED") {
      external.push(r);
      continue;
    }
    const hit = byId.get(r.memberCompanyId);
    if (hit) {
      hit.alsoOnWeb = true;
      hit.matchedItems = [...new Set([...(hit.matchedItems ?? []), ...(r.matchedItems ?? [])])].sort((a, b) => a - b);
      continue;
    }
    const row: CandidateRow = { ...r, key: memberKey(r.memberCompanyId), email: null, alsoOnWeb: true };
    members.push(row);
    byId.set(r.memberCompanyId, row);
  }
  return [...members, ...external];
}

/**
 * Seçim/çıkarma anahtarı: üye satırı panelde `m:<companyId>` ile seçilir
 * (combineRows), web sonucu ise e-posta anahtarıyla gelir. Bilerek çıkarılan
 * üye web araması dönünce yeniden seçilmesin diye eleme bu anahtarla yapılır.
 */
export function selectionKey(r: CandidateRow): string {
  return r.memberCompanyId && r.status !== "CONSENT_REQUIRED" ? memberKey(r.memberCompanyId) : r.key;
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
    memberCompanyId: c.memberCompanyId ?? null,
  };
}

/**
 * Tek kalemli aramanın (`itemNames: [name]`) eşleşmesini formdaki sıraya
 * çevirir (O-057): API kalemi işaretlediyse (`matchedItems` ∋ 1) formdaki
 * sıra no; işaretlemediyse BOŞ kalır — boş liste eşleşmeye dönüşmez.
 */
export function remapSingleItemMatch(r: CandidateRow, name: string, formItemNames: string[]): CandidateRow {
  const formNo = formItemNames.findIndex((n) => n === name) + 1;
  const matched = (r.matchedItems ?? []).includes(1) && formNo > 0;
  return { ...r, matchedItems: matched ? [formNo] : [] };
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
  members: memberValue,
  onMembersChange,
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
  /** Yayında talebe doğrudan davet edilecek üyeler. */
  members: MemberInviteTarget[];
  onMembersChange: (next: MemberInviteTarget[]) => void;
}) {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  const uiLocale = useLocale() as Locale;
  const external = useExternalSupplierDiscovery();
  const platform = useSupplierDiscovery();
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [members, setMembers] = useState<DiscoveryCandidate[]>([]);
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState<string | null>(null);
  // Kullanıcının bilerek çıkardığı adaylar yeni aramada yeniden seçilmez.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const restored = useRef(false);
  // Arama ~1 dk sürer; bu arada kullanıcı seçimi değiştirebilir → güncel liste.
  const valueRef = useRef(value);
  valueRef.current = value;
  const memberRef = useRef(memberValue);
  memberRef.current = memberValue;
  const deselectedRef = useRef(deselected);
  deselectedRef.current = deselected;

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

  const allRows = useMemo(() => combineRows(members, rows), [members, rows]);
  const selectedKeys = useMemo(
    () => new Set([...value.map((v) => v.email.toLowerCase()), ...memberValue.map((m) => memberKey(m.companyId))]),
    [value, memberValue],
  );
  const emit = (next: ExternalInviteTarget[]) => onChange(next);
  const memberTarget = (r: CandidateRow): MemberInviteTarget => ({ companyId: r.memberCompanyId!, name: r.name });
  const targetOf = (r: CandidateRow): ExternalInviteTarget => ({
    email: r.email!.toLowerCase(),
    locale: recipientLocale({ country: r.country ?? null, email: r.email, website: r.website, fallback: uiLocale }),
    country: r.country ?? null,
  });

  /** Yeni bulunan seçilebilir adaylar SEÇİLİ gelir (kullanıcı kararı); üyeler de. */
  const preselect = (found: CandidateRow[]) => {
    const cur = valueRef.current;
    const have = new Set(cur.map((v) => v.email.toLowerCase()));
    const fresh = found.filter((r) => isSelectable(r) && !deselectedRef.current.has(selectionKey(r)));
    const add = fresh.filter((r) => !r.memberCompanyId && !have.has(r.key)).map(targetOf);
    if (add.length > 0) emit([...cur, ...add]);
    const curM = memberRef.current;
    const haveM = new Set(curM.map((m) => m.companyId));
    const addM = fresh
      .filter((r) => r.memberCompanyId && r.status === "MEMBER" && !haveM.has(r.memberCompanyId))
      .map(memberTarget);
    if (addM.length > 0) {
      const next = [...curM, ...addM];
      memberRef.current = next;
      onMembersChange(next);
    }
  };

  const runSearch = async (names: string[], opts: { merge: boolean }) => {
    if (!available || names.length === 0 || external.isPending) return;
    setFailed(false);
    const base = { type: "ALIM" as const, categoryIds, targetCountries };
    // Üyeler (hızlı, deterministik) ve web araması paralel.
    if (!opts.merge) {
      void platform
        .mutateAsync({ ...base, itemNames: names })
        .then((found) => {
          setMembers(found);
          preselect(found.map(memberFromPlatform));
        })
        .catch(() => undefined);
    }
    try {
      const res = await external.mutateAsync({ ...base, itemNames: names });
      // Kalem başına aramada sıra no o tek kalemin — formdaki sıraya çevir.
      // YALNIZ API o kalemi işaretlediyse (O-057): boş eşleşme eşleşmeye
      // çevrilmez; yoksa ilgisiz firma "kalemi karşılıyor" sayılıp seçili gelirdi.
      const found = res.map(toRow).map((r) => (names.length === 1 ? remapSingleItemMatch(r, names[0]!, itemNames) : r));
      const next = opts.merge ? mergeRows(rows, found) : found;
      setRows(next);
      setSearchKey(currentKey);
      // "Daha fazla bul": yalnız o kalemle eşleşen yeni adaylar seçili gelir.
      preselect(opts.merge ? found.filter((r) => (r.matchedItems ?? []).length > 0) : found);
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
    const r = allRows.find((x) => x.key === key);
    if (!r || !isSelectable(r)) return;
    const on = !selectedKeys.has(key);
    setDeselected((s) => {
      const n = new Set(s);
      if (on) n.delete(key);
      else n.add(key);
      return n;
    });
    if (r.memberCompanyId) {
      onMembersChange(on ? [...memberValue, memberTarget(r)] : memberValue.filter((m) => m.companyId !== r.memberCompanyId));
    } else {
      emit(on ? [...value, targetOf(r)] : value.filter((v) => v.email.toLowerCase() !== key));
    }
  };
  const setMany = (keys: string[], on: boolean) => {
    const set = new Set(keys);
    const picked = allRows.filter((r) => set.has(r.key) && isSelectable(r));
    const memberIds = new Set(picked.filter((r) => r.memberCompanyId).map((r) => r.memberCompanyId!));
    if (on) {
      setDeselected((s) => new Set([...s].filter((k) => !set.has(k))));
      const add = picked.filter((r) => !r.memberCompanyId && !selectedKeys.has(r.key)).map(targetOf);
      if (add.length) emit([...value, ...add]);
      const addM = picked.filter((r) => r.memberCompanyId && !selectedKeys.has(r.key)).map(memberTarget);
      if (addM.length) onMembersChange([...memberValue, ...addM]);
    } else {
      setDeselected((s) => new Set([...s, ...keys]));
      if (picked.some((r) => !r.memberCompanyId)) emit(value.filter((v) => !set.has(v.email.toLowerCase())));
      if (memberIds.size) onMembersChange(memberValue.filter((m) => !memberIds.has(m.companyId)));
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

  const covered = new Set(allRows.flatMap((r) => r.matchedItems ?? []));
  const uncovered = searchKey !== null ? itemNames.filter((_, i) => !covered.has(i + 1)) : [];
  const selectedCount = allRows.filter((r) => isSelectable(r) && selectedKeys.has(r.key)).length;
  const stale = searchKey !== null && searchKey !== currentKey;
  const restricted = targetCountries.length > 0;

  if (itemNames.length === 0) return null;

  return (
    <div id="ai-tedarikci" className="scroll-mt-24 rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        {/* Taban genişlik (O-088): dar ekranda düğme alt satıra geçer; yoksa
            metin sütunu sıfıra iner ve başlık düğmenin altında kalırdı. */}
        <div className="min-w-[12rem] flex-1">
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

      {(searchKey !== null && !external.isPending) || (external.isPending && members.length > 0) ? (
        <div className="mt-4 space-y-4">
          {allRows.length === 0 ? (
            <p className="text-sm text-zinc-700">{failed ? t("failed") : t("noResults")}</p>
          ) : (
            <>
              <p className="text-xs font-medium text-zinc-700">
                {t("resultsSummary", { n: allRows.length, covered: covered.size, total: itemNames.length })}
                {" · "}
                <span className="text-blue-800">{t("selectedSummary", { n: selectedCount })}</span>
              </p>
              <CandidateList
                candidates={allRows}
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

    </div>
  );
}
