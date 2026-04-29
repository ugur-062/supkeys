import { Button as ReButton } from "@react-email/components";
import * as React from "react";
import { COLORS, FONTS } from "./tokens";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
}

const buttonStyle = {
  backgroundColor: COLORS.brand600,
  color: "#FFFFFF",
  fontFamily: FONTS.sans,
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 24px",
  borderRadius: "8px",
  textDecoration: "none",
  display: "inline-block",
};

export function Button({ href, children }: ButtonProps) {
  return (
    <ReButton href={href} style={buttonStyle}>
      {children}
    </ReButton>
  );
}
