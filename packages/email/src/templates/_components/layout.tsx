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
import { LOGO_CID, LOGO_HEIGHT, LOGO_WIDTH } from "../../assets/logo";
import { COLORS, FONTS } from "./tokens";

interface LayoutProps {
  preview: string;
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

// Logo gömülü (inline CID) ek olarak gönderilir → uzak görsel engelleyen
// istemcilerde ve dev'de (localhost) de görünür. Ek client.ts'te eklenir.
const LOGO_SRC = `cid:${LOGO_CID}`;
// Görüntü boyutu: 3× kaynaktan ölçekli (retina keskin), en-boy oranı korunur.
const LOGO_DISPLAY_WIDTH = 190;
const LOGO_DISPLAY_HEIGHT = Math.round((LOGO_HEIGHT / LOGO_WIDTH) * LOGO_DISPLAY_WIDTH);

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="tr">
      <Head>
        {/* Dark mode: istemciler arka planı koyulaştırır ama GÖRSELLERİ ters
            çevirmez → şeffaf zeminli siyah logo koyu zeminde kayboluyordu
            (2026-09-11, Gmail iOS). CSS `filter` / prefers-color-scheme
            çözümü Gmail uygulamaları ve Outlook'ta çalışmadı. Kalıcı çözüm:
            beyaz yuvarlatılmış zemin PNG'nin İÇİNE gömülü
            (packages/email/scripts/build-logo.py) — her istemcide, her temada
            okunur. */}
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
              width={LOGO_DISPLAY_WIDTH}
              height={LOGO_DISPLAY_HEIGHT}
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
              © 2026 Rothern
              <br />
              Bu e-postayı rothern.com platformundan aldınız.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
