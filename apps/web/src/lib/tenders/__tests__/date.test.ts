import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "../date";

// 5 Tem 2026 14:30 TÜRKİYE saati — metin ürün saat dilimiyle yazılır
// (2026-09-22), test makinesinin TZ'sinden bağımsız.
const D = new Date("2026-07-05T14:30:00+03:00");

describe("date yardımcıları", () => {
  it("formatDate gün biçimi verir", () => {
    expect(formatDate(D, "tr")).toMatch(/2026/);
    expect(formatDate(D, "tr")).toMatch(/Tem/);
  });

  it("formatDateTime saat içerir", () => {
    expect(formatDateTime(D, "tr")).toMatch(/14:30/);
  });

  it("formatTime yalnız saat", () => {
    expect(formatTime(D, "tr")).toBe("14:30");
  });

  it("boş/null girdide tire döner", () => {
    expect(formatDate(null, "tr")).toBe("—");
    expect(formatDate(undefined, "tr")).toBe("—");
    expect(formatDateTime("", "tr")).toBe("—");
    expect(formatTime(null, "tr")).toBe("—");
  });

  it("geçersiz tarihte tire döner", () => {
    expect(formatDate("not-a-date", "tr")).toBe("—");
    expect(formatDateTime("zzz", "tr")).toBe("—");
  });

  it("ISO string kabul eder", () => {
    expect(formatDate("2026-07-05T11:30:00.000Z", "tr")).toMatch(/2026/);
  });

  // 2026-09-27: dil ZORUNLU — dilsiz çağrılar İngilizce arayüzde Türkçe ay adı
  // ve dilim etiketsiz saat basıyordu (yurt dışındaki satıcı kapanışı kaçırırdı).
  it("İngilizce/Rusça: ay adı o dilde, saatli metin dilim etiketli", () => {
    expect(formatDate(D, "en")).toBe("5 Jul 2026");
    expect(formatDateTime(D, "en")).toBe("5 Jul 2026 14:30 (GMT+3)");
    expect(formatDateTime(D, "ru")).toMatch(/^5 июл\.? 2026 14:30 \(GMT\+3\)$/);
    expect(formatDateTime(D, "tr")).toBe("5 Tem 2026 14:30");
    expect(formatTime(D, "en")).toBe("14:30 (GMT+3)");
  });
});
