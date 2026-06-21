import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { OrderStatusChangedData, OrderStatusChange } from "../types";
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

interface StatusContent {
  emoji: string;
  bg: string;
  border: string;
  textColor: string;
  /** Tedarikçiye giderken (alıcı yaptı) */
  headingForSupplier: string;
  /** Alıcıya giderken (tedarikçi yaptı) */
  headingForBuyer: string;
  /** Body paragrafı — supplier alıcısı */
  bodyForSupplier: string;
  /** Body paragrafı — buyer alıcısı */
  bodyForBuyer: string;
}

const STATUS_CONTENT: Record<OrderStatusChange, StatusContent> = {
  ACCEPTED: {
    emoji: "👍",
    bg: "#eff6ff",
    border: "#bfdbfe",
    textColor: "#1e3a8a",
    headingForSupplier: "Siparişi onayladınız",
    headingForBuyer: "Tedarikçi siparişi onayladı",
    bodyForSupplier:
      "Sipariş onayınız ve teslim tarihi bilgileriniz alıcıya iletildi.",
    bodyForBuyer:
      "Tedarikçi siparişi onayladı; tahmini teslim tarihi ve ödeme bilgileri panele eklendi.",
  },
  REJECTED: {
    emoji: "🚫",
    bg: "#fff7ed",
    border: "#fed7aa",
    textColor: "#7c2d12",
    headingForSupplier: "Siparişi reddettiniz",
    headingForBuyer: "Tedarikçi siparişi reddetti",
    bodyForSupplier:
      "Sipariş reddiniz alıcıya iletildi. Gerekirse alıcıyla iletişime geçebilirsiniz.",
    bodyForBuyer:
      "Tedarikçi siparişi reddetti. Detayları aşağıdaki sebepte bulabilirsiniz.",
  },
  IN_DELIVERY: {
    emoji: "🚚",
    bg: "#eff6ff",
    border: "#bfdbfe",
    textColor: "#1e3a8a",
    headingForSupplier: "Sipariş için teslimat başlatıldı",
    headingForBuyer: "Siparişiniz teslimat sürecinde",
    bodyForSupplier:
      "Tedarikçi olarak siparişin teslimatını başlattığınız panelde işaretlendi.",
    bodyForBuyer:
      "Tedarikçi siparişin teslimatını başlattı. Teslimat süreci ilerledikçe size bildirilecek.",
  },
  DELIVERED: {
    emoji: "📦",
    bg: "#fffbeb",
    border: "#fde68a",
    textColor: "#78350f",
    headingForSupplier: "Sipariş teslim alındı — ödeme bekleniyor",
    headingForBuyer: "Siparişi teslim aldınız — ödeme adımı",
    bodyForSupplier:
      "Alıcı siparişi teslim aldı. Alıcı ödemeyi gönderdiğinde size iletilecek; ödemeyi aldığınızda panelden onaylayın, sipariş otomatik tamamlanır.",
    bodyForBuyer:
      "Siparişi teslim aldığınızı onayladınız. Ödeme bilgilerini panelden girip dekontunuzu ekleyebilirsiniz.",
  },
  COMPLETED: {
    emoji: "✅",
    bg: "#ecfdf5",
    border: "#bbf7d0",
    textColor: "#14532d",
    headingForSupplier: "Sipariş alıcı tarafından teslim alındı",
    headingForBuyer: "Sipariş tamamlandı",
    bodyForSupplier:
      "Alıcı siparişi teslim aldığını onayladı. İşbirliğiniz için teşekkür ederiz.",
    bodyForBuyer:
      "Sipariş başarıyla tamamlandı. Tedarikçinize geri bildirim verebilirsiniz.",
  },
  CANCELLED: {
    emoji: "❌",
    bg: "#fef2f2",
    border: "#fecaca",
    textColor: "#7f1d1d",
    headingForSupplier: "Sipariş iptal edildi",
    headingForBuyer: "Sipariş iptal edildi",
    bodyForSupplier:
      "Alıcı bu siparişi iptal etti. Detaylar aşağıdaki nottadır.",
    bodyForBuyer:
      "Sipariş başarıyla iptal edildi.",
  },
};

const summaryBox = (status: OrderStatusChange) => ({
  background: STATUS_CONTENT[status].bg,
  border: `1px solid ${STATUS_CONTENT[status].border}`,
  borderRadius: "12px",
  padding: "16px",
  margin: "16px 0",
});

const labelStyle = (status: OrderStatusChange) => ({
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: STATUS_CONTENT[status].textColor,
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
  fontWeight: 700 as const,
  margin: 0,
});

const titleStyle = (status: OrderStatusChange) => ({
  fontFamily: FONTS.display,
  fontSize: "16px",
  color: STATUS_CONTENT[status].textColor,
  margin: "8px 0 4px 0",
  fontWeight: 700 as const,
});

const metaStyle = (status: OrderStatusChange) => ({
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: STATUS_CONTENT[status].textColor,
  margin: "4px 0 0 0",
});

const noteBox = {
  background: COLORS.surfaceSubtle,
  borderLeft: `3px solid ${COLORS.slate500}`,
  padding: "12px 16px",
  margin: "16px 0",
};

const noteLabel = {
  fontFamily: FONTS.sans,
  fontSize: "11px",
  color: COLORS.slate500,
  textTransform: "uppercase" as const,
  fontWeight: 700 as const,
  margin: 0,
  letterSpacing: "0.5px",
};

const noteText = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  color: COLORS.slate700,
  margin: "4px 0 0 0",
  whiteSpace: "pre-wrap" as const,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "20px 0 8px 0",
};

function formatExpectedDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export function makeOrderStatusChangedSubject(
  newStatus: OrderStatusChange,
  tenderTitle: string,
): string {
  const c = STATUS_CONTENT[newStatus];
  const verb =
    newStatus === "ACCEPTED"
      ? "Sipariş onaylandı"
      : newStatus === "REJECTED"
        ? "Sipariş reddedildi"
        : newStatus === "IN_DELIVERY"
          ? "Sipariş teslimat sürecinde"
          : newStatus === "DELIVERED"
            ? "Sipariş teslim alındı — ödeme bekleniyor"
            : newStatus === "COMPLETED"
              ? "Sipariş tamamlandı"
              : "Sipariş iptal edildi";
  return `${c.emoji} ${verb}: ${tenderTitle}`;
}

export function OrderStatusChangedEmail(props: OrderStatusChangedData) {
  const c = STATUS_CONTENT[props.newStatus];
  const heading =
    props.recipient === "supplier" ? c.headingForSupplier : c.headingForBuyer;
  const body =
    props.recipient === "supplier" ? c.bodyForSupplier : c.bodyForBuyer;
  const expectedFmt = formatExpectedDate(props.expectedDeliveryDate);

  const noteLabelText =
    props.newStatus === "CANCELLED"
      ? "İptal Sebebi"
      : props.newStatus === "REJECTED"
        ? "Red Sebebi"
        : props.newStatus === "ACCEPTED"
          ? "Tedarikçi Notu"
          : props.newStatus === "IN_DELIVERY"
            ? "Tedarikçi Notu"
            : "Alıcı Notu";

  const showExpected =
    (props.newStatus === "ACCEPTED" || props.newStatus === "IN_DELIVERY") &&
    !!expectedFmt;

  return (
    <Layout preview={`${heading} — ${props.tenderTitle}`}>
      <Heading>
        {c.emoji} {heading}
      </Heading>

      <Text style={paragraph}>Merhaba {props.recipientName},</Text>

      <Text style={paragraph}>{body}</Text>

      <Section style={summaryBox(props.newStatus)}>
        <Text style={labelStyle(props.newStatus)}>{props.orderNumber}</Text>
        <Text style={titleStyle(props.newStatus)}>{props.tenderTitle}</Text>
        <Text style={metaStyle(props.newStatus)}>{props.tenderNumber}</Text>
      </Section>

      {props.note ? (
        <Section style={noteBox}>
          <Text style={noteLabel}>{noteLabelText}</Text>
          <Text style={noteText}>{props.note}</Text>
        </Section>
      ) : null}

      {showExpected ? (
        <Text style={paragraph}>
          <strong>Tahmini Teslim Tarihi:</strong> {expectedFmt}
        </Text>
      ) : null}

      <Section style={ctaWrap}>
        <Button href={props.orderUrl}>Siparişi Görüntüle</Button>
      </Section>
    </Layout>
  );
}

export function renderOrderStatusChangedText(
  props: OrderStatusChangedData,
): string {
  const c = STATUS_CONTENT[props.newStatus];
  const heading =
    props.recipient === "supplier" ? c.headingForSupplier : c.headingForBuyer;
  const expectedFmt = formatExpectedDate(props.expectedDeliveryDate);
  const noteLabelText =
    props.newStatus === "CANCELLED"
      ? "İptal Sebebi"
      : props.newStatus === "REJECTED"
        ? "Red Sebebi"
        : props.newStatus === "ACCEPTED"
          ? "Tedarikçi Notu"
          : props.newStatus === "IN_DELIVERY"
            ? "Tedarikçi Notu"
            : "Alıcı Notu";

  const lines = [
    `${c.emoji} ${heading}`,
    "",
    `Merhaba ${props.recipientName},`,
    "",
    `Sipariş No : ${props.orderNumber}`,
    `İhale      : ${props.tenderNumber} — ${props.tenderTitle}`,
    `Statü      : ${props.oldStatus} → ${props.newStatus}`,
  ];
  if (props.note) {
    lines.push("", `${noteLabelText}:`, props.note);
  }
  if (
    (props.newStatus === "ACCEPTED" || props.newStatus === "IN_DELIVERY") &&
    expectedFmt
  ) {
    lines.push("", `Tahmini Teslim Tarihi: ${expectedFmt}`);
  }
  lines.push(
    "",
    `Siparişi görüntüle: ${props.orderUrl}`,
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
