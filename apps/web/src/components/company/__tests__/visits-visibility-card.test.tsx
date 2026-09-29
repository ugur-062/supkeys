// @vitest-environment jsdom
/**
 * Derin denetim LU-28: Ziyaret Edenler sayfası `insights:view` ile açılır
 * (SATISCI dahil), ama anahtar PATCH /company/profile'a gider
 * (`company:manage`). Yetkisi olmayana anahtar pasif + açıklama; 403'e
 * tıklatılmaz.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  canManage: true,
  mutateAsync: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => (p === "company:manage" ? h.canManage : false),
}));
vi.mock("@/hooks/use-company-profile", () => ({
  useCompanyProfile: () => ({ data: { visitsVisible: true }, isLoading: false }),
  useUpdateCompanyProfile: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));

import { VisitsVisibilityCard } from "../visits-visibility-card";

beforeEach(() => {
  vi.clearAllMocks();
  h.canManage = true;
  h.mutateAsync.mockResolvedValue({});
});

describe("VisitsVisibilityCard", () => {
  it("company:manage varsa anahtar etkin ve kaydeder", async () => {
    const user = userEvent.setup();
    render(<VisitsVisibilityCard />);
    const sw = screen.getByRole("switch");
    expect(sw).toBeEnabled();
    expect(screen.queryByText(/yalnız şirket profilini yönetme yetkisi/)).not.toBeInTheDocument();
    await user.click(sw);
    expect(h.mutateAsync).toHaveBeenCalledWith({ visitsVisible: false });
  });

  it("company:manage yoksa (ör. SATISCI) anahtar pasif + açıklama", async () => {
    h.canManage = false;
    const user = userEvent.setup();
    render(<VisitsVisibilityCard />);
    const sw = screen.getByRole("switch");
    expect(sw).toBeDisabled();
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/yalnız şirket profilini yönetme yetkisi/)).toBeInTheDocument();
    await user.click(sw);
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });
});
