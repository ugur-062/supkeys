import { Body, Head, Html } from "@react-email/components";
import * as React from "react";
import type { EmailTranslator, Locale } from "../../i18n";
import { privacyNoticeUrl, type EmailEnv } from "./email-env";

/**
 * DÜZ MEKTUP — her soğuk davetin biçimi (2026-10-09, sahip: "AI'ın bulduğu,
 * hiç kayıt olmamış firmalara giden davet Promosyonlar sekmesine ya da spam'e
 * düşmemeli; bizim tarafımızdaki her nedeni kaldırın").
 *
 * Soğuk davet, bir kişinin yazdığı kısa bir iş e-postasına benzer: logo ya da
 * başka görsel YOK (dolayısıyla gömülü ek de yok), kart YOK, renkli kutu YOK,
 * düğme YOK, gizli önizleme metni YOK, renk bildirimi HİÇ yok (metin ve
 * bağlantı rengi posta istemcisinin kendi rengi — açık ve koyu modda).
 * Paragraflar, birkaç düz satır, sıradan metin bağlantıları, küçük bir alt bilgi.
 *
 * TEK MODEL, İKİ ÇİZİM: şablon bir `Letter` kurar; HTML parçası (`PlainLetter`)
 * ve düz metin parçası (`renderLetterText`) ondan üretilir → iki parça
 * ayrışamaz. Tek fark bağlantı: HTML'de `<a href>etiket</a>`, metinde
 * `etiket: adres`.
 *
 * Gelen kutusu önizlemesi mektubun kendi açılışıdır: şablonlar selamın hemen
 * ardına olgu cümlesini koyar.
 *
 * Kullanan: kayıtsız adrese talep daveti (+ hatırlatması), birden çok talebin
 * özeti, "katıl" (referans) daveti. Üyeye giden ve kod/güvenlik e-postaları
 * marka kabuğunda (`Layout`) kalır.
 */

export interface LetterLink {
  label: string;
  url: string;
}

export type LetterBlock =
  /** Tek paragraf. */
  | { kind: "text"; text: string }
  /** Birlikte duran kısa satırlar (talep bilgileri, kalem satırları). */
  | { kind: "lines"; lines: string[] }
  /** Sıradan metin bağlantıları, her biri kendi satırında. */
  | { kind: "links"; links: LetterLink[] };

export interface Letter {
  blocks: LetterBlock[];
  /** Küçük alt bilgi: kim, neden gönderdi; çıkış bağlantısı; aydınlatma metni. */
  footer: Array<string | LetterLink>;
}

/**
 * Bir soğuk davetin taşıyabileceği en çok bağlantı — çıkış ve aydınlatma
 * dahil. Koruma testi (`cold-invite-plain-letter.spec`) çizilen her mektubun
 * bağlantılarını buna göre sayar.
 */
export const PLAIN_LETTER_MAX_LINKS = 4;

/**
 * Soğuk davetlerin ortak alt bilgisi. TEK çıkış bağlantısı: gönderim servisi
 * imzalayabildiyse (INVITE akışında her zaman) imzalı çıkış sayfası, yoksa
 * davetin kendi çıkış bağlantısı. Aydınlatma metni HER ZAMAN var: soğuk davet
 * o adresle ilk temastır (KVKK m. 10).
 */
export function letterFooter(
  t: EmailTranslator,
  locale: Locale,
  env: EmailEnv,
  reason: string,
  optOutUrl?: string,
): Array<string | LetterLink> {
  const optOut = env.unsubscribeUrl ?? optOutUrl;
  return [
    reason,
    ...(optOut ? [{ label: t("email.plain.optOut"), url: optOut }] : []),
    { label: t("email.plain.privacy"), url: privacyNoticeUrl(env.siteUrl, locale) },
  ];
}

const FOOTER_RULE = "--";

/** Düz metin parçası: bloklar arası boş satır, bağlantı `etiket: adres`. */
export function renderLetterText(letter: Letter): string {
  const link = (l: LetterLink) => `${l.label}: ${l.url}`;
  const blocks = letter.blocks.map((b) => {
    if (b.kind === "text") return b.text;
    if (b.kind === "lines") return b.lines.join("\n");
    return b.links.map(link).join("\n");
  });
  const footer = [FOOTER_RULE, ...letter.footer.map((f) => (typeof f === "string" ? f : link(f)))];
  return [...blocks, footer.join("\n")].join("\n\n");
}

// Renk, zemin, kenarlık YOK: mektup istemcinin kendi renklerini alır (koyu
// modda da). Yalnız yazı boyutu ve aralık verilir.
const body: React.CSSProperties = {
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: "15px",
  lineHeight: "1.5",
};
// Uzun, bölünemeyen sözcük (mektupta basılan alıcı adresi, tek parça talep
// başlığı / kalem adı) dar ekranda sütunu taşırmasın: sözcük gerekirse ortadan
// bölünür — marka kabuğundaki kartla (`layout.tsx`) aynı iki özellik. Renk /
// kutu bildirimi değil; mektup düz kalır.
const column: React.CSSProperties = { maxWidth: "600px", overflowWrap: "break-word", wordBreak: "break-word" };
const paragraph: React.CSSProperties = { margin: "0 0 14px 0" };
const footer: React.CSSProperties = { margin: "22px 0 0 0", fontSize: "12px" };

/** Tek paragrafın satırları, aralarında `<br/>`. */
function withBreaks(parts: React.ReactNode[]): React.ReactNode {
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {i > 0 ? <br /> : null}
      {part}
    </React.Fragment>
  ));
}

// Bağlantı `href` dışında öznitelik taşımaz (düğme gibi biçimlenmez).
const anchor = (l: LetterLink) => <a href={l.url}>{l.label}</a>;

/** Düz mektubun HTML parçası. */
export function PlainLetter({ letter, locale }: { letter: Letter; locale: Locale }) {
  return (
    <Html lang={locale}>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>
      <Body style={body}>
        <div style={column}>
          {letter.blocks.map((b, i) => (
            <p key={i} style={paragraph}>
              {b.kind === "text" ? b.text : b.kind === "lines" ? withBreaks(b.lines) : withBreaks(b.links.map(anchor))}
            </p>
          ))}
          <p style={footer}>
            {withBreaks([FOOTER_RULE, ...letter.footer.map((f) => (typeof f === "string" ? f : anchor(f)))])}
          </p>
        </div>
      </Body>
    </Html>
  );
}
