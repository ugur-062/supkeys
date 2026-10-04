// @vitest-environment jsdom
/**
 * KÜÇÜK ÜLKE BAYRAĞI (2026-10-04, kullanıcı: "TR AZ DE yerine küçük bayraklar").
 * Emoji bayrağı Windows'ta iki harf ("TR") basıyordu; bileşen projeye
 * kopyalanmış flag-icons SVG'sini çizer. Sözleşme: dosya yolu, erişilebilir
 * ad (bağımsız → ülke adı, ad yanında → boş alt), dosyasız kodda metin yedeği
 * ve ülke tablosundaki her kodun dosyasının gerçekten var olması.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { COUNTRIES, flagAssetPath } from "@rothern/shared";
import { describe, expect, it } from "vitest";
import { CountryFlag, CountryLabel } from "../country-flag";

describe("CountryFlag", () => {
  it("bağımsız bayrak: SVG görseli, sabit boyut, erişilebilir adı ülke adı", () => {
    render(<CountryFlag code="DE" />);
    const img = screen.getByRole("img", { name: "Almanya" });
    expect(img).toHaveAttribute("src", "/flags/4x3/de.svg");
    expect(img).toHaveAttribute("title", "Almanya");
    expect(img).toHaveAttribute("width", "16");
    expect(img).toHaveAttribute("height", "12");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("md boyutu 20×15; küçük harf kod da çözülür", () => {
    render(<CountryFlag code="az" size="md" />);
    const img = screen.getByRole("img", { name: "Azerbaycan" });
    expect(img).toHaveAttribute("src", "/flags/4x3/az.svg");
    expect(img).toHaveAttribute("width", "20");
    expect(img).toHaveAttribute("height", "15");
  });

  it("dekoratif bayrak (ad yanında yazılı): boş alt, ekran okuyucudan gizli", () => {
    const { container } = render(<CountryFlag code="TR" decorative />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("aria-hidden")).toBe("true");
    expect(img.hasAttribute("title")).toBe(false);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("emoji basmaz (bölgesel gösterge karakteri yok)", () => {
    const { container } = render(<CountryFlag code="TR" />);
    expect(container.textContent ?? "").not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  });

  it("dosyası olmayan KKTC 'KKTC' metnine, tablodışı kod koduna düşer; boş kod hiçbir şey basmaz", () => {
    const { container, rerender } = render(<CountryFlag code="XN" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: /Kıbrıs/ })).toHaveTextContent("KKTC");
    rerender(<CountryFlag code="ZZ" />);
    expect(container.textContent).toBe("ZZ");
    rerender(<CountryFlag code={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("Kosova'nın (XK) bayrağı çizilir (emoji döneminde gizliydi)", () => {
    render(<CountryFlag code="XK" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/flags/4x3/xk.svg");
  });
});

describe("CountryLabel", () => {
  it("bayrak dekoratif + ekran dilinde ülke adı ('İstanbul' yerine 'Türkiye')", () => {
    const { container } = render(<CountryLabel code="TR" />);
    expect(container).toHaveTextContent("Türkiye");
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});

describe("bayrak dosyaları", () => {
  it("ülke tablosundaki her kodun (XN hariç) SVG'si public/flags/4x3 altında var", () => {
    const root = path.resolve(__dirname, "../../../../public");
    const missing = COUNTRIES.map((c) => flagAssetPath(c.code))
      .filter((p): p is string => !!p)
      .filter((p) => !existsSync(path.join(root, p)));
    expect(missing).toEqual([]);
    expect(COUNTRIES.filter((c) => !flagAssetPath(c.code)).map((c) => c.code)).toEqual(["XN"]);
  });
});
