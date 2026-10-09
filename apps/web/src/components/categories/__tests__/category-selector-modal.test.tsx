// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim 2026-09-29:
 *  - yeni seçilen kategori, cevap gelene kadar (placeholder = önceki liste)
 *    "(silinmiş kategori)" görünüyordu; single modda eski seçimin adı kalıyordu
 *  - `validate` reddi modalı kapatmaz, taslak korunur
 *
 * Kayıt denetimi 2026-10 (category-*, code-category-*, signup-*): seçim şeridi
 * sınırlı, aile (L2) seçimi, dal başına tek seçim, adı eşleşen ailenin
 * sınıfları, çok kelimeli vurgu, yükleme hatası ayrı durum, kapatmadan önce
 * soru, arama kutusu (kısa yer tutucu / temizle / 2 karakter ipucu), a11y.
 *
 * 2026-10-08: firma beyanında sektör (L1) satırı da işaretlenir ve iki tavan
 * (sektör + sektör altındaki seçim) ayrı sayılır; talep formu değişmedi.
 */
type Node = { id: string; code: string; nameTr: string; level: number; _count?: { children: number } };
type Q<T> = { data: T; isLoading?: boolean; isError?: boolean; isFetching?: boolean; refetch?: () => void };

const h = vi.hoisted(() => ({
  byIds: { data: undefined as unknown, isPlaceholderData: false } as {
    data: unknown;
    isPlaceholderData: boolean;
    isError?: boolean;
    isFetching?: boolean;
    refetch?: () => void;
  },
  roots: { data: [] as unknown, isLoading: false } as Q<unknown>,
  /** parentId → çocuk sorgusu. Yoksa boş liste. */
  children: {} as Record<string, Q<unknown>>,
  search: { data: undefined as unknown, isLoading: false } as Q<unknown>,
  searchArgs: [] as unknown[][],
  byIdsArgs: [] as unknown[][],
  rootsArgs: [] as unknown[][],
}));

vi.mock("@/hooks/use-categories", () => ({
  useRoots: (...args: unknown[]) => {
    h.rootsArgs.push(args);
    return h.roots;
  },
  useCategorySearchTree: (...args: unknown[]) => {
    h.searchArgs.push(args);
    return h.search;
  },
  useChildren: (parentId: string) => h.children[parentId] ?? { data: [], isLoading: false },
  useCategoriesByIds: (...args: unknown[]) => {
    h.byIdsArgs.push(args);
    return h.byIds;
  },
}));

import { chipNeedsSplit, STRIP_CHIP_MAX_LINES, stripOverflow } from "../category-dialog-shell";
import { CategorySelectorModal, highlightRanges } from "../category-selector-modal";

const A = { id: "39121600", nameTr: "Kablo", breadcrumb: "AN. Elektrik › Kablo" };

// Küçük bir ağaç: 31 Üretim Bileşenleri › 3116 Hırdavat › 311617 Somunlar › 31161701 Ankraj somunları
const SEG: Node = { id: "31000000", code: "31000000", nameTr: "Üretim Bileşenleri", level: 1 };
const FAM: Node = { id: "31160000", code: "31160000", nameTr: "Hırdavat", level: 2, _count: { children: 2 } };
const FAM2: Node = { id: "31170000", code: "31170000", nameTr: "Rulmanlar", level: 2, _count: { children: 1 } };
const CLS: Node = { id: "31161700", code: "31161700", nameTr: "Somunlar", level: 3, _count: { children: 2 } };
const CLS2: Node = { id: "31161600", code: "31161600", nameTr: "Cıvatalar", level: 3, _count: { children: 0 } };
const COM: Node = { id: "31161701", code: "31161701", nameTr: "Ankraj somunları", level: 4 };
const COM2: Node = { id: "31161702", code: "31161702", nameTr: "Kör somunlar", level: 4 };

function seedTree() {
  h.roots = { data: [SEG], isLoading: false };
  h.children = {
    [SEG.id]: { data: [FAM, FAM2], isLoading: false },
    [FAM.id]: { data: [CLS, CLS2], isLoading: false },
    [CLS.id]: { data: [COM, COM2], isLoading: false },
  };
}

/** Sektör › aile › sınıf dalını açar (aile satırı iki kipte de bulunur). */
async function openToCommodities(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
  await user.click(screen.getByRole("button", { name: /^Hırdavat/ }));
  await user.click(screen.getByRole("button", { name: "Genişlet: Somunlar" }));
}

const searchBox = () => screen.getByRole("textbox", { name: "Kategori ara" });

beforeEach(() => {
  h.byIds = { data: undefined, isPlaceholderData: false };
  h.roots = { data: [], isLoading: false };
  h.children = {};
  h.search = { data: undefined, isLoading: false };
  h.searchArgs = [];
  h.byIdsArgs = [];
  h.rootsArgs = [];
});

/** Kısa ekranda (yükseklik ≤ 520 px) tek parça kayan bölüm — kabuğun çocuk sarmalayıcısı. */
const shortModeScroller = () =>
  document.querySelector('div[class*="[@media(max-height:520px)]:overflow-y-auto"]') as HTMLElement;

describe("CategorySelectorModal — seçim bilgisi yüklenirken", () => {
  it("multi: placeholder listede olmayan yeni seçim '…' gösterir, 'silinmiş' değil", () => {
    h.byIds = { data: [A], isPlaceholderData: true };
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "23211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("Kablo")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("(silinmiş kategori)")).toBeNull();
  });

  it("multi: gerçek cevapta bulunmayan id 'silinmiş kategori' olarak kalır", () => {
    h.byIds = { data: [A], isPlaceholderData: false };
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "23211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("(silinmiş kategori)")).toBeInTheDocument();
  });

  it("single: placeholder önceki seçimi taşırken eski adı 'Seçili' diye göstermez", () => {
    h.byIds = { data: [A], isPlaceholderData: true };
    render(
      <CategorySelectorModal isOpen mode="single" onClose={() => {}} value={["23211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("✓ Seçili: …")).toBeInTheDocument();
    expect(screen.queryByText(/Kablo/)).toBeNull();
  });
});

/**
 * GİZLİ SEGMENT (2026-10-09): pencere kataloğu SUNAN yüzeydir — eski kayıttaki
 * gizli kod seçim şeridine çip, sayaca sayı, onaya değer olarak GİRMEZ.
 */
describe("CategorySelectorModal — gizli segment kodu taslağa girmez", () => {
  it("değerdeki gizli kod çip olmaz ('silinmiş' de değil), adı sorulmaz, onayda dönmez", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    h.byIds = { data: [A], isPlaceholderData: false };
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={["46181500", A.id]} onConfirm={onConfirm} />,
    );
    expect(screen.getByText("Kablo")).toBeInTheDocument();
    expect(screen.queryByText("(silinmiş kategori)")).toBeNull();
    expect(screen.queryByText(/46181500/)).toBeNull();
    // Ad isteği yalnız görünür kimlikle çıkar.
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual([A.id]);
    // Sayaç ve onay yalnız görünür seçimi sayar/döndürür.
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([A.id]);
  });

  it("yalnız gizli kod taşıyan değer boş seçimle açılır", () => {
    h.byIds = { data: undefined, isPlaceholderData: false };
    render(
      <CategorySelectorModal isOpen mode="single" onClose={() => {}} value={["10151500"]} onConfirm={() => {}} />,
    );
    expect(screen.queryByText(/Seçili/)).toBeNull();
    expect(screen.queryByText(/10151500/)).toBeNull();
    expect(h.byIdsArgs.at(-1)?.[0]).toEqual([]);
  });
});

describe("CategorySelectorModal — validate", () => {
  it("red: onConfirm/onClose çağrılmaz, metin modal içinde gösterilir", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <CategorySelectorModal
        isOpen
        onClose={onClose}
        value={[A.id]}
        onConfirm={onConfirm}
        validate={() => "Seçimleriniz 6 ayrı sektöre yayılıyor"}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/6 ayrı sektöre/);
  });

  it("geçerli: onaylanır ve kapanır", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <CategorySelectorModal isOpen onClose={onClose} value={[A.id]} onConfirm={onConfirm} validate={() => null} />,
    );
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([A.id]);
    expect(onClose).toHaveBeenCalled();
  });
});

// Arayüz testi D-345: "Tümünü temizle" sonrası "Onayla" kapalı kalıyor,
// temizleme kaydedilemiyordu.
describe("CategorySelectorModal — boş seçimi onaylama", () => {
  it("başlangıçta seçim varsa temizleyip boş onaylanabilir", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    const onConfirm = vi.fn();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Tümünü temizle" }));
    const confirm = screen.getByRole("button", { name: "Onayla" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith([]);
  });

  it("hiç seçim yokken onay kapalı kalır", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
  });

  it("alt satır dar ekranda sarılır; düğme grubu küçülmez (RU 'Подтвердить (1)' taşmasın)", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    const group = screen.getByRole("button", { name: "Onayla" }).parentElement as HTMLElement;
    expect(group.className).toContain("shrink-0");
    expect(group.className).toContain("ml-auto");
    expect((group.parentElement as HTMLElement).className).toContain("flex-wrap");
  });
});

// category-1 / signup-tr-1 / code-category-10: şerit sınırsız büyüyor, liste
// 24 px'e iniyor, Vazgeç / Onayla pencerenin dışına itiliyordu.
describe("CategorySelectorModal — yerleşim sözleşmesi (50 seçimde alt satır görünür)", () => {
  it("seçim şeridi sınırlı yükseklikte ve kendi içinde kayar; yalnız liste küçülür", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `3116${String(1000 + i)}`);
    h.byIds = { data: ids.map((id) => ({ id, nameTr: `Kalem ${id}` })), isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={ids} onConfirm={() => {}} maxSelection={50} />);

    const strip = screen.getByRole("list", { name: "Seçimleriniz" });
    expect(within(strip).getAllByRole("listitem")).toHaveLength(50);
    expect(strip.className).toMatch(/\bmax-h-24\b/);
    expect(strip.className).toContain("overflow-y-auto");
    // Kaldırma düğmesi çipin 4 px dışına taşar; şerit bu yüzden yana KAYMAZ:
    // taşma şeridin kendi iç boşluğuna düşer ve x ekseni kapalıdır
    // (`overflow-y-auto` tek başına x eksenini de `auto` yapar).
    expect(strip.className).toMatch(/\boverflow-x-hidden\b/);
    expect(strip.className).toMatch(/(^|\s)pr-1(\s|$)/);
    expect(strip.className).toMatch(/(^|\s)-mr-1(\s|$)/);

    // Panelin doğrudan bölümleri: başlık ve alt satır küçülmez.
    const panel = document.querySelector('[id^="headlessui-dialog-panel"]') as HTMLElement;
    const footer = screen.getByRole("button", { name: "Onayla (50)" }).closest("div.border-t") as HTMLElement;
    expect(footer.className).toContain("shrink-0");
    expect((screen.getByRole("heading", { name: "Kategori Seç" }).closest("div.border-b") as HTMLElement).className).toContain("shrink-0");
    // Şeridin kendisi de küçülmez (yüksekliği zaten sınırlı) …
    expect((strip.closest("div.border-b") as HTMLElement).className).toContain("shrink-0");
    // … küçülen tek bölüm liste.
    const list = panel.querySelector("div.overflow-y-auto.flex-1") as HTMLElement;
    expect(list.className).toContain("min-h-0");
  });

  it("yükseklik `dvh` ile sınırlanır, `vh` ile değil (telefonda adres çubuğu)", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    const panel = document.querySelector('[id^="headlessui-dialog-panel"]') as HTMLElement;
    expect(panel.className).toContain("100dvh");
    expect(panel.className).not.toMatch(/\d(vh|svh|lvh)\b/);
    expect(panel.className).toContain("overflow-hidden");
  });
});

// category-7 / signup-enru-3 / signup-tr-21 / category-10.
describe("CategorySelectorModal — seçim çipleri", () => {
  it("ad sarılır (sabit piksel tavanı ve tek satır kırpması yok); şeritte en çok 3 satır, tamamı ipucunda; yol ipucunda segment harfi yok", () => {
    const B = { id: "39121700", nameTr: "Pano" };
    h.byIds = { data: [A, B], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id, B.id]} onConfirm={() => {}} />);
    const name = screen.getByText("Kablo");
    expect(name.className).not.toMatch(/max-w-\[\d+px\]|truncate/);
    expect(name.className).toContain("break-words");
    // CAT-D3: çok uzun ad şeridi tek başına doldurmasın — satır tavanı YALNIZ şeritte.
    expect(name.className).toMatch(new RegExp(`(^|\\s)line-clamp-${STRIP_CHIP_MAX_LINES}(\\s|$)`));
    const chip = name.parentElement as HTMLElement;
    expect(chip.className).toContain("max-w-full");
    expect(chip).toHaveAttribute("title", "Elektrik › Kablo");
    // Yol yoksa ipucu adın kendisi: kırpılan adın tamamı okunabilir kalır.
    expect(screen.getByText("Pano").parentElement).toHaveAttribute("title", "Pano");
  });

  it("kaldırma düğmesi öğeyi adıyla söyler ve en az 32 px'lik hedef taşır", async () => {
    const user = userEvent.setup();
    const B = { id: "39121700", nameTr: "Pano" };
    h.byIds = { data: [A, B], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id, B.id]} onConfirm={() => {}} />);
    const remove = screen.getByRole("button", { name: "Kablo seçimini kaldır" });
    expect(screen.getByRole("button", { name: "Pano seçimini kaldır" })).toBeInTheDocument();
    expect(remove.className).toMatch(/\bsize-8\b/);
    expect(screen.getByRole("button", { name: "Tümünü temizle" }).className).toMatch(/\bmin-h-8\b/);
    await user.click(remove);
    expect(screen.queryByText("Kablo")).toBeNull();
    expect(screen.getByRole("button", { name: "Onayla (1)" })).toBeInTheDocument();
  });

  it("klavyeyle kaldırınca odak sıradaki çipin düğmesine geçer (gövdeye düşmez)", async () => {
    const user = userEvent.setup();
    const B = { id: "39121700", nameTr: "Pano" };
    h.byIds = { data: [A, B], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id, B.id]} onConfirm={() => {}} />);
    screen.getByRole("button", { name: "Kablo seçimini kaldır" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Pano seçimini kaldır" })).toHaveFocus();
    await user.keyboard("{Enter}");
    // Çip kalmadı → arama kutusu.
    expect(searchBox()).toHaveFocus();
  });

  // webcat-9: "Tümünü temizle" yalnız seçim varken çizilir; basınca DOM'dan gider.
  it("'Tümünü temizle' klavyeyle: odak gövdeye düşmez, arama kutusuna geçer", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} />);
    screen.getByRole("button", { name: "Tümünü temizle" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("button", { name: "Tümünü temizle" })).toBeNull();
    expect(screen.getByText("0/20")).toBeInTheDocument();
    expect(searchBox()).toHaveFocus();
  });

  it("'Tümünü temizle' fare/dokunmayla: odak arama kutusuna TAŞINMAZ (ekran klavyesi açılmasın)", async () => {
    const user = userEvent.setup();
    h.byIds = { data: [A], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} />);
    await waitFor(() => expect(searchBox()).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Tümünü temizle" }));
    expect(screen.getByText("0/20")).toBeInTheDocument();
    expect(searchBox()).not.toHaveFocus();
  });
});

// Arayüz testi CAT-D3 (360×640, Rusça): dört satırlık sektör çipi şeridi tek
// başına dolduruyor, sayaç "3" derken tek çip görünüyordu; telefonda kaydırma
// çubuğu görünmediği için gerisinin varlığını hiçbir şey söylemiyordu.
describe("CategorySelectorModal — seçim şeridi kaydığını söyler, çok uzun çip şeridi doldurmaz (CAT-D3)", () => {
  const STRIP = "Seçimleriniz";
  const more = () => document.querySelector('[data-slot="strip-more"]') as HTMLElement | null;
  const fadeTop = () => document.querySelector('[data-slot="strip-fade-top"]');
  const fadeBottom = () => document.querySelector('[data-slot="strip-fade-bottom"]');

  /**
   * jsdom yerleşim hesaplamaz → şeridin ve çiplerin kutuları burada verilir:
   * şerit `viewHeight` px, çipler alt alta (`rows` = çip yükseklikleri, 4 px üst
   * boşluk + 8 px aralık — gerçek şeridin ölçüleri), kaydırma hesaba katılır.
   */
  function stubStripLayout(viewHeight: number, rows: number[]) {
    const rect = (top: number, height: number) =>
      ({ top, bottom: top + height, height, left: 0, right: 312, width: 312, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.tagName === "UL" && this.getAttribute("aria-label") === STRIP) return rect(0, viewHeight);
      const list = this.parentElement;
      if (this.tagName === "LI" && list?.getAttribute("aria-label") === STRIP) {
        const i = Array.from(list.children).indexOf(this);
        const top = 4 + rows.slice(0, i).reduce((sum, height) => sum + height + 8, 0) - list.scrollTop;
        return rect(top, rows[i] ?? 25);
      }
      return rect(0, 0);
    });
  }

  /** Ekli çipin (ad + satır içi ek) akış yüksekliği ve satır yüksekliği (20 px). */
  function stubRunHeight(height: () => number) {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.hasAttribute("data-chip-run") ? height() : 0;
    });
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = real(el, pseudo);
      if (!(el instanceof HTMLElement) || !el.hasAttribute("data-chip-run")) return style;
      return new Proxy(style, {
        get: (target, key) => (key === "lineHeight" ? "20px" : Reflect.get(target, key)),
      });
    });
  }

  const three = (names: [string, string, string]) => {
    const ids = [SEG.id, "31171500", "47130000"];
    h.byIds = { data: ids.map((id, i) => ({ id, nameTr: names[i] })), isPlaceholderData: false };
    return ids;
  };
  const renderCompany = (value: string[]) =>
    render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={value}
        onConfirm={() => {}}
        minSelectableLevel={1}
        singlePickPerBranch
        maxSelection={50}
        maxSectors={5}
      />,
    );

  afterEach(() => vi.restoreAllMocks());

  it("stripOverflow: kesilen tek çip 'kayıyor' demektir; SAYI yalnız yarıdan fazlası gizli çipleri sayar", () => {
    const view = { top: 0, bottom: 96 };
    // 65 px'lik çip + %76'sı görünen çip + tamamen gizli çip (testçinin ölçtüğü vaka, kırpmadan sonra).
    expect(stripOverflow(view, [{ top: 4, bottom: 69 }, { top: 77, bottom: 102 }, { top: 110, bottom: 135 }])).toEqual({ above: 0, below: 1, cut: true });
    // Son satırın yalnız 4 pikseli kesik: şerit kayar (ipucu var) ama gizli çip yok (sayı yok).
    expect(stripOverflow(view, [{ top: 4, bottom: 30 }, { top: 74, bottom: 100 }])).toEqual({ above: 0, below: 0, cut: true });
    // Sona kaydırılmış: yukarıda kalan sayılır; altta kesik yok.
    expect(stripOverflow(view, [{ top: -39, bottom: 26 }, { top: 34, bottom: 59 }, { top: 67, bottom: 92 }])).toEqual({ above: 1, below: 0, cut: false });
    // Kesirli ölçü payı (1 px): sığan çip kesik sayılmaz.
    expect(stripOverflow(view, [{ top: 70.6, bottom: 96.6 }])).toEqual({ above: 0, below: 0, cut: false });
    expect(stripOverflow(view, [])).toEqual({ above: 0, below: 0, cut: false });
  });

  it("chipNeedsSplit: akış 3 satırı aşınca böl; satır yüksekliği okunamazsa bölme", () => {
    expect(STRIP_CHIP_MAX_LINES).toBe(3);
    expect(chipNeedsSplit(80, 20)).toBe(true);
    expect(chipNeedsSplit(60, 20)).toBe(false);
    expect(chipNeedsSplit(60.5, 20)).toBe(false);
    expect(chipNeedsSplit(80, Number.NaN)).toBe(false);
    expect(chipNeedsSplit(80, 0)).toBe(false);
  });

  it("gizli çip varken alt kenarda '+N' ipucu durur; görsel ipucudur (aria-hidden, sekme sırasının dışında)", () => {
    stubStripLayout(96, [65, 25, 25]);
    renderCompany(three(["Malzeme Elleçleme ve Depolama Makineleri", "Rulmanlar", "Temizlik Malzemeleri"]));
    const pill = more();
    expect(pill).not.toBeNull();
    expect(pill).toHaveTextContent("+1");
    expect(pill).toHaveAttribute("aria-hidden", "true");
    expect(pill).toHaveAttribute("tabindex", "-1");
    expect(fadeBottom()).not.toBeNull();
    expect(fadeTop()).toBeNull();
    // Şeridin kendi sözleşmesi aynen: liste yine sınırlı ve kendi içinde kayar.
    const strip = screen.getByRole("list", { name: STRIP });
    expect(strip.className).toMatch(/\bmax-h-24\b/);
    expect(strip.className).toContain("overflow-y-auto");
    // İpucu listenin DIŞINDA: çip sayısı ve liste öğeleri değişmez.
    expect(within(strip).getAllByRole("listitem")).toHaveLength(3);
    expect(strip.contains(pill)).toBe(false);
  });

  it("hepsi sığıyorsa ipucu yok", () => {
    stubStripLayout(96, [25, 25]);
    h.byIds = { data: [A, { id: "39121700", nameTr: "Pano" }], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "39121700"]} onConfirm={() => {}} />);
    expect(more()).toBeNull();
    expect(fadeBottom()).toBeNull();
    expect(fadeTop()).toBeNull();
  });

  it("ipucuna basınca şerit aşağı kayar; sona gelince ipucu kalkar, üst kenar solar; odak taşınmaz", async () => {
    stubStripLayout(96, [65, 25, 25]);
    renderCompany(three(["Malzeme Elleçleme ve Depolama Makineleri", "Rulmanlar", "Temizlik Malzemeleri"]));
    const strip = screen.getByRole("list", { name: STRIP });
    await waitFor(() => expect(searchBox()).toHaveFocus());

    // `mousedown` engellenir: tarayıcı odağı düğmeye taşımaz (arama kutusunda kalır).
    expect(fireEvent.mouseDown(more()!)).toBe(false);
    fireEvent.click(more()!);
    expect(strip.scrollTop).toBeGreaterThan(0);
    expect(searchBox()).toHaveFocus();

    // Kullanıcı sona kaydırır (şerit 135 px içerik, 96 px görünür → 39 px + alt boşluk).
    strip.scrollTop = 43;
    fireEvent.scroll(strip);
    expect(more()).toBeNull();
    expect(fadeBottom()).toBeNull();
    expect(fadeTop()).not.toBeNull();

    // Başa dönünce ipucu geri gelir.
    strip.scrollTop = 0;
    fireEvent.scroll(strip);
    expect(more()).toHaveTextContent("+1");
    expect(fadeTop()).toBeNull();
  });

  it("yalnız birkaç pikseli kesilen son satır: sayısız ok (şerit kayıyor), satır soldurulmaz", () => {
    // 4 + 65 + 8 = 77 → ikinci çip 77..102: 96 px'lik şeritte 19 px'i görünür (%76).
    stubStripLayout(96, [65, 25]);
    h.byIds = { data: [A, { id: "39121700", nameTr: "Pano" }], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "39121700"]} onConfirm={() => {}} />);
    expect(more()).not.toBeNull();
    expect(more()!.textContent).toBe("");
    expect(more()!.querySelector("svg")).not.toBeNull();
    expect(fadeBottom()).toBeNull();
  });

  it("çip kaldırılınca ipucu yeniden ölçülür", async () => {
    const user = userEvent.setup();
    stubStripLayout(96, [45, 25, 25]);
    renderCompany(three(["Elektrik Malzemeleri", "Rulmanlar", "Temizlik Malzemeleri"]));
    // 4 + 45 + 8 + 25 + 8 = 90 → üçüncü çipin yalnız 6 pikseli görünür.
    expect(more()).toHaveTextContent("+1");
    await user.click(screen.getByRole("button", { name: "Rulmanlar seçimini kaldır" }));
    expect(more()).toBeNull();
  });

  it("ekli (sektörün tamamı) çip: ek adın peşinden akar; 3 satırı aşınca ad kırpılır ve ek KENDİ satırında kalır", () => {
    let runHeight = 80; // dört satır (360 px'te Rusça en uzun sektör adı)
    stubRunHeight(() => runHeight);
    const ids = three(["Оборудование для правоохранительных органов, национальной безопасности и охраны", "Rulmanlar", "Temizlik Malzemeleri"]);
    const view = renderCompany(ids);
    const [sector, product] = within(screen.getByRole("list", { name: STRIP })).getAllByRole("listitem");
    expect(sector.className).toMatch(/(^|\s)group\/chip(\s|$)/);

    const run = sector.querySelector("[data-chip-run]") as HTMLElement;
    const inline = run.querySelector("span.whitespace-nowrap") as HTMLElement;
    const row = sector.querySelector('[data-slot="chip-suffix-row"]') as HTMLElement;
    // Akış kipi (varsayılan): ad kırpılmaz, ek satır içinde, ek satırı gizli.
    expect(run.className).not.toMatch(/(^|\s)(line-clamp-\d|truncate)(\s|$)/);
    expect(inline).toHaveTextContent("· sektörün tamamı");
    expect(row.className).toMatch(/(^|\s)hidden(\s|$)/);
    // Bölünmüş kip sınıfları `<li>`deki işarete bağlı.
    expect(run.className).toContain("group-data-[split]/chip:line-clamp-2");
    expect(inline.className).toContain("group-data-[split]/chip:invisible");
    expect(row.className).toContain("group-data-[split]/chip:block");
    expect(row).toHaveTextContent("· sektörün tamamı");

    // Dört satır → şerit çipi böler; eksiz çip ölçülmez (düz CSS kırpması).
    expect(sector).toHaveAttribute("data-split");
    expect(product).not.toHaveAttribute("data-split");
    expect(product.querySelector("[data-chip-run]")).toBeNull();
    // Adın tamamı kaldırma düğmesinin adında ve ipucunda durur.
    expect(
      screen.getByRole("button", {
        name: "Оборудование для правоохранительных органов, национальной безопасности и охраны seçimini kaldır",
      }),
    ).toBeInTheDocument();
    expect(sector.querySelector("[title]")).toHaveAttribute(
      "title",
      "Оборудование для правоохранительных органов, национальной безопасности и охраны",
    );

    // Genişleyince (akış 3 satıra iner) çip kendiliğinden eski hâline döner.
    runHeight = 60;
    view.rerender(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={ids}
        onConfirm={() => {}}
        minSelectableLevel={1}
        singlePickPerBranch
        maxSelection={50}
        maxSectors={5}
      />,
    );
    expect(sector).not.toHaveAttribute("data-split");
  });
});

// category-5 / code-category-5 / signup-tr-3: düşen istek "sonuç yok", boş dal
// ya da kalıcı "…" olarak gösteriliyordu.
describe("CategorySelectorModal — yükleme hatası ayrı durumdur", () => {
  it("seçim adları: '…' yerine kod + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.byIds = { data: undefined, isPlaceholderData: false, isError: true, refetch };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} />);
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.queryByText("(silinmiş kategori)")).toBeNull();
    expect(screen.getByText(A.id)).toBeInTheDocument();
    expect(screen.getByText("Seçimlerinizin adları yüklenemedi.")).toBeInTheDocument();
    // Kaldırma düğmesi "… seçimini kaldır" demez.
    expect(screen.getByRole("button", { name: `${A.id} seçimini kaldır` })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("yeniden deneme yoldayken hata satırı kalkar: çip '…', liste dönen simge", async () => {
    const user = userEvent.setup();
    h.byIds = { data: undefined, isPlaceholderData: false, isError: true, isFetching: true };
    h.search = { data: undefined, isLoading: false, isError: true, isFetching: true };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("Seçimlerinizin adları yüklenemedi.")).toBeNull();
    await user.type(searchBox(), "kablo");
    await waitFor(() => expect(document.querySelector("svg.animate-spin")).not.toBeNull());
    expect(screen.queryByText(/Arama tamamlanamadı/)).toBeNull();
    expect(screen.queryByText(/sonuç bulunamadı/)).toBeNull();
  });

  it("arama: 'sonuç bulunamadı' değil hata + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.search = { data: undefined, isLoading: false, isError: true, refetch };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.type(searchBox(), "kablo");
    expect(await screen.findByText(/Arama tamamlanamadı/)).toBeInTheDocument();
    expect(screen.queryByText(/sonuç bulunamadı/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("arama gerçekten boşsa 'sonuç bulunamadı' kalır", async () => {
    const user = userEvent.setup();
    h.search = { data: { segments: [] }, isLoading: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.type(searchBox(), "zzz");
    expect(await screen.findByText("“zzz” için sonuç bulunamadı")).toBeInTheDocument();
  });

  it("ağaç dalı: boş dal değil hata + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    seedTree();
    const refetch = vi.fn();
    h.children[FAM.id] = { data: undefined, isLoading: false, isError: true, refetch };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
    await user.click(screen.getByRole("button", { name: /^Hırdavat/ }));
    expect(screen.getByText("Bu bölüm yüklenemedi.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("kök liste: 'Kategori bulunamadı' değil hata + 'Yeniden dene'", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    h.roots = { data: undefined, isLoading: false, isError: true, refetch };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    expect(screen.getByText(/Kategoriler yüklenemedi/)).toBeInTheDocument();
    expect(screen.queryByText(/Sistem yöneticisiyle/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Yeniden dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("hatayı satır içinde gösterdiği için sorguları 'inlineError' ile açar (çift toast yok)", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} />);
    expect(h.byIdsArgs.at(-1)?.[1]).toEqual({ inlineError: true });
    expect(h.searchArgs.at(-1)?.[2]).toEqual({ inlineError: true });
    // Sektör listesi de (webcat-6): hata listenin yerinde çiziliyor.
    expect(h.rootsArgs.at(-1)?.[0]).toEqual({ inlineError: true });
  });
});

// category-6 / code-category-3: firma beyanında aile (L2) seçilemiyordu.
describe("CategorySelectorModal — aile (L2) seçimi", () => {
  it("minSelectableLevel=2: aile satırı onay kutusu taşır ve işaretlenir; ada tıklamak dalı açar", async () => {
    const user = userEvent.setup();
    seedTree();
    const onConfirm = vi.fn();
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={onConfirm} minSelectableLevel={2} />,
    );
    await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
    await user.click(screen.getByRole("checkbox", { name: "Hırdavat" }));
    expect(screen.getByRole("button", { name: "Onayla (1)" })).toBeInTheDocument();
    // Ada tıklamak seçimi değiştirmez, dalı açar.
    await user.click(screen.getByRole("button", { name: /^Hırdavat/ }));
    expect(screen.getByRole("checkbox", { name: "Somunlar" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hırdavat" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([FAM.id]);
  });

  it("varsayılan (talep formu, en az L3): aile satırında onay kutusu YOK", async () => {
    const user = userEvent.setup();
    seedTree();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} catalog="discovery" />);
    await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
    expect(screen.queryByRole("checkbox", { name: "Hırdavat" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Hırdavat/ }));
    expect(screen.getByRole("checkbox", { name: "Somunlar" })).toBeInTheDocument();
  });

  it("tek aileli sektör: aile seçilebiliyorsa satırı atlanmaz (işaretlenebilsin), altı açık gelir", async () => {
    const user = userEvent.setup();
    seedTree();
    h.children[SEG.id] = { data: [FAM], isLoading: false };
    const { unmount } = render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} minSelectableLevel={2} />,
    );
    await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
    expect(screen.getByRole("checkbox", { name: "Hırdavat" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Somunlar" })).toBeInTheDocument();
    unmount();

    // L3 kipinde eski davranış: tek aile atlanır, sınıflar doğrudan gelir.
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
    expect(screen.queryByText("Hırdavat")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Somunlar" })).toBeInTheDocument();
  });
});

// category-13 / code-category-7 / signup-tr-11: sınıf + kendi emtiası birlikte
// işaretlenince sayaç 2 diyordu, onaydan sonra tek çip kalıyordu.
describe("CategorySelectorModal — dal başına tek seçim", () => {
  it("singlePickPerBranch: emtia işaretlenince sınıfı düşer; sayaç = onaylanan = 1", async () => {
    const user = userEvent.setup();
    seedTree();
    const onConfirm = vi.fn();
    render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={[]}
        onConfirm={onConfirm}
        minSelectableLevel={2}
        singlePickPerBranch
        maxSelection={50}
      />,
    );
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Somunlar" }));
    await user.click(screen.getByRole("checkbox", { name: "Ankraj somunları" }));

    expect(screen.getByRole("checkbox", { name: "Somunlar" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ankraj somunları" })).toBeChecked();
    expect(screen.getByText("1/50")).toBeInTheDocument();
    // Sessizce düşürülmez: tek cümleyle söylenir (bir seçim düştü → tekil).
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aynı daldan tek seçim tutulur; bu daldaki diğer seçiminiz kaldırıldı.",
    );
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([COM.id]);
  });

  // recategory-new-4: iki yaprak düşerken not "diğer seçiminiz" (tekil) diyordu.
  it("singlePickPerBranch: birden çok seçim düşünce not kaç seçimin kaldırıldığını söyler", async () => {
    const user = userEvent.setup();
    seedTree();
    render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={[]}
        onConfirm={() => {}}
        minSelectableLevel={2}
        singlePickPerBranch
        maxSelection={50}
      />,
    );
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Ankraj somunları" }));
    await user.click(screen.getByRole("checkbox", { name: "Kör somunlar" }));
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByText("3/50")).toBeInTheDocument();
    // Henüz hiçbir seçim düşmedi → not yok.
    expect(screen.queryByText(/Aynı daldan tek seçim tutulur/)).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: "Hırdavat" }));

    expect(screen.getByText("1/50")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aynı daldan tek seçim tutulur; bu daldaki diğer 3 seçiminiz kaldırıldı.",
    );
  });

  it("singlePickPerBranch: aile işaretlenince altındaki sınıf ve emtialar düşer; kardeş dal kalır", async () => {
    const user = userEvent.setup();
    seedTree();
    const onConfirm = vi.fn();
    render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={["39121600"]}
        onConfirm={onConfirm}
        minSelectableLevel={2}
        singlePickPerBranch
      />,
    );
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    await user.click(screen.getByRole("checkbox", { name: "Kör somunlar" }));
    await user.click(screen.getByRole("checkbox", { name: "Hırdavat" }));
    await user.click(screen.getByRole("button", { name: "Onayla (2)" }));
    // Başka sektördeki seçim (39…) aynı dal değil — dokunulmaz.
    expect(onConfirm).toHaveBeenCalledWith(["39121600", FAM.id]);
  });

  it("varsayılan (talep formu): sınıf ve emtiası birlikte kalır — davranış değişmedi", async () => {
    const user = userEvent.setup();
    seedTree();
    const onConfirm = vi.fn();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={onConfirm} catalog="discovery" />);
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Somunlar" }));
    await user.click(screen.getByRole("checkbox", { name: "Ankraj somunları" }));
    await user.click(screen.getByRole("button", { name: "Onayla (2)" }));
    expect(onConfirm).toHaveBeenCalledWith([CLS.id, COM.id]);
  });

  it("tavan: çağıranın sözcüğüyle uyarır (limitMessage); verilmezse genel metin", async () => {
    const user = userEvent.setup();
    seedTree();
    h.byIds = { data: [A], isPlaceholderData: false };
    const { unmount } = render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={[A.id]}
        onConfirm={() => {}}
        maxSelection={1}
        limitMessage="En fazla 1 ürün/hizmet seçebilirsiniz."
      />,
    );
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByRole("status")).toHaveTextContent("En fazla 1 ürün/hizmet seçebilirsiniz.");
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).not.toBeChecked();
    unmount();

    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} maxSelection={1} />);
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByRole("status")).toHaveTextContent("En fazla 1 kategori seçebilirsiniz");
  });
});

// 2026-10-08 (kullanıcı: "üst başlıktan seçemiyorlar"): firma beyanında sektörün
// tamamı ayrı bir bağlantının açtığı ikinci pencereden seçiliyordu; ağaçtaki
// sektör satırı yalnız aç/kapa başlığıydı. Artık `minSelectableLevel={1}` ile
// sektör satırı da işaretlenir. Talep formu (varsayılan, L3+) DEĞİŞMEDİ.
describe("CategorySelectorModal — sektör (L1) seçimi", () => {
  const S39: Node = { id: "39000000", code: "39000000", nameTr: "Elektrik Malzemeleri", level: 1 };
  const S40: Node = { id: "40000000", code: "40000000", nameTr: "Dağıtım Sistemleri", level: 1 };
  const S41: Node = { id: "41000000", code: "41000000", nameTr: "Laboratuvar Ekipmanları", level: 1 };
  const NOTE = "Sektörün tamamı seçili: bu sektördeki bütün ürün ve hizmetleri kapsar.";

  /**
   * Sektör kutusunun erişilebilir adı (inceleme CAT-R1): çıplak sektör adı
   * DEĞİL — kutu sektörün TAMAMINI beyan eder ve adı bunu söyler. Çıplak ad,
   * dalı açan düğmenin adıdır.
   */
  const whole = (name: string) => `${name} · sektörün tamamı`;
  const sectorBox = (name: string) => screen.getByRole("checkbox", { name: whole(name) });

  /** Firma beyanının pencereyi açtığı biçim. */
  function renderCompany(props: Partial<ComponentProps<typeof CategorySelectorModal>> = {}) {
    const onConfirm = vi.fn();
    render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={[]}
        onConfirm={onConfirm}
        minSelectableLevel={1}
        singlePickPerBranch
        maxSelection={50}
        maxSectors={5}
        limitMessage="En fazla 50 ürün/hizmet seçebilirsiniz."
        {...props}
      />,
    );
    return { onConfirm };
  }

  it("sektör satırı onay kutusu taşır: kutu sektörün TAMAMINI işaretler, ada tıklamak yalnız dalı açar", async () => {
    const user = userEvent.setup();
    seedTree();
    const { onConfirm } = renderCompany();
    const box = sectorBox("Üretim Bileşenleri");
    expect(box).not.toBeChecked();
    expect(screen.queryByText(NOTE)).toBeNull();

    // Ada tıklamak işaretlemez — ağaçta gezinen kullanıcı yanlışlıkla bütün
    // sektörü beyan etmesin.
    await user.click(screen.getByRole("button", { name: "Üretim Bileşenleri" }));
    expect(screen.getByRole("checkbox", { name: "Hırdavat" })).toBeInTheDocument();
    expect(box).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Daralt: Üretim Bileşenleri" })).toHaveAttribute("aria-expanded", "true");

    // Başlık satırında işaretlemenin tek yolu kutudur → dokunma hedefi kutunun
    // çevresinde 8 px büyütülür (telefonda 34, geniş ekranda 32 px); aile de aynı.
    for (const tick of [box, screen.getByRole("checkbox", { name: "Hırdavat" })]) {
      expect(tick.className).toMatch(/(^|\s)after:-inset-2(\s|$)/);
      expect(tick.className).toMatch(/(^|\s)after:absolute(\s|$)/);
      expect(tick.className).toMatch(/(^|\s)relative(\s|$)/);
    }

    await user.click(box);
    expect(box).toBeChecked();
    // İşaretli sektör, altındaki her şeyi kapsadığını söyler (alttaki kutular boş görünür).
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hırdavat" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([SEG.id]);
  });

  it("varsayılan (talep formu) ve aile kipinde sektör satırı onay kutusu TAŞIMAZ: tek aç/kapa düğmesi", async () => {
    seedTree();
    const { unmount } = render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} catalog="discovery" />,
    );
    // Kapalı ağaçta HİÇ onay kutusu yok (ada bakmadan: sektör kutusunun adı
    // "… · sektörün tamamı"dır, çıplak adla aramak boşuna geçerdi).
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Genişlet: Üretim Bileşenleri" })).toBeNull();
    expect(screen.getByRole("button", { name: "Üretim Bileşenleri" })).toHaveAttribute("aria-expanded", "false");
    // Tek rozetli sayaç: iki tavanlı rozetler yok.
    expect(screen.getByText("0/20")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="tallies"]')).toBeNull();
    unmount();

    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} minSelectableLevel={2} />);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(document.querySelector('[data-slot="tallies"]')).toBeNull();
  });

  it("dal kuralı sektörü de kapsar: sektör işaretlenince altındakiler, altından işaretlenince sektör düşer (bildirimle)", async () => {
    const user = userEvent.setup();
    seedTree();
    const { onConfirm } = renderCompany();
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Ankraj somunları" }));
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByText("Ürün / hizmet 2/50")).toBeInTheDocument();

    await user.click(sectorBox("Üretim Bileşenleri"));
    expect(sectorBox("Üretim Bileşenleri")).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ankraj somunları" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aynı daldan tek seçim tutulur; bu daldaki diğer 2 seçiminiz kaldırıldı.",
    );
    expect(screen.getByText("Sektör 1/5")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 0/50")).toBeInTheDocument();
    expect(screen.getByText(NOTE)).toBeInTheDocument();

    // İşaretli sektörün altından bir öğe: sektör işaretinin YERİNE geçer.
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(sectorBox("Üretim Bileşenleri")).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aynı daldan tek seçim tutulur; bu daldaki diğer seçiminiz kaldırıldı.",
    );
    expect(screen.queryByText(NOTE)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([CLS2.id]);
  });

  it("seçim şeridinde sektör çipi 'sektörün tamamı' olduğunu söyler; ürün çipi söylemez", () => {
    h.byIds = {
      data: [{ id: SEG.id, nameTr: "Üretim Bileşenleri", breadcrumb: "P. Üretim Bileşenleri" }, A],
      isPlaceholderData: false,
    };
    renderCompany({ value: [SEG.id, A.id] });
    const [sector, product] = within(screen.getByRole("list", { name: "Seçimleriniz" })).getAllByRole("listitem");
    expect(sector).toHaveTextContent("Üretim Bileşenleri · sektörün tamamı");
    expect(product.textContent).toBe("Kablo");
    // Ad aynı kalır: kaldırma düğmesi sektörü adıyla söyler.
    expect(screen.getByRole("button", { name: "Üretim Bileşenleri seçimini kaldır" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla (2)" })).toBeInTheDocument();
  });

  it("arama sonucunda sektör de işaretlenir (ada tıklamak da işaretler); talep formunda başlık kalır", async () => {
    const user = userEvent.setup();
    h.search = {
      data: {
        segments: [
          {
            id: SEG.id,
            code: SEG.code,
            nameTr: SEG.nameTr,
            level: 1,
            segmentLetter: "P",
            isMatch: true,
            families: [{ id: FAM.id, code: FAM.code, nameTr: "Hırdavat", level: 2, classes: [] }],
          },
        ],
      },
      isLoading: false,
    };
    const { onConfirm } = renderCompany();
    await user.type(searchBox(), "üretim");
    const box = await screen.findByRole("checkbox", { name: whole("Üretim Bileşenleri") });
    // Ad vurgu parçalarına bölünür (<mark>Üretim</mark> + " Bileşenleri"); jsdom
    // erişilebilir adı parçaları kırparak birleştirir → boşluk isteğe bağlı.
    await user.click(screen.getByRole("button", { name: /^Üretim\s*Bileşenleri$/ }));
    expect(box).toBeChecked();
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    // Altındaki aile de işaretlenebilir; işaretlenince sektörün yerine geçer.
    await user.click(screen.getByRole("checkbox", { name: "Hırdavat" }));
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([SEG.id]);
  });

  it("arama: altı boş dönen sektör firma beyanında çizilir (kendisi bir satır); talep formunda çizilmez", async () => {
    const user = userEvent.setup();
    h.search = {
      data: { segments: [{ id: SEG.id, code: SEG.code, nameTr: SEG.nameTr, level: 1, segmentLetter: "P", families: [] }] },
      isLoading: false,
    };
    const { unmount } = render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} catalog="discovery" />,
    );
    await user.type(searchBox(), "üretim");
    expect(await screen.findByText("“üretim” için sonuç bulunamadı")).toBeInTheDocument();
    unmount();

    renderCompany();
    await user.type(searchBox(), "üretim");
    expect(await screen.findByRole("checkbox", { name: whole("Üretim Bileşenleri") })).toBeInTheDocument();
  });

  it("iki tavan AYRI sayaçla gösterilir: sektör (yayılım) + sektör altındaki seçim", () => {
    h.byIds = { data: [A], isPlaceholderData: false };
    renderCompany({ value: [A.id] });
    // Tek "1/50" rozeti yerine iki adlı rozet.
    expect(screen.queryByText("1/50")).toBeNull();
    expect(screen.getByText("Sektör 1/5")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 1/50")).toBeInTheDocument();
    // Ekran okuyucu tam cümleyi duyar; görünen kısaltma ona gizli.
    expect(screen.getByText("Sektör 1/5")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("1 sektörde seçim var (en fazla 5)").className).toContain("sr-only");
    expect(screen.getByText("1 ürün/hizmet seçildi (en fazla 50)").className).toContain("sr-only");

    // Dar ekranda rozetler kendi satırına iner (360 px'te başlık + iki rozet +
    // "Tümünü temizle" tek satıra sığmaz); geniş ekranda başlığın yanında.
    const tallies = document.querySelector('[data-slot="tallies"]') as HTMLElement;
    for (const c of ["order-last", "basis-full", "flex-wrap", "sm:order-none", "sm:basis-auto"]) {
      expect(tallies.className.split(/\s+/)).toContain(c);
    }
    expect((tallies.parentElement as HTMLElement).className.split(/\s+/)).toContain("flex-wrap");
  });

  it("sektör tavanı: YENİ sektöre giren işaret reddedilir ve nedeni söylenir; var olan sektöre eklemek serbest", async () => {
    const user = userEvent.setup();
    seedTree();
    h.roots = { data: [SEG, S39, S40], isLoading: false };
    h.byIds = { data: [A], isPlaceholderData: false };
    renderCompany({ value: [A.id], maxSectors: 2 }); // A = 39… → sektör 1/2
    expect(screen.getByText("Sektör 1/2")).toBeInTheDocument();

    await user.click(sectorBox("Üretim Bileşenleri"));
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();

    // Üçüncü sektör: reddedilir, nedeni söylenir.
    await user.click(sectorBox("Dağıtım Sistemleri"));
    expect(sectorBox("Dağıtım Sistemleri")).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "En fazla 2 sektörde seçim yapabilirsiniz. Başka bir sektör eklemek için önce birini kaldırın.",
    );
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();

    // Zaten seçim olan sektörün TAMAMINI işaretlemek sektör sayısını değiştirmez.
    await user.click(sectorBox("Elektrik Malzemeleri"));
    expect(sectorBox("Elektrik Malzemeleri")).toBeChecked();
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 0/50")).toBeInTheDocument();

    // Tamamı işaretli sektörün altından seçim de (aynı sektör) serbest.
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).toBeChecked();
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 1/50")).toBeInTheDocument();
    // Aynı sektörden ikinci (kardeş dal) seçim de: sektör sayısı yine 2.
    await user.click(screen.getByRole("checkbox", { name: "Somunlar" }));
    expect(screen.getByRole("checkbox", { name: "Somunlar" })).toBeChecked();
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 2/50")).toBeInTheDocument();
  });

  it("sektör işareti ürün/hizmet tavanına girmez; tavan sektör altındaki seçimde çağıranın sözcüğüyle uyarır", async () => {
    const user = userEvent.setup();
    seedTree();
    h.roots = { data: [SEG, S40], isLoading: false };
    h.byIds = { data: [A], isPlaceholderData: false };
    renderCompany({ value: [A.id], maxSelection: 1, limitMessage: "En fazla 1 ürün/hizmet seçebilirsiniz." });
    expect(screen.getByText("Ürün / hizmet 1/1")).toBeInTheDocument();

    // Ürün/hizmet tavanı doluyken sektör işareti yine eklenir.
    await user.click(sectorBox("Dağıtım Sistemleri"));
    expect(sectorBox("Dağıtım Sistemleri")).toBeChecked();
    expect(screen.getByText("Sektör 2/5")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 1/1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla (2)" })).toBeInTheDocument();

    // Sektör altından ikinci seçim: reddedilir.
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("En fazla 1 ürün/hizmet seçebilirsiniz.");
  });

  // İnceleme CAT-R1: sektör kutusunun erişilebilir adı çıplak sektör adıydı —
  // yanındaki aç/kapa ve ad düğmesiyle aynı. Ekran okuyucu "Üretim Bileşenleri,
  // onay kutusu" diyor, Space'ten sonra yalnız "işaretli" duyuluyordu: kutunun
  // sektörün TAMAMINI beyan ettiğini (aile / sınıf kutuları tek öğedir) hiçbir
  // şey söylemiyordu. Açıklama satırı da kutuya bağlı değildi.
  it("erişilebilirlik: sektör kutusunun ADI 'sektörün tamamı' der; işaretliyken açıklaması kapsamı söyler", async () => {
    const user = userEvent.setup();
    seedTree();
    renderCompany();
    const box = sectorBox("Üretim Bileşenleri");
    // Çıplak ad kutunun adı değildir: o ad dalı açan düğmeye aittir.
    expect(screen.queryByRole("checkbox", { name: "Üretim Bileşenleri" })).toBeNull();
    expect(screen.getByRole("button", { name: "Üretim Bileşenleri" })).toBeInTheDocument();
    expect(box).not.toHaveAttribute("aria-description");

    // Klavyeyle: odak kutuda, Space. Hiçbir seçim düşmediği için bildirim de
    // çıkmaz — anlamı kutunun adı ve açıklaması taşır.
    box.focus();
    await user.keyboard(" ");
    expect(box).toBeChecked();
    expect(screen.queryByRole("status")).toBeNull();
    // Açıklama görünen satırla AYNI metindir (aria-describedby'ı Headless
    // Checkbox kendi değeriyle ezer; aria-description yerinde kalır).
    expect(box).toHaveAttribute("aria-description", NOTE);
    expect(box).toHaveAccessibleDescription(NOTE);
    expect(screen.getByText(NOTE)).toBeInTheDocument();

    // Aile ve sınıf kutuları TEK öğedir: adları yalnız kendi adlarıdır.
    await openToCommodities(user);
    for (const name of ["Hırdavat", "Somunlar", "Ankraj somunları"]) {
      const tick = screen.getByRole("checkbox", { name });
      expect(tick).toHaveAccessibleName(name);
      expect(tick).not.toHaveAttribute("aria-description");
    }

    // İşaret kalkınca açıklama da kalkar.
    box.focus();
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
    expect(box).not.toHaveAttribute("aria-description");
  });

  it("erişilebilirlik: arama sonucundaki sektör kutusu da aynı adı ve açıklamayı taşır", async () => {
    const user = userEvent.setup();
    h.search = {
      data: {
        segments: [
          {
            id: SEG.id,
            code: SEG.code,
            nameTr: SEG.nameTr,
            level: 1,
            segmentLetter: "P",
            isMatch: true,
            families: [{ id: FAM.id, code: FAM.code, nameTr: "Hırdavat", level: 2, classes: [] }],
          },
        ],
      },
      isLoading: false,
    };
    renderCompany();
    await user.type(searchBox(), "üretim");
    const box = await screen.findByRole("checkbox", { name: whole("Üretim Bileşenleri") });
    expect(screen.queryByRole("checkbox", { name: "Üretim Bileşenleri" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Hırdavat" })).toHaveAccessibleName("Hırdavat");
    expect(box).not.toHaveAttribute("aria-description");
    await user.click(box);
    expect(box).toBeChecked();
    expect(box).toHaveAttribute("aria-description", NOTE);
  });

  // İnceleme CAT-R2: e2e kayıt yardımcısı (`e2e/signup-flow.ts`
  // `kategoriAraVeSec`) "penceredeki ilk onay kutusu"na tıklıyordu; sektör
  // satırı kutu taşıdığından bu, kapalı ağacın ilk sektörüydü (sektörün tamamı)
  // ve arama hiç sınanmıyordu. Yardımcı artık sonuç ağacının ÜÇÜNCÜ düzeyindeki
  // ilk kutuya tıklar ve "Ürün / hizmet 1/…" sayacını doğrular. O dosya yerelde
  // koşulamaz; dayandığı DOM sözleşmesi burada kilitlidir — bu test kırılırsa
  // yardımcıdaki konum da güncellenmelidir.
  it("e2e sözleşmesi: kapalı ağaçta üçüncü düzey liste yok; arama sonucunda oradaki ilk kutu SINIF satırıdır", async () => {
    const user = userEvent.setup();
    seedTree();
    h.roots = { data: [SEG, S39], isLoading: false };
    h.search = {
      data: {
        segments: [
          {
            id: SEG.id,
            code: SEG.code,
            nameTr: SEG.nameTr,
            level: 1,
            segmentLetter: "P",
            families: [
              {
                id: FAM.id,
                code: FAM.code,
                nameTr: "Hırdavat",
                level: 2,
                classes: [
                  {
                    id: CLS.id,
                    code: CLS.code,
                    nameTr: "Somunlar",
                    level: 3,
                    isMatch: true,
                    commodities: [{ id: COM.id, code: COM.code, nameTr: "Ankraj somunları", level: 4, isMatch: true }],
                  },
                ],
              },
            ],
          },
        ],
      },
      isLoading: false,
    };
    renderCompany();
    const dialog = screen.getByRole("dialog");
    const classLevelTick = () => dialog.querySelector('ul ul ul [role="checkbox"]');

    // Sonuç gelmeden: kutular var (sektörler) ama hiçbiri üçüncü düzeyde değil
    // → yardımcının konumu eşleşmez, sonucu BEKLER.
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    expect(classLevelTick()).toBeNull();

    await user.type(searchBox(), "somun");
    const somunlar = await screen.findByRole("checkbox", { name: "Somunlar" });
    // Penceredeki İLK kutu sektördür (eski adımın tıkladığı); üçüncü düzeydeki
    // ilk kutu sınıf satırıdır (aile ikinci, emtia dördüncü düzeyde).
    expect(within(dialog).getAllByRole("checkbox")[0]).toBe(sectorBox("Üretim Bileşenleri"));
    expect(classLevelTick()).toBe(somunlar);

    // Sınıf işareti "Ürün / hizmet" sayacına girer …
    await user.click(somunlar);
    expect(screen.getByText("Ürün / hizmet 1/50")).toBeInTheDocument();
    expect(screen.getByText("Sektör 1/5")).toBeInTheDocument();
    // … sektörün tamamı girmez: yardımcının doğruladığı fark budur.
    await user.click(sectorBox("Üretim Bileşenleri"));
    expect(screen.getByText("Ürün / hizmet 0/50")).toBeInTheDocument();
    expect(screen.getByText("Sektör 1/5")).toBeInTheDocument();
  });

  // İnceleme 2026-10-08 (ek gözlem): tavanın ÜSTÜNDE kayıtlı eski beyanda
  // (Ayarlar ekranı eskiden 10 sektöre izin veriyordu) sektörün tamamı yerine o
  // sektörden bir öğe işaretlemek — ya da tersi — "en fazla N sektör" diye
  // reddediliyordu. Oysa sektör EKLENMİYOR: tavan, dal kuralı sektör işaretini
  // düşürdükten SONRA kalanlara bakıyor ve aynı sektörü "yeni" sayıyordu.
  it("sektör tavanı tam ölçülür: tavanın üstündeki kayıtlı beyanda AYNI sektör içindeki değişim serbest, yeni sektör yasak", async () => {
    const user = userEvent.setup();
    seedTree();
    h.roots = { data: [SEG, S39, S40, S41], isLoading: false };
    // Üç sektörün tamamı kayıtlı, tavan 2 → 3/2 (eski veri).
    renderCompany({ value: [SEG.id, S39.id, S40.id], maxSectors: 2 });
    expect(screen.getByText("Sektör 3/2")).toBeInTheDocument();

    // Sektörün tamamı → aynı sektörden bir sınıf: sektör sayısı değişmez.
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).toBeChecked();
    expect(sectorBox("Üretim Bileşenleri")).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aynı daldan tek seçim tutulur; bu daldaki diğer seçiminiz kaldırıldı.",
    );
    expect(screen.getByText("Sektör 3/2")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 1/50")).toBeInTheDocument();

    // Tersi de: sınıf → aynı sektörün tamamı.
    await user.click(sectorBox("Üretim Bileşenleri"));
    expect(sectorBox("Üretim Bileşenleri")).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).not.toBeChecked();
    expect(screen.getByText("Sektör 3/2")).toBeInTheDocument();
    expect(screen.getByText("Ürün / hizmet 0/50")).toBeInTheDocument();

    // YENİ (dördüncü) sektör: reddedilir, nedeni söylenir.
    await user.click(sectorBox("Laboratuvar Ekipmanları"));
    expect(sectorBox("Laboratuvar Ekipmanları")).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(
      "En fazla 2 sektörde seçim yapabilirsiniz. Başka bir sektör eklemek için önce birini kaldırın.",
    );
    expect(screen.getByText("Sektör 3/2")).toBeInTheDocument();

    // Bir sektör kaldırılınca tavana inilir (2/2); kaldırılan sektör artık
    // YENİ sektördür — geri eklenemez (tavanın üstüne dönüş yok).
    await user.click(sectorBox("Dağıtım Sistemleri"));
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();
    await user.click(sectorBox("Dağıtım Sistemleri"));
    expect(sectorBox("Dağıtım Sistemleri")).not.toBeChecked();
    expect(screen.getByText("Sektör 2/2")).toBeInTheDocument();
  });
});

// code-category-1 / signup-tr-4 / category-18: adı eşleşen ailenin sınıfları
// API'den `isMatch=false`, emtiasız gelir; eskiden hiç çizilmiyordu.
describe("CategorySelectorModal — arama sonuçları", () => {
  const cls = (id: string, nameTr: string, isMatch: boolean, commodities: unknown[] = []) => ({
    id,
    code: id,
    nameTr,
    level: 3,
    isMatch,
    commodities,
  });
  const tree = (families: unknown[]) => ({
    segments: [{ id: SEG.id, code: SEG.code, nameTr: SEG.nameTr, level: 1, segmentLetter: "P", families }],
  });

  it("adı eşleşen ailenin sınıfları listelenir ve işaretlenir (isMatch=false, emtiasız)", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    h.search = {
      data: tree([
        {
          id: FAM.id,
          code: FAM.code,
          nameTr: "Hırdavat",
          level: 2,
          classes: [cls("31161500", "Vidalar", false), cls("31161600", "Cıvatalar", false), cls("31162800", "Muhtelif hırdavat", true)],
        },
      ]),
      isLoading: false,
    };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={onConfirm} />);
    await user.type(searchBox(), "hırdavat");
    const vidalar = await screen.findByRole("checkbox", { name: "Vidalar" });
    expect(screen.getByRole("checkbox", { name: "Cıvatalar" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Muhtelif hırdavat" })).toBeInTheDocument();
    // Aile adı da vurgulanır (başlık "vurgusuz" kalıyordu).
    expect(document.querySelectorAll("mark")).toHaveLength(2);
    await user.click(vidalar);
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith(["31161500"]);
  });

  it("emtiası eşleşen sınıf da işaretlenebilir satırdır; emtialar altında kalır", async () => {
    const user = userEvent.setup();
    h.search = {
      data: tree([
        {
          id: FAM.id,
          code: FAM.code,
          nameTr: "Hırdavat",
          level: 2,
          classes: [cls(CLS.id, "Somunlar", false, [{ id: COM.id, code: COM.id, nameTr: "Ankraj somunları", level: 4, isMatch: true }])],
        },
      ]),
      isLoading: false,
    };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.type(searchBox(), "ankraj");
    expect(await screen.findByRole("checkbox", { name: "Somunlar" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Ankraj somunları" })).toBeInTheDocument();
  });

  it("boş başlık çizilmez: sınıfı olmayan aile ve ailesi kalmayan sektör gizlenir", async () => {
    const user = userEvent.setup();
    h.search = {
      data: {
        segments: [
          { id: "41000000", code: "41000000", nameTr: "Laboratuvar Ekipmanı", level: 1, segmentLetter: "Y", families: [{ id: "41110000", code: "41110000", nameTr: "Kan üretimi", level: 2, classes: [] }] },
          { id: SEG.id, code: SEG.code, nameTr: SEG.nameTr, level: 1, segmentLetter: "P", families: [{ id: FAM.id, code: FAM.code, nameTr: "Hırdavat", level: 2, classes: [cls("31161500", "Vidalar", false)] }] },
        ],
      },
      isLoading: false,
    };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.type(searchBox(), "üretim");
    expect(await screen.findByRole("checkbox", { name: "Vidalar" })).toBeInTheDocument();
    expect(screen.queryByText("Laboratuvar Ekipmanı")).toBeNull();
    expect(screen.queryByText("Kan üretimi")).toBeNull();
  });

  it("aile seçilebiliyorsa (firma) arama sonucundaki aile de onay kutusu taşır", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    h.search = {
      data: tree([{ id: FAM.id, code: FAM.code, nameTr: "Hırdavat", level: 2, classes: [cls("31161500", "Vidalar", false)] }]),
      isLoading: false,
    };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={onConfirm} minSelectableLevel={2} />);
    await user.type(searchBox(), "hırdavat");
    await user.click(await screen.findByRole("checkbox", { name: "Hırdavat" }));
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([FAM.id]);
  });

  it("çok kelimeli sorguda vurgu kaybolmaz (kelimeler ayrı ayrı, sıra önemsiz)", async () => {
    const user = userEvent.setup();
    h.search = {
      data: tree([{ id: "30100000", code: "30100000", nameTr: "Yapısal malzemeler", level: 2, classes: [cls("30102500", "Sac ve paslanmaz yassı mamul", true)] }]),
      isLoading: false,
    };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.type(searchBox(), "paslanmaz sac");
    await screen.findByRole("checkbox", { name: "Sac ve paslanmaz yassı mamul" });
    expect([...document.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Sac", "paslanmaz"]);
  });
});

describe("highlightRanges — aramayla aynı kural", () => {
  const cut = (text: string, q: string) =>
    highlightRanges(text, q).map(([a, b]) => Array.from(text).slice(a, b).join(""));

  it("kelimeler ayrı aranır; bağlaç ve tek harf atılır", () => {
    expect(cut("Sac ve paslanmaz yassı mamul", "paslanmaz sac")).toEqual(["Sac", "paslanmaz"]);
    expect(cut("Boru ve bağlantı elemanları", "boru ve fittings")).toEqual(["Boru"]);
  });

  it("katlanmış eşleşme: İ/ı, aksansız yazım, Kiril й", () => {
    expect(cut("İskele sistemleri", "iskele")).toEqual(["İskele"]);
    expect(cut("Jeneratörler", "jenerator")).toEqual(["Jeneratör"]);
    // Arama metni й → и katlar; vurgu da aynı katlamayla bulur.
    expect(cut("Крайний болт", "краини")).toEqual(["Крайни"]);
    expect(cut("Насосы и компрессоры", "НАСОС")).toEqual(["Насос"]);
  });

  it("yazılan biçim geçmiyorsa kök vurgulanır (ek toleransı: 'boruları' → 'boru')", () => {
    expect(cut("Çelik borular", "çelik boruları")).toEqual(["Çelik", "boru"]);
    expect(cut("Steel pipe fittings", "pipes")).toEqual(["pipe"]);
  });

  // recategory-new-5: "and" her satırda boyanıyordu (81 vurgu).
  it("İngilizce ve Rusça bağlaçlar vurgulanmaz", () => {
    const q = "Manufacturing Components and Supplies";
    expect(cut("Manufacturing Components and Supplies", q)).toEqual(["Manufacturing", "Components", "Supplies"]);
    expect(cut("Sand castings and casting assemblies", q)).toEqual([]);
    expect(cut("Permanent mold castings and components", q)).toEqual(["components"]);
    expect(cut("Parts for the top of the unit or the base", "parts for the top of base or unit")).toEqual([
      "Parts",
      "top",
      "unit",
      "base",
    ]);
    expect(cut("Оборудование для сварки и пайки", "оборудование для сварки или пайки")).toEqual([
      "Оборудование",
      "сварки",
      "пайки",
    ]);
    // Bağlacı İÇEREN sözcük elenmez.
    expect(cut("Android tablets", "android")).toEqual(["Android"]);
  });

  // category-2 + recategory-new-3: kök API ile aynı fonksiyondan (categorySearchStem).
  it("üst üste Türkçe ek ve Rusça çekim: aramanın bulduğu kök vurgulanır", () => {
    expect(cut("Rulmanlar ve yataklar", "rulmanlarının")).toEqual(["Rulman"]);
    expect(cut("Borular, boru hatları", "borularının")).toEqual(["Boru", "boru"]);
    expect(cut("Hidrolik pompalar", "hidrolik pompası")).toEqual(["Hidrolik", "pompa"]);
    expect(cut("Оборудование для сварки и пайки", "сварка")).toEqual(["сварк"]);
    expect(cut("Электрические кабели и аксессуары", "кабель")).toEqual(["кабел"]);
    expect(cut("Сварные стальные трубы", "стальная труба")).toEqual(["стальн", "труб"]);
  });

  it("kök yalnız SÖZCÜK BAŞINDA vurgulanır; yazılan biçim sözcük içinde de", () => {
    // "nakliye" → kök "nakli": "kayNAKLIlı" içinde boyanmaz (API de eşleştirmez).
    expect(cut("Solvent kaynaklı boru düzenekleri", "nakliye")).toEqual([]);
    expect(cut("Nakliyat sandıkları (nakliyat)", "nakliye")).toEqual(["Nakli", "nakli"]);
    // Yazılan biçim eskisi gibi alt dizgi: "yağ" → "Tereyağı".
    expect(cut("Tereyağı", "yağ")).toEqual(["yağ"]);
  });

  it("örtüşen aralıklar birleşir; eşleşme yoksa boş", () => {
    expect(cut("Kablo kabloları", "kablo kablolar")).toEqual(["Kablo", "kablolar"]);
    expect(cut("Vidalar", "somun")).toEqual([]);
    expect(cut("Vidalar", "   ")).toEqual([]);
  });
});

// category-19: Escape / dış tıklama taslağı sormadan atıyordu.
describe("CategorySelectorModal — onaylanmamış değişiklikle kapatma", () => {
  async function dirtyModal(onClose = vi.fn()) {
    const user = userEvent.setup();
    const B = { id: "39121700", nameTr: "Pano" };
    h.byIds = { data: [A, B], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={onClose} value={[A.id, B.id]} onConfirm={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Pano seçimini kaldır" }));
    return { user, onClose };
  }

  it("Escape önce sorar; 'Seçime dön' taslağı korur", async () => {
    const { user, onClose } = await dirtyModal();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    const ask = screen.getByRole("alertdialog", { name: "Seçimleriniz onaylanmadı" });
    // Odak güvenli seçenekte.
    expect(within(ask).getByRole("button", { name: "Seçime dön" })).toHaveFocus();
    await user.click(within(ask).getByRole("button", { name: "Seçime dön" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Onayla (1)" })).toBeInTheDocument();
  });

  it("soru açıkken ikinci Escape soruyu kapatır, pencereyi değil", async () => {
    const { user, onClose } = await dirtyModal();
    await user.keyboard("{Escape}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("'Onaylamadan kapat' kapatır", async () => {
    const { user, onClose } = await dirtyModal();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Onaylamadan kapat" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("X düğmesi de sorar", async () => {
    const { user, onClose } = await dirtyModal();
    await user.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("dış tıklama (perde) da sorar", async () => {
    const { user, onClose } = await dirtyModal();
    const backdrop = document.querySelector("div.fixed.inset-0.flex") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("'Vazgeç' sormadan kapatır", async () => {
    const { user, onClose } = await dirtyModal();
    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  // Tasarım kuralı: güvenli seçenek birincil düğmedir; taslağı atan düz düğme.
  it("soruda 'Seçime dön' dolgulu (birincil), 'Onaylamadan kapat' düz düğmedir", async () => {
    const { user } = await dirtyModal();
    await user.keyboard("{Escape}");
    const ask = screen.getByRole("alertdialog");
    const back = within(ask).getByRole("button", { name: "Seçime dön" });
    const discard = within(ask).getByRole("button", { name: "Onaylamadan kapat" });
    // Catalyst: dolgulu düğme zeminini `--btn-bg` katmanından alır; düz düğmede o katman yok.
    expect(back.className).toContain("before:bg-(--btn-bg)");
    expect(discard.className).not.toContain("before:bg-(--btn-bg)");
    expect(discard.className).toContain("border-transparent");
    // DOM sırası: güvenli → atan (ekran okuyucu ve Tab güvenli seçenekten başlar).
    expect(within(ask).getAllByRole("button")).toEqual([back, discard]);
  });

  it("soru düğmeleri metne göre yerleşir: sığarsa yan yana, sığmazsa alt alta (kırılım noktasıyla değil)", async () => {
    const { user } = await dirtyModal();
    await user.keyboard("{Escape}");
    const row = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Seçime dön" })
      .parentElement as HTMLElement;
    const classes = row.className.split(/\s+/);
    expect(classes).toContain("flex");
    expect(classes).toContain("flex-wrap");
    // Sağdan dolar: yan yana iken birincil sağda, sarınca birincil üstte.
    expect(classes).toContain("flex-row-reverse");
    // Genişliğe bağlı zorla alt alta dizme yok.
    expect(row.className).not.toMatch(/flex-col/);
  });

  // webcat-3: Headless Dialog Escape'te `onClose`dan önce odağı düşürür
  // (`document.activeElement.blur()`); soru kapanınca odak <body>'de kalıyordu.
  it("Escape ile açılan soru kapanınca odak kullanıcının bıraktığı öğeye döner", async () => {
    const user = userEvent.setup();
    seedTree();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await openToCommodities(user);
    const box = screen.getByRole("checkbox", { name: "Ankraj somunları" });
    box.focus();
    await user.keyboard(" ");
    expect(box).toBeChecked();

    // "Seçime dön" (Enter) yolu.
    await user.keyboard("{Escape}");
    expect(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Seçime dön" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.body).not.toHaveFocus();
    expect(screen.getByRole("checkbox", { name: "Ankraj somunları" })).toHaveFocus();

    // İkinci Escape yolu.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Ankraj somunları" })).toHaveFocus();
  });

  it("X düğmesiyle açılan soru kapanınca odak X düğmesine döner", async () => {
    const { user } = await dirtyModal();
    const close = screen.getByRole("button", { name: "Kapat" });
    await user.click(close);
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Seçime dön" }));
    expect(close).toHaveFocus();
  });

  it("değişiklik yoksa Escape ve X sormadan kapatır (sıra farkı değişiklik değildir)", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    h.byIds = { data: [A], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={onClose} value={[A.id]} onConfirm={() => {}} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

// category-9 / category-16 / category-4 / signup-enru-6 / category-12.
describe("CategorySelectorModal — arama kutusu ve erişilebilirlik", () => {
  it("pencere açılınca odak arama kutusundadır", async () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await waitFor(() => expect(searchBox()).toHaveFocus());
  });

  it("yer tutucu kısadır; örnekler kutunun altında yardımcı metindir", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    expect(searchBox()).toHaveAttribute("placeholder", "Kategori ara");
    expect(searchBox()).toHaveAccessibleDescription("Örnek: çelik, kablo, vinç, kaynak");
  });

  it("tek karakterde 'en az 2 karakter' ipucu; arama başlamaz", async () => {
    const user = userEvent.setup();
    seedTree();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    await user.type(searchBox(), "b");
    expect(screen.getByRole("status")).toHaveTextContent("Aramak için en az 2 karakter yazın.");
    // Ağaç yerinde.
    expect(screen.getByRole("button", { name: "Üretim Bileşenleri" })).toBeInTheDocument();
    await user.type(searchBox(), "o");
    expect(screen.queryByText("Aramak için en az 2 karakter yazın.")).toBeNull();
  });

  it("temizle düğmesi aramayı boşaltır, ağaca döner ve odağı kutuya verir", async () => {
    const user = userEvent.setup();
    seedTree();
    h.search = { data: { segments: [] }, isLoading: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    expect(screen.queryByRole("button", { name: "Aramayı temizle" })).toBeNull();
    await user.type(searchBox(), "zzz");
    await screen.findByText("“zzz” için sonuç bulunamadı");
    const clear = screen.getByRole("button", { name: "Aramayı temizle" });
    expect(clear.className).toMatch(/\bsize-8\b/);
    await user.click(clear);
    expect(searchBox()).toHaveValue("");
    expect(searchBox()).toHaveFocus();
    // Gecikmeli değer beklenmeden ağaç geri gelir.
    expect(screen.getByRole("button", { name: "Üretim Bileşenleri" })).toBeInTheDocument();
  });

  it("aç/kapa düğmeleri aria-expanded taşır (sektör, aile, sınıf)", async () => {
    const user = userEvent.setup();
    seedTree();
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    const seg = screen.getByRole("button", { name: "Üretim Bileşenleri" });
    expect(seg).toHaveAttribute("aria-expanded", "false");
    await user.click(seg);
    expect(seg).toHaveAttribute("aria-expanded", "true");
    const fam = screen.getByRole("button", { name: /^Hırdavat/ });
    expect(fam).toHaveAttribute("aria-expanded", "false");
    await user.click(fam);
    expect(fam).toHaveAttribute("aria-expanded", "true");
    const cls = screen.getByRole("button", { name: "Genişlet: Somunlar" });
    expect(cls).toHaveAttribute("aria-expanded", "false");
    await user.click(cls);
    expect(screen.getByRole("button", { name: "Daralt: Somunlar" })).toHaveAttribute("aria-expanded", "true");
  });
});

// webcat-2: çok kısa ekranda (yatay telefon, yükseklik ≤ 520 px) aradaki bölümün
// tamamı tek parça kayar. Bildirim liste bloğunun tepesine konumlanınca (ya da
// listenin üstünde sıradan satır olunca) kaydırılmış listede görüş alanının
// dışında kalıyordu: tavan uyarısı görünmüyor, reddedilen "Onayla" ölü duruyordu.
describe("CategorySelectorModal — bildirimler kısa ekranda da görünür", () => {
  /** Bildirim bloğu: kayan bölümün DOĞRUDAN çocuğu ve o kipte tepeye yapışık. */
  function expectStuckToScroller(notice: HTMLElement) {
    const slot = notice.closest('[class*="max-height:520px"][class*=":sticky"]') as HTMLElement;
    expect(slot).not.toBeNull();
    expect(slot.className).toContain("[@media(max-height:520px)]:sticky");
    expect(slot.className).toContain("[@media(max-height:520px)]:top-0");
    expect(slot.className).toMatch(/\bz-10\b/);
    // Kaydıran öğenin doğrudan çocuğu → kaydırma boyunca yapışık kalır
    // (liste bloğunun içinde olsaydı blokla birlikte kayardı).
    expect(slot.parentElement).toBe(shortModeScroller());
    // Liste bloğunun içinde değil.
    const list = document.querySelector("div.overflow-y-auto.flex-1") as HTMLElement;
    expect(list.contains(notice)).toBe(false);
    return slot;
  }

  it("tavan uyarısı: kayan bölümün tepesine yapışan blokta; yerleşimi itmez", async () => {
    const user = userEvent.setup();
    seedTree();
    h.byIds = { data: [A], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} maxSelection={1} />);
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("En fazla 1 kategori seçebilirsiniz");
    expectStuckToScroller(notice);
    // Listenin üstüne biner: sıfır yükseklikli çapada mutlak konumlu.
    expect(notice.className).toMatch(/\babsolute\b/);
    expect((notice.parentElement as HTMLElement).className).toMatch(/\bh-0\b/);
  });

  it("onay reddi: aynı blokta, tavan uyarısının üstünde (ikisi üst üste binmez)", async () => {
    const user = userEvent.setup();
    seedTree();
    h.byIds = { data: [A], isPlaceholderData: false };
    render(
      <CategorySelectorModal
        isOpen
        onClose={() => {}}
        value={[A.id]}
        onConfirm={() => {}}
        maxSelection={1}
        validate={() => "Seçimleriniz 6 ayrı sektöre yayılıyor"}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    const alert = screen.getByRole("alert");
    const slot = expectStuckToScroller(alert);
    // Ret satırı yer kaplar (mutlak konumlu değil): kendiliğinden kaybolmaz.
    expect(alert.className).not.toMatch(/\babsolute\b/);

    // Ret dururken tavan uyarısı gelirse aynı blokta, retten SONRA çizilir.
    await openToCommodities(user);
    await user.click(screen.getByRole("checkbox", { name: "Cıvatalar" }));
    const notice = screen.getByRole("status");
    expect(notice.closest('[class*=":sticky"]')).toBe(slot);
    expect(alert.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent(/6 ayrı sektöre/);
  });

  it("bildirim yokken blok çizilmez", () => {
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[]} onConfirm={() => {}} />);
    expect(shortModeScroller().querySelector('[class*=":sticky"]')).toBeNull();
  });
});
