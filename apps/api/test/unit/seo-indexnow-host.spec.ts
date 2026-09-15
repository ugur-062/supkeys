/**
 * IndexNow YALNIZ canlı alan adını bildirir. Staging'in Render ortamında da
 * anahtar tanımlıydı; kapı env disiplinine bırakılsaydı demo adresleri dış
 * motorlara duyurulurdu (yinelenen içerik + yayınlanmamış veri).
 */
describe("IndexNow konak kapısı", () => {
  const isCanonical = (base: string): boolean => {
    try {
      return new URL(base).host === "www.rothern.com";
    } catch {
      return false;
    }
  };

  it("canlı alan adı geçer", () => {
    expect(isCanonical("https://www.rothern.com")).toBe(true);
  });

  it("staging ve önizleme adresleri GEÇMEZ", () => {
    expect(isCanonical("https://staging.rothern.com")).toBe(false);
    expect(isCanonical("https://staging.supkeys.com")).toBe(false);
    expect(isCanonical("https://supkeys-web-abc123.vercel.app")).toBe(false);
    expect(isCanonical("http://localhost:3000")).toBe(false);
  });

  it("çıplak alan adı da geçmez (kanonik www)", () => {
    expect(isCanonical("https://rothern.com")).toBe(false);
  });

  it("bozuk adres güvenli tarafta kalır", () => {
    expect(isCanonical("bu bir adres değil")).toBe(false);
  });
});
