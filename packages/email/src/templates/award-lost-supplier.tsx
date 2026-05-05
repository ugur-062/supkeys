import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { AwardLostSupplierData } from "../types";
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

const summaryBox = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "10px",
  padding: "16px 18px",
  margin: "16px 0",
};

const tenderNumberStyle = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  fontSize: "12px",
  color: COLORS.slate500,
  margin: "0 0 4px 0",
};

const titleStyle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  fontWeight: 700 as const,
  color: COLORS.brand900,
  margin: 0,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeAwardLostSupplierSubject(tenderTitle: string): string {
  return `İhale sonuçlandı: ${tenderTitle}`;
}

export function AwardLostSupplierEmail(props: AwardLostSupplierData) {
  return (
    <Layout
      preview={`${props.tenantName} ihalesi sonuçlandı, başka bir tedarikçi tercih edildi.`}
    >
      <Heading>İhale sonuçlandı</Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firmasının açtığı{" "}
        <strong style={{ color: COLORS.brand900 }}>{props.tenderTitle}</strong>{" "}
        ihalesi sonuçlandı. Maalesef bu ihalede başka bir tedarikçi tercih
        edildi.
      </Text>

      <Section style={summaryBox}>
        <Text style={tenderNumberStyle}>{props.tenderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
      </Section>

      <Text style={paragraph}>
        Verdiğiniz teklif için teşekkür ederiz. Diğer ihaleler için sizi davet
        etmeye devam edeceğiz.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>İhaleyi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderAwardLostSupplierText(
  props: AwardLostSupplierData,
): string {
  return [
    `İhale sonuçlandı: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firmasının açtığı "${props.tenderTitle}" ihalesi sonuçlandı. Maalesef bu ihalede başka bir tedarikçi tercih edildi.`,
    "",
    `İhale No: ${props.tenderNumber}`,
    "",
    `İhaleyi görüntüle: ${props.tenderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
