import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierRelationEstablishedSupplierData } from "../types";
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

const successBox = {
  backgroundColor: "#ECFDF5",
  border: "1px solid #BBF7D0",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "16px 0",
};

const successTitle = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  fontWeight: 700 as const,
  color: "#166534",
  margin: "0 0 8px 0",
};

const successText = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: "#15803D",
  margin: 0,
  lineHeight: "1.5",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeSupplierRelationEstablishedSupplierSubject(
  tenantName: string,
): string {
  return `✓ ${tenantName} ile bağlantınız aktif — Supkeys`;
}

export function SupplierRelationEstablishedSupplierEmail(
  props: SupplierRelationEstablishedSupplierData,
) {
  return (
    <Layout
      preview={`${props.tenantName} ile bağlantınız başarıyla kuruldu.`}
    >
      <Heading>Yeni alıcı bağlantınız aktif 🎉</Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firması ile bağlantınız başarıyla kuruldu. Artık bu firmanın açtığı
        ihalelere teklif verebilirsiniz.
      </Text>

      <Section style={successBox}>
        <Text style={successTitle}>✓ Bağlantınız aktif</Text>
        <Text style={successText}>
          {props.tenantName} sizi ihalelerine davet ettiğinde size e-posta ile
          bildirim gelecek.
        </Text>
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.profileUrl}>Profilime Git</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Bağlı olduğunuz alıcıların listesini Profil sayfanızdan
        görüntüleyebilirsiniz.
      </Text>
    </Layout>
  );
}

export function renderSupplierRelationEstablishedSupplierText(
  props: SupplierRelationEstablishedSupplierData,
): string {
  return [
    `${props.tenantName} ile bağlantınız aktif`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firması ile bağlantınız başarıyla kuruldu.`,
    "Artık bu firmanın açtığı ihalelere teklif verebilirsiniz.",
    "",
    `${props.tenantName} sizi ihalelerine davet ettiğinde size e-posta ile bildirim gelecek.`,
    "",
    `Profilime git: ${props.profileUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
