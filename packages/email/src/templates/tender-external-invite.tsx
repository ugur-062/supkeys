import * as React from "react";
import { DEFAULT_LOCALE, emailT, type EmailMessageKey, type EmailTranslator, type Locale } from "../i18n";
import type { TenderExternalInviteData, TenderExternalInviteItem } from "../types";
import { BulletList, MutedLink, Note, Panel, Paragraph, TEXT } from "./_components/blocks";
import { CtaButton } from "./_components/button";
import { EmailEnvContext } from "./_components/email-env";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { inline } from "./_components/text";
import { COLORS } from "./_components/tokens";

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

const panelTitle: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "22px",
  fontWeight: 600,
  color: COLORS.slate900,
};

// Panel satırları `<div>`: Outlook masaüstü satır içi öğede `display:block`u
// yok sayar, span'ler tek satırda birleşiyordu.
const panelLine: React.CSSProperties = { ...TEXT.small };

const smallText: React.CSSProperties = { ...TEXT.body, fontSize: "14px", lineHeight: "22px" };

const secondaryLink: React.CSSProperties = { ...TEXT.small, margin: "12px 0 0 0" };

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
export function infoLines(
  t: EmailTranslator,
  props: Pick<TenderExternalInviteData, "supplierTypes" | "tenderNumber" | "categories" | "deliveryPlace" | "closesAt">,
): string[] {
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

/**
 * Konudaki kalem özeti: ilk iki kalem adı + "+N kalem" ("M6 cıvata, Rulman +1
 * kalem"). Kalem yoksa talep başlığı. Konu kişiye özel ve somut olsun diye
 * (2026-09-27, kullanıcı: "şirket adı ve kalemler daha etkili olur").
 */
export function inviteSubjectItems(
  t: EmailTranslator,
  props: Pick<TenderExternalInviteData, "items" | "itemCount" | "tenderTitle">,
): string {
  const items = props.items ?? [];
  if (items.length === 0) return props.tenderTitle;
  const names = items.slice(0, 2).map((i) => i.name);
  const total = Math.max(props.itemCount ?? items.length, items.length);
  const more = total - names.length;
  return more > 0
    ? `${names.join(", ")} ${t("email.tenderExternalInvite.subjectMore", { count: more })}`
    : names.join(", ");
}

export function makeTenderExternalInviteSubject(
  props: TenderExternalInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  const items = inviteSubjectItems(t, props);
  return props.reminder
    ? t("email.tenderExternalInvite.reminderSubject", { inviterName: props.inviterName, items })
    : t("email.tenderExternalInvite.subjectItems", { inviterName: props.inviterName, items });
}

/** Gönderenin görünen adı: "ABC İnşaat (Rothern üzerinden)" — alıcının dilinde. */
export function inviteFromName(inviterName: string, locale: Locale = DEFAULT_LOCALE): string {
  return emailT(locale)("email.tenderExternalInvite.fromName", { inviterName });
}

export function TenderExternalInviteEmail(
  props: TenderExternalInviteData & { locale?: Locale },
) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const t = emailT(locale);
  const info = infoLines(t, props);
  const items = itemLines(t, props);
  // Alt bilgide imzalı çıkış bağlantısı varsa (davet akışında her zaman) not
  // yalnız açıklamayı taşır — aynı e-postada iki "kapat" bağlantısı olmasın.
  // Çıkış bağlantısı basılamadıysa (JWT_SECRET yok) opt-out notta kalır.
  const env = React.useContext(EmailEnvContext);

  return (
    <Layout
      preview={t("email.tenderExternalInvite.preview", {
        inviterName: props.inviterName,
        tenderTitle: props.tenderTitle,
      })}
      locale={locale}
    >
      <Heading>
        {t(props.reminder ? "email.tenderExternalInvite.reminderHeading" : "email.tenderExternalInvite.heading")}
      </Heading>

      <Paragraph>{t("email.tenderExternalInvite.greeting")}</Paragraph>

      <Paragraph>
        {t.rich(props.reminder ? "email.tenderExternalInvite.reminderIntro" : "email.tenderExternalInvite.intro", {
          inviterName: props.inviterName,
          b: bold,
        })}
      </Paragraph>

      <Panel>
        <div className="r-strong" style={panelTitle}>
          {props.tenderTitle}
        </div>
        {info.map((line) => (
          <div key={line} className="r-muted" style={panelLine}>
            {inline(line)}
          </div>
        ))}
      </Panel>

      {items.lines.length > 0 ? (
        <Panel style={{ backgroundColor: COLORS.card }}>
          <div className="r-strong" style={{ ...panelTitle, fontSize: "14px" }}>
            {t("email.tenderExternalInvite.itemsTitle", { count: items.total })}
          </div>
          <BulletList items={items.lines} style={{ margin: "8px 0 0 0" }} />
          {items.more > 0 ? (
            <div className="r-muted" style={{ ...panelLine, paddingTop: "4px" }}>
              {t("email.tenderExternalInvite.moreItems", { count: items.more })}
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Paragraph style={smallText}>
        {t("email.tenderExternalInvite.sealedBid")}
        <br />
        {t("email.tenderExternalInvite.freeToQuote")}
      </Paragraph>

      <Paragraph style={smallText}>
        {t("email.tenderExternalInvite.howTo", {
          inviterName: props.inviterName,
        })}
      </Paragraph>

      <CtaButton href={props.registerUrl}>{t("email.tenderExternalInvite.cta")}</CtaButton>

      {props.previewUrl ? (
        <Paragraph style={secondaryLink}>
          {t.rich("email.tenderExternalInvite.previewLink", {
            link: (chunks: React.ReactNode) => <MutedLink href={props.previewUrl ?? undefined}>{chunks}</MutedLink>,
          })}
        </Paragraph>
      ) : props.publicUrl ? (
        <Paragraph style={secondaryLink}>
          {t.rich("email.tenderExternalInvite.publicLink", {
            link: (chunks: React.ReactNode) => <MutedLink href={props.publicUrl ?? undefined}>{chunks}</MutedLink>,
          })}
        </Paragraph>
      ) : null}

      <Note>
        {env.unsubscribeUrl
          ? t("email.tenderExternalInvite.textFootnote", { inviterName: props.inviterName })
          : t.rich("email.tenderExternalInvite.footnote", {
              inviterName: props.inviterName,
              optout: (chunks: React.ReactNode) => <MutedLink href={props.optOutUrl}>{chunks}</MutedLink>,
            })}
      </Note>
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
    t(props.reminder ? "email.tenderExternalInvite.textReminderIntro" : "email.tenderExternalInvite.textIntro", {
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
    ...(props.previewUrl
      ? [t("email.tenderExternalInvite.textPreviewLink", { url: props.previewUrl })]
      : props.publicUrl
        ? [t("email.tenderExternalInvite.textPublicLink", { url: props.publicUrl })]
        : []),
    "",
    // HTML alt notuyla aynı bilgi: kim, neden gönderdi (İYS/ETK, teslim
    // edilebilirlik) + imza (derin denetim boşluk taraması GA2).
    t("email.tenderExternalInvite.textFootnote", { inviterName: props.inviterName }),
    t("email.tenderExternalInvite.textOptOut", { url: props.optOutUrl }),
    "",
    t("email.layout.textSignature"),
  ].join("\n");
}
