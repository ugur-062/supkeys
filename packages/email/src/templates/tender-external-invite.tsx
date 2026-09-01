import { Text } from "@react-email/components";
import * as React from "react";
import type { TenderExternalInviteData } from "../types";
import { Button } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { COLORS, FONTS } from "./_components/tokens";

/**
 * Faz C — dış tedarikçi daveti ("X sizi 'Y' satın alma talebine davet etti").
 * Tek seferlik davet formatı: pazarlama dili yok, yalnız ihale başlığı +
 * kategori + kapanış (kapalı zarf: tutar/teklif bilgisi ASLA). Alt bilgide
 * kim-neden-gönderdi açıklaması + tek tık opt-out (İYS/ETK hijyeni).
 */

const paragraph = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 16px 0",
};

const infoBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "10px",
  padding: "14px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

const ctaWrap = { textAlign: "center" as const, margin: "24px 0 8px 0" };

const footnote = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

export function makeTenderExternalInviteSubject(
  props: TenderExternalInviteData,
): string {
  return `📋 ${props.inviterName} sizi "${props.tenderTitle}" satın alma talebine davet etti`;
}

export function TenderExternalInviteEmail(props: TenderExternalInviteData) {
  return (
    <Layout
      preview={`${props.inviterName}, "${props.tenderTitle}" satın alma talebi için sizden teklif almak istiyor.`}
    >
      <Heading>Bir satın alma talebine davet edildiniz 📋</Heading>

      <Text style={paragraph}>Merhaba,</Text>

      <Text style={paragraph}>
        <strong>{props.inviterName}</strong>, Rothern B2B tedarik platformunda
        açtığı ihale için sizden teklif almak istiyor:
      </Text>

      <Text style={infoBox}>
        <strong>{props.tenderTitle}</strong>
        <br />
        Kategori: {props.categories}
        {props.closesAt ? (
          <>
            <br />
            Son teklif tarihi: {props.closesAt}
          </>
        ) : null}
      </Text>

      <Text style={paragraph}>
        Teklif verebilmek için ücretsiz firma hesabı oluşturmanız yeterli —
        kayıt tamamlandığında bu ihaleye otomatik davet edilirsiniz ve{" "}
        {props.inviterName} ile bağlantınız kurulur.
      </Text>

      <div style={ctaWrap}>
        <Button href={props.registerUrl}>Kaydol ve Teklif Ver</Button>
      </div>

      <Text style={footnote}>
        Bu e-posta, {props.inviterName} firmasının Rothern üzerinden gönderdiği
        tek seferlik bir ihale davetidir; bir pazarlama listesine eklenmediniz.
        Bu tür davetleri almak istemiyorsanız{" "}
        <a href={props.optOutUrl} style={{ color: COLORS.slate500 }}>
          buradan tek tıkla kapatabilirsiniz
        </a>
        .
      </Text>
    </Layout>
  );
}

export function renderTenderExternalInviteText(
  props: TenderExternalInviteData,
): string {
  return [
    `${props.inviterName} sizi Rothern'de "${props.tenderTitle}" satın alma talebine davet etti.`,
    `Kategori: ${props.categories}`,
    ...(props.closesAt ? [`Son teklif tarihi: ${props.closesAt}`] : []),
    "",
    `Kaydol ve teklif ver: ${props.registerUrl}`,
    "",
    `Bu tür davetleri kapatmak için: ${props.optOutUrl}`,
  ].join("\n");
}
