import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { TenderClosingTimeChangedData } from "../types";
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

const noteBox = {
  backgroundColor: "#FEF3C7",
  border: "1px solid #FCD34D",
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "12px 0 20px 0",
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

const dateLine = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  margin: "6px 0 0 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeTenderClosingTimeChangedSubject(
  tenderTitle: string,
  closedImmediately: boolean,
): string {
  return closedImmediately
    ? `🔒 İhale kapatıldı: ${tenderTitle}`
    : `⏰ Kapanış zamanı değişti: ${tenderTitle}`;
}

export function TenderClosingTimeChangedEmail(
  props: TenderClosingTimeChangedData,
) {
  const action = props.closedImmediately
    ? "tarafından hemen kapatıldı"
    : "tarafından kapanış zamanı güncellendi";

  return (
    <Layout
      preview={`${props.tenderTitle} ${action}.`}
    >
      <Heading>
        {props.closedImmediately
          ? "İhale kapatıldı 🔒"
          : "Kapanış zamanı değişti ⏰"}
      </Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firmasının açtığı ihale {action}.
      </Text>

      <Section style={summaryBox}>
        <Text style={tenderNumberStyle}>{props.tenderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Text style={dateLine}>
          Önceki kapanış: <strong>{props.previousCloseAt}</strong>
        </Text>
        <Text style={dateLine}>
          {props.closedImmediately ? "Kapatıldı" : "Yeni kapanış"}:{" "}
          <strong>{props.newCloseAt}</strong>
        </Text>
      </Section>

      <Section style={noteBox}>
        <Text
          style={{
            ...paragraph,
            margin: 0,
            color: "#92400E",
            fontWeight: 600,
          }}
        >
          Alıcı notu:
        </Text>
        <Text
          style={{
            ...paragraph,
            margin: "4px 0 0 0",
            color: "#78350F",
            whiteSpace: "pre-wrap",
          }}
        >
          {props.note}
        </Text>
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>İhaleyi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderTenderClosingTimeChangedText(
  props: TenderClosingTimeChangedData,
): string {
  const action = props.closedImmediately
    ? "tarafından hemen kapatıldı"
    : "tarafından kapanış zamanı güncellendi";
  return [
    props.closedImmediately
      ? `İhale kapatıldı: ${props.tenderTitle}`
      : `Kapanış zamanı değişti: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firmasının açtığı ihale ${action}.`,
    "",
    `İhale No        : ${props.tenderNumber}`,
    `Önceki kapanış  : ${props.previousCloseAt}`,
    `${props.closedImmediately ? "Kapatıldı       " : "Yeni kapanış    "}: ${props.newCloseAt}`,
    "",
    `Alıcı notu: ${props.note}`,
    "",
    `İhaleyi görüntüle: ${props.tenderUrl}`,
    "",
    "© 2026 Rothern",
  ].join("\n");
}
