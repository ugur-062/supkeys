// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ menu: vi.fn() }));

vi.mock("@/lib/public/suggest-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/public/suggest-client")>(
    "@/lib/public/suggest-client",
  );
  return { ...actual, fetchCategoryMenu: h.menu };
});

import { MegaMenu } from "../mega-menu";

const TREE = [
  {
    id: "39000000",
    name: "Elektrik Sistemleri",
    count: 12,
    children: [
      { id: "39120000", name: "Panolar", count: 7 },
      { id: "39110000", name: "Kablolar", count: 5 },
    ],
  },
  { id: "31000000", name: "Üretim Bileşenleri", count: 0, children: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.menu.mockResolvedValue(TREE);
});

describe("MegaMenu", () => {
  it("kapalıyken panel HİÇ çizilmez, aria-expanded false", () => {
    render(<MegaMenu />);
    expect(screen.getByRole("button", { name: /Kategoriler/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Panolar")).toBeNull();
  });

  it("tıklayınca segmentleri ve seçili segmentin alt dallarını gösterir", async () => {
    const u = userEvent.setup();
    render(<MegaMenu />);
    await u.click(screen.getByRole("button", { name: /Kategoriler/ }));
    expect(await screen.findByText("Elektrik Sistemleri")).toBeTruthy();
    expect(screen.getByText("Panolar")).toBeTruthy();
    expect(screen.getByText("Tüm Elektrik Sistemleri ürünleri →")).toBeTruthy();
  });

  it("alt dalı olmayan segmentte en çok ürünlü dallar gösterilir (panel boş kalmaz)", async () => {
    const u = userEvent.setup();
    render(<MegaMenu />);
    await u.click(screen.getByRole("button", { name: /Kategoriler/ }));
    await screen.findByText("Üretim Bileşenleri");
    await u.hover(screen.getByText("Üretim Bileşenleri"));
    await waitFor(() => expect(screen.getByText("Tüm Üretim Bileşenleri ürünleri →")).toBeTruthy());
    expect(screen.getAllByText("Elektrik Sistemleri").length).toBeGreaterThan(0);
  });

  it("Esc kapatır", async () => {
    const u = userEvent.setup();
    render(<MegaMenu />);
    await u.click(screen.getByRole("button", { name: /Kategoriler/ }));
    await screen.findByText("Panolar");
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("Panolar")).toBeNull());
  });
});
