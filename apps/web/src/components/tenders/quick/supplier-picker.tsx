"use client";

import { useTranslations } from "next-intl";
import { useConnections, type Connection } from "@/hooks/use-company-connections";
import { cn } from "@/lib/utils";
import { companyActivityLabel, foldSearchText, stemPrefix, tokenizeQuery } from "@rothern/shared";
import { useActivityLabel, useCityLabel } from "@/i18n/domain";
import {
  CheckBadgeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  PlusCircleIcon,
  SparklesIcon,
  TrashIcon,
  XCircleIcon,
} from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";

/**
 * DAVET / GÖRÜNÜRLÜK SEÇİCİSİ (2026-09-19, kullanıcı mockup'ı + aynı gün
 * ikinci karar: "Seçilen firmalar" paneli tablonun SAĞINA değil ALTINA,
 * tablo tam genişlik).
 *
 * ÜST: firma listesi — arama, Sektör/Şehir süzgeci, "Tümünü seç", tablo
 * (Firma · Şehir · Sektör · Firma türü), 7'şer "Daha fazla yükle".
 * ALT: "Seçilen firmalar N" — kaldırılabilir kompakt ızgara, "N firmayı
 * davet et" (yayın düğmesine götürür), "Seçimi temizle".
 *
 * İKİ KİP:
 *  - `private` (Özel): boş başlar, seçilenler davet alır ve yalnız onlar görür.
 *  - `connections` (Bağlantılarım): çağıran TÜM bağlantıları işaretli
 *    verir; işareti kaldırılan firma talebi HİÇ görmez (bildirim/e-posta da
 *    yok — `applyConnectionsScope` yayında PRIVATE'e çevirir). Sıra:
 *    işaretliler üstte, kaldırılanlar altta; her grupta kalem uygunluğu.
 *
 * SIRALAMA KALEMLERE GÖRE (kullanıcı: "koyulan kalemlere göre de bir
 * sıralama yap"): her bağlantı için uygunluk puanı — talebin kategorisiyle
 * satış beyanı aynı dalda mı (segment/aile) + kalem adlarındaki sözcükler
 * firmanın sektör/ad/faaliyet metninde geçiyor mu. Puanlı olanlar ÖNE,
 * "Kalemlere uygun" çipiyle; eşitlikte ada göre. Süzgeç/arama sırayı
 * bozmaz, yalnız daraltır. Değer sihirbazla AYNI: Rothern ID listesi.
 */
const PAGE = 7;

export function SupplierPicker({
  value,
  onChange,
  itemNames = [],
  categoryIds = [],
  onInvite,
  mode = "private",
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  /** Talep kalemlerinin adları — uygunluk sırası için. */
  itemNames?: string[];
  /** Talep kategorisi (discovery kodu) — satış beyanıyla dal eşleşmesi. */
  categoryIds?: string[];
  /** "N firmayı davet et" — çağıran yayın adımına götürür; verilmezse düğme çizilmez. */
  onInvite?: (count: number) => void;
  /** `connections`: görünürlük listesi (işaretsiz = görmez); `private`: davet listesi. */
  mode?: "private" | "connections";
}) {
  const t = useTranslations("web.panel.requests.supplierPicker");
  const activityLabel = useActivityLabel();
  const cityLabel = useCityLabel();
  const { data: connections = [], isLoading } = useConnections();
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [city, setCity] = useState("");
  const [shown, setShown] = useState(PAGE);
  const scoped = mode === "connections";

  const term = q.trim().toLocaleLowerCase("tr");
  const scored = useMemo(() => {
    const tokens = itemTokens(itemNames);
    const prefixes = categoryPrefixes(categoryIds);
    const base = connections
      .filter((c) => !!c.company.rothernId)
      .map((c) => ({ c, score: relevance(c, tokens, prefixes) }));
    const byRelevance = (a: { c: Connection; score: number }, b: { c: Connection; score: number }) =>
      b.score - a.score || a.c.company.name.localeCompare(b.c.company.name, "tr");
    if (!scoped) return base.sort(byRelevance);
    // Bağlantılarım: işaretliler üstte, çıkarılanlar altta; grup içinde uygunluk.
    const on = (x: { c: Connection }) => (value.includes(x.c.company.rothernId as string) ? 0 : 1);
    return base.sort((a, b) => on(a) - on(b) || byRelevance(a, b));
  }, [connections, itemNames, categoryIds, scoped, value]);

  const sectors = useMemo(() => uniqSorted(scored.map((s) => s.c.company.industry)), [scored]);
  const cities = useMemo(() => uniqSorted(scored.map((s) => s.c.company.city)), [scored]);

  const rows = useMemo(
    () =>
      scored.filter(({ c }) => {
        if (sector && c.company.industry !== sector) return false;
        if (city && c.company.city !== city) return false;
        if (!term) return true;
        const hay = [c.company.name, c.company.city, c.company.industry].filter(Boolean).join(" ").toLocaleLowerCase("tr");
        return hay.includes(term);
      }),
    [scored, sector, city, term],
  );
  const visible = rows.slice(0, shown);
  const allIds = scored.map(({ c }) => c.company.rothernId as string);
  const selected = scored.filter(({ c }) => value.includes(c.company.rothernId as string)).map((s) => s.c);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const visibleIds = visible.map(({ c }) => c.company.rothernId as string);
  const allVisibleOn = visibleIds.length > 0 && visibleIds.every((id) => value.includes(id));
  const toggleAll = () =>
    onChange(allVisibleOn ? value.filter((id) => !visibleIds.includes(id)) : [...new Set([...value, ...visibleIds])]);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }
  if (connections.length === 0) {
    return (
      <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
        {t("henuzBaglantinizYokHerkeseAcik")}
      </p>
    );
  }

  const TH = "px-3 py-2.5 text-left text-xs font-medium text-zinc-500";
  const listTitle = scoped ? t("baglantilarim") : t("davetEdilecekFirmalar");
  return (
    /* KAPSAYICI SORGUSU: sütunlar kapsayıcı genişliğine göre gizlenir
       (viewport'a değil) — form sütunu ≈800 px. */
    <div className="@container space-y-4">
      {/* ÜST — aday listesi, tam genişlik */}
      <section aria-label={listTitle} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-base font-semibold text-zinc-950">{listTitle}</h4>
          <p className="text-xs tabular-nums text-zinc-500">
            {scoped
              ? t("secili", { selected: selected.length, total: allIds.length })
              : t("firmaAraligi", { range: rows.length === 0 ? "0" : `1–${Math.min(shown, rows.length)}`, total: rows.length })}
          </p>
        </div>
        {scoped ? (
          <p className="mt-1 text-xs text-zinc-500">
            {t("isaretliFirmalarTalebiGorurVe")}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShown(PAGE);
              }}
              placeholder={t("firmaAdiSehirSektorAra")}
              aria-label={t("firmaAra")}
              className="w-full rounded-xl border border-zinc-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm outline-none placeholder:text-zinc-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
            />
          </div>
          <FilterSelect label={t("sektor")} value={sector} onChange={(v) => { setSector(v); setShown(PAGE); }} options={sectors.map((s) => ({ value: s, label: s }))} />
          <FilterSelect label={t("sehir")} value={city} onChange={(v) => { setCity(v); setShown(PAGE); }} options={cities.map((c) => ({ value: c, label: cityLabel(c) }))} />
          {scoped ? (
            <span className="inline-flex items-center gap-1 text-sm">
              <button type="button" onClick={() => onChange([...new Set([...value, ...allIds])])} className="rounded-lg px-2 py-1 font-medium text-blue-700 hover:bg-blue-50">
                {t("tumunuSec")}
              </button>
              <span aria-hidden className="text-zinc-300">·</span>
              <button type="button" onClick={() => onChange(value.filter((id) => !allIds.includes(id)))} className="rounded-lg px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-100">
                {t("tumunuKaldir")}
              </button>
            </span>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={allVisibleOn} onChange={toggleAll} aria-label={t("gorunenlerinTumunuSec")} className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600/30" />
              {t("tumunuSec")}
            </label>
          )}
        </div>

        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-zinc-950/5">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="w-10 px-3 py-2.5">
                  <span className="sr-only">{t("sec")}</span>
                </th>
                <th scope="col" className={TH}>{t("firma")}</th>
                <th scope="col" className={cn(TH, "hidden @md:table-cell")}>{t("sehir")}</th>
                <th scope="col" className={cn(TH, "hidden @2xl:table-cell")}>{t("sektor")}</th>
                <th scope="col" className={cn(TH, "hidden @3xl:table-cell")}>{t("firmaTuru")}</th>
                {scoped ? <th scope="col" className={cn(TH, "hidden text-right @xl:table-cell")}>{t("gorunurluk")}</th> : null}
                <th scope="col" className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-950/5">
              {visible.map(({ c, score }) => {
                const id = c.company.rothernId as string;
                const on = value.includes(id);
                const act = (c.company.activities ?? [])[0];
                return (
                  <tr key={c.connectionId} onClick={() => toggle(id)} className={cn("cursor-pointer transition", on ? "bg-blue-50/40" : scoped ? "opacity-70 hover:opacity-100" : "hover:bg-zinc-50")}>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("sec2", { name: c.company.name })}
                        className="size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-600/30"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-3">
                        <Avatar c={c} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-zinc-950">{c.company.name}</span>
                            {c.company.verified ? <CheckBadgeIcon aria-label={t("dogrulanmisFirma")} className="size-4 shrink-0 text-blue-600" /> : null}
                            {score > 0 ? (
                              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
                                <SparklesIcon aria-hidden className="size-3" />
                                {t("kalemlereUygun")}
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-xs text-zinc-500 @md:hidden">{[c.company.city ? cityLabel(c.company.city) : null, c.company.industry].filter(Boolean).join(" · ")}</span>
                        </span>
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-zinc-600 @md:table-cell">{c.company.city ? cityLabel(c.company.city) : "—"}</td>
                    <td className="hidden max-w-[12rem] truncate px-3 py-2.5 text-zinc-600 @2xl:table-cell">{c.company.industry ?? "—"}</td>
                    <td className="hidden px-3 py-2.5 @3xl:table-cell">
                      {act ? <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">{activityLabel(act)}</span> : <span className="text-zinc-400">—</span>}
                    </td>
                    {scoped ? (
                      <td className="hidden px-3 py-2.5 text-right @xl:table-cell">
                        {on ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{t("gorur")}</span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{t("gormez")}</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-2 py-2.5 text-zinc-400">
                      <ChevronRightIcon aria-hidden className="size-4" />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={scoped ? 7 : 6} className="px-3 py-6 text-center text-sm text-zinc-500">
                    {t("eslesenBaglantiYok")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {rows.length > shown ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 shadow-sm hover:bg-zinc-50"
            >
              <PlusCircleIcon aria-hidden className="size-4" />
              {t("dahaFazlaYukle")}
              <ChevronDownIcon aria-hidden className="size-4" />
            </button>
          </div>
        ) : null}
      </section>

      {/* ALT — seçilenler, tam genişlik (tablonun sağına değil altına) */}
      <section aria-label={t("secilenFirmalar")} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-base font-semibold text-zinc-950">
              {t("secilenFirmalar")}
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-blue-700">{selected.length}</span>
            </h4>
            <p className="mt-1 text-xs text-zinc-500">
              {scoped ? t("buFirmalarTalebiGorurVe") : t("yalnizDavetEttiginizFirmalarGorur")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onInvite ? (
              <button
                type="button"
                disabled={selected.length === 0}
                onClick={() => onInvite(selected.length)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                <PaperAirplaneIcon aria-hidden className="size-4" />
                {t("firmayiDavetEt", { length: selected.length })}
              </button>
            ) : null}
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => onChange(value.filter((id) => !allIds.includes(id)))}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <TrashIcon aria-hidden className="size-4" />
              {t("secimiTemizle")}
            </button>
          </div>
        </div>
        {selected.length === 0 ? (
          <p className="mt-4 rounded-xl bg-zinc-100 px-3 py-3 text-center text-xs text-zinc-600">
            {scoped ? t("hicbirBaglantiSeciliDegilTalebi") : t("yukaridakiListedenFirmaSecin")}
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-2 @xl:grid-cols-2 @4xl:grid-cols-3">
            {selected.map((c) => (
              <li key={c.connectionId} className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-zinc-950/5">
                <Avatar c={c} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-zinc-950">{c.company.name}</span>
                    {c.company.verified ? <CheckBadgeIcon aria-hidden className="size-4 shrink-0 text-blue-600" /> : null}
                  </span>
                  <span className="block truncate text-xs text-zinc-500">{[c.company.city ? cityLabel(c.company.city) : null, c.company.industry].filter(Boolean).join(" · ")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => toggle(c.company.rothernId as string)}
                  aria-label={t("davetiniKaldir", { name: c.company.name })}
                  className="shrink-0 text-zinc-300 hover:text-zinc-600"
                >
                  <XCircleIcon aria-hidden className="size-5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------- yardımcılar ---------- */

const AVATAR_TONES = ["bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700"];

function Avatar({ c }: { c: Connection }) {
  const co = c.company;
  if (co.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={co.logoUrl} alt="" className="size-9 shrink-0 rounded-full bg-white object-contain ring-1 ring-zinc-950/10" />;
  }
  const tone = AVATAR_TONES[hash(co.name) % AVATAR_TONES.length];
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", tone)}>
      {initials(co.name)}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("tr") ?? "")
    .join("");
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function uniqSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort((a, b) => a.localeCompare(b, "tr"));
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="min-w-[8.5rem] rounded-xl border border-zinc-300 bg-white py-2 pr-8 pl-3 text-sm text-zinc-700 shadow-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Kalem adlarından anlamlı kökler (≥3 harf, kök-önek). */
export function itemTokens(itemNames: string[]): string[] {
  const out = new Set<string>();
  // tokenizeQuery katlamaz → önce katla, sonra kök-önek (arama ile aynı sıra).
  for (const n of itemNames) for (const t of tokenizeQuery(n)) if (t.length >= 3) out.add(stemPrefix(foldSearchText(t)));
  return [...out];
}

/** Talep kategorisinin aile (4 hane) ve segment (2 hane) önekleri. */
function categoryPrefixes(categoryIds: string[]): { family: string[]; segment: string[] } {
  const ids = categoryIds.filter((c) => /^\d{8}$/.test(c));
  return { family: [...new Set(ids.map((c) => c.slice(0, 4)))], segment: [...new Set(ids.map((c) => c.slice(0, 2)))] };
}

/**
 * Uygunluk puanı: aile eşleşmesi 4 · segment eşleşmesi 2 · her kalem kökü
 * için sektör/ad/faaliyet metninde geçiş 1 (en çok 5). Sıfır = ilgisiz.
 */
export function relevance(c: Connection, tokens: string[], prefixes: { family: string[]; segment: string[] }): number {
  const cats = c.company.categoryIds ?? [];
  let score = 0;
  if (prefixes.family.length && cats.some((id) => prefixes.family.includes(id.slice(0, 4)))) score += 4;
  else if (prefixes.segment.length && cats.some((id) => prefixes.segment.includes(id.slice(0, 2)))) score += 2;
  if (tokens.length) {
    const hay = foldSearchText(
      [c.company.industry, c.company.name, ...(c.company.activities ?? []).map((a) => companyActivityLabel(a))].filter(Boolean).join(" "),
    );
    let hits = 0;
    for (const t of tokens) if (hay.includes(t)) hits += 1;
    score += Math.min(hits, 5);
  }
  return score;
}
