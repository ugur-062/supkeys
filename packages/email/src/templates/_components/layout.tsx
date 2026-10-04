import { Body, Container, Head, Html, Img, Preview, Text } from "@react-email/components";
import * as React from "react";
import { LOGO_CID, LOGO_HEIGHT, LOGO_WIDTH } from "../../assets/logo";
import { DEFAULT_LOCALE, emailT, type Locale } from "../../i18n";
import { EmailEnvContext, privacyNoticeUrl, showsPrivacyNotice, siteHost } from "./email-env";
import { COLORS, FONTS } from "./tokens";

interface LayoutProps {
  preview: string;
  /** Alıcının dili — verilmezse Türkçe (kaynak dil). */
  locale?: Locale;
  children: React.ReactNode;
}

/*
 * Kabuk (2026-10-04 e-posta tasarımı, kullanıcı: "Rothern logosu arka temayla
 * aynı renk bile değil, dikdörtgen bir çerçeve gibi gözüküyor"): logo artık
 * gri sayfa zemininde DEĞİL, beyaz kartın başlığında. Görselin kendi beyaz
 * zemini kartla aynı renk → açık modda çerçeve görünmez.
 *
 * Koyu mod: Gmail/Outlook arka planı ve metni kendileri koyulaştırır, GÖRSELİ
 * değiştirmez ve `prefers-color-scheme`i okumaz → logonun beyaz zemini koyu
 * kartta küçük, yuvarlak köşeli bir rozet olarak bilinçli durur (bkz.
 * scripts/build-email-logo.mjs). Apple Mail/iOS Mail gibi medya sorgusunu
 * okuyan istemciler aşağıdaki `r-*` sınıflarıyla gerçek koyu temaya geçer.
 */
const HEAD_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
a { text-decoration-skip-ink: auto; }
@media only screen and (max-width: 480px) {
  .r-wrap { padding: 20px 10px 24px 10px !important; }
  .r-pad { padding: 20px 20px 28px 20px !important; }
  .r-pad-logo { padding: 22px 20px 0 12px !important; }
  .r-h1 { font-size: 20px !important; line-height: 28px !important; }
  .r-code { font-size: 32px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
  .r-cta { width: 100% !important; }
  .r-cta .r-btn { display: block !important; text-align: center !important; }
  .r-row-l, .r-row-v { display: block !important; width: auto !important; text-align: left !important; }
  .r-row-l { padding-bottom: 0 !important; white-space: normal !important; }
  .r-row-v { padding-top: 2px !important; border-top: 0 !important; }
}
@media (prefers-color-scheme: dark) {
  .r-body { background-color: #09090B !important; }
  .r-card { background-color: #18181B !important; border-color: #27272A !important; }
  .r-h { color: #FAFAFA !important; }
  .r-text { color: #D4D4D8 !important; }
  .r-strong { color: #F4F4F5 !important; }
  .r-muted { color: #A1A1AA !important; }
  .r-box { background-color: #232326 !important; border-color: #3F3F46 !important; }
  .r-divider { border-color: #3F3F46 !important; }
  .r-code { color: #FAFAFA !important; }
  .r-btn { background-color: #FAFAFA !important; color: #18181B !important; }
  .r-foot { color: #A1A1AA !important; }
}
`;

const main: React.CSSProperties = {
  backgroundColor: COLORS.page,
  fontFamily: FONTS.sans,
  margin: 0,
  padding: 0,
};

const wrapper: React.CSSProperties = {
  margin: "0 auto",
  padding: "32px 16px 40px 16px",
  maxWidth: "600px",
  width: "100%",
};

const cardTable: React.CSSProperties = {
  backgroundColor: COLORS.card,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "12px",
  borderCollapse: "separate",
};

const cardCell: React.CSSProperties = {
  padding: "24px 36px 36px 36px",
  // Uzun e-posta adresi/bağlantı dar ekranda kartı taşırmasın.
  overflowWrap: "break-word",
  wordBreak: "break-word",
};

const logoCell: React.CSSProperties = {
  padding: "28px 36px 0 28px",
};

const logoStyle: React.CSSProperties = {
  display: "block",
  border: 0,
  outline: "none",
  height: `${LOGO_HEIGHT}px`,
  width: `${LOGO_WIDTH}px`,
  margin: 0,
};

// Sayfa zemini zinc-100 → metin en az zinc-600 (4,5:1; bkz. CLAUDE.md).
const footerStyle: React.CSSProperties = {
  textAlign: "center",
  fontFamily: FONTS.sans,
  color: COLORS.slate600,
  fontSize: "12px",
  lineHeight: "19px",
  margin: "20px 0 0 0",
  padding: "0 12px",
};

const footerLink: React.CSSProperties = { color: COLORS.slate600, textDecoration: "underline" };

// Logo gömülü (inline CID) ek olarak gönderilir → uzak görsel engelleyen
// istemcilerde ve dev'de (localhost) de görünür. Ek client.ts'te eklenir.
const LOGO_SRC = `cid:${LOGO_CID}`;

export function Layout({ preview, locale = DEFAULT_LOCALE, children }: LayoutProps) {
  const t = emailT(locale);
  // Alan adı ve yıl gönderim ortamından (bkz. email-env.ts) — sabit değil.
  const env = React.useContext(EmailEnvContext);
  const year = (env.now ?? new Date()).getUTCFullYear();
  return (
    <Html lang={locale}>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        {/* Kodu ve tarihleri iOS telefon/takvim bağlantısına çevirmesin. */}
        <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
        <style dangerouslySetInnerHTML={{ __html: HEAD_CSS }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body className="r-body" style={main}>
        <Container className="r-wrap" style={wrapper}>
          <table
            role="presentation"
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            border={0}
            className="r-card"
            style={cardTable}
          >
            <tbody>
              <tr>
                {/* Logo görselinin içinde 8 px yatay boşluk var (koyu modda
                    rozet dengeli dursun) → hücre 8 px daha az dolgu alır ki
                    açık modda logo metin sütunuyla aynı hizada başlasın. */}
                <td className="r-pad-logo" style={logoCell}>
                  <Img
                    src={LOGO_SRC}
                    alt="Rothern"
                    width={String(LOGO_WIDTH)}
                    height={String(LOGO_HEIGHT)}
                    className="rothern-logo"
                    style={logoStyle}
                  />
                </td>
              </tr>
              <tr>
                <td className="r-pad" style={cardCell}>
                  {children}
                </td>
              </tr>
            </tbody>
          </table>

          <Text className="r-foot" style={footerStyle}>
            {t("email.layout.footerNote", { site: siteHost(env.siteUrl) })}
            {/* Tek tık çıkış + tercihler — yalnız işlem DIŞI e-postalarda
                (gönderim servisi bağlamı kurar; kod/şifre/siparişte yok). */}
            {env.unsubscribeUrl ? (
              <>
                <br />
                {t.rich(
                  env.preferencesUrl ? "email.layout.unsubscribeWithPrefs" : "email.layout.unsubscribe",
                  {
                    unsub: (chunks: React.ReactNode) => (
                      <a href={env.unsubscribeUrl} className="r-foot" style={footerLink}>
                        {chunks}
                      </a>
                    ),
                    prefs: (chunks: React.ReactNode) => (
                      <a href={env.preferencesUrl} className="r-foot" style={footerLink}>
                        {chunks}
                      </a>
                    ),
                  },
                )}
              </>
            ) : null}
            {/* KVKK aydınlatma: çıkış bağlantısıyla birlikte ya da üye
                olmayan adrese giden işlem e-postasında (`privacyNotice`). */}
            {showsPrivacyNotice(env) ? (
              <>
                <br />
                {t.rich("email.layout.privacy", {
                  privacy: (chunks: React.ReactNode) => (
                    <a href={privacyNoticeUrl(env.siteUrl, locale)} className="r-foot" style={footerLink}>
                      {chunks}
                    </a>
                  ),
                })}
              </>
            ) : null}
            <br />
            {t("email.layout.copyright", { year: String(year) })}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
