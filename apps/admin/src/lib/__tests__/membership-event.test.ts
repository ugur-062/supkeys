import { describe, expect, it } from "vitest";
import { membershipEventActor, membershipEventReason } from "../membership-event";

describe("membership-event (arayüz testi api2-01)", () => {
  it("self-servis yükseltme ham kod ve 'sistem' yerine okunur etiketle görünür", () => {
    const e = { adminEmail: null, reason: "self_service_upgrade" };
    expect(membershipEventActor(e)).toBe("firma (self-servis)");
    expect(membershipEventReason(e.reason)).toBe("Firma kendi yükseltti (self-servis)");
  });

  it("admin olayı e-postasını, serbest gerekçeyi aynen; admin'siz bilinmeyen olay 'sistem'", () => {
    expect(membershipEventActor({ adminEmail: "a@x.com", reason: "Kampanya" })).toBe("a@x.com");
    expect(membershipEventReason("Kampanya")).toBe("Kampanya");
    expect(membershipEventActor({ adminEmail: null, reason: "Süre doldu (otomatik)" })).toBe("sistem");
    expect(membershipEventReason(null)).toBeNull();
  });
});
