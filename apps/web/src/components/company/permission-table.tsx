"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import type {
  PermissionCatalog,
  PermissionCatalogItem,
} from "@/hooks/use-company-users";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  Eye,
  Settings2,
  ShoppingCart,
  Store,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";

const GROUP_ORDER: PermissionCatalogItem["group"][] = [
  "buy",
  "sell",
  "approval",
  "management",
];

const VIEW_OF: Partial<Record<PermissionCatalogItem["group"], string>> = {
  buy: "buy:view",
  sell: "sell:view",
};

export type PresetKey = keyof PermissionCatalog["presets"];

const PRESETS: { key: PresetKey; label: string; icon: LucideIcon; hint: string }[] = [
  { key: "SATIN_ALMACI", label: "Satın Almacı", icon: ShoppingCart, hint: "Talep açar, kazandırır, alım siparişini yürütür" },
  { key: "SATISCI", label: "Satışçı", icon: Store, hint: "Teklif verir, ürün yayımlar, satış siparişini yürütür" },
  { key: "ONAYLAYICI", label: "Onaylayıcı", icon: ClipboardCheck, hint: "Yalnız onaylar" },
  { key: "YONETICI", label: "Yönetici", icon: Settings2, hint: "Görür, yönetir, onaylar; işlem yapmaz" },
  { key: "GORUNTULEYICI", label: "Görüntüleyici", icon: Eye, hint: "Yalnız görür, koltuk tüketmez" },
];

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((k) => b.includes(k));
}

/**
 * YETKİ TABLOSU (Faz 4, kullanıcı kararı): kişi başına gruplu tik tablosu.
 * Rol çipleri yalnız hazır seti işaretler; doğruluk kaynağı tablodur.
 * - Satınalma / Satış gruplarında bir İŞLEM tiki bile koltuk tüketir;
 *   görüntüleme ve raporlar tüketmez. İşlem tiki işaretlenince grubun
 *   görüntülemesi kendiliğinden gelir (sunucu da aynı normalizasyonu yapar).
 * - "Kullanıcı ve yetki" tikini yalnız Kurucu verir (kilitli + gerekçe).
 * - Koltuk doluysa koltuksuz kişide işlem tikleri kilitli görünür, sebep yazar.
 * - Kurucu satırında yönetim/onay/görüntüleme örtüktür (işaretli, kilitli).
 */
export function PermissionTable({
  catalog,
  value,
  onChange,
  viewerIsOwner,
  targetIsOwner = false,
  seatsFull = false,
  hadSeat = false,
  disabled = false,
}: {
  catalog: PermissionCatalog;
  value: string[];
  onChange: (next: string[]) => void;
  viewerIsOwner: boolean;
  /** Hedef Kurucu: işlem tikleri düzenlenir, gerisi örtük. */
  targetIsOwner?: boolean;
  /** Paket koltukları dolu (yeni koltuk verilemez). */
  seatsFull?: boolean;
  /** Kişi zaten koltuk taşıyor (koltuk kilidi uygulanmaz). */
  hadSeat?: boolean;
  disabled?: boolean;
}) {
  const has = (k: string) => value.includes(k);
  const seatKeys = useMemo(
    () => catalog.catalog.filter((c) => c.seat).map((c) => c.key),
    [catalog],
  );
  const holdsSeatNow = value.some((k) => seatKeys.includes(k));
  const seatLocked = seatsFull && !hadSeat && !holdsSeatNow;

  const set = (next: Set<string>) => {
    // İşlem tiki → grubun görüntülemesi örtük.
    for (const c of catalog.catalog) {
      if (c.seat && next.has(c.key)) {
        const v = VIEW_OF[c.group];
        if (v) next.add(v);
      }
    }
    onChange(catalog.catalog.map((c) => c.key).filter((k) => next.has(k)));
  };
  const toggle = (key: string, on: boolean) => {
    const next = new Set(value);
    if (on) next.add(key);
    else next.delete(key);
    set(next);
  };
  const applyPreset = (p: PresetKey) => {
    const preset = catalog.presets[p] ?? [];
    const next = new Set(preset);
    // Kurucu olmayan bir düzenleyici "kullanıcı ve yetki"yi veremez —
    // hazır set onu içerse de tik düşer (sunucu da reddeder).
    if (!viewerIsOwner) next.delete("users:manage");
    set(next);
  };
  const activePreset = useMemo(
    () =>
      PRESETS.find((p) =>
        sameSet(
          value,
          (catalog.presets[p.key] ?? []).filter(
            (k) => viewerIsOwner || k !== "users:manage",
          ),
        ),
      )?.key ?? null,
    [value, catalog, viewerIsOwner],
  );

  const groups = GROUP_ORDER.map((g) => ({
    key: g,
    label: catalog.groups[g],
    items: catalog.catalog.filter((c) => c.group === g),
  }));

  return (
    <div className="space-y-4">
      {!targetIsOwner ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Hazır setler
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              const on = activePreset === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={disabled}
                  title={p.hint}
                  aria-pressed={on}
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-400",
                    disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {p.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {activePreset
              ? "Hazır set uygulanıyor; aşağıdan kişiye özel değiştirebilirsiniz."
              : "Kişiye özel yetki kümesi."}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const isSeatGroup = g.key === "buy" || g.key === "sell";
          return (
            <fieldset
              key={g.key}
              className="rounded-xl border border-zinc-950/10 bg-white p-3"
            >
              <legend className="px-1 text-xs font-bold uppercase tracking-wide text-zinc-600">
                {g.label}
                {isSeatGroup ? (
                  <span className="ml-1.5 font-medium normal-case text-zinc-400">
                    · işlem tiki koltuk sayar
                  </span>
                ) : null}
              </legend>
              <ul className="mt-1 space-y-1.5">
                {g.items.map((c) => {
                  const implicitOwner =
                    targetIsOwner && !c.seat; // Kurucu: örtük, kilitli
                  const ownerOnly = !!c.ownerGrantsOnly && !viewerIsOwner && !has(c.key);
                  const seatBlock = c.seat && seatLocked && !has(c.key);
                  const viewImplied =
                    !c.seat &&
                    VIEW_OF[c.group] === c.key &&
                    g.items.some((x) => x.seat && has(x.key));
                  const locked =
                    disabled || implicitOwner || ownerOnly || seatBlock || viewImplied;
                  const checked = implicitOwner || has(c.key);
                  const reason = implicitOwner
                    ? "Kurucuda örtük"
                    : ownerOnly
                      ? "Yalnız Kurucu verir"
                      : seatBlock
                        ? "Koltuk dolu"
                        : viewImplied
                          ? "İşlem tiki ile birlikte gelir"
                          : null;
                  return (
                    <li key={c.key}>
                      <label
                        className={cn(
                          "flex items-center gap-2 text-sm text-zinc-800",
                          locked && "cursor-not-allowed opacity-60",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={locked}
                          onChange={(on) => toggle(c.key, on)}
                          aria-label={c.label}
                        />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        {c.seat ? (
                          <span
                            className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500"
                            title="Koltuk tüketir"
                          >
                            koltuk
                          </span>
                        ) : null}
                        {reason ? (
                          <span className="text-[11px] text-zinc-400">{reason}</span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
