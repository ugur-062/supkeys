/**
 * Arayüz testi D-357 (kök düzeltme): asistan araç sonuçlarındaki durum /
 * teslim / ödeme kodları modele gitmeden önce istek dilinde etikete çevrilir.
 * Model eskiden ham kodu görüp kendi çevirisini uyduruyordu ("Açık (OPEN)");
 * etiket arayüzle aynı katalogdan gelir, kod `...Code` alanında kalır.
 */
import { localizeToolCodes } from "../../src/modules/ai/assistant/assistant-tools";

describe("localizeToolCodes", () => {
  it("talep listesi: status etiket olur, kod statusCode'a ayrılır (tr)", () => {
    const out = localizeToolCodes(
      [{ id: "l1", status: "OPEN", title: "Vida" }],
      "listing",
      "tr",
    ) as Record<string, unknown>[];
    expect(out[0]).toEqual({ id: "l1", status: "Yayında", statusCode: "OPEN", title: "Vida" });
  });

  it("talep detayı: alt nesneler kendi varlığıyla etiketlenir (en)", () => {
    const out = localizeToolCodes(
      {
        status: "IN_AWARD",
        deliveryTerm: "EXW",
        paymentCategory: "DEFERRED",
        bids: [{ id: "b1", status: "SUBMITTED" }],
        myBid: { status: "LOST" },
        myOrder: { id: "o1", status: "PENDING" },
        orders: [{ id: "o1", status: "CANCELLED" }],
      },
      "listing",
      "en",
    ) as Record<string, unknown>;
    expect(out.status).toBe("Under evaluation");
    expect(out.statusCode).toBe("IN_AWARD");
    expect(out.deliveryTermCode).toBe("EXW");
    expect(String(out.deliveryTerm)).toContain("Ex Works");
    expect(out.paymentCategoryCode).toBe("DEFERRED");
    expect(out.paymentCategory).not.toBe("DEFERRED");
    expect((out.bids as Record<string, unknown>[])[0]).toMatchObject({
      status: "Under review",
      statusCode: "SUBMITTED",
    });
    expect(out.myBid).toMatchObject({ status: "Not selected", statusCode: "LOST" });
    expect(out.myOrder).toMatchObject({ status: "Pending approval", statusCode: "PENDING" });
    expect((out.orders as Record<string, unknown>[])[0]).toMatchObject({
      status: "Canceled",
    });
  });

  it("teklif listesi: teklif ve iç içe talep durumu ayrı sözlükten (ru)", () => {
    const out = localizeToolCodes(
      [{ id: "b1", status: "WON", listing: { id: "l1", status: "AWARDED" } }],
      "bid",
      "ru",
    ) as Record<string, Record<string, unknown>>[];
    expect(out[0]!.status).toBe("Выиграно");
    expect(out[0]!.listing).toMatchObject({ status: "Завершено", statusCode: "AWARDED" });
  });

  it("sipariş: IN_DELIVERY teslim şekline duyarlı (alıcı topluyorsa Teslime Hazır)", () => {
    const out = localizeToolCodes(
      [
        { id: "o1", status: "IN_DELIVERY", deliveryTerm: "DOMESTIC_DELIVERED" },
        { id: "o2", status: "IN_DELIVERY", deliveryTerm: "EXW" },
      ],
      "order",
      "tr",
    ) as Record<string, unknown>[];
    expect(out[0]!.status).toBe("Gönderildi");
    expect(out[1]!.status).toBe("Teslime Hazır");
    expect(out[1]!.statusCode).toBe("IN_DELIVERY");
  });

  it("bağlamsız alt nesne ve bilinmeyen kod olduğu gibi kalır; Date/sınıf nesnesi bozulmaz", () => {
    const when = new Date("2026-10-01T00:00:00Z");
    const out = localizeToolCodes(
      {
        status: "SOMETHING_NEW",
        payments: [{ status: "PENDING" }],
        createdAt: when,
      },
      "order",
      "tr",
    ) as Record<string, unknown>;
    expect(out.status).toBe("SOMETHING_NEW");
    expect(out.statusCode).toBeUndefined();
    expect(out.payments).toEqual([{ status: "PENDING" }]);
    expect(out.createdAt).toBe(when);
  });
});
