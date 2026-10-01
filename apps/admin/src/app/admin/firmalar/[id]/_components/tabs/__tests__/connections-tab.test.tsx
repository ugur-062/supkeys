// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  revoke: vi.fn((_v: unknown) => Promise.resolve()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-inspection", () => ({
  useAdminCompanyConnections: () => ({
    data: {
      connections: [
        {
          id: "cn1",
          status: "PENDING",
          direction: "outgoing",
          createdAt: "2026-09-01T00:00:00.000Z",
          other: { id: "o1", name: "Karşı A.Ş.", rothernId: "SK-9" },
        },
      ],
      referralInvites: [
        { id: "r1", email: "davet@firma.com", status: "PENDING", createdAt: "2026-09-01T00:00:00.000Z" },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRevokeInvite: () => ({ mutateAsync: h.revoke, isPending: false }),
}));

import { ConnectionsTab } from "../connections-tab";

beforeEach(() => vi.clearAllMocks());

describe("ConnectionsTab — davet iptali onaylı (D-209)", () => {
  it("bağlantı daveti: tek tıkla iptal edilmez; onayda iptal edilir", async () => {
    const user = userEvent.setup();
    render(<ConnectionsTab companyId="c1" />);
    await user.click(screen.getAllByRole("button", { name: "Daveti İptal Et" })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(h.revoke).not.toHaveBeenCalled();
    expect(within(dialog).getByText("Karşı A.Ş.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Daveti İptal Et" }));
    expect(h.revoke).toHaveBeenCalledWith({ kind: "connection", id: "cn1" });
  });

  it("referans daveti: Vazgeç'te istek gitmez", async () => {
    const user = userEvent.setup();
    render(<ConnectionsTab companyId="c1" />);
    await user.click(screen.getAllByRole("button", { name: "Daveti İptal Et" })[1]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("davet@firma.com")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    expect(h.revoke).not.toHaveBeenCalled();
  });
});
