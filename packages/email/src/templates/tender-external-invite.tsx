import { Text } from "@react-email/components";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type EmailMessageKey, type EmailTranslator, type Locale } from "../i18n";
import type { TenderExternalInviteData, TenderExternalInviteItem } from "../types";
import { Button } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { COLORS, FONTS } from "./_components/tokens";

/**
 * Faz C — dış tedarikçi daveti ("X sizi 'Y' satın alma talebine davet etti").
 *
 * 2026-09-27 (kullanıcı: "kalemler hakkında bilgi verilmeli ki şirkete cazip
 * gelsin ve kayıt olmak istesin"): talep başlığı + numara, ilk kalemler
 * ("ad — miktar birim", birim ve sayı biçimi ALICININ dilinde), toplam kalem
 * sayısı, teslim yeri (yalnız şehir + ülke), son teklif tarihi, kategori(ler),
 * aranan tedarikçi tipi, kapalı zarf ve ücretsiz teklif cümleleri, vitrindeki
 * talebin herkese açık sayfası. Kapalı zarf/anonimlik: hedef fiyat, marka,
 * şartname, belge, ticari şart ve tam adres yükte YOK (bkz. types.ts).
 * Konu satırında emoji YOK — soğuk davette spam puanını yükseltiyordu.
 * Alt bilgide kim-neden-gönderdi açıklaması + tek tık opt-out (İYS/ETK).
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

const itemsBox = {
  ...paragraph,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "10px",
  padding: "14px 16px",
  fontSize: "13px",
  margin: "0 0 16px 0",
};

const itemList = {
  margin: "6px 0 0 0",
  paddingLeft: "18px",
};

const pitch = {
  ...paragraph,
  fontSize: "13px",
  color: COLORS.slate700,
};

const ctaWrap = { textAlign: "center" as const, margin: "24px 0 8px 0" };

const secondaryLink = {
  ...paragraph,
  fontSize: "13px",
  textAlign: "center" as const,
  margin: "8px 0 0 0",
};

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

/**
 * "1.200 m" / "1,200 pieces" / "1 200 рулонов" — sayı ve birim TEK ICU
 * mesajında (çoğul uyumu dile göre). Katalogda olmayan birim (serbest metin)
 * olduğu gibi yazılır.
 */
export function formatInviteQuantity(t: EmailTranslator, item: TenderExternalInviteItem): string {
  const n = Number.isFinite(item.quantity) ? item.quantity : 0;
  const key = `email.domain.qty.${item.unitCode ?? ""}` as EmailMessageKey;
  if (item.unitCode && t.has(key)) return t(key, { n });
  return t("email.domain.qty.other", { n, unit: item.unit });
}

/** Faaliyet kodu → alıcının dilinde etiket; bilinmeyen kod düşer. */
function supplierTypeLabels(t: EmailTranslator, codes: readonly string[] | undefined): string[] {
  return (codes ?? [])
    .map((c) => `email.domain.activity.${c}` as EmailMessageKey)
    .filter((k) => t.has(k))
    .map((k) => t(k));
}

/** HTML ve düz metin sürümünün ORTAK bilgi satırları (ikisi ayrışmasın). */
function infoLines(t: EmailTranslator, props: TenderExternalInviteData): string[] {
  const types = supplierTypeLabels(t, props.supplierTypes);
  return [
    ...(props.tenderNumber ? [t("email.tenderExternalInvite.numberLine", { number: props.tenderNumber })] : []),
    ...(props.categories.length > 0
      ? [
          t("email.tenderExternalInvite.categoryLine", {
            count: props.categories.length,
            categories: props.categories.join(", "),
          }),
        ]
      : []),
    ...(props.deliveryPlace ? [t("email.tenderExternalInvite.deliveryLine", { place: props.deliveryPlace })] : []),
    ...(props.closesAt ? [t("email.tenderExternalInvite.closesAtLine", { closesAt: props.closesAt })] : []),
    ...(types.length > 0 ? [t("email.tenderExternalInvite.supplierTypeLine", { types: types.join(", ") })] : []),
  ];
}

function itemLines(t: EmailTranslator, props: TenderExternalInviteData): { lines: string[]; total: number; more: number } {
  const items = props.items ?? [];
  const total = Math.max(props.itemCount ?? items.length, items.length);
  return {
    lines: items.map((i) =>
      t("email.tenderExternalInvite.itemLine", { name: i.name, qty: formatInviteQuantity(t, i) }),
    ),
    total,
    more: total - items.length,
  };
}

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
  const info = infoLines(t, props);
  const items = itemLines(t, props);

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
        {info.map((line) => (
          <React.Fragment key={line}>
            <br />
            {line}
          </React.Fragment>
        ))}
      </Text>

      {items.lines.length > 0 ? (
        <div style={itemsBox}>
          <strong>{t("email.tenderExternalInvite.itemsTitle", { count: items.total })}</strong>
          <ul style={itemList}>
            {items.lines.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
          {items.more > 0 ? (
            <span style={{ color: COLORS.slate500 }}>
              {t("email.tenderExternalInvite.moreItems", { count: items.more })}
            </span>
          ) : null}
        </div>
      ) : null}

      <Text style={pitch}>
        {t("email.tenderExternalInvite.sealedBid")}
        <br />
        {t("email.tenderExternalInvite.freeToQuote")}
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

      {props.publicUrl ? (
        <Text style={secondaryLink}>
          {t.rich("email.tenderExternalInvite.publicLink", {
            link: (chunks: React.ReactNode) => (
              <a href={props.publicUrl ?? undefined} style={{ color: COLORS.slate700 }}>
                {chunks}
              </a>
            ),
          })}
        </Text>
      ) : null}

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
  const items = itemLines(t, props);
  return [
    t("email.tenderExternalInvite.textIntro", {
      inviterName: props.inviterName,
      tenderTitle: props.tenderTitle,
    }),
    ...infoLines(t, props),
    ...(items.lines.length > 0
      ? [
          "",
          t("email.tenderExternalInvite.itemsTitle", { count: items.total }),
          ...items.lines.map((l) => `- ${l}`),
          ...(items.more > 0 ? [t("email.tenderExternalInvite.moreItems", { count: items.more })] : []),
        ]
      : []),
    "",
    t("email.tenderExternalInvite.sealedBid"),
    t("email.tenderExternalInvite.freeToQuote"),
    "",
    t("email.tenderExternalInvite.textCta", { url: props.registerUrl }),
    ...(props.publicUrl ? [t("email.tenderExternalInvite.textPublicLink", { url: props.publicUrl })] : []),
    "",
    t("email.tenderExternalInvite.textOptOut", { url: props.optOutUrl }),
  ].join("\n");
}
