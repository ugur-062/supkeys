import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { MessageNotificationData } from "../types";
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

const previewBox = {
  background: "#f8fafc",
  borderLeft: "3px solid #3B6BFF",
  padding: "12px 16px",
  margin: "16px 0",
  borderRadius: "0 8px 8px 0",
};

const previewText = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "1.5",
  color: COLORS.slate700,
  fontStyle: "italic" as const,
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

const metaText = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  margin: "0 0 4px 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0",
};

const helperText = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: COLORS.slate500,
  fontStyle: "italic" as const,
  margin: "16px 0 0 0",
};

export function makeMessageNotificationSubject(
  contextLabel: string,
  senderCompanyName: string,
): string {
  return `💬 ${senderCompanyName} mesaj gönderdi · ${contextLabel}`;
}

export function MessageNotificationEmail(props: MessageNotificationData) {
  return (
    <Layout
      preview={`${props.senderCompanyName} size yeni bir mesaj gönderdi: ${props.contextLabel}`}
    >
      <Heading>Yeni mesajınız var</Heading>
      <Text style={paragraph}>Merhaba {props.recipientName},</Text>
      <Text style={paragraph}>
        <strong>{props.contextLabel}</strong> bağlamında{" "}
        <strong>{props.senderCompanyName}</strong> firmasından{" "}
        <strong>{props.senderPersonName}</strong> size yeni bir mesaj gönderdi:
      </Text>

      <Section style={previewBox}>
        <Text style={metaText}>{props.senderPersonName} yazdı:</Text>
        <Text style={previewText}>
          {props.messagePreview}
          {props.isTruncated ? "…" : ""}
        </Text>
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.ctaUrl}>Mesajı Görüntüle ve Yanıtla</Button>
      </Section>

      <Text style={helperText}>
        Bu bildirim, mesaj gönderildikten sonra 5 dakika içinde okunmadığı
        için otomatik gönderildi.
      </Text>
    </Layout>
  );
}

export function renderMessageNotificationText(
  props: MessageNotificationData,
): string {
  return [
    `Yeni mesaj: ${props.contextLabel}`,
    "",
    `Merhaba ${props.recipientName},`,
    "",
    `${props.senderCompanyName} firmasından ${props.senderPersonName} size yeni bir mesaj gönderdi.`,
    "",
    `--- Mesaj ---`,
    props.messagePreview + (props.isTruncated ? "…" : ""),
    `--- Mesaj sonu ---`,
    "",
    `Mesajı görüntüle: ${props.ctaUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
