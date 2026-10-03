import { orderItemAlternativeSnapshot } from "../../src/common/company/order-item-snapshot";

/** Arayüz testi O-003 — sipariş kalemi muadil/marka snapshot'ı (saf). */
describe("orderItemAlternativeSnapshot", () => {
  it("muadil teklifte teklif edilen marka/MPN kırpılıp yazılır", () => {
    expect(
      orderItemAlternativeSnapshot(
        { brand: " SKF ", mpn: "6204-2RS" },
        { isAlternative: true, offeredBrand: "FAG", offeredMpn: " " },
      ),
    ).toEqual({
      requestedBrand: "SKF",
      requestedMpn: "6204-2RS",
      isAlternative: true,
      offeredBrand: "FAG",
      offeredMpn: null,
    });
  });

  it("muadil değilse teklif edilen alanlar boş kalır (teklif edilen = istenen)", () => {
    expect(
      orderItemAlternativeSnapshot({}, { isAlternative: false, offeredBrand: "X" }),
    ).toEqual({
      requestedBrand: null,
      requestedMpn: null,
      isAlternative: false,
      offeredBrand: null,
      offeredMpn: null,
    });
  });
});
