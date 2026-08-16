import { Badge } from "@/components/catalyst/badge";
import { roleLabel } from "@/lib/company/labels";

/**
 * C31 — rol gösterimi TEK bileşen: Kurucu = amber rozet, operasyon/etiket
 * rolleri = zinc rozet; etiketler merkez sözlükten (labels.ts). Serbest
 * span/caps/renk varyantları yasak — her yüzey bunu kullanır.
 */
export function RoleBadge({
  role,
  owner = false,
}: {
  role?: string;
  owner?: boolean;
}) {
  if (owner) return <Badge color="amber">Kurucu</Badge>;
  if (!role) return null;
  return <Badge color="zinc">{roleLabel(role)}</Badge>;
}
