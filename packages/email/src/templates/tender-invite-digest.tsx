import { Text } from "@react-email/components";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type EmailTranslator, type Locale } from "../i18n";
import type { TenderInviteDigestData, TenderInviteDigestEntry } from "../types";
import { Button } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { COLORS, FONTS } from "./_components/tokens";
import { formatInviteQuantity, infoLines } from "./tender-external-invite";

/**
 * BİRDEN ÇOK TALEP DAVETİ, TEK E-POSTA (2026-09-27, teslim edilebilirlik Faz 0b).
 *
 * Kayıtsız bir adrese 7 günde en fazla bir davet e-postası gider; o sürede
 * başka alıcılar da davet ettiyse davetler kaybolmaz, burada birlikte gelir
 * ("ABC İnşaat ve 2 alıcı daha sizden teklif istiyor"). Her talep kartı tekli
 * davetin içerik kurallarıyla aynı: davet eden firma, başlık, numara, teslim
 * yeri (şehir + ülke), son tarih, ilk kalemler; hedef fiyat/şartname/belge YOK.
 * Her kartın bağlantısı o davet edenin jetonunu taşır (kayıt olunca bağlantı
 * + talep daveti o firmayla kurulur).
 */

const paragraph = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 16px 0",
};

const card = {
  ...paragraph,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "10px",
  padding: "14px 16px",
  fontSize: "13px",
  margin: "0 0 12px 0",
};

const itemList = { margin: "6px 0 0 0", paddingLeft: "18px" };

const ctaWrap = { margin: "12px 0 0 0" };

const footnote = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

/** Özette kalem önizlemesi — kart kısa kalsın. */
export const DIGEST_ITEM_PREVIEW = 3;

/**
 * Farklı davet edenlerin görünen adları; adı görünenler önce (konuda "ilk ad"
 * olarak nötr "Bir alıcı firma" yerine gerçek ad tercih edilsin). Anahtar
 * yoksa ada göre tekilleşir (geriye dönük).
 */
function distinctInviters(invites: TenderInviteDigestEntry[]): string[] {
  const byKey = new Map<string, TenderInviteDigestEntry>();
  for (const i of invites) {
    const key = i.inviterKey ?? `name:${i.inviterName}`;
    if (!byKey.has(key)) byKey.set(key, i);
  }
  const all = [...byKey.values()];
  return [...all.filter((i) => !i.inviterAnonymous), ...all.filter((i) => i.inviterAnonymous)].map(
    (i) => i.inviterName,
  );
}

export function makeTenderInviteDigestSubject(
  data: TenderInviteDigestData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  const inviters = distinctInviters(data.invites);
  const first = inviters[0] ?? "";
  return inviters.length <= 1
    ? t("email.tenderInviteDigest.subjectSameBuyer", { first, count: data.invites.length })
    : t("email.tenderInviteDigest.subject", { first, count: inviters.length - 1 });
}

function entryLines(t: EmailTranslator, e: TenderInviteDigestEntry) {
  const items = (e.items ?? []).slice(0, DIGEST_ITEM_PREVIEW);
  const total = Math.max(e.itemCount ?? items.length, items.length);
  return {
    info: infoLines(t, {
      tenderNumber: e.tenderNumber,
      categories: [],
      deliveryPlace: e.deliveryPlace,
      closesAt: e.closesAt,
      supplierTypes: [],
    }),
    items: items.map((i) => t("email.tenderExternalInvite.itemLine", { name: i.name, qty: formatInviteQuantity(t, i) })),
    more: total - items.length,
  };
}

export function TenderInviteDigestEmail(props: TenderInviteDigestData & { locale?: Locale }) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const t = emailT(locale);
  return (
    <Layout preview={t("email.tenderInviteDigest.preview", { count: props.invites.length })} locale={locale}>
      <Heading>{t("email.tenderInviteDigest.heading")}</Heading>
      <Text style={paragraph}>{t("email.tenderExternalInvite.greeting")}</Text>
      <Text style={paragraph}>{t("email.tenderInviteDigest.intro")}</Text>

      {props.invites.map((e, idx) => {
        const lines = entryLines(t, e);
        return (
          <div key={`${idx}-${e.ctaUrl}`} style={card}>
            <strong>{e.inviterName}</strong>
            <br />
            {e.tenderTitle}
            {lines.info.map((line) => (
              <React.Fragment key={line}>
                <br />
                <span style={{ color: COLORS.slate500 }}>{line}</span>
              </React.Fragment>
            ))}
            {lines.items.length > 0 ? (
              <ul style={itemList}>
                {lines.items.map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ul>
            ) : null}
            {lines.more > 0 ? (
              <span style={{ color: COLORS.slate500 }}>
                {t("email.tenderExternalInvite.moreItems", { count: lines.more })}
              </span>
            ) : null}
            <div style={ctaWrap}>
              <Button href={e.ctaUrl}>{t("email.tenderInviteDigest.cta")}</Button>
            </div>
          </div>
        );
      })}

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        {t("email.tenderExternalInvite.sealedBid")}
        <br />
        {t("email.tenderExternalInvite.freeToQuote")}
      </Text>

      <Text style={footnote}>
        {t.rich("email.tenderInviteDigest.footnote", {
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

export function renderTenderInviteDigestText(data: TenderInviteDigestData, locale: Locale = DEFAULT_LOCALE): string {
  const t = emailT(locale);
  return [
    t("email.tenderInviteDigest.textIntro", { count: data.invites.length }),
    "",
    ...data.invites.flatMap((e) => {
      const lines = entryLines(t, e);
      return [
        t("email.tenderInviteDigest.textItem", { inviterName: e.inviterName, tenderTitle: e.tenderTitle, url: e.ctaUrl }),
        ...lines.info.map((l) => `  ${l}`),
        ...lines.items.map((l) => `  - ${l}`),
        ...(lines.more > 0 ? [`  ${t("email.tenderExternalInvite.moreItems", { count: lines.more })}`] : []),
        "",
      ];
    }),
    t("email.tenderExternalInvite.sealedBid"),
    t("email.tenderExternalInvite.freeToQuote"),
    "",
    // HTML alt notuyla aynı bilgi + imza (derin denetim boşluk taraması GA2).
    t("email.tenderInviteDigest.textFootnote"),
    t("email.tenderInviteDigest.textOptOut", { url: data.optOutUrl }),
    "",
    t("email.layout.textSignature"),
  ].join("\n");
}
