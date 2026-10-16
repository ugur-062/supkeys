// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  controlKind,
  coverHitsControl,
  fabCovers,
  fabCoversControl,
  greetingCoversControl,
  hitBox,
  isButtonLike,
  isPageScrollEvent,
  isTransparentColor,
} from "../fab-suppression";

/**
 * `fab-suppression.ts` saf parçaları — doğrulama turu 2026-10 (g06/g08):
 * düğme görünümlü bağlantı tanıma, saydam renk, metin yoklaması ve
 * yuvarlak düğmenin dairesi.
 */
const rect = (left: number, top: number, w: number, h: number) =>
  ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top }) as DOMRect;

afterEach(() => {
  document.body.innerHTML = "";
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
  delete (Range.prototype as { getClientRects?: unknown }).getClientRects;
  vi.restoreAllMocks();
});

/** Görünüm alanı (jsdom varsayılanı 1024×768). */
function viewport(w: number, h: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
}
/** Kutusu sabit bir öğe. */
function boxed<K extends keyof HTMLElementTagNameMap>(tag: K, r: DOMRect, parent: Element = document.body) {
  const el = document.createElement(tag);
  if (el instanceof HTMLAnchorElement) el.href = "/x";
  el.getBoundingClientRect = () => r;
  parent.appendChild(el);
  return el;
}

describe("isTransparentColor", () => {
  it.each([
    ["", true],
    ["transparent", true],
    ["rgba(0, 0, 0, 0)", true],
    ["oklch(0.5 0.1 200 / 0)", true],
    ["oklab(0 0 0 / 0%)", true],
    ["rgb(0, 0, 0)", false],
    ["rgba(9, 9, 11, 0.1)", false],
    ["oklch(0.596 0.145 163.225)", false],
    ["oklch(0.596 0.145 163.225 / 0.9)", false],
  ])("%j → %s", (color, expected) => {
    expect(isTransparentColor(color)).toBe(expected);
  });
});

describe("isButtonLike", () => {
  it("zemini, çerçevesi ya da halkası olan alçak kontrol düğmedir", () => {
    const solid = document.createElement("a");
    solid.style.backgroundColor = "rgb(26, 156, 85)";
    const outline = document.createElement("a");
    outline.style.border = "1px solid rgba(9, 9, 11, 0.1)";
    const gradient = document.createElement("a");
    gradient.style.backgroundImage = "linear-gradient(red, blue)";
    const ring = document.createElement("button");
    ring.style.boxShadow = "rgba(212, 212, 216, 1) 0px 0px 0px 1px";
    document.body.append(solid, outline, gradient, ring);
    expect(isButtonLike(solid, 117, 32, 44)).toBe(true);
    expect(isButtonLike(outline, 138, 44, 44)).toBe(true);
    expect(isButtonLike(gradient, 100, 40, 44)).toBe(true);
    expect(isButtonLike(ring, 120, 36, 44)).toBe(true);
  });

  it("iki satıra kırılan çerçeveli bağlantı da düğmedir (RU 'Отправить сообщение' 155×68)", () => {
    const msg = document.createElement("a");
    msg.style.border = "1px solid rgba(9, 9, 11, 0.1)";
    document.body.appendChild(msg);
    expect(isButtonLike(msg, 155, 68, 44)).toBe(true);
    // 88 px'i aşan öğe düğme değildir.
    expect(isButtonLike(msg, 155, 96, 44)).toBe(false);
  });

  it("geniş öğe yalnız KISAYSA düğmedir: tam genişlik birincil düğme evet, satır yüksekliğindeki kart-satır hayır", () => {
    const cta = document.createElement("a");
    cta.style.backgroundColor = "rgb(30, 137, 223)";
    const cardRow = document.createElement("a");
    cardRow.style.border = "1px solid rgba(9, 9, 11, 0.1)";
    document.body.append(cta, cardRow);
    expect(isButtonLike(cta, 328, 44, 44)).toBe(true);
    expect(isButtonLike(cardRow, 358, 78, 44)).toBe(false);
  });

  it("form alanı çerçevesiz de olsa (88 px'e dek) düğmedir; geniş metin kutusu da", () => {
    const input = document.createElement("input");
    const area = document.createElement("textarea");
    document.body.append(input, area);
    expect(isButtonLike(input, 328, 40, 44)).toBe(true);
    expect(isButtonLike(area, 328, 88, 44)).toBe(true);
    expect(isButtonLike(area, 328, 140, 44)).toBe(false);
  });

  it("zeminsiz metin bağlantısı, arkasıyla aynı zemindeki satır, tek kenarlı ayraç ve saydam gölge düğme değildir", () => {
    const card = document.createElement("div");
    card.style.backgroundColor = "rgb(255, 255, 255)";
    const title = document.createElement("a");
    const whiteRow = document.createElement("a");
    whiteRow.style.backgroundColor = "rgb(255, 255, 255)";
    const divided = document.createElement("button");
    divided.style.borderBottom = "1px solid rgb(228, 228, 231)";
    const ghostBorder = document.createElement("a");
    ghostBorder.style.border = "1px solid transparent";
    const zeroShadow = document.createElement("button");
    zeroShadow.style.boxShadow = "rgba(0, 0, 0, 0) 0px 0px 0px 0px";
    card.append(title, whiteRow, divided, ghostBorder, zeroShadow);
    document.body.appendChild(card);
    for (const el of [title, whiteRow, divided, ghostBorder, zeroShadow]) {
      expect(isButtonLike(el, 120, 36, 44)).toBe(false);
    }
  });
});

describe("controlKind", () => {
  const b = (w: number, h: number) => ({ left: 0, top: 0, right: w, bottom: h });
  it("iki boyutu da düğmenin 3 katını aşmayan kontrol küçüktür", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    expect(controlKind(btn, b(44, 44), 44)).toBe("small");
    expect(controlKind(btn, b(132, 132), 44)).toBe("small");
    expect(controlKind(btn, b(168, 60), 56)).toBe("small");
  });

  it("telefon gelen kutusunun tam genişlik satır düğmesi (358×78) YÜZEYDİR; zeminli tam genişlik düğme düğmedir", () => {
    const row = document.createElement("button");
    const cta = document.createElement("button");
    cta.style.backgroundColor = "rgb(26, 156, 85)";
    document.body.append(row, cta);
    expect(controlKind(row, b(358, 78), 44)).toBe("surface");
    expect(controlKind(cta, b(328, 44), 44)).toBe("button");
  });

  it("zeminsiz ama kısa bağlantı dışı kontrol (düz düğme, <summary>, sekme) düğmedir; kısa metin bağlantısı ve etiket yüzeydir", () => {
    const plain = document.createElement("button");
    const summary = document.createElement("summary");
    const tab = document.createElement("div");
    tab.setAttribute("role", "tab");
    const link = document.createElement("a");
    link.href = "/x";
    const label = document.createElement("label");
    document.body.append(plain, summary, tab, link, label);
    // Telefon (birim 44): kısa = en çok 55 px.
    expect(controlKind(plain, b(240, 36), 44)).toBe("button");
    expect(controlKind(summary, b(290, 48), 44)).toBe("button");
    expect(controlKind(tab, b(170, 40), 44)).toBe("button");
    expect(controlKind(link, b(300, 40), 44)).toBe("surface");
    expect(controlKind(label, b(358, 44), 44)).toBe("surface");
    // Masaüstü (birim 56): ürün rayının "Öneriler · Göster" başlığı 320×44.
    expect(controlKind(summary, b(320, 44), 56)).toBe("button");
    // Satır yüksekliğindeki zeminsiz düğme yüzey kalır.
    expect(controlKind(plain, b(358, 60), 44)).toBe("surface");
  });
});

describe("hitBox — `::after` ile karta yayılan bağlantı", () => {
  /** jsdom sözde öğe çizmez: `getComputedStyle(el, "::after")` sahtesi. */
  function stretched(pseudo: Partial<Record<"position" | "content" | "top" | "right" | "bottom" | "left", string>>) {
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, which?: string | null) => {
      if (which === "::after") {
        return { position: "absolute", content: '""', display: "block", pointerEvents: "auto", visibility: "visible", top: "0px", right: "0px", bottom: "0px", left: "0px", ...pseudo } as unknown as CSSStyleDeclaration;
      }
      if (which === "::before") return { position: "static", content: "none" } as unknown as CSSStyleDeclaration;
      return real(el);
    });
  }

  it("kartın tamamı ölçülür (bağlantının kendi kutusu 111×36 değil)", () => {
    const card = boxed("div", rect(1180, 500, 240, 320));
    card.style.position = "relative";
    const title = boxed("a", rect(1200, 770, 111, 36), card);
    title.className = "after:absolute after:inset-0";
    stretched({});
    const box = hitBox(title);
    expect(box).toMatchObject({ left: 1180, top: 500, right: 1420, bottom: 820 });
    expect(controlKind(title, box, 56)).toBe("surface");
  });

  it("dokunma katmanı (`after:-inset-2`) kutuyu 8 px büyütür", () => {
    const btn = boxed("button", rect(1115, 697, 105, 29));
    btn.style.position = "relative";
    btn.className = "relative after:absolute after:-inset-2";
    stretched({ top: "-8px", right: "-8px", bottom: "-8px", left: "-8px" });
    expect(hitBox(btn)).toMatchObject({ left: 1107, top: 689, right: 1228, bottom: 734 });
  });

  /**
   * Mobil denetim 2026-10, beşinci tur: kart başlığı `h3.line-clamp-2`
   * (`overflow: hidden`) içinde; bağlantının `::after`ı kartın (ARTICLE)
   * tamamına yayılıyor. H3 o katmanı KIRPMAZ (kapsayan blok ARTICLE, H3 arada
   * kalıyor); kırpan yalnız ARTICLE ve onun ataları (kayan şerit). Eskiden
   * görünen kısım H3'e göre 38×35 px ölçülüyor, %45 örtülü sayılıp düğme
   * %20'si örtülen kartın yanında çekiliyordu.
   */
  it("görünen kısım: karta yayılan katmanı başlığın `line-clamp` kabı değil, kartın kendisi ve şerit kırpar", () => {
    viewport(390, 844);
    const strip = boxed("ul", rect(16, 677, 374, 312));
    strip.style.overflowX = "auto";
    const card = boxed("article", rect(340, 677, 160, 308), strip);
    card.style.position = "relative";
    card.style.overflowX = card.style.overflowY = "hidden";
    const h3 = boxed("h3", rect(352, 809, 136, 40), card);
    h3.style.overflowX = h3.style.overflowY = "hidden";
    const title = boxed("a", rect(352, 811, 106, 36), h3);
    title.className = "after:absolute after:inset-0";
    stretched({});
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [title]);
    const cover = { left: 334, top: 788, right: 378, bottom: 832 };
    // Görünen kart 50×167 px (şeridin ve ekranın içi); düğme %20'sini örter.
    expect(hitBox(title, 360, 820)).toMatchObject({ left: 340, top: 677, right: 500, bottom: 985 });
    expect(coverHitsControl(cover, [[360, 820]], { exclude: [], unit: 44 })).toBeNull();
    // Şerit kartın yalnız 34 px'ini gösteriyor: örtülen pay %26 → sayılır.
    strip.getBoundingClientRect = () => rect(16, 677, 358, 312);
    expect(coverHitsControl(cover, [[360, 820]], { exclude: [], unit: 44 })).toBe("control");
  });

  it("sınıfında `after:`/`before:` olmayan öğede sözde öğe ölçülmez", () => {
    const spy = vi.spyOn(window, "getComputedStyle");
    const link = boxed("a", rect(10, 10, 100, 20));
    expect(hitBox(link)).toMatchObject({ left: 10, top: 10, right: 110, bottom: 30 });
    expect(spy.mock.calls.some(([, which]) => which)).toBe(false);
  });
});

describe("coverHitsControl — yüzeyin görünen alanı", () => {
  it("yüzey, görünen alanının %25'inden fazlası örtülünce sayılır", () => {
    viewport(390, 844);
    const fab = document.createElement("button");
    document.body.appendChild(fab);
    // 160 px genişlikte kart ekranın sağ-altından taşıyor: görünen 90×40 px'in
    // %34'ünü düğme örter.
    const card = boxed("a", rect(300, 804, 160, 309));
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [fab, card]);
    const cover = { left: 334, top: 788, right: 378, bottom: 832 };
    const pts = [[356, 820]] as const;
    expect(coverHitsControl(cover, pts, { exclude: [fab], unit: 44 })).toBe("control");
    // Kart tamamen görünürken aynı köşe örtüşmesi sayılmaz.
    card.getBoundingClientRect = () => rect(214, 500, 160, 309);
    expect(coverHitsControl(cover, pts, { exclude: [fab], unit: 44 })).toBeNull();
  });

  it("görünen kısmı 24 px'ten dar yüzey (şeridin kenarından taşan kartın şeridi) sayılmaz", () => {
    viewport(390, 844);
    const strip = boxed("div", rect(16, 600, 358, 300));
    strip.style.overflowX = "auto";
    // Sonraki kart şeridin sağ kenarında 14 px görünüyor; düğme o şeridin %26'sını örter.
    const card = boxed("a", rect(360, 677, 160, 308), strip);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [card]);
    const cover = { left: 334, top: 788, right: 378, bottom: 832 };
    expect(coverHitsControl(cover, [[366, 810]], { exclude: [], unit: 44 })).toBeNull();
    // Aynı kart 30 px görünürken örtülen pay %26 → sayılır.
    card.getBoundingClientRect = () => rect(344, 677, 160, 308);
    expect(coverHitsControl(cover, [[366, 810]], { exclude: [], unit: 44 })).toBe("control");
  });

  /**
   * Gözden geçirme: 24 px kuralı görünen kısmın kendi boyuna bakınca tek
   * satırlık uzun metin bağlantısı (yükseklik ~18 px) hiç sayılmıyordu. Şerit
   * yalnız KIRPILARAK 24 px'in altına inen yüzeydir.
   */
  it("kendisi 24 px'ten ince metin bağlantısı şerit değildir: ucunun %25'inden fazlası örtülünce sayılır", () => {
    viewport(390, 844);
    // 150×18 bağlantı (telefonda küçük kontrol sınırı 132 px'i aşıyor → yüzey);
    // düğme sağ ucunun 44×18 px'ini (%29) örter.
    const link = boxed("a", rect(228, 800, 150, 18));
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [link]);
    const cover = { left: 334, top: 788, right: 378, bottom: 832 };
    expect(coverHitsControl(cover, [[356, 808]], { exclude: [], unit: 44 })).toBe("control");
    // Daha uzun bağlantının aynı ucu (%15) sayılmaz.
    link.getBoundingClientRect = () => rect(78, 800, 300, 18);
    expect(coverHitsControl(cover, [[356, 808]], { exclude: [], unit: 44 })).toBeNull();
  });

  it("kırpan ata (yatay şerit) görünen alanı daraltır", () => {
    viewport(390, 844);
    const strip = boxed("div", rect(0, 600, 390, 300));
    strip.style.overflowX = "auto";
    const card = boxed("a", rect(200, 790, 240, 60), strip);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [card]);
    // Ekranda kartın 190×54 px'i görünür; düğme bunun %18'ini örter.
    const cover = { left: 334, top: 788, right: 378, bottom: 832 };
    expect(coverHitsControl(cover, [[356, 810]], { exclude: [], unit: 44 })).toBeNull();
    // Şerit yalnız sağdaki 90 px'i gösteriyor: örtülen pay %38.
    strip.getBoundingClientRect = () => rect(300, 600, 90, 300);
    expect(coverHitsControl(cover, [[356, 810]], { exclude: [], unit: 44 })).toBe("control");
  });
});

describe("greetingCoversControl — karşılama balonu", () => {
  it("balonun altında küçük bağlantı varsa örter; yalnız metin/boşluk varsa örtmez", () => {
    viewport(1280, 800);
    const fab = boxed("button", rect(1192, 712, 56, 56));
    const bubble = boxed("div", rect(1000, 569, 260, 135));
    const link = boxed("a", rect(1135, 608, 105, 20));
    const text = boxed("p", rect(900, 560, 400, 200));
    const inLink = (x: number, y: number) => x >= 1135 && x <= 1240 && y >= 608 && y <= 628;
    const probe = vi.fn((x: number, y: number) => [bubble, inLink(x, y) ? link : text, document.body]);
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = probe;
    expect(greetingCoversControl(bubble, fab)).toBe(true);
    // Balonun kendisi ve düğme yoklanmaz; bağlantı yoksa örtüşme yok.
    link.remove();
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [bubble, text, document.body]);
    expect(greetingCoversControl(bubble, fab)).toBe(false);
  });

  /**
   * Mobil denetim 2026-10, beşinci tur: yüzey hiç sayılmazken balon 1280×800
   * satınalma anasayfasında "Ağır İş Ekipmanı" kutusunun (1038–1240 × 597–753)
   * %80'ini örtüyor, simgesi ve adı altında kalıyordu. Artık düğmeyle aynı
   * kural: yüzey görünen alanının %25'inden fazlası örtülecekse engel.
   */
  it("YÜZEY (kategori kutusu, kart, satır) görünen alanının %25'inden fazlası örtülecekse engel; daha azı değil", () => {
    viewport(1280, 800);
    const fab = boxed("button", rect(1192, 712, 56, 56));
    const bubble = boxed("div", rect(1000, 569, 260, 135));
    const inside = (el: Element, x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const under = { els: [] as Element[] };
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn((x: number, y: number) => [
      bubble,
      ...under.els.filter((el) => inside(el, x, y)),
      document.body,
    ]);
    // Kategori kutusu (bağlantı, 202×156): %69'u balonun altında.
    const tile = boxed("a", rect(1038, 597, 202, 156));
    under.els = [tile];
    expect(greetingCoversControl(bubble, fab)).toBe(true);
    // Yanındaki kutunun yalnız sağ ucu (36 px) balonun altında: %9.
    const card = boxed("a", rect(860, 400, 176, 321));
    under.els = [card];
    expect(greetingCoversControl(bubble, fab)).toBe(false);
    // Satır yüksekliğindeki tam genişlik satır (944×56): %25,4'ü örtülüyor — engel.
    const row = boxed("a", rect(296, 600, 944, 56));
    under.els = [row];
    expect(greetingCoversControl(bubble, fab)).toBe(true);
    // Kendi zemini olan geniş-kısa düğme (DÜĞME) ve küçük bağlantı her örtüşmede engel.
    const cta = boxed("button", rect(980, 690, 300, 40));
    cta.style.backgroundColor = "rgb(30, 137, 223)";
    under.els = [card, cta];
    expect(greetingCoversControl(bubble, fab)).toBe(true);
    under.els = [card, boxed("a", rect(1135, 608, 105, 20))];
    expect(greetingCoversControl(bubble, fab)).toBe(true);
    // Tek satırlık uzun metin bağlantısı (200×18, yüzey) balonun altında kalırsa
    // engel: ince olması onu kırpılmış şerit yapmaz.
    under.els = [card, boxed("a", rect(1020, 620, 200, 18))];
    expect(greetingCoversControl(bubble, fab)).toBe(true);
  });

  it("ölçülemeyen balon (0 boyut) ya da `elementsFromPoint` yokken örtmez", () => {
    const bubble = boxed("div", rect(0, 0, 0, 0));
    expect(greetingCoversControl(bubble, null)).toBe(false);
    bubble.getBoundingClientRect = () => rect(1000, 569, 260, 135);
    expect(greetingCoversControl(bubble, null)).toBe(false);
  });
});

describe("fabCovers", () => {
  function fabAt(r: DOMRect, under: (x: number, y: number) => Element | null) {
    const fab = document.createElement("button");
    fab.getBoundingClientRect = () => r;
    document.body.appendChild(fab);
    const probe = vi.fn((x: number, y: number) => {
      const el = under(x, y);
      return el ? [fab, el, document.body] : [fab, document.body];
    });
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = probe;
    return { fab, probe };
  }

  it("yalnız dairenin içindeki noktaları yoklar (köşeler dışarıda)", () => {
    const r = rect(304, 724, 44, 44);
    const { fab, probe } = fabAt(r, () => null);
    expect(fabCovers(fab, { text: true })).toBeNull();
    const cx = 326;
    const cy = 746;
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(9);
    for (const [x, y] of probe.mock.calls) expect(Math.hypot(x - cx, y - cy)).toBeLessThanOrEqual(20);
  });

  it("kontrolü ancak dairenin içindeyse sayar: kutunun köşesindeki ⋮ sayılmaz", () => {
    const kebab = document.createElement("button");
    kebab.getBoundingClientRect = () => rect(296, 716, 14, 14);
    document.body.appendChild(kebab);
    // Yalnız ⋮'nin kutusundaki noktada ⋮ döner.
    const { fab } = fabAt(rect(304, 724, 44, 44), (x, y) =>
      x >= 296 && x <= 310 && y >= 716 && y <= 730 ? kebab : null,
    );
    expect(fabCoversControl(fab)).toBe(false);
  });

  it("metin istenmediyse metin çekilme nedeni değildir; istenirse 'text'", () => {
    const p = document.createElement("p");
    const node = document.createTextNode("6.000,00 ₺");
    p.appendChild(node);
    document.body.appendChild(p);
    (Range.prototype as { getClientRects?: unknown }).getClientRects = function (this: Range) {
      return this.startContainer === node ? [rect(280, 738, 60, 17)] : [];
    };
    const { fab } = fabAt(rect(304, 724, 44, 44), () => p);
    expect(fabCovers(fab, { text: false })).toBeNull();
    expect(fabCovers(fab, { text: true })).toBe("text");
  });

  /**
   * Mobil denetim 2026-10, dördüncü doğrulama (s1-fab#v4new1): 390 TR ilk
   * görünümde şeridin sağ kenarından sonraki kartın başlığının 2 px'i
   * görünüyordu; metin kuralı o glifi sayıp düğmeyi çekiyordu. Yüzeyle aynı
   * pay: kırpılarak bir yönde 24 px'in altına inen satır sayılmaz.
   */
  it("kırpılarak 24 px'in altına inen metin satırı sayılmaz; 24 px'ten geniş görünen ve kendisi kısa olan sayılır", () => {
    viewport(390, 844);
    const strip = boxed("ul", rect(16, 600, 358, 300));
    strip.style.overflowX = "auto";
    const title = document.createElement("h3");
    const node = document.createTextNode("Modüler Bant Konveyör (Metre)");
    title.appendChild(node);
    strip.appendChild(title);
    let line = rect(372, 811, 82, 16);
    (Range.prototype as { getClientRects?: unknown }).getClientRects = function (this: Range) {
      return this.startContainer === node ? [line] : [];
    };
    const { fab } = fabAt(rect(334, 788, 44, 44), () => title);
    // Görünen 2×16 px.
    expect(fabCovers(fab, { text: true })).toBeNull();
    // Görünen 28×16 px.
    line = rect(346, 811, 82, 16);
    expect(fabCovers(fab, { text: true })).toBe("text");
    // Kendisi 24 px'ten kısa sözcük kırpılsa da şerit değildir.
    line = rect(368, 811, 18, 16);
    expect(fabCovers(fab, { text: true })).toBe("text");
    // Görünüm alanının dışına taşan satır da görünen kısmıyla ölçülür.
    strip.style.overflowX = "visible";
    line = rect(372, 811, 82, 16);
    viewport(374, 844);
    expect(fabCovers(fab, { text: true })).toBeNull();
  });

  it("kontrol metinden önce gelir", () => {
    const btn = document.createElement("button");
    btn.appendChild(document.createTextNode("Gönder"));
    btn.getBoundingClientRect = () => rect(290, 730, 60, 36);
    document.body.appendChild(btn);
    const { fab } = fabAt(rect(304, 724, 44, 44), () => btn);
    expect(fabCovers(fab, { text: true })).toBe("control");
  });

  it("ölçülemeyen düğme (0 boyut) ya da `elementsFromPoint` yokken hiçbir şey saymaz", () => {
    const fab = document.createElement("button");
    document.body.appendChild(fab);
    expect(fabCovers(fab, { text: true })).toBeNull();
    (document as { elementsFromPoint?: unknown }).elementsFromPoint = vi.fn(() => [fab]);
    fab.getBoundingClientRect = () => rect(0, 0, 0, 0);
    expect(fabCovers(fab, { text: true })).toBeNull();
  });
});

describe("isPageScrollEvent (METİN kuralı yalnız ilk kaydırmaya dek)", () => {
  function scrollTo(x: number, y: number) {
    Object.defineProperty(window, "scrollX", { configurable: true, writable: true, value: x });
    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: y });
  }
  afterEach(() => scrollTo(0, 0));

  it("sayfanın kendi kaydırması, tabandan farklı konumda sayılır", () => {
    scrollTo(0, 240);
    expect(isPageScrollEvent({ target: document }, [0, 0])).toBe(true);
    expect(isPageScrollEvent({ target: document.documentElement }, [0, 0])).toBe(true);
    expect(isPageScrollEvent({ target: document.body }, [0, 0])).toBe(true);
  });

  it("iç kaydırma kabı sayılmaz", () => {
    scrollTo(0, 240);
    const strip = document.createElement("div");
    expect(isPageScrollEvent({ target: strip }, [0, 0])).toBe(false);
  });

  it("konumu değiştirmeyen olay ve (0, 0)'a dönüş (yeni sayfada başa alma) sayılmaz", () => {
    scrollTo(0, 500);
    expect(isPageScrollEvent({ target: document }, [0, 500])).toBe(false);
    scrollTo(0, 0);
    expect(isPageScrollEvent({ target: document }, [0, 800])).toBe(false);
  });
});
