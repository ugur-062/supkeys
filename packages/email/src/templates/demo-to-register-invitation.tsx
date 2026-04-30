import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { DemoToRegisterInvitationData } from "../types";
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

const messageQuote = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderLeftWidth: "3px",
  borderLeftColor: COLORS.brand600,
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "16px 0",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  lineHeight: "1.6",
  fontStyle: "italic" as const,
};

const noticeBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderLeftWidth: "4px",
  borderLeftColor: COLORS.brand600,
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

const linkBox = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "6px",
  padding: "10px 12px",
  fontFamily: "monospace",
  fontSize: "11px",
  wordBreak: "break-all" as const,
  color: COLORS.slate600,
  margin: "8px 0 16px 0",
};

export const DEMO_TO_REGISTER_INVITATION_SUBJECT =
  "Supkeys'e davet edildiniz — hesap oluşturun";

export function DemoToRegisterInvitationEmail(
  props: DemoToRegisterInvitationData,
) {
  return (
    <Layout
      preview={`${props.companyName} için Supkeys hesabı oluşturma daveti.`}
    >
      <Heading>Supkeys&apos;e davet edildiniz 🎉</Heading>

      <Text style={paragraph}>Merhaba {props.contactName},</Text>

      <Text style={paragraph}>
        Supkeys ekibi ile yaptığınız görüşme için teşekkür ederiz.{" "}
        <strong style={{ color: COLORS.brand900 }}>{props.companyName}</strong>{" "}
        firması için Supkeys hesabınızı oluşturmaya davet ediyoruz.
      </Text>

      {props.message && (
        <Section style={messageQuote}>{props.message}</Section>
      )}

      <Section style={noticeBox}>
        Aşağıdaki bağlantıya tıklayarak hızlıca kayıt olabilirsiniz.{" "}
        Davetiniz <strong>{props.expiresAt}</strong> tarihine kadar geçerli.
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.registerUrl}>Hesap Oluştur</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Buton çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza yapıştırın:
      </Text>
      <Text style={linkBox}>{props.registerUrl}</Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        Sorularınız için:{" "}
        <a
          href="mailto:support@supkeys.com"
          style={{ color: COLORS.brand700, textDecoration: "underline" }}
        >
          support@supkeys.com
        </a>
      </Text>

      <Text
        style={{
          ...paragraph,
          marginTop: "20px",
          color: COLORS.brand900,
          fontWeight: 600,
        }}
      >
        — Supkeys ekibi
      </Text>
    </Layout>
  );
}

export function renderDemoToRegisterInvitationText(
  props: DemoToRegisterInvitationData,
): string {
  const lines = [
    `Merhaba ${props.contactName},`,
    "",
    "Supkeys ekibi ile yaptığınız görüşme için teşekkür ederiz.",
    `${props.companyName} firması için Supkeys hesabınızı oluşturmaya davet ediyoruz.`,
  ];
  if (props.message) {
    lines.push("", `Mesaj: "${props.message}"`);
  }
  lines.push(
    "",
    `Hesap oluştur: ${props.registerUrl}`,
    "",
    `Davetiniz ${props.expiresAt} tarihine kadar geçerli.`,
    "",
    "Sorularınız için: support@supkeys.com",
    "",
    "— Supkeys ekibi",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
