/**
 * HIZLI TALEP — AI anahtarının "neden kapalı" metni (canlı doğrulama
 * 2026-10-09, AI-UI-3): kullanıcı "Seçtiklerim" / "My selection" / «Мой выбор»
 * seçeneğine tıklıyor, neden ise "Özel taleplerde…" / "For private requests…"
 * diyordu — form bu seçeneğe hiçbir yerde öyle demiyor. Metin seçeneğin KENDİ
 * adını `{option}` ile alır (etiket değişirse neden de değişir), üç dilde.
 */
import { messagesFor, WEB_NAMESPACES } from "@rothern/i18n/messages";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";

const LOCALES = ["tr", "en", "ru"] as const;

function texts(locale: (typeof LOCALES)[number]) {
  const messages = messagesFor(locale, WEB_NAMESPACES);
  const requests = messages.web.panel.requests;
  const t = createTranslator({
    locale,
    messages,
    namespace: "web.panel.requests.aiSuppliers" as never,
    onError: (e) => {
      throw e;
    },
  }) as unknown as (key: string, values: Record<string, string>) => string;
  // Formun seçenek etiketi (`useVisibilityLabels`).
  const option = requests.requestDefaultsForm.visibility.PRIVATE.label;
  return { raw: requests.aiSuppliers.aiDiscoveryPrivateOff, option, reason: t("aiDiscoveryPrivateOff", { option }) };
}

describe("AI anahtarı — özel seçenekte neden metni seçeneğin kendi adını söyler (AI-UI-3)", () => {
  it.each(LOCALES)("%s: seçenek adı metne parametreyle girer; sabit başka bir ad yazılmaz", (locale) => {
    const { raw, option, reason } = texts(locale);
    expect(raw).toContain("{option}");
    expect(raw).not.toMatch(/Özel|özel talep|private|закрыт/i);
    expect(reason).toContain(option);
    expect(reason).not.toContain("{");
  });

  it("üç dilde beklenen cümle (tipografik tırnakla)", () => {
    expect(texts("tr").reason).toBe("“Seçtiklerim” seçiliyken AI tedarikçi arayıp davet etmez; talebi yalnız davet ettiğiniz firmalar görür.");
    expect(texts("en").reason).toBe("With “My selection” selected, AI doesn't search for or invite suppliers; only the companies you invite can see the request.");
    expect(texts("ru").reason).toBe("При выборе варианта «Мой выбор» ИИ не ищет и не приглашает поставщиков; запрос видят только приглашённые Вами компании.");
  });
});
