import { describe, expect, it } from "vitest";
import { canManageListing } from "../can-manage-listing";

describe("canManageListing (F7: assertListingManageRole birebir)", () => {
  it("izinsiz operatör → false (buton görünmez)", () => {
    expect(
      canManageListing({
        hasManagePermission: false,
        isOwner: false,
        createdById: "u1",
        userId: "u1",
      }),
    ).toBe(false);
  });
  it("izinli + ilanı OLUŞTURAN → true", () => {
    expect(
      canManageListing({
        hasManagePermission: true,
        isOwner: false,
        createdById: "u1",
        userId: "u1",
      }),
    ).toBe(true);
  });
  it("izinli + SAHİP (oluşturan değil) → true", () => {
    expect(
      canManageListing({
        hasManagePermission: true,
        isOwner: true,
        createdById: "u1",
        userId: "u2",
      }),
    ).toBe(true);
  });
  it("izinli ama oluşturan-değil ve SAHİP-değil → false (backend 403 verirdi)", () => {
    expect(
      canManageListing({
        hasManagePermission: true,
        isOwner: false,
        createdById: "u1",
        userId: "u2",
      }),
    ).toBe(false);
  });
});
