import { describe, expect, it } from "vitest";
import { orderStageIndex, orderSteps } from "../order-status";

/**
 * Süreç izleyicisi 4 kilometre taşı (2026-09-10, kullanıcı kararı): adımlar
 * OLAY adı taşır, durum adı rozette kalır; "Onay Bekliyor"/"Onaylandı" tek
 * adım (Onay) — bekleyen = süren, onaylanan = biten.
 */
describe("orderSteps / orderStageIndex", () => {
  it("dört kısa adım; orta adım teslim şekline duyarlı", () => {
    expect(orderSteps(true).map((s) => s.label)).toEqual(["Onay", "Gönderim", "Teslim", "Tamamlandı"]);
    expect(orderSteps(false).map((s) => s.label)).toEqual(["Onay", "Hazırlık", "Teslim", "Tamamlandı"]);
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
