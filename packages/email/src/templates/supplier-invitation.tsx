import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierInvitationData } from "../types";
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

const messageBox = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "8px",
  padding: "14px 18px",
  margin: "16px 0",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  lineHeight: "1.6",
  fontStyle: "italic" as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

const noticeBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

const aboutBox = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

export function makeSupplierInvitationSubject(tenantName: string): string {
  return `${tenantName} sizi tedarikçi olarak davet etti — Supkeys`;
}

export function SupplierInvitationEmail(props: SupplierInvitationData) {
  return (
    <Layout
      preview={`${props.inviterTenantName} sizi tedarikçi olarak davet etti.`}
    >
      <Heading>
        {props.inviterTenantName} sizi davet etti
      </Heading>

      <Text style={paragraph}>
        Merhaba{props.contactName ? ` ${props.contactName}` : ""},
      </Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>
          {props.inviterTenantName}
        </strong>{" "}
        firmasından <strong>{props.inviterUserName}</strong>, sizi Supkeys
        platformunda tedarikçi olarak kayıt olmaya davet etti.
      </Text>

      {props.message && (
        <>
          <Heading level={2}>{props.inviterUserName}&apos;den mesaj</Heading>
          <Section style={messageBox}>“{props.message}”</Section>
        </>
      )}

      <Section style={ctaWrap}>
        <Button href={props.acceptUrl}>Daveti Kabul Et ve Kayıt Ol</Button>
      </Section>

      <Section style={noticeBox}>
        Bu davet bağlantısı <strong>7 gün</strong> içinde geçerlidir. Süresi
        dolduğunda davet sahibinden yeniden gönderilmesini isteyebilirsiniz.
      </Section>

      <Section style={aboutBox}>
        <strong style={{ color: COLORS.slate700 }}>Supkeys nedir?</strong>{" "}
        Türkiye&apos;nin AI destekli e-satın alma ve e-ihale platformu.
        Tedarikçi yönetimi, RFQ ve açık eksiltme süreçlerini tek panelden
        yürütür. Kayıt ücretsiz; davet edildiğiniz ihalelere teklif verirsiniz.
      </Section>
    </Layout>
  );
}

export function renderSupplierInvitationText(
  props: SupplierInvitationData,
): string {
  const lines = [
    `${props.inviterTenantName} sizi davet etti`,
    "",
    `Merhaba${props.contactName ? ` ${props.contactName}` : ""},`,
    "",
    `${props.inviterTenantName} firmasından ${props.inviterUserName},`,
    "sizi Supkeys platformunda tedarikçi olarak kayıt olmaya davet etti.",
  ];
  if (props.message) {
    lines.push("", `${props.inviterUserName}'den mesaj:`, `"${props.message}"`);
  }
  lines.push(
    "",
    `Daveti kabul et ve kayıt ol: ${props.acceptUrl}`,
    "",
    "Bu davet bağlantısı 7 gün içinde geçerlidir.",
    "",
    "Supkeys nedir?",
    "Türkiye'nin AI destekli e-satın alma ve e-ihale platformu.",
    "Kayıt ücretsiz; davet edildiğiniz ihalelere teklif verirsiniz.",
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
