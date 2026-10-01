"use client";

import { useAdminAuth } from "@/hooks/use-admin-auth";
import { canAdminDo } from "@/lib/admin-permissions";
import Link from "next/link";

/**
 * Firma detayı (GET admin/companies/:id) Destek rolüne kapalı (KYC PII).
 * Karar T-09: 403 veren sayfalara bağlantı verilmez — izinsiz rolde firma adı
 * düz metin çizilir.
 */
export function useCanOpenCompany(): boolean {
  const { admin } = useAdminAuth();
  return canAdminDo(admin?.role, "listCompanies");
}

/** Firma detayına bağlantı; firma detayını göremeyen rolde düz metin. */
export function CompanyLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const canOpen = useCanOpenCompany();
  if (!canOpen) {
    const plain = className
      ?.split(/\s+/)
      .filter((c) => c && !c.startsWith("hover:"))
      .join(" ");
    return <span className={plain || undefined}>{children}</span>;
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
