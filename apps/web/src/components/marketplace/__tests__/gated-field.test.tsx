// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GatedField } from "../gated-field";

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
