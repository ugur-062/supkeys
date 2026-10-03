// @vitest-environment jsdom
/**
 * KADEMELİ FİYAT (arayüz testi D-050): "Kademe ekle" 0 fiyatlı satır
 * üretiyordu, silinen fiyat 0'a dönüyordu ve ray fiyatı "tamam" sayarken
 * taslak kaydı bile 400 alıyordu. Yeni satır BOŞ başlar, boş değer boş kalır,
 * eksik satır uyarılır; tamamlanma kuralı fiyat > 0 ister.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { productCompletion, productPublishBlockerCodes, type ProductLike } from "@rothern/shared";
import type { PriceTier } from "@/hooks/use-company-items";
import { PriceModeField, isTierComplete } from "../price-mode-field";

let latest: PriceTier[] = [];
function Harness({ initial }: { initial: PriceTier[] }) {
  const [tiers, setTiers] = useState(initial);
  latest = tiers;
  return (
    <PriceModeField
      mode="TIERED"
      amount=""
      tiers={tiers}
      currency="TRY"
      unit="adet"
      onChange={(n) => {
        if (n.tiers) setTiers(n.tiers);
      }}
    />
  );
}

describe("PriceModeField — kademeler", () => {
  it("Kademe ekle fiyatı BOŞ satır üretir ve satır uyarılır", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ minQty: 1, unitPrice: 12.5 }]} />);
    expect(screen.queryByText(/eksik kademe kaydedilmez/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Kademe ekle" }));

    const price = screen.getByLabelText("2. kademe: birim fiyat");
    expect(price).toHaveValue("");
    expect(price).toHaveAttribute("aria-invalid", "true");
    expect(latest[1]!.minQty).toBe(101);
    expect(isTierComplete(latest[1]!)).toBe(false);
    expect(screen.getByText(/eksik kademe kaydedilmez/)).toBeInTheDocument();
  });

  it("kayıtlı kademe fiyatları iki ondalıkla: 12,50 / 9,90 (arayüz testi kapanış S-SELL NEW-1)", () => {
    render(
      <Harness
        initial={[
          { minQty: 1, unitPrice: 12.5 },
          { minQty: 100, unitPrice: 10.75 },
          { minQty: 500, unitPrice: 9.9 },
        ]}
      />,
    );
    expect(screen.getByLabelText("1. kademe: birim fiyat")).toHaveValue("12,50");
    expect(screen.getByLabelText("2. kademe: birim fiyat")).toHaveValue("10,75");
    expect(screen.getByLabelText("3. kademe: birim fiyat")).toHaveValue("9,90");
    expect(latest[0]!.unitPrice).toBe(12.5);
  });

  it("kayıtlı sabit fiyat (Decimal '1250.5') 1.250,50", () => {
    render(
      <PriceModeField
        mode="FIXED"
        amount="1250.5"
        tiers={[]}
        currency="TRY"
        unit="adet"
        onChange={() => {}}
      />,
    );
    expect(document.getElementById("fiyat-birim")).toHaveValue("1.250,50");
  });

  it("silinen fiyat 0'a dönmez, boş kalır", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ minQty: 1, unitPrice: 12.5 }]} />);
    const price = screen.getByLabelText("1. kademe: birim fiyat");
    await user.clear(price);
    expect(price).toHaveValue("");
    expect(Number.isNaN(latest[0]!.unitPrice)).toBe(true);
  });

  // Arayüz testi son tur S-SELL: `type=number` alanı Türkçe tarayıcıda
  // "12,50"yi 1250 kaydediyordu (×100) ve ürün öyle yayımlanıyordu.
  it("Türkçe ondalık virgül doğru okunur (12,50 → 12.5, ×100 değil)", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ minQty: 1, unitPrice: Number.NaN }]} />);
    const price = screen.getByLabelText("1. kademe: birim fiyat");
    expect(price).toHaveAttribute("type", "text");
    await user.type(price, "12,50");
    expect(latest[0]!.unitPrice).toBe(12.5);
  });

  it("kademe miktarında Türkçe binlik ayracı: 1.000 → 1000", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ minQty: Number.NaN, unitPrice: 10 }]} />);
    await user.type(screen.getByLabelText("1. kademe: başlangıç miktarı"), "1.000");
    expect(latest[0]!.minQty).toBe(1000);
  });
});

describe("PriceModeField — sabit fiyat", () => {
  it("Türkçe ondalık virgül ham '12.50' olarak yazılır", async () => {
    const user = userEvent.setup();
    let amount = "";
    function Fixed() {
      const [a, setA] = useState("");
      amount = a;
      return (
        <PriceModeField
          mode="FIXED"
          amount={a}
          tiers={[]}
          currency="TRY"
          unit="adet"
          onChange={(n) => {
            if (n.amount !== undefined) setA(n.amount);
          }}
        />
      );
    }
    render(<Fixed />);
    await user.type(screen.getByLabelText("Birim fiyat"), "1.250,50");
    expect(amount).toBe("1250.50");
  });
});

describe("tamamlanma kuralı — fiyat > 0 (API @Min aynası)", () => {
  const base: ProductLike = {
    name: "Dağıtım panosu",
    categoryId: "39121600",
    description: "x".repeat(120),
    images: ["https://cdn/a.jpg"],
    keywords: ["pano"],
    priceMode: "TIERED",
    priceAmount: null,
    priceTiers: [{ minQty: 1, unitPrice: 10 }],
    moq: null,
    attributes: null,
  };
  const priceMissing = (p: ProductLike) =>
    productCompletion(p).missing.some((m) => m.key === "price") &&
    productPublishBlockerCodes(p).some((b) => b.code === "price");

  it("geçerli kademeler tamam", () => {
    expect(priceMissing(base)).toBe(false);
  });

  it("0 ya da boş fiyatlı kademe eksik sayılır", () => {
    expect(priceMissing({ ...base, priceTiers: [{ minQty: 1, unitPrice: 10 }, { minQty: 100, unitPrice: 0 }] })).toBe(true);
    expect(priceMissing({ ...base, priceTiers: [{ minQty: 1, unitPrice: Number.NaN }] })).toBe(true);
  });

  it("sabit fiyat 0 eksik sayılır", () => {
    expect(priceMissing({ ...base, priceMode: "FIXED", priceAmount: 0 })).toBe(true);
    expect(priceMissing({ ...base, priceMode: "FIXED", priceAmount: "12.50" })).toBe(false);
  });
});
