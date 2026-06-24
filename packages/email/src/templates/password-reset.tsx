import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { PasswordResetData } from "../types";
import { Button } from "./_components/button";
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

const infoBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "10px",
  padding: "14px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
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

export function makePasswordResetSubject(): string {
  return "🔑 Parola sıfırlama bağlantınız — Supkeys";
}

export function PasswordResetEmail(props: PasswordResetData) {
  return (
    <Layout preview="Parola sıfırlama talebiniz için bağlantı.">
      <Heading>Parolanızı sıfırlayın 🔑</Heading>

      <Text style={paragraph}>Merhaba {props.firstName},</Text>

      <Text style={paragraph}>
        Supkeys hesabınız için bir parola sıfırlama talebinde bulundunuz. Yeni
        parolanızı belirlemek için aşağıdaki butona tıklayın.
      </Text>

      <Section style={infoBox}>
        <strong style={{ color: COLORS.brand900 }}>Bağlantı bilgisi</strong>
        <br />
        Hesap: <strong>{props.email}</strong>
        <br />
        Geçerlilik: <strong>{props.expiresInMinutes} dakika</strong>
        <br />
        Bu bağlantı yalnızca bir kez kullanılabilir.
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.resetUrl}>Parolayı Sıfırla</Button>
      </Section>

      <Section style={warningBox}>
        Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz —
        bağlantıyı kullanmazsanız hesabınızda hiçbir şey değişmez.
      </Section>
    </Layout>
  );
}

export function renderPasswordResetText(props: PasswordResetData): string {
  return [
    "Supkeys parola sıfırlama",
    "",
    `Merhaba ${props.firstName},`,
    "",
    "Hesabınız için bir parola sıfırlama talebinde bulundunuz.",
    "",
    `Bağlantı ${props.expiresInMinutes} dakika geçerli ve sadece bir kez kullanılabilir.`,
    "",
    `Parolayı sıfırlamak için: ${props.resetUrl}`,
    "",
    "Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
    "",
    "— Supkeys",
  ].join("\n");
}
