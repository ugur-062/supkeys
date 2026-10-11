import { Heading as ReHeading } from "@react-email/components";
import * as React from "react";
import { COLORS, FONTS } from "./tokens";

interface HeadingProps {
  children: React.ReactNode;
  level?: 1 | 2;
}

export function Heading({ children, level = 1 }: HeadingProps) {
  const styles =
    level === 1
      ? {
          fontFamily: FONTS.display,
          fontSize: "22px",
          fontWeight: 700,
          color: COLORS.brand900,
          margin: "0 0 16px 0",
          lineHeight: "30px",
          letterSpacing: "-0.2px",
        }
      : {
          fontFamily: FONTS.display,
          fontSize: "16px",
          fontWeight: 700,
          color: COLORS.brand900,
          margin: "0 0 8px 0",
          lineHeight: "24px",
        };

  return (
    <ReHeading as={level === 1 ? "h1" : "h2"} className={level === 1 ? "r-h r-h1" : "r-h"} style={styles}>
      {children}
    </ReHeading>
  );
}
