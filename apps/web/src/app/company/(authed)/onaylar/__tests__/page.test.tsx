// @vitest-environment jsdom
/**
 * ONAYLAR — sade düzen sözleşmesi (2026-09-10): İKİ görünüm (Sıra sizde ·
 * Tüm istekler), onay akışları başlıktaki düğmeyle ayrı görünüm; "Tüm
 * istekler" tek listeden (history ucu ÇAĞRILMAZ) çiplerle süzülür; kartta
 * Alış/Satış rozeti ve çift numara yok; adımlar katlanır; karar aksiyonları.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  decide: vi.fn(),
  cancel: vi.fn(),
  history: vi.fn(),
  tab: null as string | null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(h.tab ? `tab=${h.tab}` : ""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => async () => true }));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1", isOwner: false, roles: [], permissions: ["approval:act", "approvals:manage", "buy:view"] } }),
  useHasCompanyPermission: () => true,
}));
vi.mock("@/components/company/approval-detail-panel", () => ({ ApprovalDetailPanel: ({ id }: { id: string }) => <div data-testid="detail">detay {id}</div> }));
vi.mock("@/app/company/(authed)/ayarlar/_components/approval-flows-section", () => ({ ApprovalFlowsSection: () => <div data-testid="flows" /> }));
vi.mock("@/hooks/use-debounced-value", () => ({ useDebouncedValue: (v: string) => v }));

const PENDING = [
  {
    id: "a1", requestNo: "ONY-0042", type: "LISTING_AWARD", amount: 184000, currency: "TRY", initiatorNote: "Acil",
    createdBy: "Ali Y.", createdAt: "2026-09-09T10:00:00.000Z",
    listing: { id: "l1", number: "ROT-000042", title: "Çelik boru alımı", type: "ALIM" }, currentStepOrder: 2, totalSteps: 3,
  },
];
const step = (order: number, status: string, name: string) => ({ order, approverName: name, displayLabel: null, status, note: null, decidedAt: null });
const ALL = [
  {
    id: "a1", requestNo: "ONY-0042", type: "LISTING_AWARD", status: "PENDING", amount: 184000, currency: "TRY", initiatorNote: null,
    createdAt: "2026-09-09T10:00:00.000Z", decidedAt: null, createdBy: "Ali Y.", mine: false,
    listing: { id: "l1", number: "ROT-000042", title: "Çelik boru alımı", type: "ALIM" },
    currentStepOrder: 2, currentApprover: "Ayşe K.", totalSteps: 3, decidedSteps: 1,
    steps: [step(1, "APPROVED", "Veli"), step(2, "PENDING", "Ayşe K."), step(3, "WAITING", "Can")],
  },
  {
    id: "a2", requestNo: "ONY-0041", type: "LISTING_AWARD", status: "APPROVED", amount: 9000, currency: "EUR", initiatorNote: null,
    createdAt: "2026-09-01T10:00:00.000Z", decidedAt: "2026-09-02T10:00:00.000Z", createdBy: "Ben", mine: true,
    listing: { id: "l2", number: "ROT-000041", title: "Kablo alımı", type: "ALIM" },
    currentStepOrder: 1, currentApprover: null, totalSteps: 1, decidedSteps: 1, steps: [step(1, "APPROVED", "Veli")],
  },
];

vi.mock("@/hooks/use-company-approvals", () => ({
  usePendingApprovals: () => ({ data: PENDING, isLoading: false, isError: false, refetch: vi.fn() }),
  useAllApprovals: () => ({ data: ALL, isLoading: false, isError: false, refetch: vi.fn() }),
  useApprovalHistory: h.history,
  useDecideApproval: () => ({ mutateAsync: h.decide, isPending: false }),
  useCancelApproval: () => ({ mutateAsync: h.cancel, isPending: false }),
}));

import OnaylarPage from "../page";

beforeEach(() => {
  h.decide.mockReset().mockResolvedValue({});
  h.cancel.mockReset().mockResolvedValue({});
  h.history.mockReset();
  h.tab = null;
});

describe("OnaylarPage", () => {
  it("iki sekme + akış düğmesi; Sıra sizde kartı sade (Alış/Satış yok, tek numara), Detay açılır, Onayla karar verir", async () => {
    render(<OnaylarPage />);
    const tabs = within(screen.getByRole("tablist"));
    expect(tabs.getAllByRole("tab")).toHaveLength(2);
    expect(tabs.getByRole("tab", { name: /Sıra sizde\s*1/ })).toHaveAttribute("aria-selected", "true");
    expect(tabs.getByRole("tab", { name: "Tüm istekler" })).toBeInTheDocument();
    expect(tabs.queryByRole("tab", { name: /Onay Akışları/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Onay akışlarını düzenle/ })).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Çelik boru alımı" })).toHaveAttribute("href", "/company/ilan/l1");
    expect(screen.getByText("Adım 2/3")).toBeInTheDocument();
    expect(screen.queryByText("Alış")).toBeNull();
    expect(screen.getAllByText(/ONY-0042/)).toHaveLength(1);
    expect(screen.queryByText("ROT-000042")).toBeNull();
    expect(screen.getByText(/Başlatan notu:/).closest("p")).toHaveTextContent("Acil");

    fireEvent.click(screen.getByRole("button", { name: /Detay/ }));
    expect(screen.getByTestId("detail")).toHaveTextContent("detay a1");
    fireEvent.click(screen.getByRole("button", { name: "Onayla" }));
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith({ id: "a1", action: "approve" }));
  });

  it("Tüm istekler: tek liste (history ucu çağrılmaz), çipler süzer, adımlar katlı, bekleyende iptal", async () => {
    render(<OnaylarPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Tüm istekler" }));
    expect(h.history).not.toHaveBeenCalled();
    expect(screen.getByText("Çelik boru alımı")).toBeInTheDocument();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
    expect(screen.getByText("Sırada: Ayşe K.")).toBeInTheDocument();
    expect(screen.getByText("Onaylandı")).toBeInTheDocument();
    // Adımlar katlı: özet var, satırlar <details> içinde
    expect(screen.getByText("Adımlar (1/3)")).toBeInTheDocument();
    for (const el of screen.getAllByText(/Veli/)) expect(el.closest("details")).not.toHaveAttribute("open");

    fireEvent.click(screen.getByRole("button", { name: "Başlattıklarım" }));
    expect(screen.queryByText("Çelik boru alımı")).toBeNull();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
    expect(screen.getByText(/Siz başlattınız/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bekleyen" }));
    expect(screen.queryByText("Kablo alımı")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "İptal et" })); // yönetici → bekleyeni iptal edebilir
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith("a1"));

    fireEvent.click(screen.getByRole("button", { name: "Sonuçlanan" }));
    expect(screen.queryByText("Çelik boru alımı")).toBeNull();
    expect(screen.getByText("Kablo alımı")).toBeInTheDocument();
  });

  it("?tab=history eski bağlantısı Tüm istekler'e düşer; ?tab=flows akış görünümünü açar, 'Onaylara dön' geri getirir", () => {
    h.tab = "history";
    const { unmount } = render(<OnaylarPage />);
    expect(screen.getByRole("tab", { name: "Tüm istekler" })).toHaveAttribute("aria-selected", "true");
    unmount();

    h.tab = "flows";
    render(<OnaylarPage />);
    expect(screen.getByTestId("flows")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Onaylara dön/ }));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
