import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { DemoRequestAdminAlertData } from "../types";
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

const tableWrap = {
  backgroundColor: COLORS.surfaceSubtle,
  borderRadius: "8px",
  border: `1px solid ${COLORS.surfaceBorder}`,
  padding: "16px 20px",
  margin: "16px 0",
};

const row = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 6px 0",
};

const label = {
  color: COLORS.slate500,
  fontWeight: 500,
  display: "inline-block",
  width: "120px",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

export function makeDemoRequestAdminAlertSubject(companyName: string): string {
  return `🔔 Yeni demo talebi: ${companyName}`;
}

export function DemoRequestAdminAlertEmail(props: DemoRequestAdminAlertData) {
  const adminLink = `${props.adminPanelUrl.replace(/\/$/, "")}/admin/demo-requests?search=${encodeURIComponent(props.companyName)}`;

  return (
    <Layout preview={`Yeni demo talebi geldi: ${props.companyName}`}>
      <Heading>Yeni demo talebi</Heading>

      <Text style={paragraph}>
        Landing page üzerinden yeni bir demo talebi geldi. Aşağıda detayları
        bulabilirsin.
      </Text>

      <Section style={tableWrap}>
        <Text style={row}>
          <span style={label}>Firma:</span>{" "}
          <strong style={{ color: COLORS.brand900 }}>{props.companyName}</strong>
        </Text>
        <Text style={row}>
          <span style={label}>İlgili Kişi:</span> {props.contactName}
        </Text>
        <Text style={row}>
          <span style={label}>E-posta:</span> {props.email}
        </Text>
        {props.phone && (
          <Text style={row}>
            <span style={label}>Telefon:</span> {props.phone}
          </Text>
        )}
        {props.jobTitle && (
          <Text style={row}>
            <span style={label}>Pozisyon:</span> {props.jobTitle}
          </Text>
        )}
        {props.companySize && (
          <Text style={row}>
            <span style={label}>Firma boyutu:</span> {props.companySize}
          </Text>
        )}
        {props.message && (
          <Text style={{ ...row, margin: "8px 0 0 0" }}>
            <span style={{ ...label, verticalAlign: "top" }}>Mesaj:</span>
            <span style={{ display: "inline-block", maxWidth: "320px" }}>
              {props.message}
            </span>
          </Text>
        )}
      </Section>

      <Section style={ctaWrap}>
        {/* TODO: detay drawer'ını direkt açan deeplink (?selected=:id) eklenince güncelle */}
        <Button href={adminLink}>Admin Panelinde İncele</Button>
      </Section>

      <Text
        style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}
      >
        Talep ID: {props.demoRequestId}
      </Text>
    </Layout>
  );
}

export function renderDemoRequestAdminAlertText(
  props: DemoRequestAdminAlertData,
): string {
  const lines = [
    "Yeni demo talebi",
    "",
    `Firma: ${props.companyName}`,
    `İlgili Kişi: ${props.contactName}`,
    `E-posta: ${props.email}`,
  ];
  if (props.phone) lines.push(`Telefon: ${props.phone}`);
  if (props.jobTitle) lines.push(`Pozisyon: ${props.jobTitle}`);
  if (props.companySize) lines.push(`Firma boyutu: ${props.companySize}`);
  if (props.message) lines.push("", "Mesaj:", props.message);
  lines.push(
    "",
    `Admin panel: ${props.adminPanelUrl.replace(/\/$/, "")}/admin/demo-requests`,
    `Talep ID: ${props.demoRequestId}`,
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
