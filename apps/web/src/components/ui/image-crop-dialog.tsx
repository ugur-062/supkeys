"use client";

import { Button } from "@/components/catalyst/button";
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from "@/components/catalyst/dialog";
import {
  centeredCrop,
  clampOffset,
  cropRect,
  MAX_ZOOM,
  MIN_ZOOM,
  outputSize,
  renderCrop,
  zoomAroundCenter,
  type CropState,
} from "@/lib/image-crop";
import { cn } from "@/lib/utils";
import { Loader2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * KIRP VE ODAKLA PENCERESİ (2026-09-15, kullanıcı: "eklerken bir önden görsün,
 * kişi ayarlayabilsin nereye odaklanacağını fotoğrafın").
 *
 * Görsel seçilince yüklenmeden ÖNCE açılır. Çerçeve, görselin profilde
 * çizileceği ORANDA (logo 1:1, kapak geniş şerit); kullanıcı sürükleyerek
 * kaydırır, kaydırıcıyla yakınlaştırır. "Kaydet"te çerçevede görünen bölge
 * dosyaya yazılır — önizleme ile yayındaki görsel arasında fark oluşmaz.
 *
 * Erişilebilirlik: çerçeve odaklanabilir; ok tuşları kaydırır, + / − yakınlaştırır.
 * Yeni bağımlılık yok (tuval + pointer olayları).
 */
export function ImageCropDialog({
  file,
  aspect,
  shape = "rect",
  title,
  hint,
  maxEdge,
  onCancel,
  onConfirm,
}: {
  /** Kırpılacak dosya; null iken pencere kapalı. */
  file: File | null;
  /** Genişlik / yükseklik (logo 1, kapak 4). */
  aspect: number;
  /** Logo köşeleri yuvarlak çizilir — profildeki görünümle aynı. */
  shape?: "rect" | "rounded";
  title: string;
  hint?: string;
  maxEdge: number;
  onCancel: () => void;
  /** Kırpılmış dosya. Hata fırlatırsa pencere açık kalır. */
  onConfirm: (cropped: File) => Promise<void>;
}) {
  const t = useTranslations("web.shared.imageCropDialog");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; px: number; py: number; x: number; y: number } | null>(null);

  // Dosya → görsel öğesi (EXIF yönelimi tarayıcıda uygulanır).
  useEffect(() => {
    setImg(null);
    setCrop(null);
    setLoadError(false);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => setImg(el);
    el.onerror = () => setLoadError(true);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Çerçeve boyu kapsayıcı genişliğinden; pencere yeniden boyutlanınca ortalanır.
  useLayoutEffect(() => {
    if (!file) return;
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const maxW = el.clientWidth;
      // Çok uzun kare çerçeve küçük ekranı taşırmasın.
      const w = Math.max(160, Math.min(maxW, aspect <= 1 ? 360 : maxW));
      setFrame((f) => (f && f.w === w ? f : { w, h: Math.round(w / aspect) }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [file, aspect, img]);

  useEffect(() => {
    if (img && frame) setCrop(centeredCrop(img.naturalWidth, img.naturalHeight, frame.w, frame.h));
  }, [img, frame]);

  const ready = !!(img && frame && crop);

  const update = useCallback(
    (next: CropState) => {
      if (!img || !frame) return;
      setCrop(clampOffset(next, img.naturalWidth, img.naturalHeight, frame.w, frame.h));
    },
    [img, frame],
  );

  const setZoom = (z: number) => {
    if (!img || !frame || !crop) return;
    setCrop(zoomAroundCenter(crop, z, img.naturalWidth, img.naturalHeight, frame.w, frame.h));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!crop) return;
    const step = e.shiftKey ? 40 : 10;
    const map: Record<string, () => void> = {
      ArrowLeft: () => update({ ...crop, x: crop.x + step }),
      ArrowRight: () => update({ ...crop, x: crop.x - step }),
      ArrowUp: () => update({ ...crop, y: crop.y + step }),
      ArrowDown: () => update({ ...crop, y: crop.y - step }),
      "+": () => setZoom(crop.zoom + 0.1),
      "=": () => setZoom(crop.zoom + 0.1),
      "-": () => setZoom(crop.zoom - 0.1),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const confirm = async () => {
    if (!img || !frame || !crop || !file) return;
    setBusy(true);
    try {
      const rect = cropRect(crop, img.naturalWidth, img.naturalHeight, frame.w, frame.h);
      const out = await renderCrop(img, rect, outputSize(rect, aspect, maxEdge), file.name);
      await onConfirm(out);
    } catch {
      // Çağıran hatayı zaten bildirir; pencere açık kalır, kullanıcı yeniden dener.
    } finally {
      setBusy(false);
    }
  };

  const scale =
    img && frame && crop
      ? Math.max(frame.w / img.naturalWidth, frame.h / img.naturalHeight) * crop.zoom
      : 1;

  return (
    <Dialog open={!!file} onClose={() => (busy ? undefined : onCancel())} size="xl">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>
        {t("gorseliSurukleyerekBolgeSecin")}
        {hint ? ` ${hint}` : ""}
      </DialogDescription>
      <DialogBody>
        <div ref={wrapRef} className="flex w-full justify-center">
          {loadError ? (
            <p className="py-10 text-sm text-red-700">{t("gorselAcilamadi")}</p>
          ) : (
            <div
              role="img"
              aria-label={t("kirpmaAlani")}
              tabIndex={0}
              onKeyDown={onKey}
              onPointerDown={(e) => {
                if (!crop) return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { id: e.pointerId, px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d || d.id !== e.pointerId || !crop) return;
                update({ ...crop, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) });
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              className={cn(
                "relative touch-none select-none overflow-hidden bg-zinc-100 outline-none ring-1 ring-zinc-950/10 focus-visible:ring-2 focus-visible:ring-blue-500",
                ready ? "cursor-grab active:cursor-grabbing" : "",
                shape === "rounded" ? "rounded-2xl" : "rounded-md",
              )}
              style={frame ? { width: frame.w, height: frame.h } : { width: "100%", aspectRatio: String(aspect) }}
            >
              {img && crop ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0 max-w-none"
                  style={{
                    width: img.naturalWidth * scale,
                    height: img.naturalHeight * scale,
                    transform: `translate(${crop.x}px, ${crop.y}px)`,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-zinc-500" aria-hidden />
                </div>
              )}
              {/* Üçte bir kılavuz çizgileri — odak seçimini kolaylaştırır. */}
              {ready ? (
                <div aria-hidden className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }, (_, i) => (
                    <div key={i} className="border border-white/25" />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mx-auto mt-5 flex max-w-sm items-center gap-3">
          <button
            type="button"
            onClick={() => crop && setZoom(crop.zoom - 0.25)}
            disabled={!ready || (crop?.zoom ?? 1) <= MIN_ZOOM}
            aria-label={t("uzaklastir")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-100 disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            id="image-crop-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop?.zoom ?? 1}
            disabled={!ready}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t("yakinlastirma")}
            className="w-full accent-zinc-900"
          />
          <button
            type="button"
            onClick={() => crop && setZoom(crop.zoom + 0.25)}
            disabled={!ready || (crop?.zoom ?? 1) >= MAX_ZOOM}
            aria-label={t("yakinlastir")}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-100 disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onCancel} disabled={busy}>
          {t("vazgec")}
        </Button>
        <Button onClick={() => void confirm()} disabled={!ready || busy}>
          {busy ? <Loader2 data-slot="icon" className="animate-spin" /> : null}
          {busy ? t("kaydediliyor") : t("kaydet")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
