import { BadRequestException } from "@nestjs/common";
import { translateValidatorMessage } from "../../src/common/error-messages";
import { i18nMessage } from "../../src/common/i18n/http-i18n";
import { I18nService, tApi } from "../../src/common/i18n/i18n.service";
import {
  applyUserLocale,
  currentLocale,
  runWithLocale,
} from "../../src/common/i18n/locale-context";

/**
 * i18n Faz 0 SÖZLEŞMESİ (docs/plan-i18n.md):
 *  · İstek dili Accept-Language'dan gelir, yoksa kullanıcının kayıtlı dili,
 *    o da yoksa tr. Başlık desteklenen bir dil verdiyse DB dili onu EZMEZ.
 *  · Bağlam dışı çağrı (cron/test) tr'dir — hiçbir zaman patlamaz.
 *  · Doğrulama ve iş mesajları istek dilinde üretilir; eksik çeviri boş dönmez.
 */
describe("istek dili bağlamı", () => {
  it("bağlam dışında varsayılan tr", () => {
    expect(currentLocale()).toBe("tr");
  });

  it("Accept-Language q-değerine göre seçer", () => {
    runWithLocale("de-DE,ru;q=0.9,en;q=0.8", () => {
      expect(currentLocale()).toBe("ru");
    });
    runWithLocale("en-US,en;q=0.9", () => {
      expect(currentLocale()).toBe("en");
    });
    runWithLocale("fr", () => {
      expect(currentLocale()).toBe("tr");
    });
  });

  it("başlık desteklenen dil vermediyse kullanıcının dili uygulanır", () => {
    runWithLocale(undefined, () => {
      applyUserLocale("ru");
      expect(currentLocale()).toBe("ru");
    });
    runWithLocale("fr-FR", () => {
      applyUserLocale("en");
      expect(currentLocale()).toBe("en");
    });
  });

  it("başlık açık dil verdiyse kullanıcının kayıtlı dili onu EZMEZ", () => {
    runWithLocale("en", () => {
      applyUserLocale("ru");
      expect(currentLocale()).toBe("en");
    });
  });

  it("geçersiz kullanıcı dili yok sayılır", () => {
    runWithLocale(undefined, () => {
      applyUserLocale("xx");
      expect(currentLocale()).toBe("tr");
    });
  });

  it("async zincir boyunca bağlam korunur", async () => {
    await runWithLocale("ru", async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(currentLocale()).toBe("ru");
    });
  });
});

describe("doğrulama mesajları dil farkında", () => {
  it("class-validator varsayılanını istek diline çevirir", () => {
    runWithLocale("en", () => {
      expect(translateValidatorMessage("email must be an email")).toBe("Enter a valid email address");
      expect(translateValidatorMessage("title must be longer than or equal to 3 characters")).toBe(
        "Must be at least 3 characters",
      );
    });
    runWithLocale(undefined, () => {
      expect(translateValidatorMessage("email must be an email")).toBe("Geçerli bir e-posta giriniz");
      expect(translateValidatorMessage("x must be longer than or equal to 3 characters")).toBe(
        "En az 3 karakter olmalı",
      );
    });
  });

  it("açık dil parametresi bağlamı ezer; bilinmeyen mesaj dokunulmadan döner", () => {
    expect(translateValidatorMessage("email must be an email", "ru")).toBe(
      "Введите корректный адрес электронной почты",
    );
    expect(translateValidatorMessage("Şifre en az 8 karakter")).toBe("Şifre en az 8 karakter");
  });
});

describe("tApi / I18nService / i18nMessage", () => {
  it("tApi istek dilinde, parametreli", () => {
    runWithLocale("en", () => {
      expect(tApi("api.validation.stringMax", { n: 200 })).toBe("Can be at most 200 characters");
    });
    expect(tApi("api.business.notFound")).toBe("Kayıt bulunamadı");
    expect(tApi("api.business.notFound", undefined, "ru")).toBe("Запись не найдена");
  });

  it("I18nService alıcı dili için çevirmen verir (bildirim/e-posta yolu)", () => {
    const svc = new I18nService();
    expect(svc.locale()).toBe("tr");
    expect(svc.for("en")("api.business.expired")).toBe("Expired");
    runWithLocale("ru", () => {
      expect(svc.t("api.business.forbidden")).toBe("У вас нет прав для этого действия");
    });
  });

  it("i18nMessage gövdesi HttpException ile standart şekle oturur ve code taşır", () => {
    runWithLocale("en", () => {
      const ex = new BadRequestException(i18nMessage("api.business.expired", undefined, "BID_EXPIRED"));
      const body = ex.getResponse() as Record<string, unknown>;
      expect(body.message).toBe("Expired");
      expect(body.code).toBe("BID_EXPIRED");
      expect(body.i18nKey).toBe("api.business.expired");
      expect(ex.message).toBe("Expired");
    });
  });
});
