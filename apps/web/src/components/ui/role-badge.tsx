"use client";

import { Badge } from "@/components/catalyst/badge";
import { useRoleLabel } from "@/i18n/domain";

/**
 * C31 — rol gösterimi TEK bileşen: Kurucu = amber rozet, operasyon/etiket
 * rolleri = zinc rozet; etiketler okuyucunun dilinde (`web.domain.role.<KOD>`,
 * tek kaynak `@/i18n/domain` `useRoleLabel`). Serbest span/caps/renk
 * varyantları yasak — her yüzey bunu kullanır.
 */
export function RoleBadge({
  role,
  owner = false,
}: {
  role?: string;
  owner?: boolean;
}) {
  const roleLabel = useRoleLabel();
  if (owner) return <Badge color="amber">{roleLabel("SAHIP")}</Badge>;
  if (!role) return null;
  return <Badge color="zinc">{roleLabel(role)}</Badge>;
}
