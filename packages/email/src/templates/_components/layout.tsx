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

const WEB_URL = (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LOGO_URL = `${WEB_URL}/supkeys-logo-full.png`;

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="tr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={wrapper}>
          <Section style={headerSection}>
            <Img
              src={LOGO_URL}
              alt="Supkeys"
              width="160"
              height="40"
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
              © 2026 Supkeys
              <br />
              Bu e-postayı supkeys.com platformundan aldınız.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
