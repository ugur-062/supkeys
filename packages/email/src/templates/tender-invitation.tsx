import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { TenderInvitationEmailData } from "../types";
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
  fontSize: "18px",
  fontWeight: 700 as const,
  color: COLORS.brand900,
  margin: "0 0 12px 0",
};

const factRow = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  margin: "4px 0",
};

const factLabel = {
  display: "inline-block",
  minWidth: "100px",
  color: COLORS.slate500,
  fontWeight: 500 as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeTenderInvitationSubject(tenderTitle: string): string {
  return `🎯 Yeni İhale Daveti: ${tenderTitle}`;
}

export function TenderInvitationEmail(props: TenderInvitationEmailData) {
  return (
    <Layout
      preview={`${props.tenantName} sizi yeni bir ihaleye davet etti: ${props.tenderTitle}`}
    >
      <Heading>Yeni ihale daveti 🎯</Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firması sizi yeni bir ihaleye davet etti. Aşağıdaki bilgileri inceleyip
        teklifinizi göndermek için tedarikçi panelinize giriş yapabilirsiniz.
      </Text>

      <Section style={summaryBox}>
        <Text style={tenderNumberStyle}>{props.tenderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <Text style={factRow}>
          <span style={factLabel}>Kalem sayısı</span>
          {props.itemCount} kalem
        </Text>
        <Text style={factRow}>
          <span style={factLabel}>Kapanış</span>
          <strong style={{ color: COLORS.slate900 }}>
            {props.bidsCloseAtFormatted}
          </strong>
        </Text>
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>İhaleyi İncele</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Tedarikçi hesabınızla giriş yapın, kalemleri inceleyin ve kapanış
        tarihinden önce teklifinizi gönderin. İhalede teklif verdiğiniz
        kalemlerin detayı ve son durumu panelinizde görüntülenir.
      </Text>
    </Layout>
  );
}

export function renderTenderInvitationText(
  props: TenderInvitationEmailData,
): string {
  const lines = [
    `Yeni ihale daveti: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firması sizi yeni bir ihaleye davet etti.`,
    "",
    `İhale No : ${props.tenderNumber}`,
    `Başlık   : ${props.tenderTitle}`,
    `Kalem    : ${props.itemCount}`,
    `Kapanış  : ${props.bidsCloseAtFormatted}`,
    "",
    `İhaleyi incele: ${props.tenderUrl}`,
    "",
    "Tedarikçi hesabınızla giriş yaparak teklif gönderebilirsiniz.",
    "",
    "© 2026 Supkeys",
  ];
  return lines.join("\n");
}
