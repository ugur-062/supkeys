import { isPrivateAddress, readBodyCapped } from "../../src/common/website-import";

/**
 * Dış site çekimi (profil "AI ile doldur", marka bilgisi) — yayın denetimi
 * 2026-09-28 Bölüm 5: (a) SSRF kapısı host metnine kalıpla bakıyordu, IPv4-
 * eşlemeli IPv6 ve özel ağa çözülen adresler geçiyordu; (b) zamanlayıcı gövde
 * okunmadan temizleniyor, gövde tamamen belleğe alınıyordu.
 */
describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.0.10", "169.254.169.254", "100.64.1.1", "0.0.0.0",
    "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "[::ffff:10.0.0.1]", "64:ff9b::a00:1",
  ])("özel/ayrılmış: %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "185.199.108.153", "2606:4700::6810:84e5", "::ffff:8.8.8.8", "www.rothern.com"])("genel: %s", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });
});

function streamResponse(chunks: Uint8Array[], opts: { hangAfter?: boolean } = {}): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (i < chunks.length) ctrl.enqueue(chunks[i++]!);
      else if (!opts.hangAfter) ctrl.close();
      // hangAfter: hiç kapanmayan akış (yavaş/kötü niyetli sunucu)
    },
  });
  return new Response(body);
}

describe("readBodyCapped", () => {
  const kb = (n: number) => new Uint8Array(n * 1024).fill(97);

  it("tavanın altındaki gövde aynen döner", async () => {
    const buf = await readBodyCapped(streamResponse([kb(1), kb(1)]), 4096);
    expect(buf?.byteLength).toBe(2048);
  });

  it("tavan aşılınca okuma kesilir: truncate ile ilk N bayt, değilse null", async () => {
    const big = Array.from({ length: 100 }, () => kb(64)); // 6,4 MB
    expect((await readBodyCapped(streamResponse(big), 100_000, { truncate: true }))?.byteLength).toBe(100_000);
    expect(await readBodyCapped(streamResponse(big), 100_000)).toBeNull();
  });

  it("hiç bitmeyen akış süre dolunca null döner (istek süresiz tutulamaz)", async () => {
    const started = Date.now();
    const buf = await readBodyCapped(streamResponse([kb(1)], { hangAfter: true }), 1_000_000, { timeoutMs: 150 });
    expect(buf).toBeNull();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
