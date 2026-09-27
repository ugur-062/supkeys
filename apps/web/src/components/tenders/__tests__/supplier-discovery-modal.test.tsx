// @vitest-environment jsdom
/**
 * AI tedarikçi keşfi → "Davet E-postası Gönder" sözleşmesi (2026-09-27):
 *  - YAYIN ÖNCESİ (talep yok, `onCollect` verildi): e-posta HEMEN GİTMEZ —
 *    seçilen adresler forma eklenir; genel "Rothern'e katıl" daveti
 *    (`invite-by-email/batch`) artık hiç çağrılmaz.
 *  - Kayıtlı talepte: talebe özel davet ucu; adres başına GERÇEK sonuç
 *    satırda görünür (gönderilemeyen "Gönderildi" diye işaretlenmez).
 *  - Web araması talebin görünürlük ülkeleriyle çağrılır.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  external: vi.fn(),
  sendExternal: vi.fn(),
  discovery: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-connections", () => ({
  useInviteConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useListingDetail: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useSupplierDiscovery: () => ({ mutateAsync: h.discovery, isPending: false }),
  useExternalSupplierDiscovery: () => ({ mutateAsync: h.external, isPending: false }),
  useExternalTenderInvite: () => ({ mutateAsync: h.sendExternal, isPending: false }),
}));

import { SupplierDiscoveryModal } from "../supplier-discovery-modal";

beforeEach(() => {
  h.discovery.mockReset().mockResolvedValue([]);
  h.external.mockReset().mockResolvedValue([
    { name: "Baret A.Ş.", city: "İzmir", website: null, email: "info@baret.com", reason: "Üretici" },
    { name: "Kask Ltd.", city: null, website: null, email: "satis@kask.com", reason: "Bayi" },
  ]);
  h.sendExternal.mockReset();
  Object.values(h.toast).forEach((f) => f.mockReset());
});

async function searchWeb() {
  fireEvent.click(screen.getByRole("tab", { name: /Web'de Ara/ }));
  fireEvent.click(screen.getByRole("button", { name: "Web'de Ara" }));
  await screen.findByText("Baret A.Ş.");
}

describe("SupplierDiscoveryModal — dış davet", () => {
  it("yayın öncesi: seçilen adres forma eklenir, e-posta GİTMEZ; arama hedef ülkelerle", async () => {
    const onCollect = vi.fn();
    render(
      <SupplierDiscoveryModal
        isOpen
        onClose={() => {}}
        categoryIds={["39121600"]}
        itemNames={["Baret"]}
        targetCountries={["DE"]}
        onCollect={onCollect}
      />,
    );
    await searchWeb();
    expect(h.external.mock.calls[0][0]).toMatchObject({ targetCountries: ["DE"] });
    fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
    fireEvent.click(screen.getByRole("button", { name: "Talebe ekle (1)" }));
    expect(onCollect).toHaveBeenCalledWith(["info@baret.com"]);
    expect(h.sendExternal).not.toHaveBeenCalled();
  });

  it("kayıtlı talep: talebe özel davet; gönderilemeyen adres 'Gönderildi' işaretlenmez", async () => {
    h.sendExternal.mockResolvedValue([
      { email: "info@baret.com", status: "SENT" },
      { email: "satis@kask.com", status: "SUPPRESSED", reason: "Adres e-posta almıyor" },
    ]);
    render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    await searchWeb();
    expect(h.external.mock.calls[0][0]).toMatchObject({ listingId: "l1" });
    fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
    fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
    fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" }));
    await waitFor(() =>
      expect(h.sendExternal).toHaveBeenCalledWith({ listingId: "l1", emails: ["info@baret.com", "satis@kask.com"] }),
    );
    expect(await screen.findByText("Gönderildi")).toBeInTheDocument();
    expect(screen.getByText("Adres e-posta almıyor")).toBeInTheDocument();
    expect(h.toast.warning).toHaveBeenCalledWith("satis@kask.com: Adres e-posta almıyor");
  });
});
