// @vitest-environment jsdom
/**
 * SATINALMA ANASAYFASI — kategori vitrini FOTOĞRAFSIZ (2026-10-10, sahip:
 * "satınalma sayfasında kategorilerde fotoğraflar var, halbuki değiştirmiştik,
 * fotoğraf değil ikonlar vardı").
 *
 * İkon kararı 2026-09-21'de yalnız herkese açık anasayfaya uygulanmış, panel
 * `visual` vermediği için varsayılanla fotoğraf çizmeyi sürdürmüştü. Bu test
 * sayfanın vitrini fotoğrafa dönerse kırmızı olur.
 *
 * Vitrin GERÇEK: `CategoryShowcaseRows` + `CategoryTile`, `buildShowcase` (58
 * segmentin fotoğraf yolunu veriye KOYAR) ve `toShowcaseRows`. Sahte olanlar
 * yalnız `companyApi`, hero ve ürün kartı (öteki sayfa testi
 * `page-outage.test` vitrini de sahteler; burada bilerek sahtelenmez).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isHiddenCategory } from "@rothern/shared";
import { categoryPhotoSrc } from "@/lib/public/category-photos";
import { MAPPED_SEGMENTS } from "@/lib/public/category-visual";

const h = vi.hoisted(() => ({ get: vi.fn<(url: string) => Promise<{ data: unknown }>>() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/company/satinalma",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: null, company: { tier: "GOLD", name: "Acme", slug: "acme" } }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/components/dashboard/panel-hero-search", () => ({
  PanelHeroSearch: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/marketplace/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <span>{product.name}</span>,
}));

import SatinalmaDashboardPage from "../page";

/* API'nin döndürdüğü sektörler: eşleme tablosundaki 58 segmentin TAMAMI (gizli
   olanlar dahil — sayfa ikinci kat olarak süzer). Görünür sayı elle yazılmaz,
   paylaşılan kuraldan okunur (bugün 28). */
const ALL_CODES = MAPPED_SEGMENTS.map((code) => `${code}000000`);
const VISIBLE_CODES = ALL_CODES.filter((code) => !isHiddenCategory(code));
const nameOf = (code: string) => (code === "39000000" ? "Elektrik Sistemleri" : `Sektör ${code.slice(0, 2)}`);
const SEGMENTS = ALL_CODES.map((id) => ({ id, nameTr: nameOf(id), slug: `sektor-${id.slice(0, 2)}` }));
const PRODUCTS = {
  items: [{ slug: "vida-m8", name: "Vida M8", company: { slug: "acme", name: "Acme" } }],
  total: 1,
  page: 1,
  pageSize: 16,
};

let client: QueryClient;

beforeEach(() => {
  h.get.mockReset();
  h.get.mockImplementation(async (url: string) => {
    if (url.startsWith("/categories/segments")) return { data: SEGMENTS };
    // Ürünü olan dal öne geçer → ilk bloğun tanıtım kartı (sayısıyla).
    if (url.startsWith("/company/items/discover/facets")) {
      return { data: { categories: [{ id: "39000000", name: "Elektrik Sistemleri", count: 12 }] } };
    }
    if (url.startsWith("/company/items/discover/search")) return { data: PRODUCTS };
    return { data: [] };
  });
  localStorage.clear();
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

/**
 * Sayfayı çizer ve vitrinin SON hâlini bekler: sektörler ve sayaçlar ayrı
 * sorgulardır; ürünü olan dal (39) ancak sayaçlar gelince ilk bloğun tanıtım
 * kartı olur. Vitrin kökünü ve bloklarını (`<section>`) döner.
 */
async function drawShowcase() {
  const view = render(
    <QueryClientProvider client={client}>
      <SatinalmaDashboardPage />
    </QueryClientProvider>,
  );
  // Süre payı: bütün test paketi paralel koşarken varsayılan 1 sn yetmeyebilir.
  const firstBlock = await screen.findByRole("region", { name: "Elektrik Sistemleri" }, { timeout: 5000 });
  await waitFor(() => expect(within(firstBlock).getByText("12 ürün")).toBeInTheDocument(), { timeout: 5000 });
  const showcase = firstBlock.parentElement!;
  const blocks = [...showcase.querySelectorAll<HTMLElement>(":scope > section")];
  return { ...view, blocks, showcase };
}

describe("Satınalma anasayfası — kategori vitrini fotoğrafsız (2026-10-10)", () => {
  it("ön koşul: vitrin verisi fotoğraf yolunu TAŞIR (fotoğraflı çizim bunları basardı)", () => {
    expect(VISIBLE_CODES.length).toBeGreaterThan(0);
    for (const code of VISIBLE_CODES) expect(categoryPhotoSrc(code)).toBe(`/categories/${code}.webp`);
  });

  it("vitrinde /categories/*.webp görseli YOK: ne tanıtım kartında ne kartlarda <img> var", async () => {
    const { showcase, blocks } = await drawShowcase();
    expect(showcase.querySelectorAll("img")).toHaveLength(0);
    expect(within(showcase).queryAllByRole("img")).toHaveLength(0);
    // Ne ham yol ne de görsel iyileştiricinin kodlanmış adresi (`/_next/image?url=%2Fcategories%2F…`).
    expect(showcase.innerHTML).not.toMatch(/categories(\/|%2F)/i);
    expect(showcase.innerHTML).not.toMatch(/\.webp/i);
    expect(showcase.innerHTML).not.toContain("background-image");
    // Görünür her sektör çizilir (bir kez), gizli sektör çizilmez.
    const links = [...showcase.querySelectorAll("a")];
    expect(links).toHaveLength(VISIBLE_CODES.length);
    for (const code of VISIBLE_CODES) {
      expect(links.filter((a) => a.getAttribute("href")?.includes(`/company/satinalma/kategori/${code}-`)), code).toHaveLength(1);
    }
    expect(blocks.length).toBeGreaterThan(0);
  });

  it("tanıtım kartı İKONLU kart: mavi zemin, büyük çizgisel ikon, slogan ve tam genişlik düğme", async () => {
    const { blocks } = await drawShowcase();
    for (const block of blocks) {
      const promo = block.querySelector<HTMLAnchorElement>(":scope > a")!;
      const cls = promo.className.split(/\s+/);
      // Mavi gradyan (fotoğraflı kartın `from-blue-700` zemini ve fotoğraf kutusu değil).
      expect(cls).toEqual(expect.arrayContaining(["bg-gradient-to-br", "from-blue-600", "via-blue-700", "to-blue-900"]));
      // Büyük çizgisel ikon kartın doğrudan çocuğu (fotoğraflı kartta ikon yoktur).
      const icon = promo.querySelector(":scope > svg.lucide");
      expect(icon).not.toBeNull();
      expect(icon!.getAttribute("class")).toContain("size-16");
      expect(promo.querySelector("img")).toBeNull();
      expect(within(promo).getByText("Şimdi tedarikçi bulun")).toBeInTheDocument();
    }
    // İlk blok: ürünü olan dal — sayı + ad + segment sloganı (yalnız ikonlu kartta yazılır).
    const first = within(blocks[0]!.querySelector<HTMLElement>(":scope > a")!);
    expect(first.getByText("Elektrik Sistemleri")).toBeInTheDocument();
    expect(first.getByText("12 ürün")).toBeInTheDocument();
    expect(first.getByText("Daha aydınlık, daha verimli işletmeler için çözümler.")).toBeInTheDocument();
  });

  it("kategori kartları İKONLU: tonlu zeminde yuvarlak rozet içinde çizgisel ikon, fotoğraf kutusu yok", async () => {
    const { blocks } = await drawShowcase();
    const tiles = blocks.flatMap((b) => [...b.querySelectorAll<HTMLAnchorElement>("ul > li > a")]);
    expect(tiles).toHaveLength(VISIBLE_CODES.length - blocks.length);
    for (const tile of tiles) {
      const badge = tile.querySelector(":scope > span.rounded-full");
      expect(badge).not.toBeNull();
      expect(badge!.querySelector("svg.lucide")).not.toBeNull();
      // Fotoğraflı kare kartın işaretleri: kare görsel kutusu ve beyaz zemin.
      expect(tile.querySelector(".aspect-square")).toBeNull();
      expect(tile.className.split(/\s+/)).not.toContain("bg-white");
    }
  });

  it("herkese açık anasayfayla AYNI bölünme: 28 görünür sektör = dört blok × (1 tanıtım + 6 kart), 3 sütun", async () => {
    const { blocks } = await drawShowcase();
    // Sayı kuraldan okunur; bugünkü katalogda 28'dir.
    expect(VISIBLE_CODES).toHaveLength(28);
    expect(blocks).toHaveLength(4);
    for (const block of blocks) {
      const grid = block.querySelector("ul")!;
      expect(grid.querySelectorAll("li")).toHaveLength(6);
      expect(grid.classList.contains("sm:grid-cols-3")).toBe(true);
      expect(grid.classList.contains("lg:grid-cols-3")).toBe(true);
      expect(grid.classList.contains("lg:grid-cols-5")).toBe(false);
    }
  });
});
