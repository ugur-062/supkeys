import { describe, expect, it } from "vitest";
import { canManageListing } from "../can-manage-listing";

describe("canManageListing (F7: assertListingManageRole birebir)", () => {
  it("izinsiz operatör → false (buton görünmez)", () => {
    expect(
      canManageListing({
        hasManagePermission: false,
        createdById: "u1",
        userId: "u1",
      }),
    ).toBe(false);
  });
  it("izinli + ilanı OLUŞTURAN → true", () => {
    expect(
      canManageListing({
        hasManagePermission: true,
        createdById: "u1",
        userId: "u1",
      }),
    ).toBe(true);
  });
  it("izinli ama oluşturan-değil → false (SAHİP istisnası YOK — Kurucu salt-gözlemci)", () => {
    expect(
      canManageListing({
        hasManagePermission: true,
        createdById: "u1",
        userId: "u2",
      }),
    ).toBe(false);
  });
  it("createdById/userId eksikse güvenli taraf: false", () => {
    expect(
      canManageListing({
        hasManagePermission: true,
        createdById: null,
        userId: "u2",
      }),
    ).toBe(false);
    expect(
      canManageListing({
        hasManagePermission: true,
        createdById: "u1",
        userId: null,
      }),
    ).toBe(false);
  });
});
