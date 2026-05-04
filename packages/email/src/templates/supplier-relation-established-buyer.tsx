import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierRelationEstablishedBuyerData } from "../types";
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

const summaryLabel = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  fontWeight: 600 as const,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  margin: "0 0 8px 0",
};

const summaryTitle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  fontWeight: 700 as const,
  color: COLORS.brand900,
  margin: "0 0 8px 0",
};

const summaryRow = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  margin: "4px 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeSupplierRelationEstablishedBuyerSubject(
  supplierCompanyName: string,
): string {
  return `🤝 Yeni tedarikçi listenize eklendi: ${supplierCompanyName}`;
}

export function SupplierRelationEstablishedBuyerEmail(
  props: SupplierRelationEstablishedBuyerData,
) {
  return (
    <Layout
      preview={`${props.supplierCompanyName} ${props.tenantName} tedarikçi listenize eklendi.`}
    >
      <Heading>Yeni tedarikçi listenize eklendi 🤝</Heading>

      <Text style={paragraph}>
        Merhaba{props.adminFirstName ? ` ${props.adminFirstName}` : ""},
      </Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>
          {props.supplierCompanyName}
        </strong>{" "}
        firması, gönderdiğiniz daveti kabul ederek{" "}
        <strong>{props.tenantName}</strong> tedarikçi listenize eklendi.
      </Text>

      <Section style={summaryBox}>
        <Text style={summaryLabel}>Tedarikçi Bilgileri</Text>
        <Text style={summaryTitle}>{props.supplierCompanyName}</Text>
        <Text style={summaryRow}>
          VKN:{" "}
          <span
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
          >
            {props.supplierTaxNumber}
          </span>
        </Text>
        {props.supplierCity ? (
          <Text style={summaryRow}>{props.supplierCity}</Text>
        ) : null}
        {props.supplierIndustry ? (
          <Text style={summaryRow}>Sektör: {props.supplierIndustry}</Text>
        ) : null}
        <Text style={summaryRow}>İletişim: {props.supplierContactEmail}</Text>
      </Section>

      <Text style={paragraph}>
        Bu tedarikçiyi artık ihalelerinize davet edebilirsiniz. Tedarikçi
        listenizden istediğiniz zaman erişebilir, gerekirse engelleyebilirsiniz.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.tedarikciDetayUrl}>Tedarikçilerime Git</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Bu bağlantıyı kurmadıysanız veya iptal etmek istiyorsanız, Supkeys
        panelinden tedarikçiyi engelleyebilirsiniz.
      </Text>
    </Layout>
  );
}

export function renderSupplierRelationEstablishedBuyerText(
  props: SupplierRelationEstablishedBuyerData,
): string {
  const lines = [
    `Yeni tedarikçi listenize eklendi: ${props.supplierCompanyName}`,
    "",
    `Merhaba${props.adminFirstName ? ` ${props.adminFirstName}` : ""},`,
    "",
    `${props.supplierCompanyName}, gönderdiğiniz daveti kabul ederek ${props.tenantName} tedarikçi listenize eklendi.`,
    "",
    `Firma: ${props.supplierCompanyName}`,
    `VKN: ${props.supplierTaxNumber}`,
  ];
  if (props.supplierCity) lines.push(`Şehir: ${props.supplierCity}`);
  if (props.supplierIndustry) lines.push(`Sektör: ${props.supplierIndustry}`);
  lines.push(`İletişim: ${props.supplierContactEmail}`);
  lines.push(
    "",
    `Tedarikçilerime git: ${props.tedarikciDetayUrl}`,
    "",
    "Bu bağlantıyı kurmadıysanız tedarikçiyi engelleyebilirsiniz.",
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
