"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import type { ListingItemRow } from "@/hooks/use-company-listings";
import {
  applyPercentToItems,
  cmpDecimal,
  decSub,
  type DistributeItem,
} from "@/lib/tenders/distribute";
import { cn } from "@/lib/utils";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

function money(v: number | string, currency: string): string {
  return `${Number(v).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${
    currency === "TRY" ? "₺" : currency
  }`;
}

/** Sayfanın hesapladığı hedef durumu — çubuk ve araçlar bunu tüketir.
 *  Minimum pay kaldırıldı (2026-07-13): tek sınır, kendi son teklifinin bir
 *  adım altı/üstü (monotonluk). */
export interface WorkbenchTarget {
  /** Uyulması gereken sınır toplam (kendi öncekinin ∓1 adım). null = ilk teklif. */
  effectiveTarget: string | null;
  /** Kendi son SUBMITTED toplamı (varsa). */
  ownLastTotal: string | null;
  /** Mevcut kesin toplam (fiyatlanan kalemler). */
  exactTotalStr: string;
  /** Monotonluk kıyas tabanı: önceki teklifte fiyatlanmış kalemlerin YENİ
   *  ara toplamı — yeni eklenen kalem kıyasa girmez. Kapsam genişlemediyse
   *  exactTotalStr ile aynı. */
  comparableTotalStr: string;
  /** Sınır karşılandı mı (DOWN: ≤, UP: ≥). */
  met: boolean;
  /** Sınıra kalan pozitif fark (karşılanmadıysa). */
  remaining: string;
  /** İlk teklif — sınır yok, fiyatlar serbest. */
  noReference: boolean;
}

/**
 * Pazarlık çalışma masası — çok kalemli açık eksiltme/artırmada tedarikçinin
 * hedefe hesap makinesisiz inmesini sağlar: canlı hedef çubuğu, kalem seçimi
 * (yuvarlak işaret; hepsi seçili başlar, % aracı yalnız seçililere uygulanır),
 * arama/filtre'li kompakt tablo. Tüm toplam kıyasları kesin aritmetik
 * (lib/tenders/distribute) — sunucunun Decimal doğrulamasıyla drift yok.
 * NOT: lockedIds seti "seçim DIŞI" kalemleri tutar (eski kilit semantiğinin
 * tersyüz görünümü) — ebeveyn API'si değişmedi.
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
  mandatoryIds,
  rowMeta,
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
  /** Pazarlıkta bırakılamayan kalemler (önceki teklifte fiyatlanmış) —
   *  kapsam-dışı bırakma (X) gizlenir; sunucu da reddeder. */
  mandatoryIds?: Set<string>;
  /** Satır durumu: zorunlu sorusu CEVAPSIZ kalem (amber rozet + otomatik
   *  açık gelir) ve kapalıyken görünsün istenen özet (ör. kalem teslim
   *  tarihi) — detaylar chevron arkasında gizli kalıp gözden kaçmasın. */
  rowMeta?: (it: ListingItemRow) => {
    requiredMissing?: boolean;
    note?: string | null;
  };
  /** Genişletilen satırın ek alanları (teslim tarihi + kalem soruları). */
  renderItemExtras: (it: ListingItemRow) => ReactNode;
}) {
  const [percent, setPercent] = useState(defaultPercent);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "CHANGED" | "LOCKED">("ALL");
  // Zorunlu sorusu cevapsız kalemler AÇIK başlar — chevron arkasında
  // gizli kalıp "neden gönderemiyorum"a dönüşmesin.
  const [expanded, setExpanded] = useState<Set<string>>(
    () =>
      new Set(
        items
          .filter((it) => rowMeta?.(it)?.requiredMissing)
          .map((it) => it.id),
      ),
  );

  const down = direction === "DOWN";

  // Yapılan indirim/artış — kendi öncekine göre, AYNI KALEMLER ara
  // toplamıyla (yeni eklenen kalem kıyasa girmez). Tutar kesin aritmetik;
  // % yalnız gösterim.
  const madeDiff = target.ownLastTotal
    ? down
      ? decSub(target.ownLastTotal, target.comparableTotalStr)
      : decSub(target.comparableTotalStr, target.ownLastTotal)
    : "0";
  const scopeExpanded =
    cmpDecimal(target.comparableTotalStr, target.exactTotalStr) !== 0;
  const madePct = (() => {
    const own = Number(target.ownLastTotal ?? 0);
    const diff = Number(madeDiff);
    if (!(own > 0) || !(diff > 0)) return null;
    return ((diff / own) * 100).toLocaleString("tr-TR", {
      maximumFractionDigits: 1,
    });
  })();

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

  // Hepsi seçiliyken "Tümüne", en az biri çıkarıldıysa "Seçililere".
  const allSelected =
    distItems.length > 0 && distItems.every((d) => !d.locked);
  const percentScopeLabel = allSelected ? "Tümüne" : "Seçililere";

  const applyPercent = () => {
    const p = Number(percent);
    if (!Number.isFinite(p) || p <= 0 || p >= 100) {
      toast.error("Geçerli bir yüzde girin (0–100 arası)");
      return;
    }
    if (distItems.every((d) => d.locked)) {
      toast.error("Seçili kalem yok — en az bir kalemi işaretleyin");
      return;
    }
    applyPrices(
      applyPercentToItems({ items: distItems, percent, direction, decimals }),
    );
    toast.success(
      `${allSelected ? "Tüm kalemlere" : "Seçili kalemlere"} %${percent} ${down ? "indirim" : "artış"} uygulandı`,
    );
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
          target.noReference
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
        {target.noReference ? (
          <span>
            İlk teklifin — sınır yok, fiyatlarını serbestçe gir. Sonraki
            teklifler bunun {down ? "altında" : "üzerinde"} olmak zorunda.
          </span>
        ) : target.effectiveTarget ? (
          <>
            <span>
              Önceki teklifin:{" "}
              <strong className="tabular-nums">
                {money(target.ownLastTotal ?? "0", currency)}
              </strong>
            </span>
            {/* Sınır/"Gönderilebilir" yerine YAPILAN indirim/artış: tutar + %
                (öncekine göre; kesin aritmetik, % yalnız gösterim). Kapsam
                genişletildiyse kıyas önceki kalemlerin ara toplamıyla. */}
            {target.met ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {down ? "İndirim" : "Artış"}:{" "}
                <strong className="tabular-nums">
                  {money(madeDiff, currency)}
                  {madePct != null ? ` (%${madePct})` : ""}
                </strong>
              </span>
            ) : (
              <span>
                {scopeExpanded
                  ? "Önceden fiyatladığın kalemlerin toplamı öncekinden"
                  : "Öncekinden"}{" "}
                {down ? "düşük" : "yüksek"} olmalı — henüz{" "}
                {down ? "indirim" : "artış"} yok.
              </span>
            )}
            {scopeExpanded ? (
              <span className="text-xs opacity-70">
                Yeni eklenen kalemler kıyasa girmez — fiyatları serbest.
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      {/* ── Toplu araçlar ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-950/10 bg-white p-3">
        <div className="flex items-center gap-1.5">
          <div className="w-20">
            {/* step=1: ok tuşları 5→6→7 gitsin (0.01 adımla 5.01 oluyordu);
                ondalık yüzde ("2,5") elle yazılabilir. */}
            <Input
              type="number"
              min={0}
              max={99.99}
              step="1"
              value={percent}
              aria-label="Yüzde"
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <Button outline onClick={applyPercent}>
            {percentScopeLabel} %{percent || "…"} {down ? "indirim" : "artış"}
          </Button>
        </div>
        <Button outline onClick={reset} disabled={changedIds.size === 0}>
          <RotateCcw data-slot="icon" aria-hidden="true" />
          Sıfırla
        </Button>
        <span className="text-xs text-zinc-400">
          İşareti kaldırılan kaleme % aracı dokunmaz.
        </span>
      </div>

      {/* ── Tablo filtreleri: arama SOLDA, görünüm chip'leri sağında —
          tablonun hemen üstünde ── */}
      <div className="flex flex-wrap items-center gap-2">
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
            className="w-56 rounded-lg border border-zinc-300 bg-white py-1.5 pr-2 pl-8 text-sm shadow-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
          />
        </div>
        {filterChip("ALL", "Tümü")}
        {filterChip("CHANGED", "Değişen", changedIds.size)}
        {filterChip("LOCKED", "Hariç", lockedIds.size)}
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
              <th className="px-2 py-2" aria-label="Seçim" />
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
                const hasPrice = !optedOut && price !== "" && Number(price) > 0;
                const locked = lockedIds.has(it.id);
                const init = initialPrices[it.id];
                const changed = changedIds.has(it.id);
                const lineTotal =
                  price && Number(price) > 0
                    ? Number(price) * Number(it.quantity)
                    : null;
                const isOpen = expanded.has(it.id);
                const hasExtras = true; // teslim tarihi her kalemde var
                const meta = rowMeta?.(it);
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
                        <p className="flex items-center gap-1.5 truncate font-medium text-zinc-900">
                          <span className="truncate">{it.name}</span>
                          {meta?.requiredMissing ? (
                            <Badge color="amber">Zorunlu soru</Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-zinc-400">
                          {[
                            it.materialCode,
                            it.minUnitPrice != null
                              ? `Taban: ${money(it.minUnitPrice, currency)}`
                              : null,
                            it.buyNowUnitPrice != null
                              ? `Hemen-Al: ${money(it.buyNowUnitPrice, currency)}`
                              : null,
                            it.targetPrice
                              ? `${isSatis ? "İstenen" : "Hedef"}: ${money(it.targetPrice, currency)}`
                              : null,
                            meta?.note ?? null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
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
                              aria-label={`${it.name} birim fiyat`}
                              onChange={(e) => setPrice(it.id, e.target.value)}
                              className={cn(changed && "font-semibold")}
                            />
                            {!requireAllItems && !mandatoryIds?.has(it.id) ? (
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
                      {/* "önce X" alt satırı kaldırıldı — önceki fiyat zaten
                          kendi kolonunda (üstü çizili), iki kez yazılıyordu. */}
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-zinc-800 tabular-nums">
                        {lineTotal !== null ? money(lineTotal, currency) : "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!optedOut ? (
                          // Yuvarlak seçim: işaretli = % aracı bu kalemi
                          // değiştirir (varsayılan). lockedIds = işareti
                          // kaldırılanlar (seçim dışı). Fiyatsız kalem
                          // seçili GÖRÜNMEZ ve tıklanamaz — araç ona zaten
                          // dokunmuyor, "boşa indirim uygulandı" izlenimi
                          // vermesin; fiyat girilince seçime girer.
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={hasPrice && !locked}
                            disabled={!hasPrice}
                            aria-label={
                              !hasPrice
                                ? `${it.name} fiyatsız — seçime girmez`
                                : locked
                                  ? `${it.name} kalemini seçime ekle`
                                  : `${it.name} kalemini seçimden çıkar`
                            }
                            title={
                              !hasPrice
                                ? "Fiyat girilmeden seçime girmez"
                                : locked
                                  ? "Seçime ekle — % aracı bu kalemi de değiştirsin"
                                  : "Seçimden çıkar — % aracı bu kaleme dokunmasın"
                            }
                            onClick={() => toggleLock(it.id)}
                            className={cn(
                              "inline-flex h-5 w-5 items-center justify-center rounded-full border transition",
                              !hasPrice
                                ? "cursor-default border-zinc-200 bg-zinc-50"
                                : locked
                                  ? "cursor-pointer border-zinc-300 bg-white hover:border-zinc-500"
                                  : "cursor-pointer border-zinc-900 bg-zinc-900 text-white",
                            )}
                          >
                            {hasPrice && !locked ? (
                              <Check
                                className="h-3.5 w-3.5"
                                strokeWidth={3}
                                aria-hidden="true"
                              />
                            ) : null}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {!optedOut ? (
                          <button
                            type="button"
                            aria-label={`${it.name} detayları`}
                            aria-expanded={isOpen}
                            title="Kalem detayları — teslim tarihi ve sorular"
                            onClick={() =>
                              setExpanded((s) => {
                                const n = new Set(s);
                                if (n.has(it.id)) n.delete(it.id);
                                else n.add(it.id);
                                return n;
                              })
                            }
                            className={cn(
                              "rounded-md p-1.5 hover:bg-zinc-100",
                              meta?.requiredMissing
                                ? "text-amber-600 hover:text-amber-700"
                                : "text-zinc-400 hover:text-zinc-600",
                            )}
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
