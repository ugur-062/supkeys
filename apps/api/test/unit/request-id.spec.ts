/**
 * Correlation-id çekirdeği — gelen x-request-id onurlandırma/üretim + response
 * header echo. Saf fonksiyonlar; ağ/DB yok.
 */
import {
  REQUEST_ID_HEADER,
  genRequestId,
  resolveRequestId,
} from "../../src/common/logging/request-id";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("resolveRequestId — gelen header onurlandırma/sanitizasyon", () => {
  it("geçerli gelen id onurlandırılır (dağıtık izleme: üst-servis id'si korunur)", () => {
    expect(resolveRequestId("abc-123_XYZ.9")).toBe("abc-123_XYZ.9");
  });

  it("baştaki/sondaki boşluk trim edilir", () => {
    expect(resolveRequestId("  req-42  ")).toBe("req-42");
  });

  it("dizi header'da ilk eleman kullanılır", () => {
    expect(resolveRequestId(["first-id", "second"])).toBe("first-id");
  });

  it.each([
    ["boş string", ""],
    ["yalnız boşluk", "   "],
    ["undefined", undefined],
    ["number", 123],
    ["kontrol karakteri (log injection)", "req\n42"],
    ["boşluk içeren", "req 42"],
    ["izinli-dışı karakter", "req/42"],
    ["128'den uzun", "x".repeat(129)],
  ])("geçersiz (%s) → yeni UUID üretilir", (_label, input) => {
    const id = resolveRequestId(input as unknown);
    expect(id).toMatch(UUID_RE);
  });

  it("tam 128 karakter sınır-içi kabul edilir", () => {
    const boundary = "a".repeat(128);
    expect(resolveRequestId(boundary)).toBe(boundary);
  });

  it("üretilen id'ler benzersiz (rastgele, PII değil)", () => {
    expect(resolveRequestId("")).not.toBe(resolveRequestId(""));
  });
});

describe("genRequestId — response header echo + req.id", () => {
  function fakeReqRes(headers: Record<string, unknown>) {
    const setHeader = jest.fn();
    return {
      req: { headers } as never,
      res: { setHeader } as never,
      setHeader,
    };
  }

  it("gelen id response header'ında geri döner + return edilir", () => {
    const { req, res, setHeader } = fakeReqRes({
      [REQUEST_ID_HEADER]: "incoming-99",
    });
    const id = genRequestId(req, res);
    expect(id).toBe("incoming-99");
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, "incoming-99");
  });

  it("gelen id yoksa üretilen UUID header'a yazılır (aynı değer)", () => {
    const { req, res, setHeader } = fakeReqRes({});
    const id = genRequestId(req, res);
    expect(id).toMatch(UUID_RE);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, id);
  });
});
