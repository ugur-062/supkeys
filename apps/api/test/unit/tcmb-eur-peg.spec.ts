import { of } from "rxjs";
import { EUR_PEGGED, TcmbService } from "../../src/modules/currency/services/tcmb.service";

/**
 * Yayın denetimi 2026-09-28 Bölüm 7: Bulgaristan 2026-01-01'de avroya geçti,
 * TCMB BGN yayınlamıyor → BGN sabit kurla (1 EUR = 1,95583 BGN) EUR'dan türetilir.
 */
const xml = (currencies: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="28.09.2026" Date="09/28/2026">${currencies}</Tarih_Date>`;
const cur = (code: string, selling: string, unit = "1") =>
  `<Currency CurrencyCode="${code}"><Unit>${unit}</Unit><ForexSelling>${selling}</ForexSelling></Currency>`;

describe("TcmbService — avroya bağlı birimler", () => {
  it("TCMB BGN vermezse EUR / 1,95583 ile türetilir; EUR yoksa türetilmez", async () => {
    const withEur = new TcmbService({ get: () => of({ data: xml(cur("USD", "48.8780") + cur("EUR", "55.6880")) }) } as never);
    const r = await withEur.fetchTodayRates();
    expect(r?.rates.BGN).toBeCloseTo(55.688 / EUR_PEGGED.BGN!, 4);

    const noEur = new TcmbService({ get: () => of({ data: xml(cur("USD", "48.8780")) }) } as never);
    expect((await noEur.fetchTodayRates())?.rates.BGN).toBeUndefined();
  });

  it("TCMB BGN yayınlıyorsa (eski günler) kendi değeri korunur", async () => {
    const svc = new TcmbService({ get: () => of({ data: xml(cur("EUR", "55.6880") + cur("BGN", "28.4000")) }) } as never);
    expect((await svc.fetchTodayRates())?.rates.BGN).toBe(28.4);
  });
});
