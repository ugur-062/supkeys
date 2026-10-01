"use client";

import { Badge } from "@/components/catalyst/badge";
import { TableCell, TableRow } from "@/components/catalyst/table";
import type { AuditLogItem } from "@/hooks/use-audit-logs";
import { ACTION_LABELS } from "@/lib/audit-actions";
import { actorMeta, entityTypeLabel, formatAuditMetadata } from "@/lib/audit-format";
import { safeFormat } from "@/lib/date";

/**
 * Denetim kaydı satırı — genel Denetim Kaydı sayfası ve firma detayının
 * Denetim sekmesi aynı bileşeni kullanır (arayüz testi O-047): eylem, aktör,
 * varlık ve detay etiketli; bilinmeyen kod ham haliyle görünür.
 */
export function AuditLogRow({
  item,
  showEntity = true,
}: {
  item: AuditLogItem;
  /** Firma sekmesinde varlık sütunu yok (kayıtlar zaten o firmaya ait). */
  showEntity?: boolean;
}) {
  const actor = actorMeta(item.actorType);
  const detail = formatAuditMetadata(item.action, item.metadata);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-admin-text-muted">
        {safeFormat(item.createdAt, "d MMM yyyy HH:mm")}
      </TableCell>
      <TableCell>
        <Badge color={actor.color}>{actor.label}</Badge>
        <div className="text-xs text-admin-text-muted mt-1 truncate max-w-[160px]">
          {item.actorEmail ?? item.actorId ?? "—"}
        </div>
      </TableCell>
      <TableCell className="font-medium text-admin-text">
        {ACTION_LABELS[item.action] ?? item.action}
      </TableCell>
      {showEntity ? (
        <TableCell className="text-xs text-admin-text-muted">
          {item.entityType ? (
            <>
              {entityTypeLabel(item.entityType)}
              {item.entityId ? (
                <span className="font-mono"> · {item.entityId.slice(0, 10)}</span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </TableCell>
      ) : null}
      <TableCell
        className="text-xs text-admin-text-muted max-w-[280px] truncate"
        title={detail || undefined}
      >
        {detail || "—"}
      </TableCell>
    </TableRow>
  );
}
