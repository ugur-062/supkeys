import { Text } from "@react-email/components";
import * as React from "react";
import { COLORS, FONTS } from "./tokens";

/**
 * Bütün Rothern e-postalarının ORTAK gövde parçaları (2026-10-04 e-posta
 * tasarımı). Şablonlar kendi stil nesnesini yazmaz: tipografi, aralık ve kutu
 * dili tek yerde kalsın, koyu mod sınıfları (`r-*`, bkz. layout.tsx) her
 * parçada aynı olsun.
 *
 * Outlook masaüstü `<table>` üzerindeki dolguyu yok sayar → dolgu, zemin ve
 * kenarlık her zaman `<td>`de (`Box`).
 */

export const TEXT = {
  body: {
    fontFamily: FONTS.sans,
    fontSize: "15px",
    lineHeight: "24px",
    color: COLORS.slate700,
    margin: "0 0 16px 0",
  },
  small: {
    fontFamily: FONTS.sans,
    fontSize: "13px",
    lineHeight: "20px",
    color: COLORS.slate600,
    margin: 0,
  },
} as const;

/** Gövde paragrafı. */
export function Paragraph({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Text className="r-text" style={{ ...TEXT.body, ...style }}>
      {children}
    </Text>
  );
}

/** Dolgu/zemin/kenarlığı `<td>`de taşıyan tek hücreli tablo (Outlook güvenli). */
export function Box({
  children,
  style,
  className,
  margin = "0 0 16px 0",
  align,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  margin?: string;
  align?: "left" | "center";
}) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin, borderCollapse: "separate" }}
    >
      <tbody>
        <tr>
          <td className={className} align={align} style={style}>
            {children}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const panelCell: React.CSSProperties = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "10px",
  padding: "16px 18px",
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "22px",
  color: COLORS.slate700,
};

/** Açık gri, köşeleri yuvarlak bilgi kutusu (talep özeti, kalem listesi…). */
export function Panel({
  children,
  margin,
  style,
}: {
  children: React.ReactNode;
  margin?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Box className="r-box" margin={margin ?? "4px 0 20px 0"} style={{ ...panelCell, ...style }}>
      {children}
    </Box>
  );
}

export interface InfoRow {
  label: string;
  value: React.ReactNode;
}

const rowLabel: React.CSSProperties = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  lineHeight: "20px",
  color: COLORS.slate600,
  padding: "10px 12px 10px 0",
  verticalAlign: "top",
};

const rowValue: React.CSSProperties = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  lineHeight: "20px",
  fontWeight: 600,
  color: COLORS.slate900,
  padding: "10px 0",
  textAlign: "right",
  verticalAlign: "top",
};

/**
 * Etiket | değer satırları — iki sütun, satırlar arasında ince çizgi. Dar
 * ekranda iki sütun da sarar (etiket sola, değer sağa yaslı kalır).
 */
export function InfoRows({ rows, footer }: { rows: InfoRow[]; footer?: React.ReactNode }) {
  if (rows.length === 0) return null;
  return (
    <Box className="r-box" margin="4px 0 20px 0" style={{ ...panelCell, padding: "4px 18px" }}>
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
        <tbody>
          {rows.map((row, i) => {
            const divider = i > 0 ? { borderTop: `1px solid ${COLORS.surfaceBorder}` } : {};
            // Uzun değer (kalem listesi) ya da uzun etiket (talep başlığı)
            // dar ekranda iki sütuna sığmaz → satır alt alta çizilir.
            const stacked =
              (typeof row.value === "string" && row.value.length > 34) || row.label.length > 26;
            if (stacked) {
              return (
                <tr key={i}>
                  <td colSpan={2} className="r-divider" style={{ padding: "10px 0", ...divider }}>
                    <span className="r-muted" style={{ ...rowLabel, padding: 0, display: "block" }}>
                      {row.label}
                    </span>
                    <span
                      className="r-strong"
                      style={{ ...rowValue, fontWeight: 500, padding: "2px 0 0 0", textAlign: "left", display: "block" }}
                    >
                      {row.value}
                    </span>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={i}>
                <td className="r-muted r-divider r-row-l" style={{ ...rowLabel, whiteSpace: "nowrap", ...divider }}>
                  {row.label}
                </td>
                <td className="r-strong r-divider r-row-v" style={{ ...rowValue, ...divider }}>
                  {row.value}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer ? (
        <Text
          className="r-muted r-divider"
          style={{
            ...TEXT.small,
            borderTop: `1px solid ${COLORS.surfaceBorder}`,
            padding: "10px 0 12px 0",
          }}
        >
          {footer}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * Tek kullanımlık kod bloğu: büyük, harf aralıklı rakamlar, hafif tonlu kutu.
 * Mono font YOK (kullanıcı kararı 2026-09-10) — rakam hizası `tabular-nums`.
 * Kod TEK metin düğümü: çift dokunuş/uzun basış hepsini seçer, aralık CSS ile
 * verildiği için kopyalanan değer boşluksuz ("488189").
 */
export function CodeBlock({
  code,
  label,
  caption,
}: {
  code: string;
  label: string;
  caption?: string;
}) {
  return (
    <Box
      className="r-box"
      align="center"
      margin="8px 0 24px 0"
      style={{
        backgroundColor: COLORS.surfaceMuted,
        border: `1px solid ${COLORS.surfaceBorder}`,
        borderRadius: "12px",
        padding: "20px 16px 18px 16px",
        textAlign: "center",
      }}
    >
      <Text
        className="r-muted"
        style={{ ...TEXT.small, fontWeight: 500, textAlign: "center", margin: "0 0 4px 0" }}
      >
        {label}
      </Text>
      <Text
        className="r-code"
        style={{
          fontFamily: FONTS.sans,
          fontSize: "36px",
          lineHeight: "44px",
          fontWeight: 700,
          letterSpacing: "10px",
          // Harf aralığı son rakamın ARDINA da eklenir → ortadan kaymasın diye
          // aynı miktar soldan dolgu.
          paddingLeft: "10px",
          color: COLORS.slate900,
          fontVariantNumeric: "tabular-nums",
          textAlign: "center",
          margin: 0,
          WebkitUserSelect: "all",
          userSelect: "all",
        }}
      >
        {code}
      </Text>
      {caption ? (
        <Text
          className="r-muted"
          style={{ ...TEXT.small, textAlign: "center", margin: "6px 0 0 0" }}
        >
          {caption}
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * Gövdenin altındaki sessiz not (çizgiyle ayrılmış): "Bu isteği siz
 * yapmadıysanız…", davetin kim/neden açıklaması, opt-out bağlantısı.
 */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="r-muted r-divider"
      style={{
        ...TEXT.small,
        // React Email `Text` kısa `margin`i ayrı kenarlara açıp `marginTop`u
        // ezer → üst boşluk kısa yazımda verilir.
        margin: "28px 0 0 0",
        paddingTop: "20px",
        borderTop: `1px solid ${COLORS.surfaceBorder}`,
      }}
    >
      {children}
    </Text>
  );
}

/** Not içindeki bağlantı. */
export function MutedLink({ href, children }: { href: string | undefined; children: React.ReactNode }) {
  return (
    <a href={href} className="r-muted" style={{ color: COLORS.slate600, textDecoration: "underline" }}>
      {children}
    </a>
  );
}
