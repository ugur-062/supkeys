"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/ui/button";
import {
  useAdminCompanyConnections,
  useRevokeInvite,
} from "@/hooks/use-admin-inspection";
import { safeFormat } from "@/lib/date";
import Link from "next/link";
import { toast } from "sonner";

import {
  CONNECTION_STATUS_META,
  metaOf,
  REFERRAL_STATUS_META,
} from "@/lib/terms";

/** Bağlantılar + referans davetleri — bekleyen davetler iptal edilebilir. */
export function ConnectionsTab({ companyId }: { companyId: string }) {
  const query = useAdminCompanyConnections(companyId);
  const revoke = useRevokeInvite(companyId);
  const connections = query.data?.connections ?? [];
  const referrals = query.data?.referralInvites ?? [];

  const err = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Hata");

  return (
    <div className="space-y-4">
      <section className="admin-card overflow-hidden">
        <div className="border-surface-border border-b px-5 py-3.5">
          <h3 className="text-admin-text text-sm font-semibold">
            Firma Bağlantıları
          </h3>
        </div>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Karşı firma</TableHeader>
              <TableHeader>Yön</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Tarih</TableHeader>
              <TableHeader className="text-right">İşlem</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {connections.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {query.isLoading ? "Yükleniyor..." : "Bağlantı yok"}
                </TableCell>
              </TableRow>
            ) : (
              connections.map((c) => {
                const meta = metaOf(CONNECTION_STATUS_META, c.status);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-admin-text text-sm font-medium">
                      <Link
                        href={`/admin/firmalar/${c.other.id}`}
                        className="hover:underline"
                      >
                        {c.other.name}
                      </Link>
                      <span className="text-admin-text-muted block font-mono text-[11px]">
                        {c.other.rothernId ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs">
                      {c.direction === "outgoing" ? "Giden davet" : "Gelen davet"}
                    </TableCell>
                    <TableCell>
                      <Badge color={meta.color}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                      {safeFormat(c.createdAt, "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status === "PENDING" ? (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate(
                              { kind: "connection", id: c.id },
                              {
                                onSuccess: () =>
                                  toast.success("Davet iptal edildi"),
                                onError: err,
                              },
                            )
                          }
                        >
                          Daveti İptal Et
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>

      <section className="admin-card overflow-hidden">
        <div className="border-surface-border border-b px-5 py-3.5">
          <h3 className="text-admin-text text-sm font-semibold">
            Referans Davetleri (e-posta)
          </h3>
        </div>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>E-posta</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Tarih</TableHeader>
              <TableHeader className="text-right">İşlem</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {referrals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {query.isLoading ? "Yükleniyor..." : "Referans daveti yok"}
                </TableCell>
              </TableRow>
            ) : (
              referrals.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-admin-text text-sm">
                    {r.email}
                  </TableCell>
                  <TableCell>
                    <Badge color={metaOf(REFERRAL_STATUS_META, r.status).color}>
                      {metaOf(REFERRAL_STATUS_META, r.status).label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {safeFormat(r.createdAt, "d MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "PENDING" ? (
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={revoke.isPending}
                        onClick={() =>
                          revoke.mutate(
                            { kind: "referral", id: r.id },
                            {
                              onSuccess: () =>
                                toast.success("Davet iptal edildi"),
                              onError: err,
                            },
                          )
                        }
                      >
                        Daveti İptal Et
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
