// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; isLoading: boolean; isError: boolean };
const h = vi.hoisted(() => ({
  result: { data: undefined as unknown, isLoading: false, isError: false },
  /** Verilirse sonuç sorguya göre (gerçek hook gibi anahtarlı). */
  byQuery: null as null | Record<string, Result>,
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  usePathname: () => "/admin/dashboard",
}));
vi.mock("@/hooks/use-admin-support", () => ({
  useGlobalSearch: (q: string) =>
    h.byQuery
      ? (h.byQuery[q] ?? {
          data: undefined,
          isLoading: q.trim().length >= 2,
          isError: false,
        })
      : h.result,
}));

import { GlobalSearch } from "../global-search";

beforeEach(() => {
  h.result = { data: undefined, isLoading: false, isError: false };
  h.byQuery = null;
  h.push.mockReset();
});

const company = (id: string, name: string) => ({
  id,
  name,
  rothernId: null,
  country: "TR",
  tier: "STANDART",
  isBlocked: false,
});

describe("GlobalSearch (derin denetim MU-21)", () => {
  it("sorgu hata verdiyse 'Sonuç yok' DEMEZ, hata metni gösterir", async () => {
    const user = userEvent.setup();
    h.result = { data: undefined, isLoading: false, isError: true };
    render(<GlobalSearch />);
    await user.type(screen.getByLabelText("Global arama"), "acme");
    expect(
      await screen.findByText(/Arama yapılamadı/, undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sonuç yok")).not.toBeInTheDocument();
  });

  it("başarılı boş sonuçta 'Sonuç yok'", async () => {
    const user = userEvent.setup();
    h.result = {
      data: { companies: [], users: [] },
      isLoading: false,
      isError: false,
    };
    render(<GlobalSearch />);
    await user.type(screen.getByLabelText("Global arama"), "acme");
    expect(
      await screen.findByText("Sonuç yok", undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
  });
});

describe("GlobalSearch Enter yarışı (arayüz testi O-073)", () => {
  it("yeni arama sonuçlanmadan basılan Enter ÖNCEKİ aramanın firmasına gitmez; yeni sonuç gelince ona gider", async () => {
    const user = userEvent.setup();
    h.byQuery = {
      alfa: { data: { companies: [company("c-alfa", "Alfa AŞ")], users: [] }, isLoading: false, isError: false },
    };
    const { rerender } = render(<GlobalSearch />);
    const box = screen.getByLabelText("Global arama");
    await user.type(box, "alfa");
    expect(await screen.findByText(/Alfa AŞ/, undefined, { timeout: 2000 })).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "beta{Enter}");
    // Gecikmeli arama daha "alfa"/"" iken Enter: eski firma AÇILMAZ.
    expect(h.push).not.toHaveBeenCalled();

    // "beta" sonucu gelir → bekleyen Enter yeni ilk sonuca gider.
    h.byQuery.beta = {
      data: { companies: [company("c-beta", "Beta Ltd")], users: [] },
      isLoading: false,
      isError: false,
    };
    rerender(<GlobalSearch />);
    await vi.waitFor(() => expect(h.push).toHaveBeenCalledWith("/admin/firmalar/c-beta"), {
      timeout: 2000,
    });
    expect(h.push).not.toHaveBeenCalledWith("/admin/firmalar/c-alfa");
    expect(h.push).toHaveBeenCalledTimes(1);
  });

  it("sonuçlar güncel girdiye aitse Enter hemen ilk sonuca gider", async () => {
    const user = userEvent.setup();
    h.byQuery = {
      alfa: { data: { companies: [company("c-alfa", "Alfa AŞ")], users: [] }, isLoading: false, isError: false },
    };
    render(<GlobalSearch />);
    const box = screen.getByLabelText("Global arama");
    await user.type(box, "alfa");
    await screen.findByText(/Alfa AŞ/, undefined, { timeout: 2000 });
    await user.keyboard("{Enter}");
    expect(h.push).toHaveBeenCalledWith("/admin/firmalar/c-alfa");
  });

  it("bekleyen Enter'dan sonra girdi değişirse bekleyiş düşer", async () => {
    const user = userEvent.setup();
    h.byQuery = {};
    const { rerender } = render(<GlobalSearch />);
    const box = screen.getByLabelText("Global arama");
    await user.type(box, "beta{Enter}");
    await user.type(box, "x");
    h.byQuery.beta = {
      data: { companies: [company("c-beta", "Beta Ltd")], users: [] },
      isLoading: false,
      isError: false,
    };
    rerender(<GlobalSearch />);
    await new Promise((r) => setTimeout(r, 400));
    expect(h.push).not.toHaveBeenCalled();
  });

  it("bekleyen Enter'dan sonra Escape: sonuç geç gelse de yönlendirme yok", async () => {
    const user = userEvent.setup();
    h.byQuery = {};
    const { rerender } = render(<GlobalSearch />);
    const box = screen.getByLabelText("Global arama");
    await user.type(box, "beta{Enter}");
    await user.type(box, "{Escape}");
    h.byQuery.beta = {
      data: { companies: [company("c-beta", "Beta Ltd")], users: [] },
      isLoading: false,
      isError: false,
    };
    rerender(<GlobalSearch />);
    await new Promise((r) => setTimeout(r, 400));
    expect(h.push).not.toHaveBeenCalled();
  });

  it("bekleyen Enter'dan sonra dışarı tıklama: sonuç geç gelse de yönlendirme yok", async () => {
    const user = userEvent.setup();
    h.byQuery = {};
    const { rerender } = render(
      <div>
        <GlobalSearch />
        <button type="button">dışarı</button>
      </div>,
    );
    const box = screen.getByLabelText("Global arama");
    await user.type(box, "beta{Enter}");
    await user.click(screen.getByRole("button", { name: "dışarı" }));
    h.byQuery.beta = {
      data: { companies: [company("c-beta", "Beta Ltd")], users: [] },
      isLoading: false,
      isError: false,
    };
    rerender(
      <div>
        <GlobalSearch />
        <button type="button">dışarı</button>
      </div>,
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(h.push).not.toHaveBeenCalled();
  });
});

describe("GlobalSearch kutu sınırı ve mobil düzen (arayüz testi D-212, D-031)", () => {
  it("arama kutusu 120 karakterle sınırlı", () => {
    render(<GlobalSearch />);
    expect((screen.getByLabelText("Global arama") as HTMLInputElement).maxLength).toBe(120);
  });

  it("mobil büyüteç düğmesi tam genişlik katmanı açar ve kutuya odaklanır", async () => {
    const user = userEvent.setup();
    render(<GlobalSearch />);
    const toggle = screen.getByRole("button", { name: "Aramayı aç" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const box = screen.getByLabelText("Global arama");
    expect(box.parentElement?.parentElement?.className).toMatch(/fixed inset-x-0 top-14/);
    expect(box).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });
});
