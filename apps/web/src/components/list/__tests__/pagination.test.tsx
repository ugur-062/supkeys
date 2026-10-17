// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Pagination } from "../pagination";
import { Pagination as PublicPagination } from "@/components/ui/pagination";

/**
 * Mobil denetim 2026-10 (g06/g07/g08): istemci sayfalaması yalnız satırları
 * değiştiriyordu; alttaki sayfalamaya dokunan kullanıcı yeni sayfanın
 * SONUNDA kalıyordu. Sayfa değişince liste başı sabit üst çubuğun altına
 * gelir; liste başı zaten görünüyorsa kaydırılmaz.
 */

let scrolled: { el: Element; margin: string }[] = [];
const rects = new Map<Element, Partial<DOMRect>>();

beforeEach(() => {
  scrolled = [];
  rects.clear();
  Element.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
    scrolled.push({ el: this, margin: this.style.scrollMarginTop });
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, ...rects.get(this) } as DOMRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
});

/** Sabit üst çubuk (panel `fixed h-14`) — jsdom yerleşim yapmaz, ölçü elle. */
function withTopBar(bottom: number) {
  const bar = document.createElement("header");
  bar.style.position = "fixed";
  document.body.appendChild(bar);
  rects.set(bar, { bottom });
  (document as { elementFromPoint?: unknown }).elementFromPoint = () => bar;
  return bar;
}

function ListPage({ onPageChange = () => {} }: { onPageChange?: (p: number) => void }) {
  return (
    <div>
      <h1>Başlık</h1>
      <section aria-label="Liste">satırlar</section>
      <Pagination variant="bare" page={1} totalPages={5} total={100} pageSize={20} onPageChange={onPageChange} />
    </div>
  );
}

describe("Pagination (panel listeleri) — sayfa değişince liste başı", () => {
  it("liste başı ekranın üstünde kaldıysa üst çubuğun altına kaydırır ve sayfayı değiştirir", () => {
    const bar = withTopBar(56);
    const onPageChange = vi.fn();
    render(<ListPage onPageChange={onPageChange} />);
    const list = screen.getByRole("region", { name: "Liste" });
    rects.set(list, { top: -2400 });

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]!.el).toBe(list);
    // 56 px çubuk + 12 px nefes; pay geçicidir, kaydırmadan sonra geri alınır.
    expect(scrolled[0]!.margin).toBe("68px");
    expect(list.style.scrollMarginTop).toBe("");
    bar.remove();
  });

  // Mobil kabuk (güvenli alan): çentikli telefonda çubuk üst pay kadar uzar
  // (56 + 47) ve kök `scroll-padding-top` aynı payı kaydırmaya ekler — geçici
  // pay onu DÜŞER, liste başı iki kez aşağı itilmez.
  it("güvenli alan: kökün scroll-padding-top'u geçici paydan düşülür", () => {
    const bar = withTopBar(103);
    document.documentElement.style.scrollPaddingTop = "47px";
    try {
      render(<ListPage />);
      const list = screen.getByRole("region", { name: "Liste" });
      rects.set(list, { top: -2400 });
      fireEvent.click(screen.getByRole("button", { name: "2" }));
      expect(scrolled).toHaveLength(1);
      // 103 + 12 − 47 (kök pay) = 68: liste başı çubuğun 12 px altına iner.
      expect(scrolled[0]!.margin).toBe("68px");
    } finally {
      document.documentElement.style.scrollPaddingTop = "";
      bar.remove();
    }
  });

  it("Sonraki sayfa da aynı yolu izler", () => {
    withTopBar(56);
    const onPageChange = vi.fn();
    render(<ListPage onPageChange={onPageChange} />);
    rects.set(screen.getByRole("region", { name: "Liste" }), { top: -900 });
    fireEvent.click(screen.getByRole("button", { name: "Sonraki sayfa" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
    expect(scrolled).toHaveLength(1);
  });

  it("liste başı zaten görünüyorsa kaydırmaz", () => {
    withTopBar(56);
    render(<ListPage />);
    rects.set(screen.getByRole("region", { name: "Liste" }), { top: 120 });
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(scrolled).toHaveLength(0);
  });

  it("bulunulan sayfaya dokunmak hiçbir şey yapmaz", () => {
    const onPageChange = vi.fn();
    render(<ListPage onPageChange={onPageChange} />);
    rects.set(screen.getByRole("region", { name: "Liste" }), { top: -900 });
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(onPageChange).not.toHaveBeenCalled();
    expect(scrolled).toHaveLength(0);
  });

  it("sayfalama bir sarmalayıcının içindeyse liste sarmalayıcının önceki kardeşidir", () => {
    render(
      <section>
        <ul aria-label="Ziyaretçiler">
          <li>a</li>
        </ul>
        <div>
          <Pagination variant="bare" page={1} totalPages={3} total={60} pageSize={20} onPageChange={() => {}} />
        </div>
      </section>,
    );
    const list = screen.getByRole("list", { name: "Ziyaretçiler" });
    rects.set(list, { top: -500 });
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(scrolled[0]?.el).toBe(list);
    // Üst çubuk yoksa yalnız nefes payı.
    expect(scrolled[0]?.margin).toBe("12px");
  });

  it("liste yoksa sayfa içeriğinin (main) dışına çıkıp kabuğun menüsünü kaydırmaz", () => {
    render(
      <div>
        <nav aria-label="Menü">menü</nav>
        <main>
          <Pagination variant="bare" page={1} totalPages={3} total={60} pageSize={20} onPageChange={() => {}} />
        </main>
      </div>,
    );
    rects.set(screen.getByRole("navigation", { name: "Menü" }), { top: -500 });
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(scrolled).toHaveLength(0);
  });

  it("telefonda numaralar ve boşluklar daralır, dokunma alanı 44 px yüksekliğe çıkar (sm+ aynı)", () => {
    render(<ListPage />);
    const nav = screen.getByRole("navigation", { name: "Sayfalama" });
    expect(nav.className.split(/\s+/)).toEqual(expect.arrayContaining(["gap-0.5", "sm:gap-1", "flex-wrap"]));
    const two = screen.getByRole("button", { name: "2" }).className.split(/\s+/);
    expect(two).toEqual(
      expect.arrayContaining(["h-8", "min-w-8", "px-1", "sm:px-2", "after:absolute", "after:-inset-y-1.5", "after:inset-x-0"]),
    );
  });
});

describe("Pagination (pazar/vitrin) — mobil genişlik ve istemci kipi", () => {
  it("telefonda 32 px yuva + 2 px boşluk (360 px'te 328 px'e sığar), sm ve üstünde 36 px + 4 px", () => {
    render(<PublicPagination page={1} total={8 * 24} pageSize={24} onChange={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Sayfalama" });
    expect(nav.className.split(/\s+/)).toEqual(expect.arrayContaining(["gap-0.5", "sm:gap-1", "flex-wrap"]));
    expect(nav.className).not.toMatch(/(^|\s)gap-1(\s|$)/);
    const item = screen.getByRole("button", { name: "Sayfa 2" }).className.split(/\s+/);
    expect(item).toEqual(
      expect.arrayContaining(["h-8", "min-w-8", "px-1", "sm:h-9", "sm:min-w-9", "sm:px-2", "after:-inset-y-1.5"]),
    );
    expect(item).not.toContain("h-9");
    // İlk sayfada "önceki" yuvasının yer tutucusu da daralır.
    const placeholder = nav.firstElementChild as HTMLElement;
    expect(placeholder.className.split(/\s+/)).toEqual(["size-8", "sm:size-9"]);
  });

  it("istemci kipinde (onChange) sayfa değişince liste başına döner", () => {
    withTopBar(56);
    const onChange = vi.fn();
    render(
      <div>
        <div data-testid="grid">ürünler</div>
        <div>
          <PublicPagination page={3} total={8 * 24} pageSize={24} onChange={onChange} />
        </div>
      </div>,
    );
    const grid = screen.getByTestId("grid");
    rects.set(grid, { top: -1800 });
    fireEvent.click(screen.getByRole("button", { name: "Sayfa 4" }));
    expect(onChange).toHaveBeenCalledWith(4);
    // Düğmenin kardeşi bir önceki sayfa numarasıdır — liste değil: köke çıkılır.
    expect(scrolled.map((s) => s.el)).toEqual([grid]);
  });

  it("bağlantı kipinde (hrefBuilder) gerçek bağlantılar çizer, kaydırmaya karışmaz", () => {
    render(<PublicPagination page={2} total={5 * 24} pageSize={24} hrefBuilder={(p) => `/urunler?sayfa=${p}`} />);
    expect(screen.getByRole("link", { name: "Sayfa 3" })).toHaveAttribute("href", "/urunler?sayfa=3");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Pagination — AI Asistan payı (mobil denetim 2026-10)", () => {
  it("'Sonraki sayfa' sm'den itibaren sağdaki düğmenin solunda kalır; telefonda sağ pay yok", () => {
    const { container } = render(
      <Pagination page={1} totalPages={3} total={60} pageSize={20} onPageChange={() => {}} variant="bare" />,
    );
    const root = container.querySelector("[data-pagination-root]")!;
    const classes = (root.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["sm:pr-18", "lg:pr-16", "xl:pr-14"]));
    // Telefon yerleşimi aynı: kırılımsız sağ pay yok.
    expect(classes.filter((c) => /^(?:pr|pe|px|p)-/.test(c))).toEqual([]);
    expect(screen.getByRole("button", { name: "Sonraki sayfa" })).toBeInTheDocument();
  });
});

