import { describe, expect, it } from "vitest";
import { orderStageIndex, orderStatusMeta, orderSteps } from "../order-status";

/**
 * Süreç izleyicisi 4 kilometre taşı (2026-09-10, kullanıcı kararı): adımlar
 * OLAY adı taşır, durum adı rozette kalır; "Onay Bekliyor"/"Onaylandı" tek
 * adım (Onay) — bekleyen = süren, onaylanan = biten.
 */
describe("orderSteps / orderStageIndex", () => {
  /* i18n Faz 2: adım/durum METNİ katalogda (`web.domain.orderStep.*`,
     `web.domain.orderStatus.*`); burada ANAHTAR sözleşmesi sınanır. */
  it("dört kısa adım; orta adım teslim şekline duyarlı", () => {
    expect(orderSteps(true).map((s) => s.labelKey)).toEqual(["APPROVAL", "SHIP", "DELIVERY", "COMPLETE"]);
    expect(orderSteps(false).map((s) => s.labelKey)).toEqual(["APPROVAL", "SHIP_PICKUP", "DELIVERY", "COMPLETE"]);
  });

  it("durum rozeti: satıcı taşımıyorsa IN_DELIVERY → teslime hazır anahtarı", () => {
    expect(orderStatusMeta("IN_DELIVERY", true)).toEqual({ labelKey: "IN_DELIVERY", tone: "active" });
    expect(orderStatusMeta("IN_DELIVERY", false)).toEqual({ labelKey: "IN_DELIVERY_PICKUP", tone: "active" });
    expect(orderStatusMeta("COMPLETED")).toEqual({ labelKey: "COMPLETED", tone: "done" });
  });

  it("durum → biten/süren adım", () => {
    expect(orderStageIndex("PENDING")).toEqual({ done: 0, current: 0, terminated: false });
    expect(orderStageIndex("ACCEPTED")).toEqual({ done: 1, current: 1, terminated: false });
    expect(orderStageIndex("CREATED")).toEqual({ done: 1, current: 1, terminated: false });
    expect(orderStageIndex("IN_DELIVERY")).toEqual({ done: 2, current: 2, terminated: false });
    expect(orderStageIndex("DELIVERED")).toEqual({ done: 3, current: 3, terminated: false });
    expect(orderStageIndex("COMPLETED")).toEqual({ done: 4, current: -1, terminated: false });
    expect(orderStageIndex("CANCELLED").terminated).toBe(true);
    expect(orderStageIndex("REJECTED").terminated).toBe(true);
  });
});
