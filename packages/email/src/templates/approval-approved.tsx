import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApprovalApprovedData } from "../types";
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
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  borderRadius: "12px",
  padding: "20px",
  margin: "16px 0",
};

const labelStyle = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: "#16a34a",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  fontWeight: 700 as const,
  margin: 0,
};

const titleStyle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  color: "#14532d",
  margin: "8px 0 4px 0",
  fontWeight: 700 as const,
};

const metaStyle = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: "#15803d",
  margin: "4px 0 0 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

function actionLabel(type: ApprovalApprovedData["approvalType"]): string {
  return type === "TENDER_PUBLISH"
    ? "İhale yayınlandı, davet e-postaları gönderildi."
    : "Kazandırma tamamlandı, sipariş(ler) oluşturuldu.";
}

export function makeApprovalApprovedSubject(tenderTitle: string): string {
  return `✅ Onayınız tamamlandı: ${tenderTitle}`;
}

export function ApprovalApprovedEmail(props: ApprovalApprovedData) {
  return (
    <Layout
      preview={`${props.tenderTitle} için onay süreciniz başarıyla tamamlandı.`}
    >
      <Heading>Onayınız tamamlandı ✅</Heading>

      <Text style={paragraph}>Merhaba {props.initiatorFirstName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenderTitle}</strong>{" "}
        için onay süreciniz başarıyla tamamlandı.
      </Text>

      <Section style={summaryBox}>
        <Text style={labelStyle}>{props.approvalNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Text style={metaStyle}>
          {props.tenderNumber} · {props.flowName}
        </Text>
      </Section>

      <Text style={paragraph}>
        <strong>{props.approverCount}</strong> aşamalı onay süreci son olarak{" "}
        <strong>{props.lastApproverName}</strong> tarafından onaylandı.
      </Text>

      <Text style={paragraph}>{actionLabel(props.approvalType)}</Text>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>İhaleyi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderApprovalApprovedText(
  props: ApprovalApprovedData,
): string {
  return [
    `Onayınız tamamlandı: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.initiatorFirstName},`,
    "",
    `"${props.tenderTitle}" için onay süreciniz başarıyla tamamlandı.`,
    "",
    `Onay No   : ${props.approvalNumber}`,
    `İhale No  : ${props.tenderNumber}`,
    `Akış      : ${props.flowName}`,
    `Toplam    : ${props.approverCount} aşama`,
    `Son Onay  : ${props.lastApproverName}`,
    "",
    actionLabel(props.approvalType),
    "",
    `İhaleyi görüntüle: ${props.tenderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
