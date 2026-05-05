import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { AwardCompletedBuyerData } from "../types";
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
  background: "#f0f9ff",
  border: "1px solid #bae6fd",
  borderRadius: "12px",
  padding: "20px",
  margin: "16px 0",
};

const cellTable = {
  display: "table" as const,
  width: "100%",
};

const cell = {
  display: "table-cell" as const,
  paddingRight: "16px",
  verticalAlign: "top" as const,
};

const cellLabel = {
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: "#0369a1",
  margin: 0,
};

const cellValue = {
  fontFamily: FONTS.display,
  fontSize: "20px",
  fontWeight: 700 as const,
  color: "#0c4a6e",
  margin: "4px 0 0 0",
};

const cellValueSuccess = {
  ...cellValue,
  color: "#16a34a",
};

const cellValueMuted = {
  ...cellValue,
  color: COLORS.slate600,
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${amount.toLocaleString("tr-TR")}`;
  }
}

export function makeAwardCompletedBuyerSubject(tenderTitle: string): string {
  return `🎉 İhaleniz tamamlandı: ${tenderTitle}`;
}

export function AwardCompletedBuyerEmail(props: AwardCompletedBuyerData) {
  return (
    <Layout
      preview={`İhaleniz "${props.tenderTitle}" sonuçlandı, ${props.totalOrders} sipariş oluşturuldu.`}
    >
      <Heading>İhaleniz başarıyla sonuçlandı 🎉</Heading>

      <Text style={paragraph}>Merhaba {props.buyerFirstName},</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.tenderTitle}</strong>{" "}
        ihalenizin kazandırma sürecini başarıyla tamamladınız.
      </Text>

      <Section style={summaryBox}>
        <div style={cellTable}>
          <div style={cell}>
            <Text style={cellLabel}>Toplam Sipariş</Text>
            <Text style={cellValue}>{props.totalOrders}</Text>
          </div>
          <div style={cell}>
            <Text style={cellLabel}>Toplam Harcama</Text>
            <Text style={cellValue}>
              {formatTotal(props.totalSpend, props.currency)}
            </Text>
          </div>
        </div>
        <div style={{ ...cellTable, marginTop: "16px" }}>
          <div style={cell}>
            <Text style={cellLabel}>Kazanan Tedarikçi</Text>
            <Text style={cellValueSuccess}>{props.winnerCount}</Text>
          </div>
          <div style={cell}>
            <Text style={cellLabel}>Kaybeden Tedarikçi</Text>
            <Text style={cellValueMuted}>{props.loserCount}</Text>
          </div>
        </div>
      </Section>

      <Text style={paragraph}>
        Siparişler oluşturuldu, kazanan tedarikçilere bildirim gönderildi.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.tenderUrl}>İhaleyi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderAwardCompletedBuyerText(
  props: AwardCompletedBuyerData,
): string {
  return [
    `🎉 İhaleniz tamamlandı: ${props.tenderTitle}`,
    "",
    `Merhaba ${props.buyerFirstName},`,
    "",
    `"${props.tenderTitle}" ihalenizin kazandırma sürecini başarıyla tamamladınız.`,
    "",
    `İhale No        : ${props.tenderNumber}`,
    `Toplam Sipariş  : ${props.totalOrders}`,
    `Toplam Harcama  : ${formatTotal(props.totalSpend, props.currency)}`,
    `Kazanan Tedarikçi: ${props.winnerCount}`,
    `Kaybeden Tedarikçi: ${props.loserCount}`,
    "",
    `İhaleyi görüntüle: ${props.tenderUrl}`,
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
