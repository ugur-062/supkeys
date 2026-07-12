"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import type { ListingItemRow } from "@/hooks/use-company-listings";
import {
  applyPercentToItems,
  cmpDecimal,
  distributeToTarget,
  type DistributeItem,
} from "@/lib/tenders/distribute";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  ChevronDown,
  Lock,
  LockOpen,
  RotateCcw,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

function money(v: number | string, currency: string): string {
  return `${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${
    currency === "TRY" ? "₺" : currency
  }`;
}

/** Sayfanın hesapladığı hedef durumu — çubuk ve araçlar bunu tüketir. */
export interface WorkbenchTarget {
  /** Ulaşılması gereken kesin toplam (monotonluk dahil). null = hedef yok. */
  effectiveTarget: string | null;
  /** Mevcut kesin toplam (fiyatlanan kalemler). */
  exactTotalStr: string;
  /** Hedef karşılandı mı (DOWN: ≤, UP: ≥). */
  met: boolean;
  /** Hedefe kalan pozitif fark (karşılanmadıysa). */
  remaining: string;
  /** Görünürlük ayarı hedef sayısını gizliyor (sunucu yine denetler). */
  hidden: boolean;
  /** Kur eksik — hedef hesaplanamadı. */
  rateMissing: boolean;
  /** Referans yok (ilk teklif / rakipsiz) — hedef kısıtı yok. */
  noReference: boolean;
}

/**
 * Pazarlık çalışma masası — çok kalemli açık eksiltme/artırmada tedarikçinin
 * hedefe hesap makinesisiz inmesini sağlar: canlı hedef çubuğu, kalem kilidi,
 * "tümüne %X" ve "hedefe otomatik dağıt" araçları, arama/filtre'li kompakt
 * tablo. Tüm toplam kıyasları kesin aritmetik (lib/tenders/distribute) —
 * sunucunun Decimal doğrulamasıyla drift yok.
 */
export function AuctionBidWorkbench({
  items,
  prices,
  initialPrices,
  setPrice,
  applyPrices,
  lockedIds,
  toggleLock,
  currency,
  decimals,
  direction,
  target,
  defaultPercent,
  requireAllItems,
  isSatis,
  renderItemExtras,
}: {
  items: ListingItemRow[];
  /** Kalem id → formdaki birim fiyat (null = kapsam dışı). */
  prices: Record<string, string | null>;
  /** Taşınan (önceki tur / taslak) fiyatlar — diff ve Sıfırla bunu kullanır. */
  initialPrices: Record<string, string>;
  setPrice: (itemId: string, price: string | null) => void;
  applyPrices: (next: Record<string, string>) => void;
  lockedIds: Set<string>;
  toggleLock: (itemId: string) => void;
  currency: string;
  decimals: number;
  direction: "DOWN" | "UP";
  target: WorkbenchTarget;
  /** % aracının başlangıç değeri (ilanın yüzde adımı varsa o). */
  defaultPercent: string;
  requireAllItems: boolean;
  isSatis: boolean;
  /** Genişletilen satırın ek alanları (teslim tarihi + kalem soruları). */
  renderItemExtras: (it: ListingItemRow) => ReactNode;
}) {
  const [percent, setPercent] = useState(defaultPercent);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "CHANGED" | "LOCKED">("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const down = direction === "DOWN";

  /** Araçların çalışacağı kalemler: fiyatlı olanlar (kilitliler bayraklı —
   *  toplamda sayılır ama fiyatına dokunulmaz). */
  const distItems = useMemo((): DistributeItem[] => {
    return items
      .filter((it) => {
        const p = prices[it.id];
        return p != null && p !== "" && Number(p) > 0;
      })
      .map((it) => ({
        id: it.id,
        quantity: it.quantity,
        unitPrice: prices[it.id]!,
        locked: lockedIds.has(it.id),
        minUnitPrice: it.minUnitPrice ?? null,
        maxUnitPriceExclusive: it.buyNowUnitPrice ?? null,
      }));
  }, [items, prices, lockedIds]);

  const changedIds = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const cur = prices[it.id];
      const init = initialPrices[it.id];
      if (cur != null && cur !== "" && init != null && init !== "") {
        if (cmpDecimal(cur, init) !== 0) s.add(it.id);
      }
    }
    return s;
  }, [items, prices, initialPrices]);

  const visibleItems = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("tr-TR");
    return items.filter((it) => {
      if (filter === "CHANGED" && !changedIds.has(it.id)) return false;
      if (filter === "LOCKED" && !lockedIds.has(it.id)) return false;
      if (!q) return true;
      return (
        it.name.toLocaleLowerCase("tr-TR").includes(q) ||
        (it.materialCode ?? "").toLocaleLowerCase("tr-TR").includes(q)
      );
    });
  }, [items, query, filter, changedIds, lockedIds]);

  const applyPercent = () => {
    const p = Number(percent);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) {
      toast.error("Geçerli bir yüzde girin (0–100 arası)");
      return;
    }
    if (distItems.every((d) => d.locked)) {
      toast.error("Tüm kalemler kilitli — önce en az bir kilidi açın");
      return;
    }
    applyPrices(
      applyPercentToItems({ items: distItems, percent, direction, decimals }),
    );
    toast.success(
      down
        ? `Kilitsiz kalemlere %${percent} indirim uygulandı`
        : `Kilitsiz kalemlere %${percent} artış uygulandı`,
    );
  };

  const autoDistribute = () => {
    if (!target.effectiveTarget) return;
    if (distItems.every((d) => d.locked)) {
      toast.error("Tüm kalemler kilitli — önce en az bir kilidi açın");
      return;
    }
    const r = distributeToTarget({
      items: distItems,
      targetTotal: target.effectiveTarget,
      direction,
      decimals,
    });
    applyPrices(r.prices);
    if (r.ok) {
      toast.success("Fiyatlar hedefe dağıtıldı");
    } else {
      toast.warning(
        `Hedefe ulaşılamadı — kalan ${money(r.remaining, currency)}. ` +
          (lockedIds.size > 0
            ? "Kilitli kalemleri açıp tekrar deneyin."
            : down
              ? "Kalem tabanları daha fazla inmeye izin vermiyor."
              : "Kalem hemen-al tavanları daha fazla artışa izin vermiyor."),
      );
    }
  };

  const reset = () => {
    const restore: Record<string, string> = {};
    for (const it of items) {
      const init = initialPrices[it.id];
      if (init != null && init !== "") restore[it.id] = init;
    }
    applyPrices(restore);
    toast.success("Fiyatlar taşınan teklife döndürüldü");
  };

  const filterChip = (key: typeof filter, label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setFilter(key)}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition",
        filter === key
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
      )}
    >
      {label}
      {count != null && count > 0 ? ` (${count})` : ""}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* ── Hedef çubuğu ── */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border px-4 py-3 text-sm",
          target.rateMissing || target.hidden || target.noReference
            ? "border-zinc-200 bg-zinc-50 text-zinc-600"
            : target.met
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800",
        )}
      >
        <span>
          Mevcut toplam:{" "}
          <strong className="tabular-nums">
            {money(target.exactTotalStr, currency)}
          </strong>
        </span>
        {target.rateMissing ? (
          <span>Kur bilgisi eksik — hedef şu an hesaplanamıyor.</span>
        ) : target.hidden ? (
          <span>
            Hedef gizli: görünürlük ayarı en iyi teklifi açıklamıyor — gerekli{" "}
            {down ? "azaltma" : "artırma"} gönderimde sunucu tarafından
            denetlenir.
          </span>
        ) : target.noReference ? (
          <span>İlk teklif — hedef kısıtı yok, fiyatlarını serbestçe gir.</span>
        ) : target.effectiveTarget ? (
          <>
            <span>
              Hedef:{" "}
              <strong className="tabular-nums">
                {down ? "≤" : "≥"} {money(target.effectiveTarget, currency)}
              </strong>
            </span>
            {target.met ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Hedef karşılandı
              </span>
            ) : (
              <span>
                Kalan {down ? "indirim" : "artırım"}:{" "}
                <strong className="tabular-nums">
                  {money(target.remaining, currency)}
                </strong>
              </span>
            )}
          </>
        ) : null}
      </div>

      {/* ── Toplu araçlar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-950/10 bg-white p-3">
        <div className="flex items-center gap-1.5">
          <div className="w-20">
            <Input
              type="number"
              min={0.01}
              max={99.99}
              step="0.01"
              value={percent}
              aria-label="Yüzde"
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <Button outline onClick={applyPercent}>
            Tümüne %{percent || "…"} {down ? "indirim" : "artış"}
          </Button>
        </div>
        <Button
          outline
          disabled={!target.effectiveTarget || target.met}
          title={
            !target.effectiveTarget
              ? "Hedef bilinmiyor (gizli/kur eksik/referans yok)"
              : target.met
                ? "Hedef zaten karşılandı"
                : undefined
          }
          onClick={autoDistribute}
        >
          <Wand2 data-slot="icon" aria-hidden="true" />
          Hedefe Otomatik Dağıt
        </Button>
        <Button outline onClick={reset} disabled={changedIds.size === 0}>
          <RotateCcw data-slot="icon" aria-hidden="true" />
          Sıfırla
        </Button>
        <span className="text-xs text-zinc-400">
          Kilitli kalemin fiyatına araçlar dokunmaz.
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {filterChip("ALL", "Tümü")}
          {filterChip("CHANGED", "Değişen", changedIds.size)}
          {filterChip("LOCKED", "Kilitli", lockedIds.size)}
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Kalem ara…"
              aria-label="Kalem ara"
              className="w-44 rounded-lg border border-zinc-300 bg-white py-1.5 pr-2 pl-8 text-sm shadow-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Kompakt kalem tablosu ── */}
      <div className="overflow-x-auto rounded-xl border border-zinc-950/10 bg-white">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-[1] bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Kalem</th>
              <th className="px-3 py-2 text-right font-medium">Miktar</th>
              <th className="px-3 py-2 text-right font-medium">Önceki</th>
              <th className="px-3 py-2 text-right font-medium">
                Yeni Birim Fiyat ({currency === "TRY" ? "₺" : currency})
              </th>
              <th className="px-3 py-2 text-right font-medium">Satır Toplamı</th>
              <th className="px-2 py-2" aria-label="Kilit" />
              <th className="px-2 py-2" aria-label="Detay" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visibleItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-zinc-400">
                  Eşleşen kalem yok.
                </td>
              </tr>
            ) : (
              visibleItems.map((it, idx) => {
                const price = prices[it.id];
                const optedOut = price === null;
                const locked = lockedIds.has(it.id);
                const init = initialPrices[it.id];
                const changed = changedIds.has(it.id);
                const lineTotal =
                  price && Number(price) > 0
                    ? Number(price) * Number(it.quantity)
                    : null;
                const isOpen = expanded.has(it.id);
                const hasExtras = true; // teslim tarihi her kalemde var
                return (
                  <FragmentRow
                    key={it.id}
                    open={isOpen}
                    extras={hasExtras && !optedOut ? renderItemExtras(it) : null}
                  >
                    <tr className={cn(optedOut && "bg-zinc-50/60 opacity-60")}>
                      <td className="px-3 py-2 text-xs text-zinc-400 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="max-w-64 px-3 py-2">
                        <p className="truncate font-medium text-zinc-900">
                          {it.name}
                        </p>
                        <p className="truncate text-[11px] text-zinc-400">
                          {it.materialCode ? `${it.materialCode} · ` : ""}
                          {it.minUnitPrice != null
                            ? `Taban: ${money(it.minUnitPrice, currency)} · `
                            : ""}
                          {it.buyNowUnitPrice != null
                            ? `Hemen-Al: ${money(it.buyNowUnitPrice, currency)} · `
                            : ""}
                          {it.targetPrice
                            ? `${isSatis ? "İstenen" : "Hedef"}: ${money(it.targetPrice, currency)}`
                            : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-zinc-600 tabular-nums">
                        {Number(it.quantity)} {it.unit}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                        {init ? (
                          <span className={cn(changed && "line-through")}>
                            {Number(init).toLocaleString("tr-TR", {
                              maximumFractionDigits: decimals,
                            })}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {optedOut ? (
                          <button
                            type="button"
                            onClick={() => setPrice(it.id, "")}
                            className="text-xs font-semibold text-blue-600 hover:underline"
                          >
                            Teklif ver
                          </button>
                        ) : (
                          <div className="ml-auto flex w-32 items-center justify-end gap-1">
                            <Input
                              type="number"
                              min={0}
                              step={String(Math.pow(10, -decimals))}
                              value={price ?? ""}
                              disabled={locked}
                              aria-label={`${it.name} birim fiyat`}
                              onChange={(e) => setPrice(it.id, e.target.value)}
                              className={cn(changed && "font-semibold")}
                            />
                            {!requireAllItems ? (
                              <button
                                type="button"
                                aria-label="Bu kaleme teklif verme"
                                title="Bu kaleme teklif verme"
                                onClick={() => setPrice(it.id, null)}
                                className="shrink-0 text-zinc-300 hover:text-red-600"
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-zinc-800 tabular-nums">
                        {lineTotal !== null ? money(lineTotal, currency) : "—"}
                        {changed && init && lineTotal !== null ? (
                          <p className="text-[11px] font-normal text-zinc-400">
                            önce{" "}
                            {money(Number(init) * Number(it.quantity), currency)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!optedOut ? (
                          <button
                            type="button"
                            aria-label={
                              locked
                                ? `${it.name} kilidini aç`
                                : `${it.name} fiyatını kilitle`
                            }
                            aria-pressed={locked}
                            title={
                              locked
                                ? "Kilidi aç — araçlar bu kalemi tekrar değiştirebilsin"
                                : "Kilitle — araçlar bu kalemin fiyatına dokunmasın"
                            }
                            onClick={() => toggleLock(it.id)}
                            className={cn(
                              "rounded-md p-1.5 transition",
                              locked
                                ? "bg-zinc-900 text-white"
                                : "text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600",
                            )}
                          >
                            {locked ? (
                              <Lock className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <LockOpen className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!optedOut ? (
                          <button
                            type="button"
                            aria-label={`${it.name} detayları`}
                            aria-expanded={isOpen}
                            onClick={() =>
                              setExpanded((s) => {
                                const n = new Set(s);
                                if (n.has(it.id)) n.delete(it.id);
                                else n.add(it.id);
                                return n;
                              })
                            }
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 transition-transform",
                                isOpen && "rotate-180",
                              )}
                              aria-hidden="true"
                            />
                            {(it.questions?.length ?? 0) > 0 ? (
                              <span className="sr-only">
                                {it.questions!.length} soru
                              </span>
                            ) : null}
                          </button>
                        ) : null}
                        {(it.questions?.length ?? 0) > 0 && !isOpen ? (
                          <Badge color="zinc">{it.questions!.length}</Badge>
                        ) : null}
                      </td>
                    </tr>
                  </FragmentRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Satır + (açıksa) ek alan satırı — tbody içinde geçerli markup için. */
function FragmentRow({
  children,
  open,
  extras,
}: {
  children: ReactNode;
  open: boolean;
  extras: ReactNode;
}) {
  return (
    <>
      {children}
      {open && extras ? (
        <tr className="bg-zinc-50/60">
          <td colSpan={8} className="px-4 py-3">
            {extras}
          </td>
        </tr>
      ) : null}
    </>
  );
}
