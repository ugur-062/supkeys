// @vitest-environment jsdom
/**
 * PANEL KATEGORİ SAYFASI — kesinti (son canlı kontrol 2026-10-10, OUTF-6).
 *
 * Başlık (h1) kategori adını facet yanıtından okur. API yanıt vermezken liste
 * hata kartını, süzgeç sütunu "Süzgeçler yüklenemedi"yi çiziyordu ama h1 boş bir
 * iskelet çubuğu olarak kalıyordu (26 sn sonra da) — sayfa başlıksızdı.
 *
 * GERÇEK keşif kancaları + gerçek QueryClient; yalnız `companyApi` sahte.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
  slug: "31000000-uretim-bilesenleri-ve-malzemeleri",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => `/company/satinalma/kategori/${h.slug}`,
  useParams: () => ({ slug: h.slug }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));
vi.mock("@/hooks/use-company-auth", () => ({ useHasCompanyPermission: () => true }));

import PanelCategoryPage from "../page";

const networkError = Object.assign(new Error("Network Error"), { isAxiosError: true });
const FACETS = {
  categories: [],
  selectedCategory: { id: "31000000", name: "Üretim Bileşenleri ve Malzemeleri", level: 1 },
  subCategories: [],
  cities: [],
  activities: [],
  verified: 0,
  price: { has: 0, request: 0 },
  attributes: [],
};

let client: QueryClient;
const view = () =>
  render(
    <QueryClientProvider client={client}>
      <PanelCategoryPage />
    </QueryClientProvider>,
  );
const title = () => screen.getByRole("heading", { level: 1 });

beforeEach(() => {
  h.get.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

describe("panel kategori sayfası — başlık (OUTF-6)", () => {
  it("kategori okunamadıysa h1 iskelette KALMAZ: genel başlık çizilir", async () => {
    h.get.mockRejectedValue(networkError);
    view();
    await waitFor(() => expect(title()).toHaveTextContent(/^Kategori$/));
    expect(title().querySelector(".animate-pulse")).toBeNull();
    // Liste kendi hata durumunu çizer — başlık onunla birlikte durur.
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("yanıt BEKLENİRKEN h1 iskelettir (genel başlık yalnız okuma düşünce)", async () => {
    h.get.mockImplementation(() => new Promise(() => {}));
    view();
    await act(async () => {});
    expect(title().querySelector(".animate-pulse")).not.toBeNull();
    expect(title()).not.toHaveTextContent("Kategori");
  });

  it("API ayaktayken h1 kategorinin adıdır", async () => {
    h.get.mockImplementation(async (url: string) => {
      if (url.startsWith("/company/items/discover/facets")) return { data: FACETS };
      if (url.startsWith("/company/items/discover/search")) return { data: { items: [], total: 0, page: 1, pageSize: 24 } };
      return { data: { items: [], total: 0, page: 1, pageSize: 20 } };
    });
    view();
    await waitFor(() => expect(title()).toHaveTextContent("Üretim Bileşenleri ve Malzemeleri"));
  });
});
