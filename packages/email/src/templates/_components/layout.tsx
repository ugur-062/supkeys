import {
  Body,
  Container,
  Head,
  Hr,
  Html,
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

const logoBox = {
  display: "inline-block",
  width: "36px",
  height: "36px",
  lineHeight: "36px",
  borderRadius: "8px",
  backgroundColor: COLORS.brand600,
  color: "#FFFFFF",
  fontFamily: FONTS.display,
  fontWeight: 700,
  fontSize: "18px",
  textAlign: "center" as const,
  verticalAlign: "middle",
  marginRight: "8px",
};

const logoText = {
  display: "inline-block",
  fontFamily: FONTS.display,
  fontWeight: 700,
  fontSize: "20px",
  verticalAlign: "middle",
  margin: 0,
};

const footerStyle = {
  textAlign: "center" as const,
  color: COLORS.slate500,
  fontSize: "12px",
  marginTop: "24px",
  lineHeight: "1.6",
};

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="tr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={wrapper}>
          <Section style={headerSection}>
            <span style={logoBox}>S</span>
            <span style={logoText}>
              <span style={{ color: COLORS.brand900 }}>sup</span>
              <span style={{ color: COLORS.brand600 }}>keys</span>
            </span>
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
