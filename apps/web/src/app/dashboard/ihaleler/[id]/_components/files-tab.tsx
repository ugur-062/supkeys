"use client";

import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { Badge } from "@/components/catalyst/badge";
import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { Alert } from "@/components/ui/alert";
import { useAttachments } from "@/hooks/use-attachments";
import type { AttachmentSurface } from "@/lib/attachments/types";

interface Props {
  surface?: AttachmentSurface;
  tender: { id: string; status: string };
}

const TENANT_EDITABLE_STATUSES = new Set(["DRAFT", "IN_APPROVAL"]);

export function FilesTab({ surface = "tenant", tender }: Props) {
  const isTenant = surface === "tenant";
  const canEdit = isTenant && TENANT_EDITABLE_STATUSES.has(tender.status);

  const { data: items } = useAttachments(surface, "TENDER_DOC", tender.id);

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <Subheading>İhale Dökümanları</Subheading>
          {items && items.length > 0 ? <Badge>{items.length}</Badge> : null}
        </div>
        <Text className="mt-1">
          {isTenant
            ? "Şartname, teknik özellikler, çizimler ve diğer ek dosyaları yükleyin. Davet edilen tedarikçiler bu dosyaları görür."
            : "Alıcının ihale için paylaştığı dökümanlar."}
        </Text>
      </header>

      {canEdit ? (
        <AttachmentUpload
          surface="tenant"
          scope="TENDER_DOC"
          scopeRefId={tender.id}
        />
      ) : isTenant ? (
        <Alert variant="info">
          Yayınlanmış ihalelerde döküman ekleme veya silme yapılamaz.
        </Alert>
      ) : null}

      <AttachmentList
        surface={surface}
        scope="TENDER_DOC"
        scopeRefId={tender.id}
        canDelete={canEdit}
        emptyText={
          isTenant
            ? "Bu ihaleye eklenmiş döküman yok"
            : "Alıcı henüz döküman paylaşmadı"
        }
      />
    </div>
  );
}
