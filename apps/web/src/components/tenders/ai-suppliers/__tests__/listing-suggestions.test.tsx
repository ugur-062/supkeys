// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingSuggestions } from "../listing-suggestions";

/**
 * YAYIN SONRASI AI ÖNERİLERİ (2026-09-27, Faz 1): bulunanlar SEÇİLİ gelir,
 * tek tıkla davet; davet edilmiş aday kilitli; "Gizle" bandı kapatır; tur
 * sürerken "AI arıyor…".
 */
const h = vi.hoisted(() => ({
  data: undefined as unknown,
  invite: vi.fn(),
  dismiss: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useListingDiscovery: () => ({ data: h.data }),
  useInviteDiscoveryCandidates: () => ({ mutateAsync: h.invite, isPending: false }),
  useDismissListingDiscovery: () => ({ mutate: h.dismiss, isPending: false }),
}));

const cand = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  email: `${id}@x.com`,
  website: null,
  city: null,
  country: "TR",
  reason: "r",
  matchedItems: [1],
  scope: "LOCAL",
  status: "SUGGESTED",
  recentlyInvited: false,
  ...extra,
});

const done = (candidates: unknown[], extra: Record<string, unknown> = {}) => ({
  aiDiscovery: true,
  listingStatus: "OPEN",
  runs: [{ id: "r1", trigger: "PUBLISH", state: "DONE", createdAt: "", finishedAt: "", dismissedAt: null, candidates, ...extra }],
});

beforeEach(() => {
  h.invite.mockReset().mockResolvedValue([{ email: "a@x.com", status: "QUEUED" }, { email: "b@x.com", status: "QUEUED" }]);
  h.dismiss.mockReset();
  h.toast.success.mockReset();
});

describe("ListingSuggestions", () => {
  it("bant: sayı + yurt dışı; liste açılınca hepsi SEÇİLİ; tek tıkla davet seçilenlere gider", async () => {
    h.data = done([
      cand("a", "Cıvata AŞ"),
      cand("b", "Viti Srl", { country: "IT", scope: "ABROAD" }),
      cand("c", "Eski Ltd", { status: "INVITED" }),
    ]);
    render(<ListingSuggestions listingId="l1" itemNames={["M6 cıvata"]} buyerCountry="TR" variant="band" />);
    expect(screen.getByText("AI 2 tedarikçi buldu")).toBeInTheDocument();
    expect(screen.getByText("(yurt dışından: 1)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cıvata AŞ seç")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Listeyi göster" }));
    expect(screen.getByLabelText("Cıvata AŞ seç")).toBeChecked();
    expect(screen.getByLabelText("Viti Srl seç")).toBeChecked();
    expect(screen.getByLabelText("Eski Ltd seç")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "2 firmaya davet gönder" }));
    await waitFor(() => expect(h.invite).toHaveBeenCalledWith(["a", "b"]));
    expect(h.toast.success).toHaveBeenCalled();
  });

  it("?ai-davet=1 ile liste açık gelir; çıkarılan aday davet edilmez", async () => {
    h.data = done([cand("a", "Cıvata AŞ"), cand("b", "Viti Srl")]);
    render(<ListingSuggestions listingId="l1" itemNames={["M6 cıvata"]} buyerCountry="TR" variant="band" defaultOpen />);
    fireEvent.click(screen.getByLabelText("Viti Srl seç"));
    fireEvent.click(screen.getByRole("button", { name: "1 firmaya davet gönder" }));
    await waitFor(() => expect(h.invite).toHaveBeenCalledWith(["a"]));
  });

  it("Gizle bandı kapatır; kapatılmış tur çizilmez", () => {
    h.data = done([cand("a", "Cıvata AŞ")]);
    const { unmount } = render(<ListingSuggestions listingId="l1" itemNames={[]} buyerCountry="TR" variant="band" />);
    fireEvent.click(screen.getByRole("button", { name: "Gizle" }));
    expect(h.dismiss).toHaveBeenCalled();
    unmount();
    h.data = done([cand("a", "Cıvata AŞ")], { dismissedAt: "2026-09-27T10:00:00Z" });
    const { container } = render(<ListingSuggestions listingId="l1" itemNames={[]} buyerCountry="TR" variant="band" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tur sürerken 'AI arıyor'; otomatik arama kapalı ve tur yoksa hiçbir şey çizilmez", () => {
    h.data = { aiDiscovery: true, listingStatus: "OPEN", runs: [{ id: "r1", trigger: "PUBLISH", state: "RUNNING", createdAt: "", finishedAt: null, dismissedAt: null, candidates: [] }] };
    render(<ListingSuggestions listingId="l1" itemNames={[]} buyerCountry="TR" variant="panel" />);
    expect(screen.getByText(/AI talebiniz için yurt içinde ve yurt dışında tedarikçi arıyor/)).toBeInTheDocument();
    h.data = { aiDiscovery: false, listingStatus: "OPEN", runs: [] };
    const { container } = render(<ListingSuggestions listingId="l2" itemNames={[]} buyerCountry="TR" variant="panel" />);
    expect(container).toBeEmptyDOMElement();
  });
});
