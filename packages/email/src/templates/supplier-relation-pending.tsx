import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierRelationPendingData } from "../types";
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

const summaryRow = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  margin: "4px 0",
};

const summaryLabel = {
  display: "inline-block",
  minWidth: "90px",
  color: COLORS.slate500,
  fontWeight: 500 as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeSupplierRelationPendingSubject(
  supplierCompanyName: string,
): string {
  return `🤝 Yeni tedarikçi bağlantı talebi: ${supplierCompanyName}`;
}

export function SupplierRelationPendingEmail(
  props: SupplierRelationPendingData,
) {
  return (
    <Layout
      preview={`${props.supplierCompanyName} sizinle bağlantı talep etti.`}
    >
      <Heading>Yeni bağlantı talebi 🤝</Heading>

      <Text style={paragraph}>
        Merhaba{props.recipientFirstName ? ` ${props.recipientFirstName}` : ""},
      </Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>
          {props.supplierCompanyName}
        </strong>
        , gönderdiğiniz daveti aldı ve sizinle çalışmak istiyor. Talebi
        inceleyip onaylayabilir veya reddedebilirsiniz.
      </Text>

      <Section style={summaryBox}>
        <Text style={summaryRow}>
          <span style={summaryLabel}>Firma</span>
          <strong style={{ color: COLORS.brand900 }}>
            {props.supplierCompanyName}
          </strong>
        </Text>
        <Text style={summaryRow}>
          <span style={summaryLabel}>Vergi No</span>
          <span
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              color: COLORS.slate700,
            }}
          >
            {props.supplierTaxNumber}
          </span>
        </Text>
        <Text style={summaryRow}>
          <span style={summaryLabel}>Şehir</span>
          {props.supplierCity}
        </Text>
        {props.supplierIndustry ? (
          <Text style={summaryRow}>
            <span style={summaryLabel}>Sektör</span>
            {props.supplierIndustry}
          </Text>
        ) : null}
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.reviewUrl}>Talebi İncele</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Onayladığınızda tedarikçi, ihalelerinize teklif verebilir hale gelir.
        Reddederseniz tedarikçi engellenir ve talebi tekrar gönderemez.
      </Text>
    </Layout>
  );
}

export function renderSupplierRelationPendingText(
  props: SupplierRelationPendingData,
): string {
  const lines = [
    `Yeni bağlantı talebi: ${props.supplierCompanyName}`,
    "",
    `Merhaba${props.recipientFirstName ? ` ${props.recipientFirstName}` : ""},`,
    "",
    `${props.supplierCompanyName}, sizinle çalışmak istiyor.`,
    "",
    `Vergi No: ${props.supplierTaxNumber}`,
    `Şehir: ${props.supplierCity}`,
  ];
  if (props.supplierIndustry) lines.push(`Sektör: ${props.supplierIndustry}`);
  lines.push(
    "",
    `Talebi incele: ${props.reviewUrl}`,
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
