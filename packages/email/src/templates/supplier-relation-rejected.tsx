import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierRelationRejectedData } from "../types";
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

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

const reasonBox = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderLeftWidth: "3px",
  borderLeftColor: COLORS.slate500,
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "12px 0",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  lineHeight: "1.6",
  fontStyle: "italic" as const,
};

export function makeSupplierRelationRejectedSubject(tenantName: string): string {
  return `${tenantName} bağlantı talebinizi yanıtladı — Supkeys`;
}

export function SupplierRelationRejectedEmail(
  props: SupplierRelationRejectedData,
) {
  return (
    <Layout
      preview={`${props.tenantName} bağlantı talebinizi reddetti.`}
    >
      <Heading>Bağlantı talebi reddedildi</Heading>

      <Text style={paragraph}>Merhaba {props.supplierContactName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firması bağlantı talebinizi maalesef onaylamadı. Bu, hesabınızı veya
        diğer alıcılarla mevcut bağlantılarınızı etkilemez.
      </Text>

      {props.reason ? (
        <>
          <Text
            style={{
              ...paragraph,
              fontSize: "13px",
              fontWeight: 600 as const,
              color: COLORS.brand900,
              margin: "16px 0 4px",
            }}
          >
            Sebep
          </Text>
          <Section style={reasonBox}>“{props.reason}”</Section>
        </>
      ) : null}

      <Section style={ctaWrap}>
        <Button href={props.profileUrl}>Profilime Git</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Sorularınız için{" "}
        <a
          href={`mailto:${props.supportEmail}`}
          style={{ color: COLORS.brand700 }}
        >
          {props.supportEmail}
        </a>{" "}
        ile iletişime geçebilirsiniz.
      </Text>
    </Layout>
  );
}

export function renderSupplierRelationRejectedText(
  props: SupplierRelationRejectedData,
): string {
  const lines = [
    `${props.tenantName} bağlantı talebinizi reddetti`,
    "",
    `Merhaba ${props.supplierContactName},`,
    "",
    `${props.tenantName} bağlantı talebinizi maalesef onaylamadı.`,
  ];
  if (props.reason) {
    lines.push("", `Sebep: "${props.reason}"`);
  }
  lines.push(
    "",
    `Profilime git: ${props.profileUrl}`,
    "",
    `Sorularınız için: ${props.supportEmail}`,
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
