import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * Hesap kurulum bağlantısı (`setup=1`, arayüz testi api2-02 yeniden
 * doğrulama): admin'in açtığı hesabın "Şifremi Belirle" bağlantısı
 * "Şifreni sıfırla / Hatırladın mı?" sayfasına düşmez.
 */
vi.mock("@/components/marketing/auth-shell", () => ({
  AuthShell: ({
    title,
    subtitle,
    footer,
    children,
  }: {
    title: string;
    subtitle: string;
    footer: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      <footer>{footer}</footer>
      {children}
    </div>
  ),
}));
vi.mock("../reset-password-form", () => ({ ResetPasswordForm: () => <form /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `t:${key}`,
  setRequestLocale: () => {},
}));

async function render(search: Record<string, string>) {
  const { default: Page, generateMetadata } = await import("../page");
  const args = {
    params: Promise.resolve({ locale: "tr" }),
    searchParams: Promise.resolve(search),
  };
  const html = renderToStaticMarkup(await Page(args));
  const meta = await generateMetadata(args);
  return { html, title: meta.title };
}

describe("şifre sayfası — sıfırlama / hesap kurulumu", () => {
  it("varsayılan: sıfırlama metinleri ve 'Hatırladın mı?'", async () => {
    const { html, title } = await render({ token: "a".repeat(64) });
    expect(html).toContain("t:title");
    expect(html).toContain("t:remembered");
    expect(html).not.toContain("t:setupTitle");
    expect(title).toBe("t:metaTitle");
  });

  it("setup=1: 'Şifreni belirle' metinleri, 'Hatırladın mı?' yok; giriş bağlantısı kalır", async () => {
    const { html, title } = await render({ token: "a".repeat(64), setup: "1" });
    expect(html).toContain("t:setupTitle");
    expect(html).toContain("t:setupSubtitle");
    expect(html).toContain("t:setupHaveAccount");
    expect(html).not.toContain("t:remembered");
    expect(html).not.toContain("t:title<");
    expect(html).toContain('href="/company/login"');
    expect(title).toBe("t:setupMetaTitle");
  });
});
