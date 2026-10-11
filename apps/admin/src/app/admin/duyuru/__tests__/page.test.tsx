// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("Duyuru — onay kutusu açıkken form kilitli (arayüz testi D-220)", () => {
  it("onayda alanlar düzenlenemez; Vazgeç kilidi açar", async () => {
    const user = userEvent.setup();
    render(<AdminDuyuruPage />);
    const subject = screen.getByPlaceholderText("Örn. Planlı bakım bildirimi");
    const message = screen.getByPlaceholderText("Duyuru metni...");
    await user.type(subject, "Bakim duyurusu");
    await user.type(message, "Yarin 02:00-03:00 arasi bakim var.");
    await user.click(screen.getByRole("button", { name: /Duyuruyu Gönder/ }));

    expect(screen.getByRole("button", { name: "Evet, Gönder" })).toBeEnabled();
    expect(subject).toBeDisabled();
    expect(message).toBeDisabled();
    for (const select of screen.getAllByRole("combobox")) expect(select).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(subject).toBeEnabled();
    expect(message).toBeEnabled();
  });
});
