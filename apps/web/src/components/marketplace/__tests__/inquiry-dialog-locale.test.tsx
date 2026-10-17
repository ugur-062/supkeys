// @vitest-environment jsdom
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * MİSAFİR BİLGİ TALEBİ DİLİ (derin denetim MU-25): talep SAYFA diliyle
 * gönderilir. API `Accept-Language`i `PublicInquiry.locale` olarak yazar;
 * başlık konmazsa tarayıcının kendi dili gidiyordu (zh-CN tarayıcıyla /en
 * sayfası → Türkçe doğrulama e-postası).
 */
vi.mock("next-intl", async () => {
  const { createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("tr", WEB_NAMESPACES);
  return {
    useTranslations: (namespace?: string) =>
      createTranslator({
        locale: "tr",
        messages: MESSAGES,
        namespace: namespace as never,
        timeZone: "Europe/Istanbul",
        onError: () => {},
        getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
      }),
    useLocale: () => "en",
  };
});

import { InquiryDialog } from "../inquiry-dialog";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InquiryDialog — dil", () => {
  it("isteğe sayfa dilini Accept-Language olarak koyar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <InquiryDialog
        open
        onClose={() => undefined}
        companySlug="firma"
        productSlug="pano"
        productName="Pano"
        companyName="Firma"
      />,
    );
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/public\/inquiries$/);
    expect((init.headers as Record<string, string>)["Accept-Language"]).toBe("en");
  });
});
