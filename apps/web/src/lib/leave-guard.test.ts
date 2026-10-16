import { describe, expect, it } from "vitest";
import { confirmAppLeave, registerLeaveCheck } from "./leave-guard";

describe("leave-guard — programla gezinmeden önce sorulan kontroller", () => {
  it("kontrol yoksa izin; hepsi izin verirse izin; biri 'kal' derse ya da fırlatırsa kal", async () => {
    await expect(confirmAppLeave()).resolves.toBe(true);
    const offA = registerLeaveCheck(() => true);
    const offB = registerLeaveCheck(async () => true);
    await expect(confirmAppLeave()).resolves.toBe(true);
    const offC = registerLeaveCheck(() => false);
    await expect(confirmAppLeave()).resolves.toBe(false);
    offC();
    const offD = registerLeaveCheck(() => {
      throw new Error("x");
    });
    await expect(confirmAppLeave()).resolves.toBe(false);
    offD();
    offA();
    offB();
    await expect(confirmAppLeave()).resolves.toBe(true);
  });
});
