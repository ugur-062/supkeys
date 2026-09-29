// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  result: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/dashboard",
}));
vi.mock("@/hooks/use-admin-support", () => ({
  useGlobalSearch: () => h.result,
}));

import { GlobalSearch } from "../global-search";

beforeEach(() => {
  h.result = { data: undefined, isLoading: false, isError: false };
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
