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
    // Yerel ad kutusu her türde açık (2026-10-08); "Diğer" dışında isteğe bağlı.
    expect(screen.getByLabelText("Yerel hukuki yapı")).toHaveValue("");
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

  /**
   * 2026-10-08: kayıt sihirbazı ülkenin yerel yapılarını listeler; yerel ad
   * HER türle saklanır (LIMITED + "GmbH"). Eskiden kutu yalnız "Diğer"de
   * açılıyordu — GmbH'yi UG'ye düzeltmek için türü "Diğer"e çevirmek gerekirdi.
   */
  it("yerel ad her türde görünür ve tür değişmeden düzeltilir; boşaltılınca boş değer gider", async () => {
    const user = userEvent.setup();
    render(
      <EditProfileDialog
        companyId="c1"
        data={data({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" })}
        onClose={() => {}}
      />,
    );
    const local = screen.getByLabelText("Yerel hukuki yapı");
    expect(local).toHaveValue("GmbH");
    expect(local).toHaveAttribute("maxLength", "80");
    await user.clear(local);
    await user.type(local, "UG (haftungsbeschränkt)");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenLastCalledWith(
      { id: "c1", patch: { legalFormLocal: "UG (haftungsbeschränkt)" } },
      expect.anything(),
    );

    await user.clear(local);
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenLastCalledWith({ id: "c1", patch: { legalFormLocal: "" } }, expect.anything());
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("tür değişince yerel ad kutusu boşalır (eski ad yeni türe taşınmaz); kayıtlı türe dönünce geri gelir", async () => {
    const user = userEvent.setup();
    render(
      <EditProfileDialog
        companyId="c1"
        data={data({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" })}
        onClose={() => {}}
      />,
    );
    const type = screen.getByLabelText("Hukuki yapı");
    const local = screen.getByLabelText("Yerel hukuki yapı");
    await user.selectOptions(type, "JOINT_STOCK");
    expect(local).toHaveValue("");
    // Kayıtlı türe dönüş: kayıtlı ad geri gelir, gönderilecek değişiklik kalmaz.
    await user.selectOptions(type, "LIMITED");
    expect(local).toHaveValue("GmbH");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).not.toHaveBeenCalled();

    // Yeni tür + yeni yerel ad birlikte gider; ad yazılmazsa boş gider (API eskisini siler).
    await user.selectOptions(type, "JOINT_STOCK");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenLastCalledWith(
      { id: "c1", patch: { companyType: "JOINT_STOCK", legalFormLocal: "" } },
      expect.anything(),
    );
    await user.type(local, "AG");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenLastCalledWith(
      { id: "c1", patch: { companyType: "JOINT_STOCK", legalFormLocal: "AG" } },
      expect.anything(),
    );

    // "Diğer"e geçiş: yazılı ad serbest metin olarak kalır.
    await user.selectOptions(type, "OTHER");
    expect(local).toHaveValue("AG");
  });

  /**
   * İnceleme 2026-10-08 (admin-type-correction-erases-local-name). Bu sürümden
   * önce kaydolan her yabancı firma "Diğer + yerel ad" olarak saklı. Admin türü
   * düzeltince kutu boşalır; aynı adı yeniden yazıp kaydedince pencere yalnız
   * türü gönderiyordu (ad kayıtlı değerle aynı → "değişmedi") ve API, adsız
   * gelen tür değişikliğinde eski adı SİLİYORDU: admin kutuda GmbH'yı ve
   * başarı bildirimini görüyor, firma adsız "Limited Şirket" kalıyordu.
   */
  it("tür değişirken yerel ad kayıtlı adla AYNI olsa da gönderilir (Diğer + GmbH → Limited + GmbH)", async () => {
    const user = userEvent.setup();
    render(
      <EditProfileDialog
        companyId="c1"
        data={data({ country: "DE", companyType: "OTHER", legalFormLocal: "GmbH" })}
        onClose={() => {}}
      />,
    );
    const local = screen.getByLabelText("Yerel hukuki yapı");
    await user.selectOptions(screen.getByLabelText("Hukuki yapı"), "LIMITED");
    expect(local).toHaveValue("");
    await user.type(local, "GmbH");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenLastCalledWith(
      { id: "c1", patch: { companyType: "LIMITED", legalFormLocal: "GmbH" } },
      expect.anything(),
    );
  });

  /**
   * Türün sahibi API'dir (2026-10-08): yerel ad firmanın ülkesinin listesindeyse
   * tür oradan yazılır. Admin'in seçtiği tür ezildiyse yanıt `mappedCompanyType`
   * taşır; pencere bunu söyler — yalnız "Güncellendi" demek "seçtiğim tür
   * kaydedildi" diye okunurdu.
   */
  it("API türü yerel addan yazdıysa bildirim hangi türün kaydedildiğini söyler; hiçbir alan değişmediyse 'Güncellendi' denmez", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <EditProfileDialog
        companyId="c1"
        data={data({ country: "DE", companyType: "LIMITED", legalFormLocal: "GmbH" })}
        onClose={onClose}
      />,
    );
    await user.selectOptions(screen.getByLabelText("Hukuki yapı"), "JOINT_STOCK");
    await user.type(screen.getByLabelText("Yerel hukuki yapı"), "GmbH");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).toHaveBeenLastCalledWith(
      { id: "c1", patch: { companyType: "JOINT_STOCK", legalFormLocal: "GmbH" } },
      expect.anything(),
    );

    const { onSuccess } = h.mutate.mock.calls.at(-1)![1] as { onSuccess: (r: unknown) => void };

    // GmbH, DE'de Limited: API hiçbir şey yazmadı (kayıt zaten Limited + GmbH).
    onSuccess({ ok: true, changed: [], mappedCompanyType: "LIMITED" });
    expect(h.toast.info).toHaveBeenCalledWith(expect.stringMatching(/"Limited Şirket" olarak kaydedildi.*"GmbH"/));
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    // Başka alan da değiştiyse ikisi birlikte: ne kaydedildi + kaç alan.
    vi.clearAllMocks();
    onSuccess({ ok: true, changed: ["companyType", "name"], mappedCompanyType: "SOLE_PROPRIETOR" });
    expect(h.toast.info).toHaveBeenCalledWith(expect.stringMatching(/"Şahıs Firması" olarak kaydedildi/));
    expect(h.toast.success).toHaveBeenCalledWith("Güncellendi (2 alan)");

    // Eşleme yoksa eskisi gibi yalnız başarı bildirimi.
    vi.clearAllMocks();
    onSuccess({ ok: true, changed: ["companyType"] });
    expect(h.toast.info).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith("Güncellendi (1 alan)");
  });

  it("ülke ya da firma adı boşaltılınca istek gitmez, alanı söyleyen uyarı (D-201)", async () => {
    const user = userEvent.setup();
    render(<EditProfileDialog companyId="c1" data={data()} onClose={() => {}} />);
    await user.clear(screen.getByLabelText("Ülke (kod)"));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Ülke/));

    await user.type(screen.getByLabelText("Ülke (kod)"), "TR");
    await user.clear(screen.getByLabelText("Firma adı (görünen)"));
    h.toast.error.mockClear();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/Firma adı/));
  });
});
