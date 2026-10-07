// @vitest-environment jsdom
/**
 * Derin denetim S060 — teklif detayındaki "Kazandır" talep detayının
 * korumalarını atlıyordu: süresi dolmuş teklifte aktifti (CLAUDE.md §6),
 * ön kontrol (`award/preview`) yoktu → onaya takılan kazandırmada onaycılara
 * not girilemiyordu, onay metni geri alınamazlığı söylemiyordu.
 */
import { formatMoney } from "@/components/ui/money";
import type { ListingDetail } from "@/hooks/use-company-listings";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  award: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  perms: ["buy:listing:manage", "buy:award"] as string[],
  company: null as Record<string, unknown> | null,
  search: "",
  error: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1", bidId: "b1" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: h.company }),
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.error ? undefined : h.detail,
      isLoading: false,
      isError: !!h.error,
      error: h.error,
      refetch: vi.fn(),
    }),
    useAwardListing: () => ({ mutateAsync: h.award, isPending: false }),
    useAwardPreview: () => ({ mutateAsync: h.preview, isPending: false }),
    useEliminateBid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock("@/hooks/use-bid-documents", () => ({
  useBidDocuments: () => ({ data: [] }),
  BID_DOC_KINDS: ["TEKLIF_MEKTUBU", "DIGER"],
}));

import BidDetailPage from "../page";

function detail(bid: Record<string, unknown> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0001",
    type: "ALIM",
    title: "Rulman Alımı",
    status: "OPEN",
    isOwner: true,
    createdById: "u1",
    primaryCurrency: "TRY",
    items: [],
    bids: [
      {
        id: "b1",
        bidderName: "Tedarikçi A.Ş.",
        amount: "1500",
        currency: "TRY",
        note: null,
        status: "SUBMITTED",
        createdAt: new Date().toISOString(),
        items: [],
        ...bid,
      },
    ],
  } as unknown as ListingDetail;
}

const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  h.perms = ["buy:listing:manage", "buy:award"];
  h.company = null;
  h.search = "";
  h.error = null;
  h.award.mockResolvedValue({ pendingApproval: false, number: "ORD-2026-0001" });
  h.preview.mockResolvedValue({ requiresApproval: false });
  h.confirm.mockResolvedValue(true);
});

describe("Teklif detayı — Kazandır korumaları (S060)", () => {
  it("geçerliliği dolmuş teklifte Kazandır pasif + ipucu + rozet", () => {
    h.detail = detail({
      submittedAt: new Date(Date.now() - 35 * DAY).toISOString(),
      validityDays: 30,
    });
    render(<BidDetailPage />);
    expect(screen.getByRole("button", { name: "Kazandır" })).toBeDisabled();
    expect(screen.getByText("Geçerlilik doldu")).toBeInTheDocument();
    expect(screen.getByText(/geçerlilik süresi dolmuş/)).toBeInTheDocument();
  });

  it("geçerli teklif: önce ön kontrol, sonra geri alınamazlık uyarılı yıkıcı onay", async () => {
    h.detail = detail({
      submittedAt: new Date(Date.now() - 5 * DAY).toISOString(),
      validityDays: 30,
    });
    render(<BidDetailPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Kazandır" }));
    await waitFor(() => expect(h.award).toHaveBeenCalledWith({ bidId: "b1", approvalNote: undefined }));
    expect(h.preview).toHaveBeenCalledWith({ bidId: "b1" });
    const opts = h.confirm.mock.calls[0][0];
    expect(opts.destructive).toBe(true);
    expect(opts.description).toMatch(/GERİ ALINAMAZ/);
    // Kullanıcı kararı 2026-10-07: geri alınamaz işlemde tutar da yazılır.
    expect(opts.description).toContain(`Kazandırılacak tutar: ${formatMoney("1500", "TRY", "tr")}.`);
  });

  it("yabancı birimli teklif: onayda kendi birimi + sunucunun TRY karşılığı (2026-10-07)", async () => {
    h.detail = detail({ amount: "1200", currency: "USD", amountTry: "58822.08" });
    render(<BidDetailPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Kazandır" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(h.confirm.mock.calls[0][0].description).toContain(
      `Kazandırılacak tutar: ${formatMoney("1200", "USD", "tr")} (≈ ${formatMoney("58822.08", "TRY", "tr")}).`,
    );
  });

  it("onaya takılan kazandırma: onay yerine not dialogu, not onaycılara iletilir", async () => {
    h.preview.mockResolvedValue({ requiresApproval: true });
    h.award.mockResolvedValue({ pendingApproval: true });
    h.detail = detail();
    const user = userEvent.setup();
    render(<BidDetailPage />);
    await user.click(screen.getByRole("button", { name: "Kazandır" }));
    expect(await screen.findByText("Kazandırmayı onaya gönder")).toBeInTheDocument();
    // Onaya giden kazandırma da tutarı ve onaya gidişi söyler (2026-10-07).
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(`Kazandırılacak tutar: ${formatMoney("1500", "TRY", "tr")}.`);
    expect(dialog).toHaveTextContent(/ONAYA gönderilecek/);
    expect(h.confirm).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox"), "Bütçe onaylı");
    await user.click(screen.getByRole("button", { name: "Onaya Gönder" }));
    await waitFor(() =>
      expect(h.award).toHaveBeenCalledWith({ bidId: "b1", approvalNote: "Bütçe onaylı" }),
    );
  });

  it("ön kontrol başarısızsa sessiz kazandırma yapılmaz (fail-closed)", async () => {
    h.preview.mockRejectedValue(new Error("x"));
    h.detail = detail();
    render(<BidDetailPage />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Kazandır" }));
    await waitFor(() => expect(h.preview).toHaveBeenCalled());
    expect(h.award).not.toHaveBeenCalled();
  });

  it("doğrulanmamış alıcıda Kazandır pasif + doğrulama ipucu (arayüz testi D-044)", () => {
    h.company = { id: "c1", tier: "GOLD", companyVerificationStatus: "UNVERIFIED" };
    h.detail = detail();
    render(<BidDetailPage />);
    expect(screen.getByRole("button", { name: "Kazandır" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Doğrulamayı tamamlayın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
  });

  it("incelemedeki (PENDING) firmada Kazandır pasif, bağlantısız inceleme notu", () => {
    h.company = { id: "c1", tier: "GOLD", companyVerificationStatus: "PENDING" };
    h.detail = detail();
    render(<BidDetailPage />);
    expect(screen.getByRole("button", { name: "Kazandır" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Doğrulamayı tamamlayın" })).toBeNull();
    expect(screen.getByText(/Doğrulamanız inceleniyor/)).toBeInTheDocument();
  });

  it("geri bağlantısı Gelen Teklifler süzgecini (?teklifler=) korur (D-109)", () => {
    h.search = "teklifler=incomplete";
    h.detail = detail();
    render(<BidDetailPage />);
    expect(screen.getByRole("link", { name: "Rulman Alımı" })).toHaveAttribute(
      "href",
      "/company/ilan/l1?teklifler=incomplete",
    );
  });

  it("geri bağlantısı bilinmeyen süzgeç değerini taşımaz", () => {
    h.search = "teklifler=evil";
    h.detail = detail();
    render(<BidDetailPage />);
    expect(screen.getByRole("link", { name: "Rulman Alımı" })).toHaveAttribute("href", "/company/ilan/l1");
  });

  it("buy:award izni yoksa Kazandır gösterilmez, Ele kalır (derin denetim LU-21)", () => {
    h.perms = ["buy:listing:manage"];
    h.detail = detail();
    render(<BidDetailPage />);
    expect(screen.queryByRole("button", { name: "Kazandır" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ele" })).toBeInTheDocument();
  });
});

describe("Teklif detayı — sonuç etiketi ve erişim (arayüz testi D-102 / D-024)", () => {
  it("kazandırmada kaybeden teklif 'Kaybetti', elenen 'Elendi'", () => {
    h.detail = { ...detail({ status: "LOST" }), status: "AWARDED" } as unknown as ListingDetail;
    const { unmount } = render(<BidDetailPage />);
    expect(screen.getByText("Kaybetti")).toBeInTheDocument();
    expect(screen.queryByText("Elendi")).toBeNull();
    unmount();
    h.detail = detail({ status: "LOST", eliminatedAt: new Date().toISOString() });
    render(<BidDetailPage />);
    expect(screen.getByText("Elendi")).toBeInTheDocument();
  });

  it("404'te nötr kart; işe yaramayan 'Tekrar dene' yok", () => {
    h.error = { response: { status: 404 } };
    render(<BidDetailPage />);
    expect(screen.getByText("Teklife ulaşılamıyor.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("geçici hata (5xx) yeniden denemeyi korur", () => {
    h.error = { response: { status: 500 } };
    render(<BidDetailPage />);
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });
});
