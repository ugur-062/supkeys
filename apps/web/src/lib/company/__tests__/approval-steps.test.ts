// Arayüz testi D-361: sonuçlanmış onay isteğinde karar verilmemiş adımlar.
import { describe, expect, it } from "vitest";
import { displayStepStatus } from "../approval-steps";

describe("displayStepStatus", () => {
  it("istek bekliyorsa adım durumu aynen", () => {
    expect(displayStepStatus("PENDING", "PENDING")).toBe("PENDING");
    expect(displayStepStatus("WAITING", "PENDING")).toBe("WAITING");
  });

  it("istek reddedildi / iptal / onaylandıysa bekleyen ve sıradaki adımlar NOT_NEEDED", () => {
    for (const req of ["REJECTED", "CANCELLED", "APPROVED"] as const) {
      expect(displayStepStatus("WAITING", req)).toBe("NOT_NEEDED");
      expect(displayStepStatus("PENDING", req)).toBe("NOT_NEEDED");
    }
  });

  it("verilmiş kararlar ve atlanan adımlar değişmez", () => {
    expect(displayStepStatus("APPROVED", "REJECTED")).toBe("APPROVED");
    expect(displayStepStatus("REJECTED", "REJECTED")).toBe("REJECTED");
    expect(displayStepStatus("SKIPPED", "APPROVED")).toBe("SKIPPED");
  });
});
