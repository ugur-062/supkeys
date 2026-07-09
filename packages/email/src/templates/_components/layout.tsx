import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { LOGO_CID } from "../../assets/logo";
import { COLORS, FONTS } from "./tokens";

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
}

const main = {
  backgroundColor: COLORS.surfaceSubtle,
  fontFamily: FONTS.sans,
  margin: 0,
  padding: 0,
};

const wrapper = {
  margin: "0 auto",
  padding: "32px 16px",
  maxWidth: "600px",
};

const card = {
  backgroundColor: "#FFFFFF",
  borderRadius: "12px",
  border: `1px solid ${COLORS.surfaceBorder}`,
  padding: "32px",
};

const headerSection = {
  textAlign: "center" as const,
  marginBottom: "24px",
};

// Logo BEYAZ bir kutuya oturur: siyah+şeffaf logo, istemci dark-mode uygulasa
// bile (color-scheme meta'sını yok sayan Gmail vb.) koyu zeminde kaybolmasın —
// tablo-hücresi arka planı e-postada en dayanıklı yapıdır.
const logoChip = {
  backgroundColor: "#FFFFFF",
  padding: "14px 22px",
  borderRadius: "10px",
  border: `1px solid ${COLORS.surfaceBorder}`,
};

const logoStyle = {
  display: "block",
  height: "auto",
  margin: 0,
};

const footerStyle = {
  textAlign: "center" as const,
  color: COLORS.slate500,
  fontSize: "12px",
  marginTop: "24px",
  lineHeight: "1.6",
};

// Logo gömülü (inline CID) ek olarak gönderilir → uzak görsel engelleyen
// istemcilerde ve dev'de (localhost) de görünür. Ek client.ts'te eklenir.
const LOGO_SRC = `cid:${LOGO_CID}`;

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="tr">
      <Head>
        {/* E-posta yalnız AÇIK (light) temada render edilsin — istemci (Gmail/
            Apple Mail/Outlook) otomatik dark-mode renk ters-çevirmesi yapmasın.
            Aksi halde siyah+şeffaf logo koyu zeminde kaybolur, monokrom palet
            bozulurdu. */}
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`
          :root {
            color-scheme: light only;
            supported-color-schemes: light;
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={wrapper}>
          <Section style={headerSection}>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              style={{ margin: "0 auto" }}
            >
              <tbody>
                <tr>
                  <td
                    style={logoChip}
                    {...({ bgcolor: "#FFFFFF" } as Record<string, string>)}
                  >
                    <Img
                      src={LOGO_SRC}
                      alt="Rothern"
                      width="150"
                      height="44"
                      style={logoStyle}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={card}>{children}</Section>

          <Section>
            <Hr
              style={{
                borderColor: COLORS.surfaceBorder,
                margin: "24px 0 16px",
              }}
            />
            <Text style={footerStyle}>
              © 2026 Rothern
              <br />
              Bu e-postayı rothern.com platformundan aldınız.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
