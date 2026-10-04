import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { NotificationData } from "../types";
import { Alert, CodeBlock, EntryList, HighlightPanel, InfoRows, Note, Paragraph } from "./_components/blocks";
import { CtaButton } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";

export function makeNotificationSubject(props: NotificationData): string {
  return props.subject;
}

/**
 * Kodlu e-postanın alıcının dilindeki parçaları (HTML ve düz metin AYNI
 * kaynaktan — ikisi ayrışmasın).
 */
function codeTexts(props: NotificationData, locale: Locale) {
  if (!props.code) return null;
  const t = emailT(locale);
  const minutes = props.code.expiresInMinutes;
  return {
    label: t("email.code.label"),
    validity: minutes != null ? t("email.code.validity", { minutes }) : undefined,
    preview:
      minutes != null
        ? t("email.code.preview", { code: props.code.value, minutes })
        : t("email.code.previewNoExpiry", { code: props.code.value }),
    textLine: t("email.code.textLine", { code: props.code.value }),
    ignore: props.footerNote ?? t("email.code.ignoreNote"),
  };
}

/**
 * Gövde metni ÇAĞIRANDAN gelir (alıcının diliyle üretilmiş başlık/paragraf/CTA)
 * — burada çeviri yapılmaz; yalnız kod bloğunun sabit parçaları (`email.code.*`)
 * ve kabuk (Layout altbilgisi + <html lang>) alıcının dilinde. Dil verilmezse
 * Türkçe.
 */
export function NotificationEmail(props: NotificationData & { locale?: Locale }) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const code = codeTexts(props, locale);
  const footer = code ? code.ignore : props.footerNote;
  return (
    <Layout preview={props.preview ?? code?.preview ?? props.heading} locale={locale}>
      <Heading>{props.heading}</Heading>

      {props.paragraphs.map((p, i) => (
        <Paragraph key={i}>{p}</Paragraph>
      ))}

      {code && props.code ? (
        <CodeBlock code={props.code.value} label={code.label} caption={code.validity} />
      ) : null}

      {props.highlights?.length ? <HighlightPanel items={props.highlights} /> : null}

      {props.entries?.length ? <EntryList entries={props.entries} /> : null}

      {props.infoRows && props.infoRows.length > 0 ? <InfoRows rows={props.infoRows} /> : null}

      {props.ctaUrl && props.ctaLabel ? <CtaButton href={props.ctaUrl}>{props.ctaLabel}</CtaButton> : null}

      {props.alert ? <Alert>{props.alert}</Alert> : null}

      {footer ? <Note>{footer}</Note> : null}
    </Layout>
  );
}

export function renderNotificationText(
  props: NotificationData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const code = codeTexts(props, locale);
  const lines = [props.heading, ""];
  for (const p of props.paragraphs) {
    lines.push(p, "");
  }
  if (code) {
    lines.push(code.textLine);
    if (code.validity) lines.push(code.validity);
    lines.push("");
  }
  if (props.highlights?.length) {
    for (const h of props.highlights) lines.push(`- ${h}`);
    lines.push("");
  }
  if (props.entries?.length) {
    for (const e of props.entries) lines.push(e.detail ? `${e.title} — ${e.detail}` : e.title);
    lines.push("");
  }
  if (props.infoRows?.length) {
    for (const row of props.infoRows) lines.push(row.value ? `${row.label}: ${row.value}` : row.label);
    lines.push("");
  }
  if (props.ctaUrl && props.ctaLabel) {
    lines.push(`${props.ctaLabel}: ${props.ctaUrl}`, "");
  }
  if (props.alert) lines.push(props.alert, "");
  const footer = code ? code.ignore : props.footerNote;
  if (footer) lines.push(footer, "");
  lines.push(emailT(locale)("email.layout.textSignature"));
  return lines.join("\n");
}
