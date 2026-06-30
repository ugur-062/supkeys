import { describe, expect, it } from "vitest";
import {
  CURRENCY_SYMBOL,
  TENDER_STATUS_META,
  tenderStatusLabel,
} from "../labels";

describe("etiketler", () => {
  it("tenderStatusLabel bilinen durumu TR'ye çevirir", () => {
    expect(tenderStatusLabel("OPEN_FOR_BIDS")).toBe(
      TENDER_STATUS_META.OPEN_FOR_BIDS.label,
    );
  });

  it("tenderStatusLabel bilinmeyen değeri ham döner (kırılmaz)", () => {
    expect(tenderStatusLabel("UFO_STATUS")).toBe("UFO_STATUS");
  });

  it("CURRENCY_SYMBOL temel birimleri içerir", () => {
    expect(CURRENCY_SYMBOL.TRY).toBe("₺");
    expect(CURRENCY_SYMBOL.USD).toBe("$");
    expect(CURRENCY_SYMBOL.EUR).toBe("€");
  });
});
