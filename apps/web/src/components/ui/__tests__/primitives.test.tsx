// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { avatarInitials, avatarHash, AVATAR_PASTELS } from "@/lib/avatar-utils";
import { Avatar } from "../avatar";
import { Badge } from "../badge";
import { Breadcrumb } from "../breadcrumb";
import { pageSlots } from "../pagination";

describe("pageSlots — 7 yuva", () => {
  it("toplam ≤ 7 → hepsi", () => {
    expect(pageSlots(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("baştayken 1 2 3 4 5 … N", () => {
    expect(pageSlots(1, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
    expect(pageSlots(4, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
  });
  it("ortadayken 1 … c-1 c c+1 … N", () => {
    expect(pageSlots(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });
  it("sondayken 1 … N-4 … N", () => {
    expect(pageSlots(19, 20)).toEqual([1, "…", 16, 17, 18, 19, 20]);
  });
  it("her zaman 7 yuva (N > 7)", () => {
    for (let c = 1; c <= 30; c += 1) expect(pageSlots(c, 30)).toHaveLength(7);
  });
});

describe("Avatar monogram", () => {
  it("TR büyük harf: 'izmir demir' → 'İD'; tek kelime ilk iki harf", () => {
    expect(avatarInitials("izmir demir")).toBe("İD");
    expect(avatarInitials("ışık")).toBe("IŞ");
  });
  it("aynı ad aynı pastel (deterministik), farklı adlar dağılır", () => {
    const a = avatarHash("Samsun Oluklu Mukavva") % AVATAR_PASTELS.length;
    expect(avatarHash("Samsun Oluklu Mukavva") % AVATAR_PASTELS.length).toBe(a);
    render(<Avatar name="Samsun Oluklu Mukavva" size={48} />);
    const el = screen.getByRole("img", { name: "Samsun Oluklu Mukavva" });
    expect(el.textContent).toBe("SO");
    expect(el.className).toContain(AVATAR_PASTELS[a]!.bg);
  });
});

describe("Badge / Breadcrumb", () => {
  it("verified rozeti ikon taşır, neutral taşımaz", () => {
    const { container } = render(
      <>
        <Badge tone="verified">Doğrulanmış</Badge>
        <Badge tone="neutral">Üretici</Badge>
      </>,
    );
    const badges = container.querySelectorAll("span");
    expect(badges[0]!.querySelector("svg")).not.toBeNull();
    expect(badges[1]!.querySelector("svg")).toBeNull();
  });
  it("kırıntıda son öğe aria-current=page, öncekiler bağlantı", () => {
    render(<Breadcrumb items={[{ label: "Anasayfa", href: "/" }, { label: "Ürünler", href: "/urunler" }, { label: "Pano" }]} />);
    expect(screen.getByText("Pano").getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Ürünler" }).getAttribute("href")).toBe("/urunler");
  });
});
