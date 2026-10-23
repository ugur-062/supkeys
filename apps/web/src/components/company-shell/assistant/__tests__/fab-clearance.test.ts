import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAB_CLEARANCE_SM_CLASS,
  FAB_CLEARANCE_SM_IN_PX3_CLASS,
  FAB_CLEARANCE_SM_IN_PX5_CLASS,
  FAB_CLEARANCE_SM_RIGHT_CLASS,
} from "../fab-clearance";

/**
 * Masaüstü AI Asistan payı (mobil denetim 2026-10): içerik kenarına dayanan
 * kontrol (Ürünlerim ⋮, "Sonraki sayfa", "Varsayılan yap", öneri şeridinin
 * "İleri kaydır" oku) her sm+ kırılımda düğmenin SOLUNDA biter. Geometri
 * kaynaktan okunur — kabuğun iç payı ya da düğmenin konumu değişirse kırmızı.
 */
const read = (file: string) => readFileSync(path.resolve(__dirname, "../../../..", file), "utf-8");
const px = (n: string | undefined) => Number(n) * 4;
/** `sm:pr-18` → { sm: 72 }; kırılımsız sınıf "base" olarak döner. */
function byBreakpoint(classes: string, prop: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of classes.split(/\s+/).filter(Boolean)) {
    const m = new RegExp(`^(?:([a-z0-9]+):)?${prop}-(\\d+)$`).exec(c);
    if (m) out[m[1] ?? "base"] = px(m[2]);
  }
  return out;
}
/** Kırılım zinciri: değeri olmayan kırılım bir öncekini devralır. */
const BREAKPOINTS = ["sm", "md", "lg", "xl", "2xl"] as const;
function resolve(values: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let last = values.base;
  for (const bp of BREAKPOINTS) {
    last = values[bp] ?? last;
    out[bp] = last ?? 0;
  }
  return out;
}

describe("FAB payı (sm+) — kaynaktan geometri", () => {
  const shell = /id="icerik"\s+className="([^"]+)"/.exec(read("components/company-shell/shell.tsx"))?.[1] ?? "";
  const launcher = read("components/company-shell/assistant/assistant-launcher.tsx");
  // Tam boy düğme: `bottom-8 right-8 h-14 w-14`; küçük: `bottom-6 right-6 h-11 w-11`.
  const full = /"bottom-\d+ right-(\d+) h-\d+ w-(\d+)"/.exec(launcher);
  const compact = /"bottom-\d+ right-(\d+) h-\d+ w-(\d+) opacity-60/.exec(launcher);
  const fullLeft = px(full?.[1]) + px(full?.[2]);
  const compactLeft = px(compact?.[1]) + px(compact?.[2]);
  const pad = resolve(byBreakpoint(shell, "px"));

  it("ölçüler okunur: kabuk iç payı sm 24 · lg 32 · xl 40; düğmenin sol kenarı ekranın sağından 88 (tam) / 68 (küçük)", () => {
    expect(pad).toMatchObject({ sm: 24, lg: 32, xl: 40 });
    expect(fullLeft).toBe(88);
    expect(compactLeft).toBe(68);
  });

  it.each([
    ["FAB_CLEARANCE_SM_CLASS", FAB_CLEARANCE_SM_CLASS, "pr", 0],
    ["FAB_CLEARANCE_SM_RIGHT_CLASS", FAB_CLEARANCE_SM_RIGHT_CLASS, "right", 0],
    // `px-5` kartın içindeki satır: kartın 20 px'i de paya eklenir.
    ["FAB_CLEARANCE_SM_IN_PX5_CLASS", FAB_CLEARANCE_SM_IN_PX5_CLASS, "pr", 20],
    ["FAB_CLEARANCE_SM_IN_PX3_CLASS", FAB_CLEARANCE_SM_IN_PX3_CLASS, "pr", 12],
  ] as const)("%s: telefonda pay YOK; her sm+ kırılımda kontrol tam boy düğmenin en az 8 px solunda", (_, classes, prop, inset) => {
    const own = byBreakpoint(classes, prop);
    // Kırılımsız sınıf telefon yerleşimini değiştirirdi.
    expect(own.base).toBeUndefined();
    const clearance = resolve(own);
    for (const bp of BREAKPOINTS) {
      const fromViewportRight = pad[bp]! + inset + clearance[bp]!;
      expect(fromViewportRight, bp).toBeGreaterThanOrEqual(fullLeft + 8);
      expect(fromViewportRight, bp).toBeGreaterThanOrEqual(compactLeft + 8);
    }
  });

  it.each([
    [FAB_CLEARANCE_SM_IN_PX5_CLASS, 20],
    [FAB_CLEARANCE_SM_IN_PX3_CLASS, 12],
  ] as const)("kart içi satır payı (%s) alt çubuğunkiyle aynı yere düşer (kartın iç payı + satır payı = alt çubuk payı)", (classes, cardPad) => {
    const outer = resolve(byBreakpoint(FAB_CLEARANCE_SM_CLASS, "pr"));
    const inner = resolve(byBreakpoint(classes, "pr"));
    for (const bp of BREAKPOINTS) expect(cardPad + inner[bp]!, bp).toBe(outer[bp]);
  });

  it("pay altı yerde kullanılır: Ürünlerim ⋮ sütunu, liste sayfalaması, Ticari şartlar alt çubuğu ve satırları, öneri şeridi oku, talep satırının alt çizgisi", () => {
    expect(read("components/products/products-view.tsx")).toMatch(
      /"px-3 py-3 text-right max-sm:relative max-sm:w-0 max-sm:px-0 max-sm:py-0",\n\s+FAB_CLEARANCE_SM_CLASS,/,
    );
    expect(read("components/list/pagination.tsx")).toMatch(/FAB_CLEARANCE_SM_CLASS,\n\s+\)\}/);
    const terms = read("components/tenders/quick/terms-panel.tsx");
    expect(terms).toMatch(/bg-zinc-50 px-5 py-3", FAB_CLEARANCE_SM_CLASS\)/);
    // Satırların "değiştir" düğmesi etiket satırında, satır listesi `px-5`.
    expect(terms).toMatch(/divide-y divide-zinc-950\/5 px-5"/);
    expect(terms).toMatch(/justify-between gap-2", FAB_CLEARANCE_SM_IN_PX5_CLASS\)\}>[\s\S]{0,400}?<button/);
    expect(read("components/dashboard/panel-recommendations.tsx")).toMatch(/`right-3 \$\{FAB_CLEARANCE_SM_RIGHT_CLASS\}`/);
    // Talep satırı (`ListingCard row`) `px-3` kartın içinde: alt çizgide "Teklif ver".
    const card = read("components/marketplace/listing-card.tsx");
    expect(card).toMatch(/<div className="px-3 py-2\.5">/);
    expect(card).toMatch(/"mt-2 flex items-center justify-between gap-3 text-\[11px\] text-slate-500",\n\s+fabClearance && FAB_CLEARANCE_SM_IN_PX3_CLASS,/);
    // Herkese açık satırda AI düğmesi yok → pay yok.
    expect(read("components/marketplace/listing-teaser-row.tsx")).toMatch(/<ListingCard variant="row" data=\{data\} fabClearance=\{false\} \/>/);
  });
});

/**
 * TELEFON (sm altı): düğme `max-sm:bottom-3 max-sm:right-3 max-sm:size-11` —
 * sol kenarı ekranın sağından 12 + 44 = 56 px; kabuğun telefondaki iç payı
 * 16 px. Pay kırılımsız sınıflarla değil, yerinde ölçülür.
 */
describe("FAB payı (telefon) — Ürünlerim satırı", () => {
  const shell = /id="icerik"\s+className="([^"]+)"/.exec(read("components/company-shell/shell.tsx"))?.[1] ?? "";
  const launcher = read("components/company-shell/assistant/assistant-launcher.tsx");
  const phoneFab = /"max-sm:bottom-\d+ max-sm:right-(\d+) max-sm:size-(\d+)"/.exec(launcher);
  const phoneFabLeft = px(phoneFab?.[1]) + px(phoneFab?.[2]);
  const phonePad = byBreakpoint(shell, "px").base ?? 0;
  const src = read("components/products/products-view.tsx");
  /** Catalyst `plain` simge düğmesi (⋮) 44 px (Chromium'da ölçüldü). */
  const KEBAB_PX = 44;

  it("ölçüler okunur: telefonda düğmenin sol kenarı ekranın sağından 56 px, kabuk payı 16 px", () => {
    expect(phoneFabLeft).toBe(56);
    expect(phonePad).toBe(16);
  });

  it("⋮ durum satırında, sağdan `right-12`: düğmenin sütununun en az 8 px solunda biter; ad düğmesi de; rozet ⋮'nin altına girmez", () => {
    // ⋮ sütunu telefonda sıfır genişlikte ve `relative` (⋮ ona göre konumlanır, tablo kartın kenarında).
    expect(src).toMatch(/<th scope="col" className=\{cn\(th, "text-right max-sm:w-0 max-sm:px-0"\)\}>/);
    const kebabRight = px(/<span className="max-sm:absolute max-sm:right-(\d+) max-sm:bottom-[\d.]+">\s*<Dropdown>/.exec(src)?.[1]);
    expect(phonePad + kebabRight).toBeGreaterThanOrEqual(phoneFabLeft + 8);
    // Ürün hücresinin `px-3`ü (12) + ad düğmesinin `max-sm:mr-9`u.
    const nameMr = px(/hover:underline max-sm:mr-(\d+) /.exec(src)?.[1]);
    expect(phonePad + 12 + nameMr).toBeGreaterThanOrEqual(phoneFabLeft + 8);
    // Rozet satırının sağ payı ⋮'nin yerini (genişliği + 8 px) bırakır.
    const badgeReserve = px(/hasMenu && "max-sm:pr-(\d+)"/.exec(src)?.[1]);
    expect(12 + badgeReserve).toBeGreaterThanOrEqual(kebabRight + KEBAB_PX + 8);
  });
});
