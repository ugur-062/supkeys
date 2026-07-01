import { describe, expect, it } from "vitest";
import { formatPhone } from "../signup-client";

describe("formatPhone", () => {
  it("TR numarasını +90 5XX XXX XX XX maskeler", () => {
    expect(formatPhone("5551112233")).toBe("+90 555 111 22 33");
    expect(formatPhone("05551112233")).toBe("+90 555 111 22 33");
    expect(formatPhone("905551112233")).toBe("+90 555 111 22 33");
  });

  it("uluslararası + önekini korur (TR dışı)", () => {
    expect(formatPhone("+491701234567")).toBe("+491701234567");
  });

  it("uluslararası 00 önekini + ile normalize eder", () => {
    // Regresyon: eskiden 0049… → 090… gibi bozuluyordu.
    expect(formatPhone("0049 170 1234567")).toBe("+49 170 1234567");
  });

  it("harf/simge temizler, uzunluğu sınırlar", () => {
    expect(formatPhone("+44abc7911123456789099")).toBe("+447911123456789099");
  });
});
