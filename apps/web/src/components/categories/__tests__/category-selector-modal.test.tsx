// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
      <CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "43211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("Kablo")).toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.queryByText("(silinmiş kategori)")).toBeNull();
  });

  it("multi: gerçek cevapta bulunmayan id 'silinmiş kategori' olarak kalır", () => {
    h.byIds = { data: [A], isPlaceholderData: false };
    render(
      <CategorySelectorModal isOpen onClose={() => {}} value={[A.id, "43211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("(silinmiş kategori)")).toBeInTheDocument();
  });

  it("single: placeholder önceki seçimi taşırken eski adı 'Seçili' diye göstermez", () => {
    h.byIds = { data: [A], isPlaceholderData: true };
    render(
      <CategorySelectorModal isOpen mode="single" onClose={() => {}} value={["43211500"]} onConfirm={() => {}} />,
    );
    expect(screen.getByText("✓ Seçili: …")).toBeInTheDocument();
    expect(screen.queryByText(/Kablo/)).toBeNull();
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
  it("adın tamamı gösterilir (sabit piksel tavanı ve kırpma yok), yol ipucunda segment harfi yok", () => {
    h.byIds = { data: [A], isPlaceholderData: false };
    render(<CategorySelectorModal isOpen onClose={() => {}} value={[A.id]} onConfirm={() => {}} />);
    const name = screen.getByText("Kablo");
    expect(name.className).not.toMatch(/max-w-\[\d+px\]|truncate/);
    expect(name.className).toContain("break-words");
    const chip = name.parentElement as HTMLElement;
    expect(chip.className).toContain("max-w-full");
    expect(chip).toHaveAttribute("title", "Elektrik › Kablo");
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
    // Sessizce düşürülmez: tek cümleyle söylenir.
    expect(screen.getByRole("status")).toHaveTextContent(/Aynı daldan tek seçim tutulur/);
    await user.click(screen.getByRole("button", { name: "Onayla (1)" }));
    expect(onConfirm).toHaveBeenCalledWith([COM.id]);
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
