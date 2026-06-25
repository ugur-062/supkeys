import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { AuctionClosingReminderData } from "../types";
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

const countdownStyle = {
  fontFamily: FONTS.display,
  fontSize: "20px",
  fontWeight: 800 as const,
  color: "#b45309",
  margin: "12px 0 0 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeAuctionClosingReminderSubject(
  tenderTitle: string,
  minutesLeft: number,
): string {
  return `⏰ ${minutesLeft} dk kaldı — ${tenderTitle}`;
}

export function AuctionClosingReminderEmail(
  props: AuctionClosingReminderData,
) {
  const isAuction = props.isAuction !== false;
  const noun = isAuction ? "açık eksiltme" : "ihale";
  return (
    <Layout
      preview={`${props.tenderTitle} ${noun}si yakında kapanıyor — teklifinizi gözden geçirin.`}
    >
      <Heading>
        {isAuction ? "Açık eksiltme" : "İhale"} yakında kapanıyor ⏰
      </Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firmasının {noun}sinin kapanışına yaklaştık.{" "}
        {isAuction
          ? "Son teklifinizi gözden geçirmek için zamanınız var."
          : "Henüz teklif vermediyseniz son teklifinizi göndermek için zamanınız var."}
      </Text>

      <Section style={summaryBox}>
        <Text style={tenderNumberStyle}>{props.tenderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Text style={countdownStyle}>~{props.minutesLeft} dakika kaldı</Text>
      </Section>

      <Text style={paragraph}>
        Kapanıştan sonra teklif kabul edilmez.{" "}
        {isAuction
          ? "Daha iyi bir teklif verebilecekseniz şimdi son şansınız."
          : "Teklif vermek istiyorsanız şimdi son şansınız."}
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>
          {isAuction ? "Eksiltmeye Git" : "İhaleye Git"}
        </Button>
      </Section>
    </Layout>
  );
}

export function renderAuctionClosingReminderText(
  props: AuctionClosingReminderData,
): string {
  const isAuction = props.isAuction !== false;
  const noun = isAuction ? "Açık eksiltme" : "İhale";
  return [
    `${noun} yakında kapanıyor: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firmasının ${noun.toLowerCase()}sinin kapanışına yaklaşık ${props.minutesLeft} dakika kaldı.`,
    "",
    `İhale No : ${props.tenderNumber}`,
    `Başlık   : ${props.tenderTitle}`,
    `Kapanış  : ${props.closesAt}`,
    "",
    `${isAuction ? "Eksiltmeye" : "İhaleye"} git: ${props.tenderUrl}`,
    "",
    "© 2026 Rothern",
  ].join("\n");
}
