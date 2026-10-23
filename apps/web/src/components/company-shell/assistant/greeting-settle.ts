"use client";

import type { Box } from "./fab-suppression";

/**
 * KARŞILAMA BALONU — SAYFA BALONUN YERİNDE OTURDU MU? (mobil denetim 2026-10,
 * dördüncü doğrulama s1-fab#v4new0)
 *
 * Balonun yer yoklaması (`greetingCoversControl`) açılıştan 0,8–4 sn sonra,
 * çoğu kez satınalma anasayfasının şeritleri ya da Şirketim'in iş listesi hâlâ
 * İSKELETKEN koşuyordu: altında kontrol bulamıyor, balon açılıyor, içerik
 * sonra altına geliyordu (1440×900'de 3 yüklemenin 2'sinde; balon "İleri
 * kaydır" okunun ve kart başlıklarının üstünde 170–1085 ms kaldı, oka
 * tıklamak asistanı açtı). Ölçülen: balonun açıldığı karede yerinde 3 iskelet
 * vardı ve yerindeki son değişiklik 489 ms önceydi.
 *
 * Kural — yer yoklamasından ÖNCE sayfa balonun yerinde (`greetingZone`:
 * görünüm alanının sağ-alt köşesi, altındaki düğme dahil) OTURMUŞ olmalı:
 *  · son `PAGE_SETTLE_MS` boyunca o bölgeye değen DOM değişikliği yok
 *    (eklenen öğe kendi kutusuyla, çıkarma / metin / öznitelik değişimi
 *    hedefin kutusuyla ölçülür — kenar çubuğu ya da üst çubuktaki rozet
 *    sayılmaz; asistanın kendi düğümleri `LAUNCHER_NODE_ATTR` ile dışarıda),
 *    pencere boyu ve sayfa yüksekliği de değişmedi;
 *  · bölgede İSKELET (`animate-pulse`), dönen gösterge (`animate-spin`) ya da
 *    `aria-busy="true"` kap yok (canlı nokta gibi 10 px'ten küçük gösterge
 *    sayılmaz);
 *  · süren bir veri isteği yok (`isBusy` — React Query `isFetching`): boş
 *    duran ama dolacak kap (yüklenirken hiç çizilmeyen bölüm) ancak böyle
 *    anlaşılır.
 * Hepsi zamanlayıcıyla ölçülür (duvar saati okunmaz). Kuralın yerel üretim
 * derlemesinde sayfa içi benzetimi (1280–1920, TR/RU, satınalma anasayfası ve
 * Şirketim, 18 yükleme): sayfa düğme bağlandıktan 1,4–2,3 sn sonra oturuyor,
 * her seferinde içerik balonun yerine ÇOKTAN gelmiş (yoklama onu görür).
 */

/** Asistanın kendi düğümleri (düğme, balon, panel) bu öznitelikle işaretlenir. */
export const LAUNCHER_NODE_ATTR = "data-assistant-launcher";
/** JSX'te işaret: `<div {...LAUNCHER_NODE_PROPS}>`. */
export const LAUNCHER_NODE_PROPS = { [LAUNCHER_NODE_ATTR]: "" } as const;

/** Sayfanın balonun yerinde bu kadar süre değişmeden durması beklenir (ms). */
export const PAGE_SETTLE_MS = 600;

/** Balonun en geniş hâli (260 px) + sağ payı ve altındaki düğme, payıyla (px). */
const ZONE_WIDTH_PX = 320;
/** Balonun en uzun hâli (~225 px, RU) + düğme payı (96 px), payıyla (px). */
const ZONE_HEIGHT_PX = 340;
/** Bir kayıtta en çok bu kadar eklenen öğe kendi kutusuyla ölçülür. */
const MAX_MEASURED_NODES = 8;
/** Bundan küçük gösterge (canlı nokta, ince çizgi) yükleme sayılmaz (px). */
const LOADER_MIN_PX = 10;
const LOADER_SELECTOR = '[aria-busy="true"], .animate-pulse, .animate-spin';

/** Sayfa değişikliği gözlemi: yapı, metin ve görünümü değiştiren öznitelikler. */
export const PAGE_MUTATION_OPTIONS: MutationObserverInit = {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ["class", "hidden", "style", "aria-busy", "src"],
};

const overlaps = (r: Box, z: Box) => r.right > z.left && r.left < z.right && r.bottom > z.top && r.top < z.bottom;
const hasArea = (r: DOMRect) => r.width > 0 && r.height > 0;

/** Balonun açılacağı köşe ve altındaki düğme: görünüm alanının sağ-alt köşesi. */
export function greetingZone(win: Window = window): Box {
  const w = win.innerWidth;
  const h = win.innerHeight;
  return { left: Math.max(0, w - ZONE_WIDTH_PX), top: Math.max(0, h - ZONE_HEIGHT_PX), right: w, bottom: h };
}

/** Düğüm asistanın kendisine mi ait? (Kopmuş düğümde kendi alt ağacına bakılır.) */
export function isLauncherNode(node: Node | null | undefined): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest(`[${LAUNCHER_NODE_ATTR}]`);
}

/** Kayıt sayfanın kendi değişikliği mi? Yalnız asistanın düğümlerine dokunan kayıt sayılmaz. */
export function isPageMutation(rec: MutationRecord): boolean {
  if (isLauncherNode(rec.target)) return false;
  if (rec.type !== "childList") return true;
  const nodes = [...Array.from(rec.addedNodes), ...Array.from(rec.removedNodes)];
  return nodes.length === 0 || nodes.some((n) => !isLauncherNode(n));
}

/**
 * Kayıt bölgeye değiyor mu? Eklenen öğeler kendi kutularıyla ölçülür; hiçbiri
 * ölçülemezse (boyutsuz sarmalayıcı, çok sayıda öğe) ya da kayıt çıkarma,
 * metin ya da öznitelik değişimiyse hedefin kutusuyla.
 */
export function mutationTouchesZone(rec: MutationRecord, zone: Box): boolean {
  const added =
    rec.type === "childList"
      ? Array.from(rec.addedNodes).filter((n): n is Element => n instanceof Element && !isLauncherNode(n))
      : [];
  let measured = false;
  for (const el of added.slice(0, MAX_MEASURED_NODES)) {
    const r = el.getBoundingClientRect();
    if (!hasArea(r)) continue;
    if (overlaps(r, zone)) return true;
    measured = true;
  }
  if (measured && added.length <= MAX_MEASURED_NODES) return false;
  const target = rec.target instanceof Element ? rec.target : rec.target.parentElement;
  if (!target) return false;
  const r = target.getBoundingClientRect();
  return hasArea(r) && overlaps(r, zone);
}

/** Bölgede hâlâ yükleniyor gösteren bir öğe (iskelet, dönen gösterge, `aria-busy`) var mı? */
export function zoneStillLoading(zone: Box, doc: Document = document): boolean {
  for (const el of Array.from(doc.querySelectorAll(LOADER_SELECTOR))) {
    if (isLauncherNode(el)) continue;
    const r = el.getBoundingClientRect();
    if (Math.min(r.width, r.height) < LOADER_MIN_PX) continue;
    if (overlaps(r, zone)) return true;
  }
  return false;
}

export type SettleWatcher = {
  /** Sayfa şu an balonun yerinde oturmuş mu? */
  isSettled: () => boolean;
  dispose: () => void;
};

/**
 * Sayfanın balonun yerinde oturmasını izler (kural yukarıda). Her etkinlik
 * sessizlik süresini yeniden başlatır; süre dolunca bölgede yükleme ya da
 * süren istek varsa bir süre daha beklenir, yoksa `onSettled` çağrılır
 * (yeniden etkinlik olup sayfa yeniden oturursa yine çağrılır).
 */
export function watchPageSettle({
  zone,
  isBusy,
  onSettled,
  quietMs = PAGE_SETTLE_MS,
  doc = document,
}: {
  zone: () => Box;
  isBusy?: () => boolean;
  onSettled: () => void;
  quietMs?: number;
  doc?: Document;
}): SettleWatcher {
  const win = doc.defaultView ?? window;
  let settled = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    timer = undefined;
    if (disposed) return;
    if (zoneStillLoading(zone(), doc) || isBusy?.()) {
      arm();
      return;
    }
    settled = true;
    onSettled();
  };
  function arm() {
    settled = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, quietMs);
  }
  const mo = new MutationObserver((records) => {
    if (disposed) return;
    const z = zone();
    if (records.some((r) => isPageMutation(r) && mutationTouchesZone(r, z))) arm();
  });
  mo.observe(doc.body, PAGE_MUTATION_OPTIONS);
  // Sayfa yüksekliği değişti (görsel yüklendi, içerik itildi): bölgedeki
  // içerik yer değiştirmiş olabilir.
  const ro =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!disposed) arm();
        })
      : null;
  ro?.observe(doc.body);
  win.addEventListener("resize", arm);
  arm();
  return {
    isSettled: () => settled,
    dispose: () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      mo.disconnect();
      ro?.disconnect();
      win.removeEventListener("resize", arm);
    },
  };
}
