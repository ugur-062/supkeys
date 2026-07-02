"use client";

import { Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  useOrderDocuments,
  useUploadOrderDoc,
  type OrderDocType,
} from "@/hooks/use-order-documents";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from "@heroicons/react/20/solid";
import { useRef } from "react";
import { toast } from "sonner";

function DocGroup({
  orderId,
  type,
  title,
  hint,
  canUpload,
  docs,
}: {
  orderId: string;
  type: OrderDocType;
  title: string;
  hint: string;
  canUpload: boolean;
  docs: { id: string; fileName: string; url: string; createdAt: string }[];
}) {
  const upload = useUploadOrderDoc(orderId);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`"${file.name}" 50MB sınırını aşıyor`);
      return;
    }
    try {
      await upload.mutateAsync({ file, type });
      toast.success("Belge yüklendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="rounded-lg border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{title}</div>
          <div className="text-xs text-zinc-500">{hint}</div>
        </div>
        {canUpload ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={upload.isPending}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {upload.isPending ? "Yükleniyor…" : "Yükle"}
            </button>
          </>
        ) : null}
      </div>

      <div className="mt-3 space-y-1">
        {docs.length === 0 ? (
          <Text className="text-xs text-zinc-400">Henüz belge yok.</Text>
        ) : (
          docs.map((d) => (
            <a
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {d.fileName}
            </a>
          ))
        )}
      </div>
    </div>
  );
}

export function OrderDocumentsSection({
  orderId,
  role,
}: {
  orderId: string;
  role: "seller" | "buyer";
}) {
  const { data: docs } = useOrderDocuments(orderId);
  const delivery = (docs ?? []).filter((d) => d.type === "DELIVERY");
  const payment = (docs ?? []).filter((d) => d.type === "PAYMENT");

  return (
    <section className="space-y-3">
      <Subheading>Belgeler</Subheading>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DocGroup
          orderId={orderId}
          type="DELIVERY"
          title="Teslim Belgesi"
          hint="İrsaliye / konşimento (satıcı yükler)"
          canUpload={role === "seller"}
          docs={delivery}
        />
        <DocGroup
          orderId={orderId}
          type="PAYMENT"
          title="Ödeme Dekontu"
          hint="Ödeme kanıtı (alıcı yükler)"
          canUpload={role === "buyer"}
          docs={payment}
        />
      </div>
    </section>
  );
}
