// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Breadcrumb } from "../breadcrumb";
import { Chip } from "../chip";
import { Iban } from "../iban";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

/**
 * Mobil denetim 2026-10: küçük kontrollerin dokunma alanı görünmez bir
 * katmanla (`after:absolute after:-inset-*`) büyür, görünüm değişmez. jsdom
 * yerleşim yapmaz → kilitlenen şey sınıflardır (alan hesabı yorumlarda).
 */
const classes = (el: Element) => el.className.split(/\s+/);

describe("Chip × (g05)", () => {
  it("görünen daire 20 px kalır, dokunma alanı 44×36 px", () => {
    render(
      <Chip onRemove={() => {}} removeLabel="Üretici süzgecini kaldır">
        Üretici
      </Chip>,
    );
    const btn = screen.getByRole("button", { name: "Üretici süzgecini kaldır" });
    expect(classes(btn)).toEqual(
      expect.arrayContaining(["relative", "size-5", "shrink-0", "after:absolute", "after:-inset-x-3", "after:-inset-y-2"]),
    );
  });
});

describe("Breadcrumb ev ikonu (g05)", () => {
  it("ikon 16 px kalır, bağlantının dokunma alanı 44 px", () => {
    render(<Breadcrumb home={{ href: "/company/satinalma", label: "Satınalma anasayfası" }} items={[{ label: "Ürün" }]} />);
    const link = screen.getByRole("link", { name: "Satınalma anasayfası" });
    expect(classes(link)).toEqual(expect.arrayContaining(["relative", "block", "after:absolute", "after:-inset-3.5"]));
    expect(link.querySelector("svg")?.getAttribute("class")).toContain("size-4");
  });
});

describe("Iban göster/kopyala (g07/g08/g11)", () => {
  it("iki düğme de 38 px alan alır ve alanlar çakışmaz (kopyala ml-3)", () => {
    render(<Iban value="TR330006100519786457841326" />);
    const show = screen.getByRole("button", { name: "IBAN'ı göster" });
    const copy = screen.getByRole("button", { name: "IBAN'ı kopyala" });
    for (const btn of [show, copy]) {
      expect(classes(btn)).toEqual(expect.arrayContaining(["relative", "after:absolute", "after:-inset-2", "-m-1", "p-1"]));
    }
    expect(classes(copy)).toContain("ml-3");
    expect(classes(show)).not.toContain("ml-3");
    // Dar kartta açık IBAN sığmazsa düğmeler alt satıra iner.
    expect(classes(show.parentElement!)).toEqual(expect.arrayContaining(["flex-wrap", "max-w-full"]));
  });

  it("maskesiz (yalnız kopyala) düğmede ek boşluk yok", () => {
    render(<Iban value="TR330006100519786457841326" masked={false} />);
    expect(classes(screen.getByRole("button", { name: "IBAN'ı kopyala" }))).not.toContain("ml-3");
  });
});
