/**
 * S2 — "tam kapsam" kıyas filtresi tek-kaynak (bidCoversAllItems).
 * owner currentBest + public bestTotal aynı predicate'i kullanır: yalnız tüm
 * kalemleri fiyatlamış teklif kıyasa girer; kalemsiz ilanda herkes girer.
 */
import { bidCoversAllItems } from "../../src/common/company/bid-items";

describe("S2 — bidCoversAllItems", () => {
  it("tam kapsam (>=) kıyasa girer", () => {
    expect(bidCoversAllItems(3, 3)).toBe(true);
    expect(bidCoversAllItems(4, 3)).toBe(true); // kapsam genişletme
  });

  it("kısmi kapsam kıyasa giremez", () => {
    expect(bidCoversAllItems(2, 3)).toBe(false);
    expect(bidCoversAllItems(0, 1)).toBe(false);
  });

  it("kalemsiz ilan (count 0) → herkes kıyaslanabilir", () => {
    expect(bidCoversAllItems(0, 0)).toBe(true);
    expect(bidCoversAllItems(5, 0)).toBe(true);
  });
});
