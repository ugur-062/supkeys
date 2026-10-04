// @vitest-environment jsdom
import { readdirSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CountryFlag } from "../country-flag";

describe("admin CountryFlag", () => {
  it("bağımsız bayrak: SVG görseli, erişilebilir ad Türkçe ülke adı", () => {
    const { container } = render(<CountryFlag code="DE" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/flags/4x3/de.svg");
    expect(img.getAttribute("alt")).toBe("Almanya");
    expect(img.getAttribute("title")).toBe("Almanya");
    expect(img.getAttribute("width")).toBe("16");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("dekoratif bayrak: boş alt, ekran okuyucudan gizli", () => {
    const { container } = render(<CountryFlag code="AZ" decorative />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("dosyası olmayan KKTC kısa metne düşer, boş kod hiçbir şey basmaz", () => {
    const { container, rerender } = render(<CountryFlag code="XN" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("KKTC");
    rerender(<CountryFlag code={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("admin bayrak seti web ile birebir aynı (web testi seti ülke tablosuyla eşler)", () => {
    const list = (app: string) =>
      readdirSync(path.resolve(__dirname, `../../../../${app}/public/flags/4x3`)).sort();
    const admin = list("admin");
    expect(admin.length).toBeGreaterThan(240);
    expect(admin).toEqual(list("web"));
  });
});
