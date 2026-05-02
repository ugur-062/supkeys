import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierRelationApprovedData } from "../types";
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

const noticeBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

export function makeSupplierRelationApprovedSubject(tenantName: string): string {
  return `✓ ${tenantName} bağlantınızı onayladı — Supkeys`;
}

export function SupplierRelationApprovedEmail(
  props: SupplierRelationApprovedData,
) {
  return (
    <Layout
      preview={`${props.tenantName} bağlantı talebinizi onayladı.`}
    >
      <Heading>Bağlantı onaylandı 🎉</Heading>

      <Text style={paragraph}>
        Merhaba {props.supplierContactName},
      </Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firması bağlantı talebinizi onayladı. Artık <strong>onaylı tedarikçi
        ağında</strong> yer alıyorsunuz; açtıkları ihalelere teklif verebilir,
        siparişlerini karşılayabilirsiniz.
      </Text>

      <Section style={noticeBox}>
        Tedarikçi panelinizden &ldquo;Profilim&rdquo; sayfasına giderek bağlı
        alıcılarınızı görebilirsiniz.
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.profileUrl}>Profilime Git</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Sorularınız için{" "}
        <a href="mailto:support@supkeys.com" style={{ color: COLORS.brand700 }}>
          support@supkeys.com
        </a>
        .
      </Text>
    </Layout>
  );
}

export function renderSupplierRelationApprovedText(
  props: SupplierRelationApprovedData,
): string {
  return [
    `${props.tenantName} bağlantınızı onayladı`,
    "",
    `Merhaba ${props.supplierContactName},`,
    "",
    `${props.tenantName} bağlantı talebinizi onayladı.`,
    "Artık açtıkları ihalelere teklif verebilirsiniz.",
    "",
    `Profilime git: ${props.profileUrl}`,
    "",
    "Sorularınız için: support@supkeys.com",
    "© 2026 Supkeys",
  ].join("\n");
}
