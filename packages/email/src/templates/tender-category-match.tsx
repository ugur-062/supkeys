import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { TenderCategoryMatchEmailData } from "../types";
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
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
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

export function makeTenderCategoryMatchSubject(tenderTitle: string): string {
  return `✨ Kategorinize uygun yeni ihale: ${tenderTitle}`;
}

export function TenderCategoryMatchEmail(props: TenderCategoryMatchEmailData) {
  return (
    <Layout
      preview={`Faaliyet kategorilerinize uygun yeni ihale: ${props.tenderTitle}`}
    >
      <Heading>Kategorinize uygun yeni ihale ✨</Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firması, faaliyet kategorilerinizle eşleşen yeni bir herkese açık ihale
        yayınladı. Davet edilmediniz; ancak ilginizi çekebileceği için size
        bildiriyoruz — dilerseniz teklif verebilirsiniz.
      </Text>

      <Section style={summaryBox}>
        <Text style={tenderNumberStyle}>{props.tenderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        {props.matchedCategoryNames.length > 0 ? (
          <Text style={factRow}>
            <span style={factLabel}>Eşleşen</span>
            {props.matchedCategoryNames.slice(0, 3).join(", ")}
            {props.matchedCategoryNames.length > 3
              ? ` +${props.matchedCategoryNames.length - 3}`
              : ""}
          </Text>
        ) : null}
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
        Bu öneriyi, onboarding'de seçtiğiniz faaliyet kategorileri ihaledeki
        kategorilerle eşleştiği için aldınız. Bu tür bildirimleri tedarikçi
        panelinizdeki Ayarlar → Bildirimler bölümünden kapatabilirsiniz.
      </Text>
    </Layout>
  );
}

export function renderTenderCategoryMatchText(
  props: TenderCategoryMatchEmailData,
): string {
  const lines = [
    `Kategorinize uygun yeni ihale: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firması faaliyet kategorilerinizle eşleşen yeni bir herkese açık ihale yayınladı.`,
    "",
    `İhale No : ${props.tenderNumber}`,
    `Başlık   : ${props.tenderTitle}`,
  ];
  if (props.matchedCategoryNames.length > 0) {
    lines.push(`Eşleşen  : ${props.matchedCategoryNames.join(", ")}`);
  }
  lines.push(
    `Kalem    : ${props.itemCount}`,
    `Kapanış  : ${props.bidsCloseAtFormatted}`,
    "",
    `İhaleyi incele: ${props.tenderUrl}`,
    "",
    "Bu bildirimleri Ayarlar → Bildirimler'den kapatabilirsiniz.",
    "",
    "© 2026 Rothern",
  );
  return lines.join("\n");
}
