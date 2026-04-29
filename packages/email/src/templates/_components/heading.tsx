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
          fontSize: "24px",
          fontWeight: 700,
          color: COLORS.brand900,
          margin: "0 0 16px 0",
          lineHeight: "1.3",
        }
      : {
          fontFamily: FONTS.display,
          fontSize: "16px",
          fontWeight: 700,
          color: COLORS.brand900,
          margin: "0 0 8px 0",
          lineHeight: "1.4",
        };

  return <ReHeading as={level === 1 ? "h1" : "h2"} style={styles}>{children}</ReHeading>;
}
