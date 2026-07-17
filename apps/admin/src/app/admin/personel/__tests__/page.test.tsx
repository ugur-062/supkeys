// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  staff: { data: [] as unknown[], isLoading: false, isError: false },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  // manageStaff (personel yönetimi) yalnız SUPER_ADMIN.
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/hooks/use-admin-staff", () => ({
  useStaff: () => h.staff,
  useCreateStaff: () => ({ mutate: vi.fn(), isPending: false }),
  useStaffAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AdminPersonelPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = { role: "SUPER_ADMIN" };
  h.staff = { data: [], isLoading: false, isError: false };
});

describe("PersonelView — rol kapısı (canAdminDo manageStaff)", () => {
  it("SALES: sayfa kapalı — erişim uyarısı, 'Personel Ekle' yok", () => {
    h.admin = { role: "SALES" };
    render(<AdminPersonelPage />);
    expect(screen.getByText(/erişim yetkiniz yok/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Personel Ekle/i }),
    ).not.toBeInTheDocument();
  });

  it("SUPPORT: sayfa kapalı", () => {
    h.admin = { role: "SUPPORT" };
    render(<AdminPersonelPage />);
    expect(screen.getByText(/erişim yetkiniz yok/i)).toBeInTheDocument();
  });

  it("SUPER_ADMIN: sayfa açık — 'Personel Ekle' görünür", () => {
    h.admin = { role: "SUPER_ADMIN" };
    render(<AdminPersonelPage />);
    expect(
      screen.getByRole("button", { name: /Personel Ekle/i }),
    ).toBeInTheDocument();
  });
});
