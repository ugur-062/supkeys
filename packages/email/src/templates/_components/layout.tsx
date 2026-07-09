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

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="tr">
      <Head>
        {/* E-posta yalnız AÇIK (light) temada render edilsin — istemci (Gmail/
            Apple Mail/Outlook) otomatik dark-mode renk ters-çevirmesi yapmasın.
            Aksi halde siyah+şeffaf logo koyu zeminde kaybolur, monokrom palet
            bozulurdu. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`
          :root {
            color-scheme: light only;
            supported-color-schemes: light;
          }
        `}</style>
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
