import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { NotificationData } from "../types";
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

const infoBox = {
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "10px",
  padding: "14px 16px",
  margin: "16px 0",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  lineHeight: "1.7",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

const footerStyle = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

export function makeNotificationSubject(props: NotificationData): string {
  return props.subject;
}

export function NotificationEmail(props: NotificationData) {
  return (
    <Layout preview={props.preview ?? props.heading}>
      <Heading>{props.heading}</Heading>

      {props.paragraphs.map((p, i) => (
        <Text key={i} style={paragraph}>
          {p}
        </Text>
      ))}

      {props.infoRows && props.infoRows.length > 0 ? (
        <Section style={infoBox}>
          {props.infoRows.map((row, i) => (
            <React.Fragment key={i}>
              {row.label}: <strong>{row.value}</strong>
              {i < props.infoRows!.length - 1 ? <br /> : null}
            </React.Fragment>
          ))}
        </Section>
      ) : null}

      {props.ctaUrl && props.ctaLabel ? (
        <Section style={ctaWrap}>
          <Button href={props.ctaUrl}>{props.ctaLabel}</Button>
        </Section>
      ) : null}

      {props.footerNote ? (
        <Section style={footerStyle}>{props.footerNote}</Section>
      ) : null}
    </Layout>
  );
}

export function renderNotificationText(props: NotificationData): string {
  const lines = [props.heading, ""];
  for (const p of props.paragraphs) {
    lines.push(p, "");
  }
  if (props.infoRows?.length) {
    for (const row of props.infoRows) lines.push(`${row.label}: ${row.value}`);
    lines.push("");
  }
  if (props.ctaUrl && props.ctaLabel) {
    lines.push(`${props.ctaLabel}: ${props.ctaUrl}`, "");
  }
  if (props.footerNote) lines.push(props.footerNote, "");
  lines.push("— Rothern");
  return lines.join("\n");
}
