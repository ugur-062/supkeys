import { Button as ReButton } from "@react-email/components";
import * as React from "react";
import { COLORS, FONTS } from "./tokens";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
}

// Marka birincil düğmesi (tokens.ts `brand600`). React Email `Button`
// Outlook için MSO dolgu hilesini kendisi basar.
const buttonStyle = {
  backgroundColor: COLORS.brand600,
  color: "#FFFFFF",
  fontFamily: FONTS.sans,
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "20px",
  padding: "12px 22px",
  borderRadius: "8px",
  textDecoration: "none",
  display: "inline-block",
};

export function Button({ href, children }: ButtonProps) {
  return (
    <ReButton href={href} className="r-btn" style={buttonStyle}>
      {children}
    </ReButton>
  );
}

/** Gövdedeki birincil eylem: metin sütunuyla aynı hizada (sola yaslı). */
export function CtaButton({ href, children }: ButtonProps) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      className="r-cta"
      style={{ margin: "8px 0 8px 0" }}
    >
      <tbody>
        <tr>
          <td>
            <Button href={href}>{children}</Button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
