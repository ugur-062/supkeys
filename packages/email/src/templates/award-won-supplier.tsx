import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { AwardWonSupplierData } from "../types";
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
  background: "#ecfdf5",
  border: "1px solid #bbf7d0",
  borderRadius: "12px",
  padding: "20px",
  margin: "16px 0",
};

const orderNumberStyle = {
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  fontSize: "12px",
  color: "#16a34a",
  margin: "0 0 4px 0",
  textTransform: "uppercase" as const,
};

const titleStyle = {
  fontFamily: FONTS.display,
  fontSize: "16px",
  fontWeight: 700 as const,
  color: "#14532d",
  margin: "0 0 12px 0",
};

const totalLabel = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: "#15803d",
  margin: 0,
};

const totalValue = {
  fontFamily: FONTS.display,
  fontSize: "24px",
  fontWeight: 700 as const,
  color: "#14532d",
  margin: "4px 0 0 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

function formatTotal(amount: number, currency: string): string {
  try {
    return amount.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${amount.toLocaleString("tr-TR")}`;
  }
}

export function makeAwardWonSupplierSubject(tenderTitle: string): string {
  return `🏆 Tebrikler! İhaleyi kazandınız: ${tenderTitle}`;
}

export function AwardWonSupplierEmail(props: AwardWonSupplierData) {
  const winLine = props.isFullWin
    ? "tüm kalemleri kazandınız!"
    : `${props.winningItemsCount}/${props.totalItemsCount} kalemi kazandınız.`;

  return (
    <Layout
      preview={`Tebrikler! ${props.tenantName} ihalesini kazandınız.`}
    >
      <Heading>Tebrikler! 🏆 İhaleyi kazandınız</Heading>

      <Text style={paragraph}>Merhaba {props.supplierUserName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenantName}</strong>{" "}
        firmasının açtığı{" "}
        <strong style={{ color: COLORS.brand900 }}>{props.tenderTitle}</strong>{" "}
        ihalesinde {winLine}
      </Text>

      <Section style={summaryBox}>
        <Text style={orderNumberStyle}>{props.orderNumber}</Text>
        <Text style={titleStyle}>{props.tenderTitle}</Text>
        <div style={{ marginTop: "12px" }}>
          <Text style={totalLabel}>Toplam Sipariş Tutarı</Text>
          <Text style={totalValue}>
            {formatTotal(props.totalAmount, props.currency)}
          </Text>
        </div>
      </Section>

      <Text style={paragraph}>
        Sipariş detaylarını sipariş sayfasından inceleyebilirsiniz.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.orderUrl}>Siparişi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderAwardWonSupplierText(
  props: AwardWonSupplierData,
): string {
  const winLine = props.isFullWin
    ? "tüm kalemleri kazandınız"
    : `${props.winningItemsCount}/${props.totalItemsCount} kalemi kazandınız`;
  return [
    `🏆 Tebrikler! İhaleyi kazandınız: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.supplierUserName},`,
    "",
    `${props.tenantName} firmasının açtığı "${props.tenderTitle}" ihalesinde ${winLine}.`,
    "",
    `Sipariş No   : ${props.orderNumber}`,
    `Toplam Tutar : ${formatTotal(props.totalAmount, props.currency)}`,
    "",
    `Siparişi görüntüle: ${props.orderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
