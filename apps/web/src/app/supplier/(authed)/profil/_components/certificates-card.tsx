"use client";

import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { Dropzone } from "@/components/ui/dropzone";
import { IconButton } from "@/components/ui/icon-button";
import {
  useDeleteCertificate,
  useSupplierCertificates,
  useUploadCertificate,
} from "@/hooks/use-supplier-certificates";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const MAX_BYTES = 10 * 1024 * 1024;

export function CertificatesCard() {
  const { data: certs, isLoading } = useSupplierCertificates();
  const uploadM = useUploadCertificate();
  const deleteM = useDeleteCertificate();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  const reset = () => {
    setName("");
    setFile(null);
    setAdding(false);
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error("Dosya en fazla 10MB olabilir");
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
  };

  const upload = async () => {
    if (!file || name.trim().length < 1) {
      toast.error("Belge adı ve dosya gerekli");
      return;
    }
    try {
      await uploadM.mutateAsync({ file, name: name.trim() });
      toast.success("Belge yüklendi");
      reset();
    } catch {
      toast.error("Yüklenemedi");
    }
  };

  const remove = async (id: string, n: string) => {
    if (!confirm(`"${n}" silinsin mi?`)) return;
    try {
      await deleteM.mutateAsync(id);
      toast.success("Belge silindi");
    } catch {
      toast.error("Silinemedi");
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Subheading>Sertifikalarım / Belgeler</Subheading>
          <Text className="mt-1">
            ISO vb. belgeleriniz herkese açık profilinizde görünür.
          </Text>
        </div>
        {!adding ? (
          <Button outline onClick={() => setAdding(true)}>
            <Upload data-slot="icon" /> Belge Ekle
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <p className="text-sm text-slate-500 py-4">Yükleniyor…</p>
      ) : (certs?.length ?? 0) === 0 && !adding ? (
        <p className="text-sm text-slate-500 py-4 text-center">
          Henüz belge yok. “Belge Ekle” ile ISO/sertifikalarınızı yükleyin.
        </p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {certs?.map((c) => (
            <li
              key={c.id}
              className="py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-sm text-zinc-950 truncate">{c.name}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.url ? (
                  <IconButton
                    aria-label="Aç"
                    onClick={() =>
                      c.url &&
                      window.open(c.url, "_blank", "noopener,noreferrer")
                    }
                  >
                    <ExternalLink className="h-4 w-4" />
                  </IconButton>
                ) : null}
                <IconButton
                  tone="danger"
                  onClick={() => remove(c.id, c.name)}
                  aria-label="Sil"
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="rounded-xl border border-surface-border bg-surface-subtle/40 p-4 space-y-3">
          <Field>
            <Label>Belge Adı *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="örn. ISO 9001:2015"
            />
          </Field>
          <Field>
            <Label>Dosya *</Label>
            <Dropzone
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onFiles={(files) => pickFile(files[0] ?? null)}
              label={file ? "Dosyayı değiştir" : "Dosya seç"}
              hint={file ? file.name : "PDF, JPG, PNG, WebP · maks. 10MB"}
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button plain onClick={reset}>
              Vazgeç
            </Button>
            <Button onClick={upload} disabled={uploadM.isPending}>
              Yükle
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
