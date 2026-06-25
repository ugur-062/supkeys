import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { TwoFactorOtpData } from "../types";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { COLORS, FONTS } from "./_components/tokens";

const paragraph = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 16px 0",
};

const codeBox = {
  textAlign: "center" as const,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "12px",
  padding: "20px",
  margin: "20px 0",
};

const codeStyle = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  fontSize: "32px",
  fontWeight: 700 as const,
  letterSpacing: "8px",
  color: COLORS.brand900,
  margin: 0,
};

const warningBox = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

export function makeTwoFactorOtpSubject(): string {
  return "🔐 Doğrulama kodunuz — Rothern";
}

export function TwoFactorOtpEmail(props: TwoFactorOtpData) {
  return (
    <Layout preview="Rothern doğrulama kodunuz.">
      <Heading>Doğrulama kodunuz 🔐</Heading>

      <Text style={paragraph}>Merhaba {props.firstName},</Text>

      <Text style={paragraph}>
        Hesabınızın {props.purposeLabel} işlemi için aşağıdaki tek kullanımlık
        doğrulama kodunu kullanın:
      </Text>

      <Section style={codeBox}>
        <Text style={codeStyle}>{props.otpCode}</Text>
      </Section>

      <Text style={paragraph}>
        Kod <strong>{props.expiresInMinutes} dakika</strong> geçerlidir ve
        yalnızca bir kez kullanılabilir.
      </Text>

      <Section style={warningBox}>
        Bu işlemi siz başlatmadıysanız bu e-postayı yok sayabilir ve parolanızı
        değiştirmenizi öneririz.
      </Section>
    </Layout>
  );
}

export function renderTwoFactorOtpText(props: TwoFactorOtpData): string {
  return [
    "Rothern doğrulama kodu",
    "",
    `Merhaba ${props.firstName},`,
    "",
    `${props.purposeLabel} işlemi için doğrulama kodunuz: ${props.otpCode}`,
    "",
    `Kod ${props.expiresInMinutes} dakika geçerli ve yalnızca bir kez kullanılabilir.`,
    "",
    "Bu işlemi siz başlatmadıysanız e-postayı yok sayın.",
    "",
    "— Rothern",
  ].join("\n");
}
