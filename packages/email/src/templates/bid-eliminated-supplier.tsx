import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { BidEliminatedSupplierData } from "../types";
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

const reasonBox = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "12px",
  padding: "16px 18px",
  margin: "16px 0",
};

const reasonLabel = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  fontWeight: 700 as const,
  color: "#991b1b",
  margin: "0 0 6px 0",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
};

const reasonText = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  color: "#7f1d1d",
  margin: 0,
  whiteSpace: "pre-wrap" as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

export function makeBidEliminatedSupplierSubject(tenderTitle: string): string {
  return `🚫 Teklifiniz elendi: ${tenderTitle}`;
}

export function BidEliminatedSupplierEmail(props: BidEliminatedSupplierData) {
  return (
    <Layout
      preview={`${props.tenantName} firması "${props.tenderTitle}" ihalesindeki teklifinizi eledi.`}
    >
      <Heading>Teklifiniz elendi 🚫</Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firması,{" "}
        <strong style={{ color: COLORS.brand900 }}>{props.tenderTitle}</strong>{" "}
        ihalesindeki teklifinizi eledi.
      </Text>

      <Section style={reasonBox}>
        <Text style={reasonLabel}>Eleme Sebebi</Text>
        <Text style={reasonText}>{props.eliminationReason}</Text>
      </Section>

      {props.canResubmit ? (
        <>
          <Text style={paragraph}>
            <strong>İyi haber:</strong> Yeniden teklif verme hakkınız var.
            Eleme sebebini dikkate alarak yeni teklifinizi gönderebilirsiniz.
          </Text>
          <Section style={ctaWrap}>
            <Button href={props.submitNewBidUrl}>Yeniden Teklif Ver</Button>
          </Section>
        </>
      ) : (
        <>
          <Text style={paragraph}>
            Maalesef ihale teklif kabul süresi sona erdi, yeniden teklif
            veremezsiniz.
          </Text>
          <Section style={ctaWrap}>
            <Button href={props.tenderUrl}>İhaleyi Görüntüle</Button>
          </Section>
        </>
      )}
    </Layout>
  );
}

export function renderBidEliminatedSupplierText(
  props: BidEliminatedSupplierData,
): string {
  return [
    `Teklifiniz elendi: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firması "${props.tenderTitle}" ihalesindeki teklifinizi eledi.`,
    "",
    "Eleme Sebebi:",
    props.eliminationReason,
    "",
    props.canResubmit
      ? `Yeniden teklif verebilirsiniz: ${props.submitNewBidUrl}`
      : `İhale teklif kabul süresi sona erdi: ${props.tenderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
