"use client";

import { isCoarsePointer } from "@/components/messaging/use-coarse-pointer";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * AI Asistan düğmesinin (FAB) KENDİLİĞİNDEN ÇEKİLDİĞİ durumlar — mobil denetim
 * 2026-10 (g04/g05/g06/g08/g09). Düğme sağ-alt köşede sabit durur; telefonda
 * altındaki kontrolü örtüp dokunuşu yutuyordu (mesaj Gönder, sihirbazın
 * "Devam" düğmesi, "Excel ile İçe Aktar", teklif formunda kalemi atlama ×,
 * Ürünlerim satır ⋮ menüsü, hero aramasının gönder düğmesi). Kural:
 *
 *  · MODAL: açık bir modal diyalog / alt çekmece / mobil menü varken düğme
 *    GİZLİ (her genişlikte; perdenin altında zaten tıklanamaz). Eskiden alt
 *    çekmecenin paneli "yapışkan alt çubuk" sanılıyor ve düğme üst çubuğun
 *    üstüne zıplıyordu.
 *  · YAZIM: telefonda ya da dokunmatik cihazda bir metin alanı odaktayken
 *    GİZLİ — ekran klavyesi açıkken düğme alanın, öneri listesinin ya da
 *    gönder düğmesinin üstüne binmesin.
 *  · ÖRTÜŞME (her genişlikte): düğme DURURKEN (kaydırma bitince) altında bir
 *    kontrol (düğme, alan, seçenek, küçük bağlantı, DÜĞME GÖRÜNÜMLÜ bağlantı…)
 *    varsa çekilir — saydamlaşır ve dokunuşu/tıklamayı geçirir; köşe boşalınca
 *    geri gelir. Kaydırma sürerken önceki karar korunur (her satırda yanıp
 *    sönmesin). Büyük YÜZEYLER (liste satırı düğmesi, kart, `::after` ile
 *    karta yayılan başlık bağlantısı, uzun başlık bağlantısı) ancak görünen
 *    alanlarının büyük bir payı örtülünce sayılır — ayrıntı `controlKind` ve
 *    `coverHitsControl`. Doğrulama turu g06: eskiden
 *    yalnız telefonda ölçülüyordu; masaüstünde (1280) küçük düğme Taleplerim
 *    "Sonraki sayfa"yı, tam boy düğme yeni talepte "Varsayılan yap"ı örtüyor,
 *    tıklama asistanı açıyordu.
 *  · METİN (telefon/dokunmatik, YALNIZ İLK GÖRÜNÜMDE): düğme durduğu yerde bir
 *    METNİN üstündeyse de çekilir (doğrulama turu g08: ilk yüklemede 360 px'te
 *    Kapanış tarihi "16 Eki 202" okunuyordu; ilan kalemlerinde sağa yaslı
 *    fiyatlar). Ürün kararı (mobil denetim 2026-10, ölçülen görünürlük durağan
 *    konumlarda %43-82): kural sayfadaki İLK KAYDIRMAYA dek geçerlidir — ilk
 *    görünümde düğmenin altındaki metin başka yoldan açığa çıkamaz; kullanıcı
 *    kaydırınca metni düğmenin altından kendisi çıkarabilir, artık yalnız
 *    ÖRTÜŞME kuralı uygulanır. "Kaydırdı" bilgisi rota değişince sıfırlanır.
 *    Yalnız SAYFANIN kendi kaydırması sayılır, konumu da değişmiş olmalı (iç
 *    kaydırma kapları, yerinde kalan `scroll` olayı ve Next'in yeni sayfada
 *    başa dönmesi sayılmaz) — `isPageScrollEvent`. Masaüstü küçük düğmesi
 *    metnin üstünde YARI SAYDAM kalır (Faz 8.2 B3 kararı). Metin de YÜZEY
 *    gibi görünen kısmıyla ölçülür: kırpılarak bir yönde 24 px'in altına
 *    inen satır (şeridin kenarından taşan kartın başlığı) sayılmaz (`textAt`).
 *
 * Örtüşmede çekilen düğme klavyeyle hâlâ ulaşılabilir: odak gelince görünür
 * olur (başka giriş noktası yok; `invisible` sekme sırasından düşürürdü).
 */

/** sm kırılımı — altı "telefon". */
export const PHONE_MAX_PX = 640;
/** Kaydırma bu süre durunca "durdu" sayılır (ms). */
const SCROLL_SETTLE_MS = 160;

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"]';

/** Düğmenin altında kalınca dokunuşu yutulacak öğeler. */
const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  "label",
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[role="textbox"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(", ");

/** Yazı yazılmayan input türleri — odakları klavye açmaz. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Telefon ya da dokunmatik cihaz mı? (Karar her ölçümde yeniden okunur.) */
export function isPhoneLike(): boolean {
  if (typeof window === "undefined") return false;
  return isCoarsePointer() || window.innerWidth < PHONE_MAX_PX;
}

/** Odaktaki öğe ekran klavyesi açan bir metin alanı mı? */
export function isEditableElement(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  if (el instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  }
  return false;
}

function isRendered(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if (typeof check === "function") return check.call(el);
  // `checkVisibility` yok (iOS 17.4 öncesi WebView, jsdom): atalardan biri
  // `display: none` ise çizilmemiştir.
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || window.getComputedStyle(node).display === "none") return false;
  }
  return true;
}

/**
 * İmleç düğmenin üstünde mi? Yalnız gerçek hover'ı olan cihazda (Tailwind
 * `hover:` da yalnız orada işler); dokunmatikte dokunuştan kalan "yapışkan
 * hover" sayılmaz.
 */
function hovered(el: Element): boolean {
  try {
    if (typeof window.matchMedia === "function" && !window.matchMedia("(hover: hover)").matches) {
      return false;
    }
    return el.matches(":hover");
  } catch {
    return false;
  }
}

/** Açık (çizilmiş) bir modal diyalog / alt çekmece / mobil menü var mı? */
export function modalDialogOpen(doc: Document = document): boolean {
  return Array.from(doc.querySelectorAll(MODAL_SELECTOR)).some(isRendered);
}

/** Ekranda bir kutu (DOMRect'in kenar alanları; sözde öğe kutusu da bu biçimde). */
export type Box = { left: number; top: number; right: number; bottom: number };

/**
 * ÖRTÜŞME KURALININ ÖLÇÜLERİ (mobil denetim 2026-10, üçüncü tur). Birim `unit`
 * = AI düğmesinin kenarı (telefonda ve küçük masaüstü düğmesinde 44, tam boy
 * masaüstü düğmesinde 56 px).
 *
 *  · KÜÇÜK kontrol: iki boyutu da düğmenin 3 katını aşmayan (⋮, ×, Gönder,
 *    "Sonraki sayfa", kart içi "Teklif ver", "Tümünü gör") — herhangi bir
 *    örtüşmede çekilir.
 *  · DÜĞME: kendi zemini/çerçevesi/halkası olan (ya da form alanı) ve en çok
 *    88 px yüksek kontrol — iki satıra kırılan etiket dahil (RU "Отправить
 *    сообщение" 155×68). Düğmenin 4 katından geniş olanı yalnız KISAYSA (en
 *    çok 1,25 düğme) düğmedir (tam genişlik birincil düğme, metin alanı);
 *    satır yüksekliğindeki geniş öğe yüzeydir. Zeminsiz ama kısa (en çok 1,25
 *    düğme) bağlantı dışı kontrol de (düz düğme, `<summary>`) düğme sayılır.
 *    Herhangi bir örtüşmede çekilir.
 *  · YÜZEY (geri kalan büyük kontrol: liste satırı düğmesi, kart, `::after`
 *    ile karta yayılan başlık bağlantısı, uzun başlık bağlantısı): ancak
 *    GÖRÜNEN alanının (görünüm alanı + kırpan atalar, `HitPart`) %25'inden
 *    fazlası örtülünce çekilir; kırpılarak bir yönde 24 px'in altına inen
 *    yüzey (şeridin kenarından taşan kart) sayılmaz, kendisi ince olan metin
 *    bağlantısı sayılır (`clippedToSliver`). Karşılama balonu da aynı kuralla
 *    ölçülür. Ölçülen: telefon
 *    gelen kutusunda her satır 358×78 tam genişlik düğmeydi ve düğme 20
 *    durağan konumun 18'inde çekiliyordu; masaüstü satınalma anasayfasının öneri
 *    kartlarında başlık bağlantısının kendi kutusu (111×36) ölçülüyor, kartın
 *    tamamına yayılan tıklama alanı görülmüyor, düğme 1024–1600'de ilk
 *    yüklemede çekiliyordu.
 */
const SMALL_CONTROL_FACTOR = 3;
const BUTTON_LIKE_MAX_HEIGHT_PX = 88;
const BUTTON_LIKE_WIDE_FACTOR = 4;
const BUTTON_LIKE_SHORT_FACTOR = 1.25;
const SURFACE_MAX_COVERED_SHARE = 0.25;
/**
 * KIRPILARAK bir yönde en küçük dokunma hedefinin (24 px) altına inen YÜZEY
 * sayılmaz: kayan şeridin kenarından ya da ekranın altından taşan kartın şeridi
 * (390 px'te sağ kenarda 14×167 px görünen sonraki kart). Kullanıcı ona
 * dokunmaz, kaydırıp getirir; düğme orada çekilmesin. KENDİSİ o yönde 24
 * px'ten ince olan yüzey (tek satırlık uzun metin bağlantısı, ~17-20 px)
 * şerit değildir, %25 kuralıyla ölçülür (`clippedToSliver`). Küçük kontrol ve
 * düğme bu kuraldan etkilenmez.
 */
const SURFACE_MIN_VISIBLE_PX = 24;

/**
 * Tıklama alanı (`full`) bir yönde 24 px ya da daha genişken görünen kısmı
 * (`vis`) o yönde 24 px'in altına mı indi? Gözden geçirme (mobil denetim
 * 2026-10, beşinci tur): kural görünen kısmın kendi boyuna bakınca tek
 * satırlık uzun metin bağlantıları (yükseklik ~17-20 px) hiç sayılmıyordu —
 * balon böyle bir bağlantının tamamını, düğme ucunun %25'ten fazlasını
 * örtebiliyordu.
 */
function clippedToSliver(full: Box, vis: Box): boolean {
  const sliver = (visible: number, own: number) =>
    own >= SURFACE_MIN_VISIBLE_PX && visible < SURFACE_MIN_VISIBLE_PX;
  return sliver(width(vis), width(full)) || sliver(height(vis), height(full));
}

/** Yazı/seçim alanları — kendi çerçeveleri olmasa da kontroldür. */
const FORM_FIELD_SELECTOR = [
  'input:not([type="hidden"])',
  "select",
  "textarea",
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="slider"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
].join(", ");

const width = (b: Box) => b.right - b.left;
const height = (b: Box) => b.bottom - b.top;
const area = (b: Box | null) => (b ? Math.max(0, width(b)) * Math.max(0, height(b)) : 0);
function intersect(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
  return box.right > box.left && box.bottom > box.top ? box : null;
}
function union(a: Box, b: Box): Box {
  return {
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  };
}
const toBox = (r: DOMRect | Box): Box => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });

/** Hesaplanmış renk tamamen saydam mı? (`rgba(…, 0)`, `oklch(… / 0)`, `transparent`, `#0000`) */
export function isTransparentColor(color: string): boolean {
  const c = color.trim();
  if (!c || c === "transparent") return true;
  const hex = c.match(/^#(?:[0-9a-f]{3}([0-9a-f])|[0-9a-f]{6}([0-9a-f]{2}))$/i);
  if (hex) return parseInt(hex[1] ?? hex[2] ?? "f", 16) === 0;
  const legacy = c.match(/^rgba\(([^)]*)\)$/);
  const alpha = legacy ? legacy[1]?.split(",")[3] : c.match(/\/\s*([^)\s]+)\s*\)$/)?.[1];
  return alpha !== undefined && parseFloat(alpha) === 0;
}

/** Gölge değerinde (ring, shadow) görünen bir renk var mı? `none` ve saydam sıfır gölgeler sayılmaz. */
function hasVisibleShadow(value: string): boolean {
  if (!value || value === "none") return false;
  const colors = value.match(/(?:rgba?|oklch|oklab|lab|lch|hsla?|color)\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? [];
  return colors.some((c) => !isTransparentColor(c));
}

/** Öğenin arkasındaki zemin rengi: ilk saydam olmayan atanın zemini (yoksa sayfa beyazı). */
function backdropColor(el: Element): string {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const bg = window.getComputedStyle(n).backgroundColor;
    if (!isTransparentColor(bg)) return bg;
  }
  return "rgb(255, 255, 255)";
}

/**
 * Öğe kendi yüzeyini çiziyor mu? Arkasından farklı zemin rengi, zemin görseli,
 * en az üç kenarda görünen çerçeve ya da görünen halka/gölge. Liste satırının
 * alt ayracı (tek kenar) ve beyaz karttaki beyaz satır yüzey sayılmaz.
 */
function hasOwnSurface(el: Element): boolean {
  const cs = window.getComputedStyle(el);
  if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
  if (!isTransparentColor(cs.backgroundColor) && cs.backgroundColor !== backdropColor(el)) return true;
  const borders = (["top", "right", "bottom", "left"] as const).filter(
    (side) =>
      parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 &&
      !isTransparentColor(cs.getPropertyValue(`border-${side}-color`)),
  ).length;
  return borders >= 3 || hasVisibleShadow(cs.boxShadow);
}

/**
 * Düğme görünümlü kontrol mü? (Catalyst `Button`, kart içi "Teklif ver"
 * CTA'sı, çerçeveli "Mesaj Gönder", form alanı) — ölçüler yukarıda. Doğrulama
 * turu g08: bunlar "uzun başlık bağlantısı" sayılıp ucu örtülünce düğme
 * görünür kalıyor, ucuna dokunmak asistanı açıyordu; üçüncü tur: iki satıra
 * kırılan 68 px'lik çerçeveli bağlantı da düğmedir.
 */
export function isButtonLike(el: Element, w: number, h: number, unit: number): boolean {
  if (h > BUTTON_LIKE_MAX_HEIGHT_PX) return false;
  if (el.matches(FORM_FIELD_SELECTOR)) return true;
  if (w > BUTTON_LIKE_WIDE_FACTOR * unit && h > BUTTON_LIKE_SHORT_FACTOR * unit) return false;
  return hasOwnSurface(el);
}

export type ControlKind = "small" | "button" | "surface";

/** Metin bağlantıları: uzun, zeminsiz bağlantının ucu örtülebilir (yüzey kuralı). */
const TEXT_LINK_SELECTOR = 'a[href], [role="link"], label';

/** Kontrolün türü (tıklama alanı kutusuyla; ölçüler yukarıda). */
export function controlKind(el: Element, box: Box, unit: number): ControlKind {
  const w = width(box);
  const h = height(box);
  if (w <= SMALL_CONTROL_FACTOR * unit && h <= SMALL_CONTROL_FACTOR * unit) return "small";
  if (isButtonLike(el, w, h, unit)) return "button";
  // Zeminsiz ama KISA (en çok 1,25 düğme) bağlantı dışı kontrol — tam genişlik
  // düz düğme, açılır bölüm başlığı (`<summary>`, Disclosure; ok sağ uçta),
  // uzun RU etiketli `plain` düğme, sekme, seçenek — da her örtüşmede sayılır:
  // tamamı tıklama hedefidir, ucundaki ok/sözcük düğmenin altında kalabilir
  // (gözden geçirme 2026-10: yeni talepte "Detaylar" başlığı, ürün rayında
  // "Göster/Gizle"). Satır yüksekliğindeki düğme (gelen kutusu 358×78) yüzeydir.
  if (h <= BUTTON_LIKE_SHORT_FACTOR * unit && !el.matches(TEXT_LINK_SELECTOR)) return "button";
  return "surface";
}

/** Konumlandırılmış (`absolute`) torunların kutusunu belirleyen ilk ata (öğenin kendisi dahil). */
function containingBlock(el: Element): Element | null {
  for (let n: Element | null = el; n && n !== n.ownerDocument.documentElement; n = n.parentElement) {
    const cs = window.getComputedStyle(n);
    const set = (v: string | undefined) => !!v && v !== "none" && v !== "normal" && v !== "auto";
    if (
      (cs.position && cs.position !== "static") ||
      set(cs.transform) ||
      set(cs.translate) ||
      set(cs.scale) ||
      set(cs.rotate) ||
      set(cs.filter) ||
      set(cs.perspective) ||
      /layout|paint|strict|content/.test(cs.contain ?? "") ||
      /transform|perspective|filter/.test(cs.willChange ?? "") ||
      set(cs.containerType)
    ) {
      return n;
    }
  }
  return null;
}

/** Kutunun dolgu alanı (çerçeve içi); satır içi öğede kutunun kendisi. */
function paddingBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  if (el.clientWidth === 0 && el.clientHeight === 0) return toBox(r);
  const left = r.left + el.clientLeft;
  const top = r.top + el.clientTop;
  return { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight };
}

/**
 * `absolute` konumlu `::before`/`::after` kutusu — kartın tamamına yayılan
 * başlık bağlantısı (`after:absolute after:inset-0`) ya da dokunma alanını
 * büyüten katman (`after:-inset-2`). `cb` öğenin kapsayan bloğu
 * (`containingBlock`). Ölçülemiyorsa null.
 */
function pseudoBox(el: Element, which: "::before" | "::after", cb: Element): Box | null {
  let ps: CSSStyleDeclaration;
  try {
    ps = window.getComputedStyle(el, which);
  } catch {
    return null;
  }
  if (ps.position !== "absolute") return null;
  if (!ps.content || ps.content === "none" || ps.content === "normal") return null;
  if (ps.display === "none" || ps.pointerEvents === "none" || ps.visibility === "hidden") return null;
  const pad = paddingBox(cb);
  const px = (v: string) => (/^-?\d+(\.\d+)?px$/.test(v.trim()) ? parseFloat(v) : NaN);
  const [t, r, b, l] = [ps.top, ps.right, ps.bottom, ps.left].map(px) as [number, number, number, number];
  // Kenar değeri okunamadıysa (motor `auto` döndü) kapsayan kutunun kendisi.
  if ([t, r, b, l].some((v) => Number.isNaN(v))) return pad;
  return { left: pad.left + l, top: pad.top + t, right: pad.right - r, bottom: pad.bottom - b };
}

/**
 * Tıklama alanının bir parçası ve onu kırpabilecek İLK ata (`clipFrom`, dahil).
 * Öğenin kendi kutusunu ebeveyninden yukarı her taşma kabı kırpar; `absolute`
 * sözde öğeyi ise yalnız KAPSAYAN BLOĞU ve onun ataları kırpar — arada kalan
 * ata (kartın `line-clamp-2` başlığı, `overflow: hidden`) kartın tamamına
 * yayılan katmanı kırpmaz (mobil denetim 2026-10, beşinci tur: 1366×768'de
 * düğme yalnız ucu altında kalan öneri kartının, 390'da şeridin kenarında
 * 14×167 px görünen sonraki kartın yanında çekiliyordu — görünen kısım H3
 * yüzünden 2×35 px ölçülüyordu).
 */
type HitPart = { box: Box; clipFrom: Element | null };

/** Parçaların kapsayan kutusu (ilk parça öğenin kendi kutusudur). */
function partsBox([own, ...rest]: readonly [HitPart, ...HitPart[]]): Box {
  return rest.reduce((acc, p) => union(acc, p.box), own.box);
}

function hitParts(el: Element, x?: number, y?: number): [HitPart, ...HitPart[]] {
  const own: HitPart = { box: toBox(el.getBoundingClientRect()), clipFrom: el.parentElement };
  const parts: [HitPart, ...HitPart[]] = [own];
  // `after:inset-0`, `sm:after:-inset-2` … (kırılım önekli sınıf da).
  if (/(?:^|[\s:])(?:after|before):/.test(el.getAttribute("class") ?? "")) {
    const cb = containingBlock(el);
    if (cb) {
      for (const which of ["::before", "::after"] as const) {
        const p = pseudoBox(el, which, cb);
        if (p) parts.push({ box: p, clipFrom: cb });
      }
    }
  }
  // Yoklama noktası hiçbir parçanın içinde değilse (ölçülemeyen katman) öğenin
  // kendi kutusu o noktayı kapsayacak kadar büyür. Ölçülemeyen (boş) kutu
  // büyütülmez: küçük kontrol sayılır.
  if (x !== undefined && y !== undefined) {
    const all = partsBox(parts);
    const inside = x >= all.left && x <= all.right && y >= all.top && y <= all.bottom;
    if (area(all) > 0 && !inside) own.box = union(own.box, { left: x, top: y, right: x, bottom: y });
  }
  return parts;
}

/**
 * Kontrolün TIKLAMA alanı: kendi kutusu + konumlandırılmış sözde öğeleri
 * (yalnız sınıfında Tailwind `after:`/`before:` taşıyan öğede ölçülür — uygulamadaki
 * bütün yayılan bağlantılar ve dokunma katmanları böyle yazılır). Yoklama
 * noktası yine de dışında kaldıysa kutu o noktayı da kapsayacak kadar büyür.
 */
export function hitBox(el: Element, x?: number, y?: number): Box {
  return partsBox(hitParts(el, x, y));
}

/** Kutunun ekranda ve `from`dan (dahil) yukarı kırpan taşma kaplarının içinde GÖRÜNEN kısmı. */
function clippedPart(box: Box, from: Element | null, doc: Document): Box | null {
  const view = doc.defaultView;
  let vis: Box | null = intersect(box, {
    left: 0,
    top: 0,
    right: view?.innerWidth ?? Number.POSITIVE_INFINITY,
    bottom: view?.innerHeight ?? Number.POSITIVE_INFINITY,
  });
  for (let n = from; vis && n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
    const cs = window.getComputedStyle(n);
    const clipX = !!cs.overflowX && cs.overflowX !== "visible";
    const clipY = !!cs.overflowY && cs.overflowY !== "visible";
    if (!clipX && !clipY) continue;
    const r = n.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) continue;
    vis = intersect(vis, {
      left: clipX ? r.left : vis.left,
      right: clipX ? r.right : vis.right,
      top: clipY ? r.top : vis.top,
      bottom: clipY ? r.bottom : vis.bottom,
    });
  }
  return vis;
}

/**
 * Tıklama alanının GÖRÜNEN kısmı: her parça kendi kırpan atalarıyla kırpılır
 * (`HitPart`), görünen parçaların kapsayan kutusu döner.
 */
function visiblePart(el: Element, parts: readonly HitPart[]): Box | null {
  let vis: Box | null = null;
  for (const p of parts) {
    const v = clippedPart(p.box, p.clipFrom, el.ownerDocument);
    if (v) vis = vis ? union(vis, v) : v;
  }
  return vis;
}

/**
 * Düğmenin altında yoklanan noktalar: kutuda 5×5 ızgara, yalnız DAİRENİN
 * içindekiler (kutu köşeleri yuvarlak düğmenin dışında kalır, oradaki öğe
 * görünür ve dokunulur). Eski 3×3 ızgara 16 px aralıklıydı; küçük ×/⋮ ve
 * tek satır küçük metin aradan kaçabiliyordu.
 */
function probePoints(r: Box): Array<[number, number]> {
  const w = width(r);
  const h = height(r);
  const cx = r.left + w / 2;
  const cy = r.top + h / 2;
  const reach = Math.min(w, h) / 2 - 2;
  const points: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const x = r.left + (w * (i + 0.5)) / 5;
      const y = r.top + (h * (j + 0.5)) / 5;
      if (Math.hypot(x - cx, y - cy) <= reach) points.push([x, y]);
    }
  }
  return points;
}

/** Dikdörtgen bir katmanın (karşılama balonu) altında en çok `step` px aralıklı noktalar. */
function gridPoints(r: Box, step: number): Array<[number, number]> {
  const inset = 4;
  const w = width(r) - 2 * inset;
  const h = height(r) - 2 * inset;
  if (w <= 0 || h <= 0) return [];
  const cols = Math.max(2, Math.ceil(w / step) + 1);
  const rows = Math.max(2, Math.ceil(h / step) + 1);
  const points: Array<[number, number]> = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      points.push([r.left + inset + (w * i) / (cols - 1), r.top + inset + (h * j) / (rows - 1)]);
    }
  }
  return points;
}

/** (x, y) noktasında katmanın (hariç tutulanların) altında kalan en üst öğe. */
function elementUnder(exclude: readonly Element[], x: number, y: number, doc: Document): Element | undefined {
  return doc.elementsFromPoint(x, y).find((el) => !exclude.some((ex) => ex === el || ex.contains(el)));
}

/**
 * Öğenin KENDİ metni (doğrudan metin düğümleri) bu noktada GÖRÜNÜR biçimde
 * çizili mi? Her satırın kutusu görünüm alanı ve kırpan atalarıyla
 * (`clippedPart`, öğenin kendisi dahil) kırpılır; nokta görünen kısımda
 * olmalı. Kırpılarak bir yönde 24 px'in altına inen satır (`clippedToSliver`
 * — yüzeylerle AYNI pay) sayılmaz: mobil denetim 2026-10, dördüncü doğrulama
 * (390 TR satınalma anasayfası, ilk görünüm) — kayan şeridin sağ kenarından
 * 2 px görünen sonraki kartın başlığı ("Modüler Bant Konveyör", satır
 * 82×16, görünen 2×16) düğmeyi ilk görünümde çekiyordu; yüzey kuralı aynı
 * kartı zaten şerit saymıştı.
 */
function textAt(el: Element, x: number, y: number, doc: Document): boolean {
  const range = doc.createRange();
  // `Range.getClientRects` yok (jsdom): metin ölçülemez, sayılmaz.
  if (typeof range.getClientRects !== "function") return false;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const q of Array.from(range.getClientRects())) {
      const line = toBox(q);
      const vis = clippedPart(line, el, doc);
      if (!vis || clippedToSliver(line, vis)) continue;
      if (x >= vis.left && x <= vis.right && y >= vis.top && y <= vis.bottom) return true;
    }
  }
  return false;
}

/**
 * `cover` katmanı (AI düğmesi ya da karşılama balonu) yoklama noktalarında bir
 * kontrolü örtüyor mu? Her noktada katmanın altındaki en üst öğenin
 * etkileşimli atası aranır; KÜÇÜK kontrol ve DÜĞME her örtüşmede, YÜZEY
 * görünen alanının %25'inden fazlası örtülünce sayılır (`controlKind`). İç içe
 * küçük kontrol (satırdaki ⋮, karttaki "Teklif ver") o noktada en üstte
 * olduğundan kendi türüyle ölçülür. `text` istenmişse kontrol bulunmayınca
 * çizili metin de "text" döner.
 */
export function coverHitsControl(
  cover: Box,
  points: ReadonlyArray<readonly [number, number]>,
  { exclude, unit, text = false }: { exclude: readonly Element[]; unit: number; text?: boolean },
  doc: Document = document,
): "control" | "text" | null {
  if (typeof doc.elementsFromPoint !== "function") return null;
  const decided = new Map<Element, boolean>();
  let textUnder = false;
  for (const [x, y] of points) {
    const under = elementUnder(exclude, x, y, doc);
    if (!under || under === doc.body || under === doc.documentElement) continue;
    const control = under.closest(INTERACTIVE_SELECTOR);
    if (control && control !== doc.body && control !== doc.documentElement) {
      let counts = decided.get(control);
      if (counts === undefined) {
        const parts = hitParts(control, x, y);
        const full = partsBox(parts);
        const kind = controlKind(control, full, unit);
        if (kind === "surface") {
          const vis = visiblePart(control, parts);
          const covered = vis ? intersect(cover, vis) : null;
          counts =
            !!vis &&
            !clippedToSliver(full, vis) &&
            area(covered) > SURFACE_MAX_COVERED_SHARE * area(vis);
        } else {
          counts = true;
        }
        decided.set(control, counts);
      }
      if (counts) return "control";
    }
    if (text && !textUnder && textAt(under, x, y, doc)) textUnder = true;
  }
  return textUnder ? "text" : null;
}

/**
 * Düğme DURDUĞU yerde bir kontrolün üstünde mi? Düğmenin dairesinde ızgara
 * noktaları yoklanır (`coverHitsControl`): ⋮, ×, Gönder, "Siparişe Git",
 * düğme görünümlü bağlantılar ve form alanları her zaman sayılır; liste
 * satırı, kart ve uzun başlık bağlantısı ancak görünen alanının büyük payı
 * örtülünce — yoksa liste sayfalarında düğme hiç görünmezdi.
 */
export function fabCoversControl(fab: HTMLElement, doc: Document = document): boolean {
  return fabCovers(fab, { text: false }, doc) !== null;
}

/**
 * Düğmenin altında ne var: "control" (yukarıdaki kural), `text` istenmişse
 * "text" (çizili bir metin — kontrol olmayan öğenin kendi metni; kural
 * istisnası olan başlık bağlantısının metni de) ya da null.
 */
export function fabCovers(
  fab: HTMLElement,
  { text }: { text: boolean },
  doc: Document = document,
): "control" | "text" | null {
  const r = fab.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return coverHitsControl(toBox(r), probePoints(r), { exclude: [fab], unit: Math.max(r.width, r.height), text }, doc);
}

/** Tam boy masaüstü düğmesinin kenarı (düğme ölçülemezken balonun birimi). */
const FULL_FAB_PX = 56;
/** Balonun altı bu aralıkla yoklanır (px). */
const GREETING_PROBE_STEP_PX = 16;

/**
 * Karşılama balonu (sağ-altta ~260×135) bir kontrolü örtüyor mu? Doğrulama
 * turu (2026-10, 1280×800 satınalma anasayfası): balon "Tümünü gör"
 * bağlantısını 6 sn örtüyor, tıklama asistanı açıyordu. Düğmeyle AYNI kural
 * (`coverHitsControl`), birim AI düğmesinin kenarı; balonun kendisi ve düğme
 * yoklanmaz: KÜÇÜK kontrol ve DÜĞME her örtüşmede, YÜZEY (kart, `after:` ile
 * karta yayılan başlık bağlantısı, kategori kutusu, liste satırı, uzun metin
 * bağlantısı) GÖRÜNEN alanının %25'inden fazlası örtülünce. Mobil denetim
 * 2026-10, beşinci tur: yüzey hiç sayılmazken balon 1280×800'de "Ağır İş
 * Ekipmanı" kutusunun %80'ini (simge ve ad tamamen altında), 1920×1080'de
 * kayan şeritteki son kartın görünen başlığını örtüyor; örtülen başlığa
 * tıklamak asistanı açıyordu. Bilinçli bedel: kartlarla dolu sayfada
 * (satınalma anasayfası, 1024–1600) balon çoğu konumda açılmaz; yer boşalınca
 * (1 sn arayla) ya da sonraki sayfada açılır.
 */
export function greetingCoversControl(
  bubble: HTMLElement,
  fab: HTMLElement | null,
  doc: Document = document,
): boolean {
  const r = bubble.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const f = fab?.getBoundingClientRect();
  const unit = f && f.width > 0 ? Math.max(f.width, f.height) : FULL_FAB_PX;
  const exclude = fab ? [bubble, fab] : [bubble];
  return coverHitsControl(toBox(r), gridPoints(toBox(r), GREETING_PROBE_STEP_PX), { exclude, unit }, doc) !== null;
}

/**
 * Kaydırma olayı SAYFANIN kendi kaydırması mı ve sayfa ilk görünümden gerçekten
 * kaydı mı? Taban (`base`) rota değişiminde okunan konumdur. Sayılmayanlar:
 *  · iç kaydırma kapları (tablo, şerit, çekmece) — ilk görünümün içeriği
 *    düğmenin altından çıkmaz;
 *  · konumu değiştirmeyen olay;
 *  · sol-üst köşeye (0, 0) dönüş — Next yeni sayfada görünümü başa alır ve o
 *    `scroll` olayı rota değişiminden SONRA gelebilir (kullanıcının ilk
 *    kaydırması her zaman en az bir olayda 0'dan farklı bir konum bildirir).
 */
export function isPageScrollEvent(
  e: Pick<Event, "target">,
  base: readonly [number, number],
  doc: Document = document,
): boolean {
  const t = e.target;
  const page = t === doc || t === doc.documentElement || t === doc.body || t === doc.scrollingElement;
  if (!page) return false;
  const win = doc.defaultView;
  if (!win) return false;
  const x = win.scrollX;
  const y = win.scrollY;
  if (x === base[0] && y === base[1]) return false;
  return x !== 0 || y !== 0;
}

/**
 * "modal"/"typing": düğme tümüyle çekilir (görünmez, odak almaz).
 * "covers": saydam ve tıklamayı geçirir ama klavyeyle odaklanabilir kalır;
 * odak gelince karar düşer ve düğme görünür.
 */
export type FabSuppression = "modal" | "typing" | "covers" | null;

/**
 * Düğmenin şu an çekilip çekilmediği (ve nedeni). `recheck` düğmenin kendi
 * konum geçişi bitince çağrılır (alt çubuğa kalkma animasyonu sırasında
 * ölçülen kutu ara konumdur).
 */
export function useFabSuppression({
  enabled,
  fabRef,
  panelOpen,
  routeKey,
}: {
  enabled: boolean;
  fabRef: RefObject<HTMLElement | null>;
  /** Asistan paneli açıkken düğme panelin altında kalır; örtüşme ölçülmez. */
  panelOpen: boolean;
  /**
   * Sayfanın kimliği (yol): değişince "sayfa kaydırıldı" bilgisi sıfırlanır ve
   * METİN kuralı yeni sayfanın ilk görünümünde yeniden geçerli olur.
   */
  routeKey?: string;
}): { suppressed: FabSuppression; recheck: () => void } {
  const [suppressed, setSuppressed] = useState<FabSuppression>(null);
  const scheduleRef = useRef<() => void>(() => {});
  const panelOpenRef = useRef(panelOpen);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
    scheduleRef.current();
  }, [panelOpen]);

  // Sayfadaki ilk kaydırma (METİN kuralı yalnız ondan önce). Taban konum rota
  // değişiminde okunur: Next'in başa alması bu efektten önce yapılmışsa taban
  // zaten yeni konumdur; sonra gelirse (0, 0) sayılmaz (`isPageScrollEvent`).
  const pageScrolledRef = useRef(false);
  const scrollBaseRef = useRef<readonly [number, number]>([0, 0]);
  useEffect(() => {
    pageScrolledRef.current = false;
    scrollBaseRef.current = [window.scrollX, window.scrollY];
    scheduleRef.current();
  }, [routeKey]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let scrolling = false;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    let covers = false;

    const measure = () => {
      raf = 0;
      if (modalDialogOpen()) {
        setSuppressed("modal");
        return;
      }
      const phone = isPhoneLike();
      if (phone && isEditableElement(document.activeElement)) {
        setSuppressed("typing");
        return;
      }
      const fab = fabRef.current;
      if (panelOpenRef.current || (fab && (document.activeElement === fab || hovered(fab)))) {
        // Panel açık, düğme odakta ya da imleç üstünde: kullanıcı düğmeyi
        // istiyor. (Üstüne gelince düğme 2 px kalkar; o kayma ölçümü
        // değiştirip düğmeyi imlecin altından çekmesin.)
        covers = false;
      } else if (!scrolling && fab) {
        // Kaydırma sürerken önceki karar korunur. Metin yalnız telefonda ve
        // yalnız sayfa henüz kaydırılmamışken (ilk görünüm).
        covers = fabCovers(fab, { text: phone && !pageScrolledRef.current }) !== null;
      }
      setSuppressed(covers ? "covers" : null);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    scheduleRef.current = schedule;

    const onScroll = (e: Event) => {
      if (!pageScrolledRef.current && isPageScrollEvent(e, scrollBaseRef.current)) {
        pageScrolledRef.current = true;
      }
      scrolling = true;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrolling = false;
        schedule();
      }, SCROLL_SETTLE_MS);
    };

    measure();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    // DOM değişmeden kayan yerleşim (görsel yüklenince uzayan sayfa) da
    // düğmenin altına bir kontrol getirebilir.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(document.body);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    // `scroll` kabarcıklanmaz: yakalama evresinde iç kaydırma kapları da duyulur.
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    const coarse =
      typeof window.matchMedia === "function" ? window.matchMedia("(pointer: coarse)") : null;
    coarse?.addEventListener?.("change", schedule);
    return () => {
      scheduleRef.current = () => {};
      if (raf) cancelAnimationFrame(raf);
      if (scrollTimer) clearTimeout(scrollTimer);
      mo.disconnect();
      ro?.disconnect();
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", schedule);
      coarse?.removeEventListener?.("change", schedule);
    };
  }, [enabled, fabRef]);

  const recheck = useCallback(() => scheduleRef.current(), []);
  return { suppressed: enabled ? suppressed : null, recheck };
}
