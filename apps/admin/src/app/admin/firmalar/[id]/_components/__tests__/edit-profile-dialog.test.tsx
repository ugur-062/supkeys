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
});
