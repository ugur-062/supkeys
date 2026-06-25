import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApprovalReminderData } from "../types";
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

const summaryHeader = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: "#92400e",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  fontWeight: 700 as const,
  margin: 0,
};

const summaryTitle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  color: "#78350f",
  margin: "8px 0 4px 0",
  fontWeight: 700 as const,
};

const summaryMeta = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: "#92400e",
  margin: "8px 0 0 0",
};

const summaryAmount = {
  fontFamily: FONTS.display,
  fontSize: "22px",
  fontWeight: 700 as const,
  color: "#78350f",
  margin: "12px 0 0 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

const helperText = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: COLORS.slate500,
  margin: "16px 0 0 0",
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

function typeLabel(type: ApprovalReminderData["approvalType"]): string {
  return type === "TENDER_PUBLISH" ? "İhale Yayını" : "Kazandırma";
}

export function makeApprovalReminderSubject(
  tenderTitle: string,
  daysWaiting: number,
): string {
  return `⏰ Onay hatırlatma: ${tenderTitle} (${daysWaiting} gündür bekliyor)`;
}

export function ApprovalReminderEmail(props: ApprovalReminderData) {
  const action = typeLabel(props.approvalType);
  return (
    <Layout
      preview={`${props.daysWaiting} gündür onay bekleyen süreç var: ${props.tenderTitle}`}
    >
      <Heading>Onay süreciniz hâlâ bekliyor ⏰</Heading>

      <Text style={paragraph}>Merhaba {props.approverFirstName},</Text>

      <Text style={paragraph}>
        <strong>{props.daysWaiting} gün</strong> önce{" "}
        <strong>{props.initiatorName}</strong> tarafından sizden{" "}
        <strong>{action}</strong> onayı talep edildi ve hâlâ cevap bekleniyor.
      </Text>

      <Section style={summaryBox}>
        <Text style={summaryHeader}>
          {props.approvalNumber} · {props.daysWaiting} gündür bekliyor
        </Text>
        <Text style={summaryTitle}>{props.tenderTitle}</Text>
        <Text style={summaryMeta}>
          {props.tenderNumber} · {props.flowName}
        </Text>
        <Text style={summaryAmount}>
          {formatAmount(props.amount, props.currency)}
        </Text>
      </Section>

      <Text style={paragraph}>
        Bu süreç onaylanmadan ilgili işlem (
        {action.toLocaleLowerCase("tr-TR")}) tamamlanamayacak. Lütfen en kısa
        sürede inceleyin.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.approvalUrl}>Onay Sürecini Görüntüle</Button>
      </Section>

      <Text style={helperText}>
        Bu hatırlatma 3 gün içinde cevap verilmediği için otomatik gönderildi.
        Cevap verilmediği takdirde 3 gün sonra tekrar hatırlatılacak.
      </Text>
    </Layout>
  );
}

export function renderApprovalReminderText(
  props: ApprovalReminderData,
): string {
  const action = typeLabel(props.approvalType);
  return [
    `Onay hatırlatma: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.approverFirstName},`,
    "",
    `${props.daysWaiting} gün önce ${props.initiatorName} sizden ${action} onayı talep etti ve hâlâ cevap bekleniyor.`,
    "",
    `Onay No   : ${props.approvalNumber}`,
    `İhale No  : ${props.tenderNumber}`,
    `Akış      : ${props.flowName}`,
    `Tutar     : ${formatAmount(props.amount, props.currency)}`,
    `Bekleme   : ${props.daysWaiting} gün`,
    "",
    `Onay sürecini görüntüle: ${props.approvalUrl}`,
    "",
    "Bu hatırlatma 3 gün içinde cevap verilmediği için otomatik gönderildi.",
    "",
    "© 2026 Rothern",
  ].join("\n");
}
