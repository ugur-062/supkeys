// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  staff: { data: [] as unknown[], isLoading: false, isError: false },
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  // manageStaff (personel yönetimi) yalnız SUPER_ADMIN.
  admin: { role: "SUPER_ADMIN" } as { role: string; id?: string } | null,
  actMutate: vi.fn(),
  staffCalls: 0,
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/hooks/use-admin-staff", () => ({
  useStaff: () => {
    h.staffCalls += 1;
    return h.staff;
  },
  useCreateStaff: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(() => Promise.resolve({ ok: true, id: "n", tempPassword: "x" })), isPending: false }),
  useStaffAction: () => ({ mutate: h.actMutate, mutateAsync: (...a: unknown[]) => { (h.actMutate as (...x: unknown[]) => unknown)(...a); return Promise.resolve({}); }, isPending: false }),
}));

import AdminPersonelPage from "../page";

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = { role: "SUPER_ADMIN" };
  h.staff = { data: [], isLoading: false, isError: false };
  h.staffCalls = 0;
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

  it("SALES/SUPPORT: personel sorgusu HİÇ atılmaz (403 toast'ı yok — T-09)", () => {
    h.admin = { role: "SALES" };
    render(<AdminPersonelPage />);
    expect(h.staffCalls).toBe(0);
    expect(screen.getByText(/yalnızca Süper Admin rolüne açık/)).toBeInTheDocument();
  });

  it("SUPER_ADMIN: sayfa açık — 'Personel Ekle' görünür", () => {
    h.admin = { role: "SUPER_ADMIN" };
    render(<AdminPersonelPage />);
    expect(
      screen.getByRole("button", { name: /Personel Ekle/i }),
    ).toBeInTheDocument();
  });
});

describe("Şifre Sıfırla (derin denetim MU-21 — Süper Admin kendini kilitlemesin)", () => {
  const row = (id: string, email: string) => ({
    id,
    email,
    firstName: "Ad",
    lastName: "Soyad",
    role: "SUPER_ADMIN",
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-09-01T00:00:00Z",
  });

  it("kendi satırında 'Şifre Sıfırla' yok; başka personelde onay dialog'undan sonra çalışır", async () => {
    const user = userEvent.setup();
    h.admin = { role: "SUPER_ADMIN", id: "me" };
    h.staff = {
      data: [row("me", "ben@rothern.com"), row("other", "diger@rothern.com")],
      isLoading: false,
      isError: false,
    };
    render(<AdminPersonelPage />);

    const selfRow = screen.getByText("ben@rothern.com").closest("tr")!;
    expect(
      within(selfRow).queryByRole("button", { name: /Şifre Sıfırla/ }),
    ).not.toBeInTheDocument();

    const otherRow = screen.getByText("diger@rothern.com").closest("tr")!;
    await user.click(
      within(otherRow).getByRole("button", { name: /Şifre Sıfırla/ }),
    );
    // Tek tık mutasyon YOK — önce onay.
    expect(h.actMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sıfırla" }));
    expect(h.actMutate).toHaveBeenCalledWith(
      { id: "other", action: "reset-password" }
    );
  });
});

describe("Pasifleştir onayı (arayüz testi D-222)", () => {
  const row = (id: string, email: string) => ({
    id,
    email,
    firstName: "Ad",
    lastName: "Soyad",
    role: "SALES",
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-09-01T00:00:00Z",
  });

  it("tek tık mutasyon yok; Vazgeç iptal eder, onay pasifleştirir", async () => {
    const user = userEvent.setup();
    h.admin = { role: "SUPER_ADMIN", id: "me" };
    h.staff = {
      data: [row("other", "diger@rothern.com")],
      isLoading: false,
      isError: false,
    };
    render(<AdminPersonelPage />);
    const otherRow = screen.getByText("diger@rothern.com").closest("tr")!;

    await user.click(within(otherRow).getByRole("button", { name: "Pasifleştir" }));
    expect(h.actMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("oturumları hemen kapanır");
    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(h.actMutate).not.toHaveBeenCalled();

    await user.click(within(otherRow).getByRole("button", { name: "Pasifleştir" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Pasifleştir" }),
    );
    expect(h.actMutate).toHaveBeenCalledWith({ id: "other", action: "active", active: false });
  });
});
