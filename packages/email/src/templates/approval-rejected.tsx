import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApprovalRejectedData } from "../types";
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
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "12px",
  padding: "20px",
  margin: "16px 0",
};

const labelStyle = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: "#991b1b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  fontWeight: 700 as const,
  margin: 0,
};

const titleStyle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  color: "#7f1d1d",
  margin: "8px 0 4px 0",
  fontWeight: 700 as const,
};

const metaStyle = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: "#991b1b",
  margin: "4px 0 0 0",
};

const reasonBox = {
  background: "#fef2f2",
  borderLeft: "3px solid #dc2626",
  padding: "12px 16px",
  margin: "16px 0",
};

const reasonLabel = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: "#991b1b",
  textTransform: "uppercase" as const,
  fontWeight: 700 as const,
  margin: 0,
  letterSpacing: "0.5px",
};

const reasonText = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  color: "#7f1d1d",
  margin: "4px 0 0 0",
  whiteSpace: "pre-wrap" as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

function reverseLabel(type: ApprovalRejectedData["approvalType"]): string {
  return type === "TENDER_PUBLISH"
    ? "İhale taslak (DRAFT) durumuna döndü, düzenleyip tekrar yayınlayabilirsiniz."
    : "İhale kazandırma aşamasına döndü, kararlarınızı düzenleyip tekrar tamamlayabilirsiniz.";
}

export function makeApprovalRejectedSubject(tenderTitle: string): string {
  return `❌ Onay süreciniz reddedildi: ${tenderTitle}`;
}

export function ApprovalRejectedEmail(props: ApprovalRejectedData) {
  return (
    <Layout
      preview={`${props.tenderTitle} için onay süreciniz ${props.rejectorName} tarafından reddedildi.`}
    >
      <Heading>Onay süreciniz reddedildi ❌</Heading>

      <Text style={paragraph}>Merhaba {props.initiatorFirstName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenderTitle}</strong>{" "}
        için başlattığınız onay süreci{" "}
        <strong>{props.rejectorName}</strong> tarafından reddedildi.
      </Text>

      <Section style={summaryBox}>
        <Text style={labelStyle}>{props.approvalNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Text style={metaStyle}>
          {props.tenderNumber} · {props.flowName}
        </Text>
      </Section>

      <Section style={reasonBox}>
        <Text style={reasonLabel}>Reddetme Sebebi</Text>
        <Text style={reasonText}>{props.rejectionNote}</Text>
      </Section>

      <Text style={paragraph}>{reverseLabel(props.approvalType)}</Text>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>İhaleyi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderApprovalRejectedText(
  props: ApprovalRejectedData,
): string {
  return [
    `Onay süreciniz reddedildi: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.initiatorFirstName},`,
    "",
    `"${props.tenderTitle}" için başlattığınız onay süreci ${props.rejectorName} tarafından reddedildi.`,
    "",
    `Onay No   : ${props.approvalNumber}`,
    `İhale No  : ${props.tenderNumber}`,
    `Akış      : ${props.flowName}`,
    "",
    `Reddetme Sebebi:`,
    props.rejectionNote,
    "",
    reverseLabel(props.approvalType),
    "",
    `İhaleyi görüntüle: ${props.tenderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
