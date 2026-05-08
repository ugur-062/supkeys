import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApprovalRequiredData } from "../types";
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
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "12px",
  padding: "20px",
  margin: "16px 0",
};

const labelStyle = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: "#92400e",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  fontWeight: 700 as const,
  margin: 0,
};

const titleStyle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  color: "#78350f",
  margin: "8px 0 4px 0",
  fontWeight: 700 as const,
};

const metaStyle = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: "#92400e",
  margin: "4px 0 0 0",
};

const amountStyle = {
  fontFamily: FONTS.display,
  fontSize: "22px",
  fontWeight: 700 as const,
  color: "#78350f",
  margin: "12px 0 0 0",
};

const noteBox = {
  background: COLORS.surfaceSubtle,
  borderLeft: `3px solid ${COLORS.slate500}`,
  padding: "12px 16px",
  margin: "16px 0",
};

const noteLabel = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: COLORS.slate500,
  textTransform: "uppercase" as const,
  fontWeight: 700 as const,
  margin: 0,
  letterSpacing: "0.5px",
};

const noteText = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  color: COLORS.slate700,
  margin: "4px 0 0 0",
  whiteSpace: "pre-wrap" as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

const helperText = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  margin: "16px 0 0 0",
  lineHeight: "1.5",
};

const fallbackBanner = {
  background: "#fef3c7",
  border: "1px solid #fde68a",
  borderRadius: "8px",
  padding: "12px 16px",
  margin: "12px 0",
};

const fallbackText = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: "#92400e",
  margin: 0,
  lineHeight: "1.5",
};

function formatAmount(amount: number, currency: string): string {
  try {
    return amount.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${amount.toLocaleString("tr-TR")} ${currency}`;
  }
}

function typeLabel(type: ApprovalRequiredData["approvalType"]): string {
  return type === "TENDER_PUBLISH" ? "İhale Yayını" : "Kazandırma";
}

export function makeApprovalRequiredSubject(tenderTitle: string): string {
  return `🔔 Onayınız bekleniyor: ${tenderTitle}`;
}

export function ApprovalRequiredEmail(props: ApprovalRequiredData) {
  const action = typeLabel(props.approvalType);
  return (
    <Layout
      preview={`${props.initiatorName} sizden ${action} onayı talep etti.`}
    >
      <Heading>Onayınız bekleniyor 🔔</Heading>

      <Text style={paragraph}>Merhaba {props.approverFirstName},</Text>

      {props.isFallback ? (
        <Section style={fallbackBanner}>
          <Text style={fallbackText}>
            <strong>⚠️ Otomatik Atama:</strong> Bu onay daha önce{" "}
            <strong>{props.originalApproverName}</strong> üzerine atanmıştı,
            ancak ilgili kullanıcı pasif duruma geçtiği için yetkili Firma
            Yöneticisi olarak size yönlendirildi.
          </Text>
        </Section>
      ) : null}

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.initiatorName}</strong>
        , sizden <strong>{action}</strong> onayı talep etti.
      </Text>

      <Section style={summaryBox}>
        <Text style={labelStyle}>{props.approvalNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Text style={metaStyle}>
          {props.tenderNumber} · {props.flowName}
        </Text>
        <Text style={amountStyle}>
          {formatAmount(props.amount, props.currency)}
        </Text>
      </Section>

      {props.initiatorNote ? (
        <Section style={noteBox}>
          <Text style={noteLabel}>Açıklama</Text>
          <Text style={noteText}>{props.initiatorNote}</Text>
        </Section>
      ) : null}

      <Section style={ctaWrap}>
        <Button href={props.approvalUrl}>Onay Sürecini Görüntüle</Button>
      </Section>

      <Text style={helperText}>
        Bu süreç onaylanmadan ilgili işlem ({action.toLocaleLowerCase("tr-TR")})
        tamamlanmayacak.
      </Text>
    </Layout>
  );
}

export function renderApprovalRequiredText(
  props: ApprovalRequiredData,
): string {
  const action = typeLabel(props.approvalType);
  const lines = [
    `Onayınız bekleniyor: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.approverFirstName},`,
    "",
  ];
  if (props.isFallback && props.originalApproverName) {
    lines.push(
      `⚠️ Otomatik Atama: Bu onay daha önce ${props.originalApproverName} adına atanmıştı; pasif duruma geçtiği için size yönlendirildi.`,
      "",
    );
  }
  lines.push(
    `${props.initiatorName} sizden ${action} onayı talep etti.`,
    "",
    `Onay No   : ${props.approvalNumber}`,
    `İhale No  : ${props.tenderNumber}`,
    `Akış      : ${props.flowName}`,
    `Tutar     : ${formatAmount(props.amount, props.currency)}`,
  );
  if (props.initiatorNote) {
    lines.push("", `Açıklama  : ${props.initiatorNote}`);
  }
  lines.push(
    "",
    `Onay sürecini görüntüle: ${props.approvalUrl}`,
    "",
    "Bu süreç onaylanmadan ilgili işlem tamamlanmayacak.",
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
