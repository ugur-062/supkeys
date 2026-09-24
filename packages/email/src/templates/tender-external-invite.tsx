import { Text } from "@react-email/components";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { TenderExternalInviteData } from "../types";
import { Button } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { COLORS, FONTS } from "./_components/tokens";

/**
 * Faz C — dış tedarikçi daveti ("X sizi 'Y' satın alma talebine davet etti").
 * Tek seferlik davet formatı: pazarlama dili yok, yalnız talep başlığı +
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

/** Cümle içinde kalın yazılan parça — çeviride sözcük sırası değişse de yerini korur. */
const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

export function makeTenderExternalInviteSubject(
  props: TenderExternalInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return emailT(locale)("email.tenderExternalInvite.subject", {
    inviterName: props.inviterName,
    tenderTitle: props.tenderTitle,
  });
}

export function TenderExternalInviteEmail(
  props: TenderExternalInviteData & { locale?: Locale },
) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const t = emailT(locale);

  return (
    <Layout
      preview={t("email.tenderExternalInvite.preview", {
        inviterName: props.inviterName,
        tenderTitle: props.tenderTitle,
      })}
      locale={locale}
    >
      <Heading>{t("email.tenderExternalInvite.heading")}</Heading>

      <Text style={paragraph}>{t("email.tenderExternalInvite.greeting")}</Text>

      <Text style={paragraph}>
        {t.rich("email.tenderExternalInvite.intro", {
          inviterName: props.inviterName,
          b: bold,
        })}
      </Text>

      <Text style={infoBox}>
        <strong>{props.tenderTitle}</strong>
        <br />
        {t("email.tenderExternalInvite.categoryLine", {
          categories: props.categories,
        })}
        {props.closesAt ? (
          <>
            <br />
            {t("email.tenderExternalInvite.closesAtLine", {
              closesAt: props.closesAt,
            })}
          </>
        ) : null}
      </Text>

      <Text style={paragraph}>
        {t("email.tenderExternalInvite.howTo", {
          inviterName: props.inviterName,
        })}
      </Text>

      <div style={ctaWrap}>
        <Button href={props.registerUrl}>
          {t("email.tenderExternalInvite.cta")}
        </Button>
      </div>

      <Text style={footnote}>
        {t.rich("email.tenderExternalInvite.footnote", {
          inviterName: props.inviterName,
          optout: (chunks: React.ReactNode) => (
            <a href={props.optOutUrl} style={{ color: COLORS.slate500 }}>
              {chunks}
            </a>
          ),
        })}
      </Text>
    </Layout>
  );
}

export function renderTenderExternalInviteText(
  props: TenderExternalInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  return [
    t("email.tenderExternalInvite.textIntro", {
      inviterName: props.inviterName,
      tenderTitle: props.tenderTitle,
    }),
    t("email.tenderExternalInvite.categoryLine", {
      categories: props.categories,
    }),
    ...(props.closesAt
      ? [
          t("email.tenderExternalInvite.closesAtLine", {
            closesAt: props.closesAt,
          }),
        ]
      : []),
    "",
    t("email.tenderExternalInvite.textCta", { url: props.registerUrl }),
    "",
    t("email.tenderExternalInvite.textOptOut", { url: props.optOutUrl }),
  ].join("\n");
}
