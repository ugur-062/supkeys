"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Subheading } from "@/components/catalyst/heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Text } from "@/components/catalyst/text";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { SUPPLIER_RELATION_STATUS_META } from "@/lib/supplier/status";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AddInvitationModal } from "./add-invitation-modal";

type BadgeColor = "lime" | "amber" | "red" | "zinc";

function statusColor(status: string): BadgeColor {
  if (status === "ACTIVE") return "lime";
  if (status === "PENDING_TENANT_APPROVAL") return "amber";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

export function TenantRelationsList() {
  const { tenantRelations } = useSupplierAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationToken = searchParams.get("invitation");
  const [modalOpen, setModalOpen] = useState(false);

  // URL'de invitation token varsa modalı otomatik aç
  useEffect(() => {
    if (invitationToken) setModalOpen(true);
  }, [invitationToken]);

  const handleClose = () => {
    setModalOpen(false);
    // Modal kapanınca URL'den invitation parametresini temizle —
    // sayfa yenilenince modal yeniden açılmasın
    if (invitationToken) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("invitation");
      const qs = params.toString();
      router.replace(qs ? `/supplier/profil?${qs}` : "/supplier/profil");
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <Subheading>Bağlı Olduğum Alıcılar</Subheading>
        <Text className="mt-1">
          {tenantRelations.length === 0
            ? "Henüz bağlı olduğunuz bir alıcı yok"
            : `${tenantRelations.length} aktif ilişki`}
        </Text>
      </div>

      {tenantRelations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-950/10 bg-zinc-50 px-6 py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <Building2 className="h-6 w-6 text-zinc-300" />
          </div>
          <Text className="mt-3 font-semibold text-zinc-950">
            Henüz bağlı olduğunuz bir alıcı yok
          </Text>
          <Text className="mx-auto mt-1 max-w-sm">
            Bir alıcı firma sizi davet ettiğinde, davet kodu ile bağlantı
            kurabilirsiniz.
          </Text>
        </div>
      ) : (
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Alıcı Firma</TableHeader>
              <TableHeader>Bağlanma Tarihi</TableHeader>
              <TableHeader>Durum</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {tenantRelations.map((rel) => {
              const meta = SUPPLIER_RELATION_STATUS_META[rel.status];
              return (
                <TableRow key={rel.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                        <Building2 className="h-4 w-4 text-zinc-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate">{rel.tenantName}</div>
                        {rel.status === "BLOCKED" && rel.blockedReason ? (
                          <div className="truncate text-xs text-danger-600">
                            Engelleme sebebi: {rel.blockedReason}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {format(new Date(rel.createdAt), "d MMM yyyy", {
                      locale: tr,
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge color={statusColor(rel.status)}>{meta.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <div className="space-y-2 border-t border-zinc-950/5 pt-6">
        <Button outline className="w-full" onClick={() => setModalOpen(true)}>
          <Plus data-slot="icon" />
          Yeni Davet Kodu Ekle
        </Button>
        <Text className="text-center text-xs">
          Bir alıcı firma sizi davet ettiyse, e-postanızdaki kodu buraya girerek
          bağlantı talebinde bulunabilirsiniz.
        </Text>
      </div>

      <AddInvitationModal
        open={modalOpen}
        onClose={handleClose}
        initialToken={invitationToken}
      />
    </section>
  );
}
