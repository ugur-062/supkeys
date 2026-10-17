// @vitest-environment jsdom
/**
 * YAYIN PANELİ — elle "Uygun tedarikçi öner ve davet et" düğmesi (canlı
 * doğrulama 2026-10-09, AI-UI-5).
 *
 * Otomatik arama AÇIK yayımlanan talepte AI zaten kendisi arıyor ve davet
 * ediyor; "AI … arıyor" durumunun hemen üstündeki aynı boydaki düğme kalan bir
 * iş gibi okunuyordu → orada çizilmez (elle pencere talep sayfasında durur).
 * Otomatik arama KAPALI talepte düğme kalır.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: { data: undefined as unknown, isError: false },
  company: {} as Record<string, unknown> | null,
  modal: vi.fn(),
}));

vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ user: { id: "u1" }, company: h.company }),
}));
vi.mock("@/hooks/use-company-listings", () => ({ useListingDetail: () => h.detail }));
vi.mock("@/components/tenders/ai-suppliers/listing-suggestions", () => ({
  ListingSuggestions: ({ variant }: { variant: string }) => <div data-testid="ai-status" data-variant={variant} />,
}));
vi.mock("@/components/tenders/share-listing", () => ({ ShareListing: () => <div data-testid="share" /> }));
vi.mock("@/components/tenders/supplier-discovery-modal", () => ({
  SupplierDiscoveryModal: (p: { isOpen: boolean; listingId?: string }) => {
    h.modal(p);
    return p.isOpen ? <div role="dialog" aria-label="AI ile tedarikçi bul" /> : null;
  },
}));

import { PublishedPanel } from "../published-panel";

const MANUAL = "Uygun tedarikçi öner ve davet et";

function renderPanel() {
  return render(
    <PublishedPanel listingId="l1" title="Hidrolik keçe takımı" categoryIds={["39121600"]} itemNames={["Keçe"]} onNew={vi.fn()} />,
  );
}

beforeEach(() => {
  h.modal.mockClear();
  h.company = { id: "c1", tier: "GOLD", companyVerificationStatus: "VERIFIED" };
  h.detail = { data: undefined, isError: false };
});

describe("PublishedPanel — elle davet düğmesi (AI-UI-5)", () => {
  it("otomatik arama AÇIK yayımlandıysa düğme çizilmez; 'Talebi gör' ve AI durumu kalır", () => {
    h.detail = { data: { id: "l1", aiDiscovery: true, visibility: "PUBLIC", publicPath: null }, isError: false };
    renderPanel();
    expect(screen.getByRole("heading", { name: "Talebiniz yayında" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MANUAL })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Talebi gör" })).toHaveAttribute("href", "/company/ilan/l1");
    expect(screen.getByTestId("ai-status")).toHaveAttribute("data-variant", "panel");
    // Tek düğme kaldı: iki sütunlu ızgara kurulmaz.
    expect(screen.getByRole("link", { name: "Talebi gör" }).parentElement!.className).not.toMatch(/sm:grid-cols-2/);
  });

  it("bağlantılara açık talepte de otomatik arama açıksa düğme çizilmez", () => {
    h.detail = { data: { id: "l1", aiDiscovery: true, visibility: "CONNECTIONS" }, isError: false };
    renderPanel();
    expect(screen.queryByRole("button", { name: MANUAL })).not.toBeInTheDocument();
  });

  it("otomatik arama KAPALI yayımlandıysa düğme durur ve elle pencereyi açar", () => {
    h.detail = { data: { id: "l1", aiDiscovery: false, visibility: "PUBLIC" }, isError: false };
    renderPanel();
    const button = screen.getByRole("button", { name: MANUAL });
    expect(button).toBeEnabled();
    expect(button.parentElement!.className).toMatch(/sm:grid-cols-2/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "AI ile tedarikçi bul" })).toBeInTheDocument();
    expect(h.modal).toHaveBeenLastCalledWith(expect.objectContaining({ isOpen: true, listingId: "l1" }));
  });

  it("özel talepte tur koşmaz (kutu işaretli kalmış olsa da): düğme durur", () => {
    h.detail = { data: { id: "l1", aiDiscovery: true, visibility: "PRIVATE" }, isError: false };
    renderPanel();
    expect(screen.getByRole("button", { name: MANUAL })).toBeInTheDocument();
  });

  it("talep okunana dek düğme belirip kaybolmaz (çizilmez); talep okunamazsa eski davranış (düğme)", () => {
    const loading = renderPanel();
    expect(screen.queryByRole("button", { name: MANUAL })).not.toBeInTheDocument();
    loading.unmount();
    h.detail = { data: undefined, isError: true };
    renderPanel();
    expect(screen.getByRole("button", { name: MANUAL })).toBeInTheDocument();
  });

  it("doğrulanmamış firmada (AI durumu da yok) pasif düğme + neden eskisi gibi", () => {
    h.company = { id: "c1", tier: "STANDART", companyVerificationStatus: "UNVERIFIED" };
    h.detail = { data: { id: "l1", aiDiscovery: true, visibility: "PUBLIC" }, isError: false };
    renderPanel();
    const button = screen.getByRole("button", { name: MANUAL });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Tedarikçi önerisi firma doğrulaması gerektirir");
    expect(screen.queryByTestId("ai-status")).not.toBeInTheDocument();
  });
});

/**
 * Son canlı kontrol 2026-10-10 (AUTO-COUNT-1 / F3): eski taslaktan kalan dış
 * davetlerin sonucu. Kuyrukta olup talep kapanmadan gidemeyecek adres "sıraya
 * alındı" sayısına girmez ve satırında durum + neden yazar (talep sayfasındaki
 * "E-postayla davet edilenler" bölümüyle aynı).
 */
describe("PublishedPanel — dış davet sonuçları", () => {
  it("gidemeyecek davet sayılmaz; satırında 'Gönderilmedi' ve nedeni yazar", () => {
    h.detail = { data: { id: "l1", aiDiscovery: false, visibility: "PUBLIC" }, isError: false };
    render(
      <PublishedPanel
        listingId="l1"
        title="Hidrolik keçe takımı"
        categoryIds={["39121600"]}
        itemNames={["Keçe"]}
        inviteResults={[
          { email: "satis@gidecek.com.tr", status: "QUEUED", sendAfter: "2026-10-12T06:00:00.000Z" },
          { email: "satis@bekleyen.com.tr", status: "QUEUED", notSentReason: "FREQUENCY" },
        ]}
        onNew={vi.fn()}
      />,
    );
    expect(screen.getByText(/^1 davet sıraya alındı/)).toBeInTheDocument();
    const held = screen.getByText("satis@bekleyen.com.tr").closest("li")!;
    expect(held).toHaveTextContent("Gönderilmedi · Adres bu hafta başka bir davet aldı; talep kapanmadan sıra gelmedi");
    expect(held).not.toHaveTextContent("Sıraya alındı");
    expect(screen.getByText("satis@gidecek.com.tr").closest("li")!).toHaveTextContent("Sıraya alındı");
  });
});
