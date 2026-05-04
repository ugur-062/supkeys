import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { TenderClosedBuyerData } from "../types";
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
  margin: "0 0 12px 0",
};

const statRow = {
  display: "table" as const,
  width: "100%",
  marginTop: "8px",
};

const statCell = {
  display: "table-cell" as const,
  paddingRight: "20px",
};

const statLabel = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  margin: 0,
};

const statValue = {
  fontFamily: FONTS.display,
  fontSize: "20px",
  fontWeight: 700 as const,
  color: COLORS.brand900,
  margin: "4px 0 0 0",
};

const statValueSuccess = {
  ...statValue,
  color: "#16a34a",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeTenderClosedBuyerSubject(tenderTitle: string): string {
  return `🎯 İhaleniz kapandı, kazandırma zamanı: ${tenderTitle}`;
}

export function TenderClosedBuyerEmail(props: TenderClosedBuyerData) {
  return (
    <Layout
      preview={`İhaleniz değerlendirme aşamasında — ${props.bidCount} teklif geldi.`}
    >
      <Heading>İhaleniz değerlendirme aşamasında 🎯</Heading>

      <Text style={paragraph}>Merhaba {props.buyerFirstName},</Text>

      <Text style={paragraph}>
        İhalenizin teklif kabul süresi sona erdi. Şimdi gelen teklifleri
        inceleyerek kazandırma yapma zamanı.
      </Text>

      <Section style={summaryBox}>
        <Text style={tenderNumberStyle}>{props.tenderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Section style={statRow}>
          <div style={statCell}>
            <Text style={statLabel}>Davet Edilen</Text>
            <Text style={statValue}>{props.invitedCount}</Text>
          </div>
          <div style={statCell}>
            <Text style={statLabel}>Teklif Alınan</Text>
            <Text style={statValueSuccess}>{props.bidCount}</Text>
          </div>
        </Section>
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>Teklifleri İncele</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        İhale durumu artık &ldquo;Kazandırma Aşamasında&rdquo;. Tedarikçileri
        kazandırma kararı verdiğinizde otomatik bilgilendirilir.
      </Text>
    </Layout>
  );
}

export function renderTenderClosedBuyerText(
  props: TenderClosedBuyerData,
): string {
  return [
    `İhaleniz değerlendirme aşamasında: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.buyerFirstName},`,
    "",
    "İhalenizin teklif kabul süresi sona erdi. Şimdi gelen teklifleri inceleyerek kazandırma yapma zamanı.",
    "",
    `İhale No      : ${props.tenderNumber}`,
    `Başlık        : ${props.tenderTitle}`,
    `Davet Edilen  : ${props.invitedCount}`,
    `Teklif Alınan : ${props.bidCount}`,
    "",
    `Teklifleri incele: ${props.tenderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
