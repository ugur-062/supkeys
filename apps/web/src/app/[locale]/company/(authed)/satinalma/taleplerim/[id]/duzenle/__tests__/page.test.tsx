// @vitest-environment jsdom
/**
 * Talep düzenleme sayfası kapıları (arayüz testi D-039 / D-244): olmayan kayıt
 * "bulunamadı"; firmanın başka kullanıcısının talebi formu AÇMAZ (API 403'üyle
 * aynı kural); düzenlenebilir talepte sayfa başlığı ve Vazgeç görünür.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: { data: undefined as unknown, isLoading: false } as {
    data: unknown;
    isLoading: boolean;
    isPending?: boolean;
    isError?: boolean;
    error?: unknown;
    refetch?: () => void;
  },
  user: { id: "u1" } as { id: string } | null,
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "l1" }) }));
vi.mock("@/hooks/use-company-listings", () => ({ useListingDetail: () => h.detail }));
vi.mock("@/hooks/use-company-auth", () => ({ useCompanyAuth: () => ({ user: h.user, company: null }) }));
vi.mock("@/components/tenders/quick/quick-request", () => ({
  QuickRequest: (p: { invitationsAsOf?: string; retiredCategory?: boolean; listingStatus?: string }) => (
    <div
      data-testid="quick-request"
      data-invitations-as-of={p.invitationsAsOf ?? ""}
      data-retired-category={String(!!p.retiredCategory)}
      data-status={p.listingStatus ?? ""}
    />
  ),
}));
// Eşleyici sahte; `hasRetiredCategory` GERÇEK (sayfanın forma verdiği işaret sınanıyor).
vi.mock("@/lib/tenders/map-detail-to-form", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenders/map-detail-to-form")>()),
  mapDetailToForm: () => ({}),
}));

import EditTenderPage from "../page";

const listing = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  title: "Çelik boru alımı",
  status: "DRAFT",
  isOwner: true,
  canEdit: true,
  createdById: "u1",
  ...over,
});

beforeEach(() => {
  h.user = { id: "u1" };
  h.detail = { data: undefined, isLoading: false };
});

describe("EditTenderPage", () => {
  it("olmayan kayıtta 'bulunamadı' yazar, 'yetkiniz yok' yazmaz", () => {
    render(<EditTenderPage />);
    expect(screen.getByRole("heading", { name: "Satın Alma Talebi bulunamadı" })).toBeInTheDocument();
    expect(screen.getByText("Bu talep bulunamadı ya da kaldırılmış.")).toBeInTheDocument();
    expect(screen.queryByText(/yetkiniz yok/)).toBeNull();
    expect(screen.queryByTestId("quick-request")).toBeNull();
  });

  it("firmanın başka kullanıcısının talebi (Sahip dahil) formu açmaz, nedeni söylenir", () => {
    h.detail = { data: listing({ createdById: "u2" }), isLoading: false };
    render(<EditTenderPage />);
    expect(screen.getByRole("heading", { name: "Düzenlenemez" })).toBeInTheDocument();
    expect(screen.getByText(/yalnız açan kullanıcı düzenleyebilir/)).toBeInTheDocument();
    expect(screen.queryByTestId("quick-request")).toBeNull();
  });

  it("talebi açan kullanıcı formu sayfa başlığı ve Vazgeç ile görür", () => {
    h.detail = { data: listing(), isLoading: false };
    render(<EditTenderPage />);
    expect(screen.getByRole("heading", { name: "Talebi düzenle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vazgeç" })).toHaveAttribute("href", expect.stringContaining("/company/ilan/l1"));
    expect(screen.getByTestId("quick-request")).toBeInTheDocument();
  });

  it("AI-3: detayın davetli listesini okuduğu anı (invitationsAsOf) forma verir — form kaydederken geri gönderir", () => {
    // Form açıkken otomatik tedarikçi aramasının davet ettiği üye, kayıtla silinmesin.
    h.detail = { data: listing({ invitationsAsOf: "2026-10-09T08:00:00.000Z" }), isLoading: false };
    render(<EditTenderPage />);
    expect(screen.getByTestId("quick-request")).toHaveAttribute("data-invitations-as-of", "2026-10-09T08:00:00.000Z");
  });

  // Gözden geçirme R-WEB-01: eşleyici gizli kategoriyi forma vermez → alanın
  // neden boş olduğunu form sayfadan öğrenir (kategorinin adı anılmadan).
  it("saklanan kodlarında gizli kategori olan talepte forma 'kullanımdan kalkan kategori' işareti ve durum gider", () => {
    h.detail = { data: listing({ status: "OPEN", categoryIds: ["46181500"] }), isLoading: false };
    render(<EditTenderPage />);
    expect(screen.getByTestId("quick-request")).toHaveAttribute("data-retired-category", "true");
    expect(screen.getByTestId("quick-request")).toHaveAttribute("data-status", "OPEN");
  });

  it("görünür kategorili (ya da güncel API'nin kategorisiz döndürdüğü) talepte işaret gitmez", () => {
    h.detail = { data: listing({ status: "OPEN", categoryIds: ["39121600"] }), isLoading: false };
    const view = render(<EditTenderPage />);
    expect(screen.getByTestId("quick-request")).toHaveAttribute("data-retired-category", "false");
    view.unmount();
    h.detail = { data: listing({ status: "OPEN", categoryIds: [] }), isLoading: false };
    render(<EditTenderPage />);
    expect(screen.getByTestId("quick-request")).toHaveAttribute("data-retired-category", "false");
  });
});

describe("EditTenderPage — kesinti ≠ bulunamadı (canlı doğrulama 2026-10-09 taraması)", () => {
  const NOT_FOUND = { name: "Satın Alma Talebi bulunamadı" };

  it("talep okunamadıysa (yanıt yok) 'bulunamadı' değil hata + Tekrar dene", () => {
    const refetch = vi.fn();
    h.detail = { data: undefined, isLoading: false, isPending: false, isError: true, error: { message: "Network Error" }, refetch };
    render(<EditTenderPage />);
    expect(screen.queryByRole("heading", NOT_FOUND)).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each([502, 503, 429])("HTTP %i de okunamadı sayılır", (status) => {
    h.detail = { data: undefined, isLoading: false, isPending: false, isError: true, error: { response: { status } }, refetch: vi.fn() };
    render(<EditTenderPage />);
    expect(screen.queryByRole("heading", NOT_FOUND)).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("API'nin 404 yanıtı gerçek 'bulunamadı'dır", () => {
    h.detail = { data: undefined, isLoading: false, isPending: false, isError: true, error: { response: { status: 404 } }, refetch: vi.fn() };
    render(<EditTenderPage />);
    expect(screen.getByRole("heading", NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) 'bulunamadı' değil 'Yükleniyor…'", () => {
    h.detail = { data: undefined, isLoading: false, isPending: true };
    render(<EditTenderPage />);
    expect(screen.queryByRole("heading", NOT_FOUND)).toBeNull();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("arka plan yoklaması düşünce açık form kalır (yazılan değişiklik kaybolmaz)", () => {
    h.detail = { data: listing(), isLoading: false, isPending: false, isError: true, error: { message: "Network Error" }, refetch: vi.fn() };
    render(<EditTenderPage />);
    expect(screen.getByTestId("quick-request")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
