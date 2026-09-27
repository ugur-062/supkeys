// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `vitest.setup.ts` next-intl'i TR katalogla sahteler (`useLocale` hep "tr");
// burada arayüz dili test başına ayarlanır.
let currentLocale = "tr";
vi.mock("next-intl", () => ({ useLocale: () => currentLocale }));

import { MoneyInput } from "../money-input";

let last = "";
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <>
      <MoneyInput
        aria-label="Tutar"
        value={v}
        onChange={(next) => {
          last = next;
          setV(next);
        }}
      />
      <button type="button" onClick={() => setV("2500.5")}>
        Dışarıdan
      </button>
    </>
  );
}

const box = () => screen.getByLabelText("Tutar") as HTMLInputElement;

async function typeIn(text: string) {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(box());
  await user.keyboard(text);
  return user;
}

afterEach(() => {
  currentLocale = "tr";
  last = "";
});

/**
 * Yazım modeli (2026-09-27): metnin TAMAMI ayrıştırılır. Eski model ara
 * durumu ham değere çevirip yeniden biçimlediği için sondaki ayraç hemen
 * "ondalık" sayılıyordu → İngilizce arayüzde "12,500" yazan 12,50'ye,
 * Türkçe arayüzde "12.500" yazan 12,50'ye düşüyordu.
 */
describe("MoneyInput — tuş tuş yazım, arayüz diline göre", () => {
  it("EN: 12,500 yazmak 12500'dür (REGRESYON: 12.50)", async () => {
    currentLocale = "en";
    await typeIn("12,500");
    expect(last).toBe("12500");
    expect(box().value).toBe("12,500");
  });

  it("EN: nokta ondalık; canlı gruplama bozulmaz", async () => {
    currentLocale = "en";
    await typeIn("1234567.8");
    expect(last).toBe("1234567.8");
    expect(box().value).toBe("1,234,567.8");
  });

  it("TR: 12.500 yazmak 12500'dür, 1500,50 ondalıklı", async () => {
    currentLocale = "tr";
    await typeIn("12.500");
    expect(last).toBe("12500");
    expect(box().value).toBe("12.500");
  });

  it("TR: nokta alışkanlığıyla ondalık (1500.50) korunur, odaktan çıkınca TR biçimi", async () => {
    currentLocale = "tr";
    await typeIn("1500.50");
    expect(last).toBe("1500.50");
    fireEvent.blur(box());
    expect(box().value).toBe("1.500,50");
  });

  it("RU: boşluk binlik, virgül ondalık", async () => {
    currentLocale = "ru";
    await typeIn("1234,5");
    expect(last).toBe("1234.5");
    fireEvent.blur(box());
    expect(box().value).toBe("1 234,5");
  });

  it("yarım ondalık odaktan çıkınca düşer", async () => {
    currentLocale = "en";
    await typeIn("12.");
    expect(last).toBe("12.");
    fireEvent.blur(box());
    expect(last).toBe("12");
    expect(box().value).toBe("12");
  });

  it("dışarıdan gelen değer yazılan metni ezer", async () => {
    currentLocale = "en";
    const user = await typeIn("7,5");
    await user.click(screen.getByRole("button", { name: "Dışarıdan" }));
    expect(box().value).toBe("2,500.5");
  });

  it("harf yazılamaz", async () => {
    currentLocale = "en";
    await typeIn("1a2b");
    expect(last).toBe("12");
    expect(box().value).toBe("12");
  });
});
