"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import {
  docLabels,
  useCompanyDocs,
  useSubmitDocs,
  useUploadDoc,
  type DocKind,
  type VerificationStatus,
} from "@/hooks/use-company-docs";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SettingsShell } from "../_components/settings-shell";

const STATUS_META: Record<
  VerificationStatus,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  UNVERIFIED: { label: "Doğrulanmamış", color: "zinc" },
  PENDING: { label: "Onay bekliyor", color: "amber" },
  VERIFIED: { label: "Doğrulanmış", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

export default function DogrulamaPage() {
  const { data, isLoading } = useCompanyDocs();
  const upload = useUploadDoc();
  const submit = useSubmitDocs();
  const [busyKind, setBusyKind] = useState<DocKind | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFile = async (kind: DocKind, file: File | undefined) => {
    if (!file) return;
    setBusyKind(kind);
    try {
      await upload.mutateAsync({ kind, file });
      toast.success("Belge yüklendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
    } finally {
      setBusyKind(null);
    }
  };

  const handleSubmit = async () => {
    try {
      await submit.mutateAsync();
      toast.success("Belgeler doğrulamaya gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Gönderilemedi"));
    }
  };

  const labels = data ? docLabels(data.country, data.required) : [];
  const allUploaded = data && labels.every((d) => data.docs[d.key]);

  return (
    <SettingsShell
      title="Doğrulama Belgeleri"
      description="Firma doğrulaması için gerekli belgeleri yükleyin. Premium (PAKET) üyelik için doğrulama zorunludur."
    >
      {isLoading || !data ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Text className="text-sm text-zinc-500">Durum:</Text>
            <Badge color={STATUS_META[data.status].color}>
              {STATUS_META[data.status].label}
            </Badge>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-950/10 bg-white">
            <ul className="divide-y divide-zinc-100">
              {labels.map((d) => {
                const url = data.docs[d.key];
                const isBusy = busyKind === d.key;
                return (
                  <li
                    key={d.key}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                      <span className="text-sm text-zinc-900">{d.label}</span>
                      {url ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                          <Check className="h-3.5 w-3.5" /> Yüklendi
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">Eksik</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-blue-600 hover:underline"
                        >
                          Görüntüle
                        </a>
                      ) : null}
                      <Button
                        plain
                        onClick={() => inputs.current[d.key]?.click()}
                        disabled={isBusy || data.status === "VERIFIED"}
                      >
                        <Upload className="h-4 w-4" />
                        {isBusy ? "Yükleniyor…" : url ? "Değiştir" : "Yükle"}
                      </Button>
                      <input
                        ref={(el) => {
                          inputs.current[d.key] = el;
                        }}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          handleFile(d.key, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {data.status !== "VERIFIED" && data.status !== "PENDING" ? (
            <div className="flex items-center justify-between gap-3">
              <Text className="text-xs text-zinc-400">
                Tüm belgeler yüklendiğinde doğrulamaya gönderebilirsiniz.
              </Text>
              <Button
                onClick={handleSubmit}
                disabled={!allUploaded || submit.isPending}
              >
                Doğrulamaya Gönder
              </Button>
            </div>
          ) : data.status === "PENDING" ? (
            <Text className="text-sm text-amber-700">
              Belgeleriniz inceleniyor — sonuç bildirilecektir.
            </Text>
          ) : null}
        </div>
      )}
    </SettingsShell>
  );
}
