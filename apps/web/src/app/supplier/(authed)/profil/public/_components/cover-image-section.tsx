"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/ui/dropzone";
import { useRemoveCover, useUploadCover } from "@/hooks/use-supplier-profile";
import axios from "axios";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

interface Props {
  coverImageUrl: string | null;
}

export function CoverImageSection({ coverImageUrl }: Props) {
  const upload = useUploadCover();
  const remove = useRemoveCover();

  const onFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Sadece JPEG / PNG / WebP yükleyebilirsiniz");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Dosya 5MB'dan büyük olamaz");
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast.success("Kapak güncellendi");
    } catch (err) {
      const raw = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : (err as Error)?.message;
      const msg = Array.isArray(raw)
        ? raw.join(", ")
        : (raw ?? "Yükleme başarısız");
      toast.error(msg);
    }
  };

  const onRemove = async () => {
    if (!window.confirm("Kapak görselini kaldırmak istediğinize emin misiniz?"))
      return;
    try {
      await remove.mutateAsync();
      toast.success("Kapak kaldırıldı");
    } catch {
      toast.error("Kaldırma başarısız");
    }
  };

  const busy = upload.isPending || remove.isPending;

  return (
    <PanelCard
      title="Kapak Görseli"
      subtitle="JPEG / PNG / WebP, maks. 5MB · önerilen oran 16:9"
    >
      {coverImageUrl ? (
        <>
          <div className="relative h-40 w-full overflow-hidden rounded-xl border border-surface-border bg-gradient-to-br from-zinc-500 via-zinc-600 to-zinc-800 md:h-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
                const parent = img.parentElement;
                if (parent && !parent.querySelector("[data-broken]")) {
                  const div = document.createElement("div");
                  div.setAttribute("data-broken", "true");
                  div.className =
                    "absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-amber-50 text-amber-800";
                  div.innerHTML =
                    '<p class="text-sm font-semibold">Kapak yüklenemedi</p><p class="text-xs mt-1">R2 bucket public erişim aktif değil — Cloudflare panelden "Allow Access" tıkla.</p>';
                  parent.appendChild(div);
                }
              }}
            />
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Dropzone
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onFiles={(files) => files[0] && onFile(files[0])}
              label="Kapağı değiştir"
              hint="JPEG / PNG / WebP · maks. 5MB"
              className="flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onRemove}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" />
              Kaldır
            </Button>
          </div>
        </>
      ) : (
        <Dropzone
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onFiles={(files) => files[0] && onFile(files[0])}
          label={busy ? "Yükleniyor…" : "Kapak yükle"}
          hint="JPEG / PNG / WebP · maks. 5MB · önerilen oran 16:9"
        />
      )}
    </PanelCard>
  );
}
