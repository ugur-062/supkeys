import {
  localeOf,
  renderPayload,
  type InAppPayload,
} from "../../src/modules/notifications/notification.service";

/**
 * i18n Faz 3 — bildirim metni ALICININ dilinde üretilir.
 *
 * Sözleşme: (1) anahtar verilirse metin o dilin katalogundan, ICU
 * parametreleriyle çıkar; (2) `ctaPath` alıcının diline çevrilir ve mutlak
 * adresin kökeni korunur; (3) anahtar YOKSA bugünkü düz metin davranışı
 * birebir korunur (entegrasyon testleri payload'ı elle kuruyor).
 */
const BASE = "https://www.rothern.com";

const payload = (extra: Partial<InAppPayload>): InAppPayload => ({
  type: "test",
  ...extra,
});

describe("renderPayload — anahtar → alıcının dilinde metin", () => {
  it("aynı anahtarı üç dilde farklı metne çevirir", () => {
    const p = payload({ titleKey: "api.business.notFound", bodyKey: "api.business.forbidden" });
    expect(renderPayload(p, "tr").title).toBe("Kayıt bulunamadı");
    expect(renderPayload(p, "en").title).toBe("Record not found");
    expect(renderPayload(p, "ru").title).toBe("Запись не найдена");
    expect(renderPayload(p, "tr").body).toBe("Bu işlem için yetkiniz yok");
    expect(renderPayload(p, "en").body).not.toBe(renderPayload(p, "tr").body);
  });

  it("ICU parametrelerini uygular (çoğul EN/RU'da dile göre çözülür)", () => {
    const p = payload({ titleKey: "api.validation.stringMin", params: { n: 8 } });
    expect(renderPayload(p, "tr").title).toBe("En az 8 karakter olmalı");
    expect(renderPayload(p, "en").title).toBe("Must be at least 8 characters");
    expect(renderPayload(payload({ titleKey: "api.validation.stringMin", params: { n: 1 } }), "en").title).toBe(
      "Must be at least 1 character",
    );
  });

  it("params üç anahtar için ORTAK sözlüktür", () => {
    const p = payload({
      titleKey: "api.validation.stringMin",
      bodyKey: "api.validation.stringMax",
      params: { n: 3 },
    });
    const tr = renderPayload(p, "tr");
    expect(tr.title).toBe("En az 3 karakter olmalı");
    expect(tr.body).toBe("En fazla 3 karakter olabilir");
  });

  it("anahtar verilmişse düz metni YOK SAYAR", () => {
    const p = payload({ title: "alim", titleKey: "api.business.notFound" });
    expect(renderPayload(p, "tr").title).toBe("Kayıt bulunamadı");
  });

  it("ctaLabelKey yoksa ve düz etiket de yoksa null", () => {
    expect(renderPayload(payload({}), "tr").ctaLabel).toBeNull();
    expect(renderPayload(payload({ ctaLabelKey: "api.business.notFound" }), "en").ctaLabel).toBe(
      "Record not found",
    );
  });
});

describe("renderPayload — eski yol (düz metin) birebir korunur", () => {
  it("anahtar yoksa verilen metin aynen yazılır", () => {
    const p = payload({
      title: "alim",
      body: "Yeni teklif geldi",
      ctaLabel: "Görüntüle",
      ctaUrl: `${BASE}/company/ilan/abc`,
    });
    // Alıcının dili İngilizce olsa bile anahtar yoksa çeviri YAPILMAZ.
    expect(renderPayload(p, "en")).toEqual({
      title: "alim",
      body: "Yeni teklif geldi",
      ctaLabel: "Görüntüle",
      ctaUrl: `${BASE}/company/ilan/abc`,
    });
  });

  it("hiçbir metin verilmezse boş dize / null", () => {
    expect(renderPayload(payload({}), "tr")).toEqual({
      title: "",
      body: "",
      ctaLabel: null,
      ctaUrl: null,
    });
  });
});

describe("renderPayload — ctaPath alıcının dilinde", () => {
  it("Türkçe alıcıda yol AYNEN kalır (ön ek yok)", () => {
    const p = payload({ ctaPath: `${BASE}/company/ilan/abc123` });
    expect(renderPayload(p, "tr").ctaUrl).toBe(`${BASE}/company/ilan/abc123`);
  });

  it("dinamik segment (gerçek id) korunur, yol parçaları çevrilir", () => {
    const p = payload({ ctaPath: `${BASE}/company/ilan/abc123` });
    expect(renderPayload(p, "en").ctaUrl).toBe(`${BASE}/en/company/request/abc123`);
    expect(renderPayload(p, "ru").ctaUrl).toBe(`${BASE}/ru/kompaniya/zayavka/abc123`);
  });

  it("köken olmadan (göreli iç yol) da çalışır", () => {
    expect(renderPayload(payload({ ctaPath: "/company/siparis/o1" }), "en").ctaUrl).toBe(
      "/en/company/order/o1",
    );
    expect(renderPayload(payload({ ctaPath: "/company/onaylar" }), "ru").ctaUrl).toBe(
      "/ru/kompaniya/soglasovaniya",
    );
  });

  it("sorgu dizesi korunur", () => {
    expect(renderPayload(payload({ ctaPath: `${BASE}/company/mesajlar?with=c1` }), "en").ctaUrl).toBe(
      `${BASE}/en/company/messages?with=c1`,
    );
  });

  it("tanınmayan yol olduğu gibi geçer", () => {
    expect(renderPayload(payload({ ctaPath: `${BASE}/talep-onayla?t=tok` }), "en").ctaUrl).toBe(
      `${BASE}/en/confirm-inquiry?t=tok`,
    );
    expect(renderPayload(payload({ ctaPath: "mailto:x@y.com" }), "en").ctaUrl).toBe("mailto:x@y.com");
  });

  it("ctaPath verilmişse ctaUrl YOK SAYILIR", () => {
    const p = payload({ ctaUrl: `${BASE}/eski`, ctaPath: "/company/premium" });
    expect(renderPayload(p, "en").ctaUrl).toBe("/en/company/plans");
  });
});

describe("localeOf — DB dizesi desteklenen dile indirgenir", () => {
  it("geçerli değerler aynen, gerisi varsayılan", () => {
    expect(localeOf("en")).toBe("en");
    expect(localeOf("ru")).toBe("ru");
    expect(localeOf("tr")).toBe("tr");
    expect(localeOf("de")).toBe("tr");
    expect(localeOf(null)).toBe("tr");
    expect(localeOf(undefined)).toBe("tr");
    expect(localeOf("")).toBe("tr");
  });
});
