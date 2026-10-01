// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  statsCalls: 0,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/hooks/use-admin-companies", () => ({
  useAdminCompanyStats: () => {
    h.statsCalls += 1;
    return { data: undefined, isLoading: false, isError: false };
  },
}));
vi.mock("@/hooks/use-admin-support", () => ({
  useAnnounce: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import AdminDuyuruPage from "../page";

beforeEach(() => {
  h.admin = { role: "SUPER_ADMIN" };
  h.statsCalls = 0;
});

describe("Duyuru — rol kapısı (arayüz testi D-017)", () => {
  it.each(["SALES", "SUPPORT"])("%s adresle açınca form yok, sorgu yok, yetki kartı var", (role) => {
    h.admin = { role };
    render(<AdminDuyuruPage />);
    expect(screen.getByText("Bu sayfaya erişim yetkiniz yok.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Duyuruyu Gönder/ })).not.toBeInTheDocument();
    expect(h.statsCalls).toBe(0);
  });

  it("SUPER_ADMIN formu görür", () => {
    render(<AdminDuyuruPage />);
    expect(screen.getByRole("button", { name: /Duyuruyu Gönder/ })).toBeInTheDocument();
  });
});
