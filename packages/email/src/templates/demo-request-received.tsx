import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { DemoRequestReceivedData } from "../types";
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

const listStyle = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "1.8",
  color: COLORS.slate700,
  margin: "0 0 24px 16px",
  paddingLeft: 0,
};

const summaryBox = {
  backgroundColor: COLORS.brand50,
  borderRadius: "8px",
  border: `1px solid ${COLORS.brand100}`,
  padding: "16px",
  margin: "16px 0",
};

const summaryRow = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 4px 0",
};

const summaryLabel = {
  color: COLORS.slate500,
  fontWeight: 500,
};

export const DEMO_REQUEST_RECEIVED_SUBJECT = "Talebiniz alındı — Supkeys";

export function DemoRequestReceivedEmail(props: DemoRequestReceivedData) {
  const { contactName, companyName, email, phone, message } = props;

  return (
    <Layout preview="Demo talebinizi aldık, ekibimiz en kısa sürede dönüş yapacak.">
      <Heading>Merhaba {contactName},</Heading>

      <Text style={paragraph}>
        Demo talebinizi aldık. Ekibimiz <strong>1 iş günü</strong> içinde size
        dönüş yapacak.
      </Text>

      <Heading level={2}>Demo görüşmesinde:</Heading>
      <ul style={listStyle}>
        <li>Firma süreçlerinizi birlikte inceleyeceğiz</li>
        <li>Supkeys&apos;in canlı demosunu göstereceğiz</li>
        <li>Tüm sorularınızı yanıtlayacağız</li>
      </ul>

      <Heading level={2}>Talep özetiniz</Heading>
      <Section style={summaryBox}>
        <Text style={summaryRow}>
          <span style={summaryLabel}>Firma:</span> {companyName}
        </Text>
        <Text style={summaryRow}>
          <span style={summaryLabel}>E-posta:</span> {email}
        </Text>
        {phone && (
          <Text style={{ ...summaryRow, margin: 0 }}>
            <span style={summaryLabel}>Telefon:</span> {phone}
          </Text>
        )}
      </Section>

      {message && (
        <>
          <Heading level={2}>Mesajınız</Heading>
          <Text style={{ ...paragraph, fontStyle: "italic" }}>
            “{message}”
          </Text>
        </>
      )}

      <Text style={paragraph}>
        Sorularınız için bu e-postayı yanıtlayabilirsiniz.
      </Text>

      <Text
        style={{
          ...paragraph,
          margin: 0,
          color: COLORS.brand900,
          fontWeight: 600,
        }}
      >
        — Supkeys ekibi
      </Text>
    </Layout>
  );
}

export function renderDemoRequestReceivedText(
  props: DemoRequestReceivedData,
): string {
  const lines = [
    `Merhaba ${props.contactName},`,
    "",
    "Demo talebinizi aldık. Ekibimiz 1 iş günü içinde size dönüş yapacak.",
    "",
    "Demo görüşmesinde:",
    "- Firma süreçlerinizi birlikte inceleyeceğiz",
    "- Supkeys'in canlı demosunu göstereceğiz",
    "- Tüm sorularınızı yanıtlayacağız",
    "",
    "Talep özetiniz:",
    `Firma: ${props.companyName}`,
    `E-posta: ${props.email}`,
  ];
  if (props.phone) lines.push(`Telefon: ${props.phone}`);
  if (props.message) {
    lines.push("", "Mesajınız:", props.message);
  }
  lines.push(
    "",
    "Sorularınız için bu e-postayı yanıtlayabilirsiniz.",
    "",
    "— Supkeys ekibi",
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
