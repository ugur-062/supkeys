import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Tedarikçi Paneli — Supkeys",
    template: "%s — Supkeys Tedarikçi",
  },
  robots: { index: false, follow: false },
};

export default function SupplierLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
