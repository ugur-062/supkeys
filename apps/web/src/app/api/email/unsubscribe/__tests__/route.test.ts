import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../route";

/**
 * RFC 8058 tek tık çıkış ucu (canlı öncesi sağlamlaştırma H3). Sözleşme:
 * `POST` geçerli jetonu API'ye iletir (200), bozuk jetonda API'ye HİÇ gitmez
 * (400), API hatasında 502 döner (posta sağlayıcısı yeniden dener); `GET`
 * HİÇBİR ŞEY değiştirmez — onay sayfasına 303.
 */
// Sahte, düşük entropili sabit (gerçek jeton değil) — izin verilen tüm karakter sınıfları.
const TOKEN = "ornek_jeton-".repeat(3) + "A1";
const BASE = "https://www.supkeys.com/api/email/unsubscribe";
const API = "https://api.example.test/api";

const fetchMock = vi.fn();

const post = (query: string) =>
  POST(
    new Request(`${BASE}${query}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    }),
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/email/unsubscribe (tek tık)", () => {
  it("geçerli jeton → API'ye iletilir, 200", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await post(`?t=${TOKEN}`);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/public/email/unsubscribe`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ t: TOKEN });
    expect(init.cache).toBe("no-store");
  });

  it.each([
    ["jeton yok", ""],
    ["boş jeton", "?t="],
    ["kısa jeton", "?t=abc"],
    ["geçersiz karakter", `?t=${TOKEN}%2F..%2Fadmin`],
    ["aşırı uzun jeton", `?t=${"a".repeat(2001)}`],
  ])("geçersiz jeton (%s) → 400, API çağrılmaz", async (_ad, query) => {
    const res = await post(query);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API jetonu reddeder (400) → 400", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
    expect((await post(`?t=${TOKEN}`)).status).toBe(400);
  });

  it.each([500, 503, 404, 429])("API %i → 502", async (status) => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));
    expect((await post(`?t=${TOKEN}`)).status).toBe(502);
  });

  it("API'ye ulaşılamıyor (ağ hatası) → 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await post(`?t=${TOKEN}`)).status).toBe(502);
  });

  it("yanıt gövdesi boş — API hata ayrıntısı sızmaz", async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"iç hata"}', { status: 500 }));
    expect(await (await post(`?t=${TOKEN}`)).text()).toBe("");
  });
});

describe("GET /api/email/unsubscribe (yalnız yönlendirme)", () => {
  it("geçerli jeton → 303 /e-posta-tercihleri?t=…, fetch YOK", () => {
    const res = GET(new Request(`${BASE}?t=${TOKEN}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `https://www.supkeys.com/e-posta-tercihleri?t=${TOKEN}`,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("geçersiz jeton → jetonsuz 303 (açık yönlendirme yok), fetch YOK", () => {
    const res = GET(new Request(`${BASE}?t=%2F%2Fevil.example&next=https://evil.example`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://www.supkeys.com/e-posta-tercihleri");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
