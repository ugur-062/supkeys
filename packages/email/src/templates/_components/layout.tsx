import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { LOGO_CID } from "../../assets/logo";
import { DEFAULT_LOCALE, emailT, type Locale } from "../../i18n";
import { EmailEnvContext, privacyNoticeUrl, showsPrivacyNotice, siteHost } from "./email-env";
import { COLORS, FONTS } from "./tokens";

interface LayoutProps {
  preview: string;
  /** Alıcının dili — verilmezse Türkçe (kaynak dil). */
  locale?: Locale;
  children: React.ReactNode;
}

const main = {
  backgroundColor: COLORS.surfaceSubtle,
  fontFamily: FONTS.sans,
  margin: 0,
  padding: 0,
};

const wrapper = {
  margin: "0 auto",
  padding: "32px 16px",
  maxWidth: "600px",
};

const card = {
  backgroundColor: "#FFFFFF",
  borderRadius: "12px",
  border: `1px solid ${COLORS.surfaceBorder}`,
  padding: "32px",
};

const headerSection = {
  textAlign: "center" as const,
  marginBottom: "24px",
};

const logoStyle = {
  display: "inline-block",
  height: "auto",
  margin: 0,
};

const footerStyle = {
  textAlign: "center" as const,
  color: COLORS.slate500,
  fontSize: "12px",
  marginTop: "24px",
  lineHeight: "1.6",
};

const footerLink = { color: COLORS.slate500, textDecoration: "underline" };

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
        {/* Koyu mod: istemciler (Gmail iOS/Android, Apple Mail, Outlook)
            arka planı koyulaştırır ama GÖRSELLERİ değiştirmez ve çoğu
            `prefers-color-scheme`/`filter` CSS'ini desteklemez (Gmail hiçbirini).
            Tek sağlam yol: logo görselinin KENDİ zemini olsun — beyaz, köşeleri
            yuvarlak bir kart içinde siyah logo (bkz. assets/logo.ts, üretim
            scripts/build-email-logo.mjs). Açık zeminde kart görünmez, koyu
            zeminde beyaz kart olarak durur; logo her koşulda okunur. */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={wrapper}>
          <Section style={headerSection}>
            <Img
              src={LOGO_SRC}
              alt="Rothern"
              width="170"
              height="50"
              className="rothern-logo"
              style={logoStyle}
            />
          </Section>

          <Section style={card}>{children}</Section>

          <Section>
            <Hr
              style={{
                borderColor: COLORS.surfaceBorder,
                margin: "24px 0 16px",
              }}
            />
            <Text style={footerStyle}>
              {t("email.layout.copyright", { year: String(year) })}
              <br />
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
                        <a href={env.unsubscribeUrl} style={footerLink}>
                          {chunks}
                        </a>
                      ),
                      prefs: (chunks: React.ReactNode) => (
                        <a href={env.preferencesUrl} style={footerLink}>
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
                      <a href={privacyNoticeUrl(env.siteUrl, locale)} style={footerLink}>
                        {chunks}
                      </a>
                    ),
                  })}
                </>
              ) : null}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
