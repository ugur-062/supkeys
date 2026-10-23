// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim LU-12: Bağlantılar / Üyelik geçmişi / Notlar sekmeleri istek
 * hatasını "Bağlantı yok" / "Henüz not yok" gibi BOŞ durum olarak gösteriyordu
 * (tekrar dene yok). Hata artık ayrı durum + yeniden çekme düğmesi.
 */
const h = vi.hoisted(() => ({
  refetch: vi.fn(),
  failed: { data: undefined, isLoading: false, isError: true } as Record<string, unknown>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ admin: { role: "SUPER_ADMIN" } }),
}));
vi.mock("@/hooks/use-admin-inspection", () => ({
  useAdminCompanyConnections: () => h.failed,
  useRevokeInvite: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-admin-support", () => ({
  useCompanyNotes: () => h.failed,
  useAddNote: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteNote: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConnectionsTab } from "../connections-tab";
import { NotesTab } from "../notes-tab";

beforeEach(() => {
  vi.clearAllMocks();
  h.failed = { data: undefined, isLoading: false, isError: true, refetch: h.refetch };
});

describe("firma detayı sekmeleri — hata ≠ boş", () => {
  it("Bağlantılar: iki tabloda da hata durumu, boş metni yok; Tekrar dene yeniden çeker", async () => {
    const user = userEvent.setup();
    render(<ConnectionsTab companyId="c1" />);
    expect(screen.queryByText("Bağlantı yok")).not.toBeInTheDocument();
    expect(screen.queryByText("Referans daveti yok")).not.toBeInTheDocument();
    const retry = screen.getAllByRole("button", { name: "Tekrar dene" });
    expect(retry).toHaveLength(2);
    await user.click(retry[0]!);
    expect(h.refetch).toHaveBeenCalled();
  });

  it("Notlar: 'Henüz not yok' yerine hata + Tekrar dene", async () => {
    const user = userEvent.setup();
    render(<NotesTab companyId="c1" />);
    expect(screen.queryByText("Henüz not yok")).not.toBeInTheDocument();
    expect(screen.getByText(/Notlar alınamadı/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it("veri gelince boş metni yine gösterilir (gerileme yok)", () => {
    h.failed = { data: [], isLoading: false, isError: false, refetch: h.refetch };
    render(<NotesTab companyId="c1" />);
    expect(screen.getByText("Henüz not yok")).toBeInTheDocument();
  });
});
