// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  admin: { role: "SUPER_ADMIN" } as { role: string } | null,
  pathname: "/admin/sistem",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: h.refresh, push: vi.fn() }),
  usePathname: () => h.pathname,
}));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: h.admin }),
}));
vi.mock("@/lib/client-error", () => ({ reportClientError: vi.fn() }));
vi.mock("@/components/layout/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-shell">{children}</div>
  ),
}));

import AdminSegmentError from "@/app/admin/error";
import RootError from "@/app/error";

function renderWithClient(ui: React.ReactElement, qc = new QueryClient()) {
  return { qc, ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = { role: "SUPER_ADMIN" };
  h.pathname = "/admin/sistem";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("Admin hata sınırı (arayüz testi D-219 / O-112 admin kısmı)", () => {
  it("oturum açıkken hata ekranı kabuğun (menü + üst çubuk) İÇİNDE çizilir", () => {
    renderWithClient(<AdminSegmentError error={new Error("x")} reset={vi.fn()} />);
    expect(screen.getByTestId("admin-shell")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("giriş sayfasında ya da oturum yokken kabuk çizilmez", () => {
    h.pathname = "/admin/login";
    renderWithClient(<AdminSegmentError error={new Error("x")} reset={vi.fn()} />);
    expect(screen.queryByTestId("admin-shell")).not.toBeInTheDocument();
    h.pathname = "/admin/sistem";
    h.admin = null;
    renderWithClient(<AdminSegmentError error={new Error("x")} reset={vi.fn()} />);
    expect(screen.queryByTestId("admin-shell")).not.toBeInTheDocument();
  });

  it("'Tekrar dene' önbelleği sıfırlar, rotayı tazeler ve segmenti yeniden çizer", async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    const qc = new QueryClient();
    // Bozuk yanıt önbellekte: yalnız reset() bunu yeniden kullanırdı.
    qc.setQueryData(["admin", "system"], { broken: true });
    const resetQueries = vi.spyOn(qc, "resetQueries");
    renderWithClient(<RootError error={new Error("x")} reset={reset} />, qc);
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(resetQueries).toHaveBeenCalled();
    expect(qc.getQueryData(["admin", "system"])).toBeUndefined();
    expect(h.refresh).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});
