/**
 * Kırpma hesabı — çerçevede görünen bölge dosyaya birebir yazılmalı; görsel
 * çerçeveyi her zaman doldurmalı (boş kenar kalamaz).
 */
import { describe, expect, it } from "vitest";
import {
  baseScale,
  centeredCrop,
  clampOffset,
  cropRect,
  MAX_ZOOM,
  outputSize,
  zoomAroundCenter,
} from "../image-crop";

describe("image-crop", () => {
  // 2000×1000 yatay görsel, 300×300 kare çerçeve (logo).
  const W = 2000;
  const H = 1000;
  const F = 300;

  it("taban ölçek çerçeveyi kısa kenardan doldurur", () => {
    expect(baseScale(W, H, F, F)).toBeCloseTo(0.3);
  });

  it("başlangıçta görsel ortalanır ve kırpma merkezdeki kareyi alır", () => {
    const c = centeredCrop(W, H, F, F);
    expect(c.zoom).toBe(1);
    expect(c.y).toBe(0);
    const r = cropRect(c, W, H, F, F);
    expect(r.sw).toBeCloseTo(1000);
    expect(r.sh).toBeCloseTo(1000);
    expect(r.sx).toBeCloseTo(500);
    expect(r.sy).toBeCloseTo(0);
  });

  it("sürükleme görseli çerçeve dışına boşluk bırakacak kadar kaydıramaz", () => {
    const c = centeredCrop(W, H, F, F);
    const left = clampOffset({ ...c, x: 500 }, W, H, F, F);
    expect(left.x).toBe(0);
    const right = clampOffset({ ...c, x: -5000 }, W, H, F, F);
    expect(right.x).toBeCloseTo(F - W * 0.3);
    expect(cropRect(right, W, H, F, F).sx).toBeCloseTo(1000);
  });

  it("yakınlaştırma çerçeve merkezini sabit tutar ve sınırlar içinde kalır", () => {
    const c = centeredCrop(W, H, F, F);
    const z = zoomAroundCenter(c, 2, W, H, F, F);
    const r = cropRect(z, W, H, F, F);
    expect(r.sw).toBeCloseTo(500);
    // Merkez hâlâ görselin ortası (1000, 500).
    expect(r.sx + r.sw / 2).toBeCloseTo(1000);
    expect(r.sy + r.sh / 2).toBeCloseTo(500);
    expect(zoomAroundCenter(c, 99, W, H, F, F).zoom).toBe(MAX_ZOOM);
    expect(zoomAroundCenter(c, 0.1, W, H, F, F).zoom).toBe(1);
  });

  it("kapak (4:1) çıktısı oranı korur ve kaynaktan büyük üretmez", () => {
    const frameW = 400;
    const frameH = 100;
    const c = centeredCrop(W, H, frameW, frameH);
    const r = cropRect(c, W, H, frameW, frameH);
    expect(r.sw / r.sh).toBeCloseTo(4);
    const out = outputSize(r, 4, 1600);
    expect(out).toEqual({ w: 1600, h: 400 });
    // Küçük kaynak büyütülmez.
    expect(outputSize({ sw: 800, sh: 200 }, 4, 1600)).toEqual({ w: 800, h: 200 });
    expect(outputSize({ sw: 300, sh: 300 }, 1, 512)).toEqual({ w: 300, h: 300 });
  });
});
