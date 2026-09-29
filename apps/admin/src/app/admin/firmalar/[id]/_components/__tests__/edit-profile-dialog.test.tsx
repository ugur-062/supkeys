// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useUpdateCompanyProfile: () => ({ mutate: h.mutate, isPending: false }),
}));

import { EditProfileDialog } from "../edit-profile-dialog";

function data(over: Record<string, unknown> = {}) {
  return { name: "Acme", country: "TR", iban: null, ibanHolder: null, bankSwiftBic: null, bankName: null, ...over } as never;
}

beforeEach(() => vi.clearAllMocks());

/**
 * Kayıt tüm ülkelere açık (2026-09-27): IBAN'sız ülkede alan "Hesap No";
 * SWIFT ve banka adı admin'den düzeltilebilir (ülke kodu API'de tam listeden).
 */
describe("EditProfileDialog", () => {
  it("IBAN ülkesinde IBAN etiketi; IBAN'sız ülkede Hesap No", () => {
    const { unmount } = render(<EditProfileDialog companyId="c1" data={data()} onClose={() => {}} />);
    expect(screen.getByLabelText("IBAN")).toBeInTheDocument();
    unmount();
    render(<EditProfileDialog companyId="c1" data={data({ country: "IN", usesIban: false })} onClose={() => {}} />);
    expect(screen.queryByLabelText("IBAN")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Hesap No")).toBeInTheDocument();
    expect(screen.getByLabelText("Hesap Sahibi")).toBeInTheDocument();
  });

  it("SWIFT normalize edilip gönderilir; 2 harf olmayan ülke kodu reddedilir", async () => {
    const user = userEvent.setup();
    render(<EditProfileDialog companyId="c1" data={data({ country: "IN", usesIban: false })} onClose={() => {}} />);
    await user.type(screen.getByLabelText("SWIFT / BIC"), "hdfc in bb");
    await user.type(screen.getByLabelText("Banka adı"), "HDFC Bank");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenCalledWith(
      { id: "c1", patch: { bankSwiftBic: "HDFCINBB", bankName: "HDFC Bank" } },
      expect.anything(),
    );

    const cc = screen.getByLabelText("Ülke (kod)");
    await user.clear(cc);
    await user.type(cc, "Z");
    h.mutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalled();
  });

  /**
   * Derin denetim MU-02: fatura e-postası doluysa firmanın TÜM e-postaları
   * oraya gider — biçim hatası kaydedilmez; küçük harfle gönderilir.
   */
  it("fatura e-postası: geçersiz biçim reddedilir, geçerli adres küçük harfle gider", async () => {
    const user = userEvent.setup();
    render(<EditProfileDialog companyId="c1" data={data()} onClose={() => {}} />);
    const input = screen.getByLabelText("Fatura e-postası");
    expect(input).toHaveAttribute("type", "email");
    await user.type(input, "muhasebe@firma,com");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, "Muhasebe@Firma.com");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenCalledWith(
      { id: "c1", patch: { billingEmail: "muhasebe@firma.com" } },
      expect.anything(),
    );
  });

  /**
   * Hukuki yapı (2026-09-27): yabancı firmanın GmbH/LLC'si admin'den
   * düzeltilemiyordu. "Diğer" iken yerel ad zorunlu (API ile aynı kural).
   */
  it("hukuki yapı Diğer seçilince yerel ad zorunlu, ikisi birlikte gönderilir", async () => {
    const user = userEvent.setup();
    render(<EditProfileDialog companyId="c1" data={data({ country: "DE", companyType: "LIMITED" })} onClose={() => {}} />);
    expect(screen.queryByLabelText("Yerel hukuki yapı")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Hukuki yapı"), "OTHER");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalled();

    await user.type(screen.getByLabelText("Yerel hukuki yapı"), "GmbH");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenCalledWith(
      { id: "c1", patch: { companyType: "OTHER", legalFormLocal: "GmbH" } },
      expect.anything(),
    );
  });

  it("mevcut yerel ad düzenlenir; hukuki yapı değişmediyse yalnız yerel ad gider", async () => {
    const user = userEvent.setup();
    render(
      <EditProfileDialog
        companyId="c1"
        data={data({ country: "DE", companyType: "OTHER", legalFormLocal: "GmbH" })}
        onClose={() => {}}
      />,
    );
    const local = screen.getByLabelText("Yerel hukuki yapı");
    expect(local).toHaveValue("GmbH");
    await user.clear(local);
    await user.type(local, "GmbH & Co. KG");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenCalledWith(
      { id: "c1", patch: { legalFormLocal: "GmbH & Co. KG" } },
      expect.anything(),
    );
  });
});
