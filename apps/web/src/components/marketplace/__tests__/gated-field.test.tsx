// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { GatedField } from "../gated-field";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

function signIn(member: boolean) {
  useCompanyAuthStore.setState({
    isHydrated: true,
    user: member ? ({ id: "u", permissions: ["sell:view"], roles: [] } as never) : null,
    company: member ? ({ tier: "STANDART", companyVerificationStatus: "VERIFIED" } as never) : null,
  });
}

beforeEach(() => signIn(false));

describe("GatedField box — kayıt bağlantısı niyet + dönüş taşır (arayüz testi D-332)", () => {
  it("verilen kayıt bağlantısını kullanır", () => {
    render(
      <GatedField
        size="box"
        label="Kalem listesi"
        redirect="/company/satis?q=ROT-1#acik-talepler"
        signup="/company/kayit?intent=teklif&redirect=%2Fcompany%2Fsatis"
      />,
    );
    expect(screen.getByRole("link", { name: /kaydol/i })).toHaveAttribute(
      "href",
      "/company/kayit?intent=teklif&redirect=%2Fcompany%2Fsatis",
    );
  });

  it("verilmezse kayıt da giriş hedefine döner (çıplak /company/kayit değil)", () => {
    render(<GatedField size="box" label="Kalem listesi" redirect="/company/firma/abc" />);
    expect(screen.getByRole("link", { name: /kaydol/i })).toHaveAttribute(
      "href",
      "/company/kayit?redirect=%2Fcompany%2Ffirma%2Fabc",
    );
  });
});

describe("GatedField inline — alan başına tam cümle (arayüz testi D-083)", () => {
  it("sentence verilince genel '{label} için' kalıbı yerine alanın cümlesi", () => {
    const { container } = render(<GatedField label="Firmanın web sitesi" sentence="sellerSite" redirect="/company/firma/abc" />);
    expect(container.textContent).toBe("Firmanın web sitesini görmek için giriş yapın");
    expect(screen.getByRole("link", { name: "giriş yapın" })).toHaveAttribute(
      "href",
      "/company/login?next=%2Fcompany%2Ffirma%2Fabc",
    );
  });

  it("sentence yoksa genel kalıp kalır", () => {
    const { container } = render(<GatedField label="Puanlar" />);
    expect(container.textContent).toBe("Puanlar için giriş yapın");
  });
});

/**
 * Arayüz testi kapanış S-PUB-ADMIN: header "Panele git" derken firma profili
 * oturumlu üyeye "Kayıt ücretsiz… Giriş yapın · Ücretsiz kaydolun" basıyordu.
 */
describe("GatedField — oturumlu üyeye giriş/kayıt denmez", () => {
  it("box: kayıt/giriş yerine panel karşılığı, misafir ipucu yok", () => {
    signIn(true);
    render(
      <GatedField
        size="box"
        label="Puan dağılımı"
        hint="Kayıt ücretsiz — 2 dakika"
        redirect="/company/firma/abc"
      />,
    );
    expect(screen.queryByRole("link", { name: /kaydol/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /giriş/i })).toBeNull();
    expect(screen.queryByText("Kayıt ücretsiz — 2 dakika")).toBeNull();
    expect(screen.getByText("Puan dağılımı üye panelinizde")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panelde görüntüle" })).toHaveAttribute("href", "/company/firma/abc");
  });

  it("box: üyeye özel ipucu verilirse çizilir", () => {
    signIn(true);
    render(<GatedField size="box" label="Puanlar" hint="misafir" memberHint="üye notu" redirect="/company/firma/abc" />);
    expect(screen.getByText("üye notu")).toBeInTheDocument();
  });

  it("inline iletişim: giriş cümlesi yerine doğrudan panel bağlantısı", () => {
    signIn(true);
    const { container } = render(<GatedField label="Rothern ID" sentence="contact" redirect="/company/firma/abc" />);
    expect(container.textContent).toBe("Rothern ID ve iletişim bilgileri panelde");
    expect(screen.getByRole("link", { name: "panelde" })).toHaveAttribute("href", "/company/firma/abc");
  });

  it("panel karşılığı yoksa (dönüş adresi yok / satıcı sitesi) üyeye hiç çizilmez", () => {
    signIn(true);
    const a = render(<GatedField size="box" label="Kalem listesi" />);
    expect(a.container.textContent).toBe("");
    a.unmount();
    const b = render(<GatedField label="Site" sentence="sellerSite" redirect="/company/urun/a/b" />);
    expect(b.container.textContent).toBe("");
  });
});
