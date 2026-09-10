// @vitest-environment jsdom
/**
 * ÜYE DAVET — sözleşme (2026-09-10): e-posta gerçek biçim denetimi + satır
 * içi hata; geçerli e-posta + yetki seçiliyken davet ucu çağrılır.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invite: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: { id: "u1", isOwner: true } }) }));
vi.mock("@/hooks/use-company-users", () => ({
  useInviteUser: () => ({ mutateAsync: h.invite, isPending: false }),
  usePermissionCatalog: () => ({ data: { catalog: [], groups: {}, presets: { SATIN_ALMACI: ["buy:view", "buy:listing:manage"] } } }),
  useSeats: () => ({ data: { limit: 4, used: 1, pendingSeatInvites: 0, usedBuy: 1, usedSell: 0 } }),
}));
vi.mock("@/components/company/permission-table", () => ({ PermissionTable: () => <div data-testid="perm-table" /> }));

import { InviteUserDialog } from "../invite-user-dialog";

beforeEach(() => h.invite.mockReset().mockResolvedValue({}));

describe("InviteUserDialog", () => {
  it("geçersiz e-postada satır içi hata ve kilitli düğme; geçerli e-postada davet gönderilir", async () => {
    render(<InviteUserDialog open onClose={() => {}} />);
    const email = screen.getByPlaceholderText("kisi@firma.com");
    const send = screen.getByRole("button", { name: "Davet Gönder" });
    fireEvent.change(email, { target: { value: "ali@firma" } });
    fireEvent.blur(email);
    expect(screen.getByText(/Geçerli bir e-posta adresi girin/)).toBeInTheDocument();
    expect(send).toBeDisabled();

    fireEvent.change(email, { target: { value: "ali@firma.com" } });
    expect(screen.queryByText(/Geçerli bir e-posta adresi girin/)).toBeNull();
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(h.invite).toHaveBeenCalledTimes(1));
    expect(h.invite.mock.calls[0][0]).toMatchObject({ email: "ali@firma.com", permissions: ["buy:view", "buy:listing:manage"] });
  });
});
