"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import { useRemoveCover, useUploadCover } from "@/hooks/use-supplier-profile";
import axios from "axios";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

interface Props {
  coverImageUrl: string | null;
}

export function CoverImageSection({ coverImageUrl }: Props) {
  const upload = useUploadCover();
  const remove = useRemoveCover();
  const inputRef = useRef<HTMLInputElement>(null);

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
    } finally {
      if (inputRef.current) inputRef.current.value = "";
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
      <div
        className="relative h-40 md:h-48 w-full rounded-xl overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 border border-surface-border"
        aria-hidden
      >
        {coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              // R2 public erişim açık değilse 404 → kullanıcı broken image
              // görmek yerine uyarı görsün.
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
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <ImagePlus className="h-4 w-4" />
          {coverImageUrl ? "Değiştir" : "Kapak Yükle"}
        </Button>
        {coverImageUrl && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRemove}
            disabled={busy}
          >
            <Trash2 className="h-4 w-4" />
            Kaldır
          </Button>
        )}
      </div>
    </PanelCard>
  );
}
