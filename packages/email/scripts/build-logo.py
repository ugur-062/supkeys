#!/usr/bin/env python3
"""E-posta logosunu üretir: src/assets/logo.ts (base64, inline CID eki).

Neden beyaz zeminli? E-posta istemcileri dark mode'da arka planı koyulaştırır
ama GÖRSELLERE dokunmaz; şeffaf zeminli siyah logo koyu zeminde kaybolur.
CSS `filter`/`prefers-color-scheme` çözümü Gmail (özellikle iOS/Android
uygulaması) ve Outlook'ta çalışmaz. Tek güvenilir yol: beyaz yuvarlatılmış
zemini PNG'nin İÇİNE gömmek — açık temada zemin (#FAFAFA) ile neredeyse
kaynaşır, koyu temada logo beyaz kart üzerinde okunur.

Kullanım (repo kökünden):  python3 packages/email/scripts/build-logo.py
Gerekli: Pillow (pip install pillow)
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "apps/web/public/rothern-logo-trans.png"  # siyah, şeffaf zemin
OUT = ROOT / "packages/email/src/assets/logo.ts"

PAD_X, PAD_Y, RADIUS = 48, 30, 44  # kaynak 774×226 için (3× görüntü ölçeği)


def main() -> None:
    logo = Image.open(SRC).convert("RGBA")
    w, h = logo.size
    W, H = w + 2 * PAD_X, h + 2 * PAD_Y

    # Beyaz yuvarlatılmış zemin (alpha maskesiyle; köşeler şeffaf kalır).
    canvas = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), RADIUS, fill=255)
    white = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    canvas.paste(white, (0, 0), mask)
    canvas.alpha_composite(logo, (PAD_X, PAD_Y))

    buf = io.BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    OUT.write_text(
        "// AUTO-GENERATED — packages/email/scripts/build-logo.py; elle düzenleme.\n"
        "// Siyah logo, BEYAZ yuvarlatılmış zeminli PNG (dark mode'da da okunsun\n"
        "// diye zemin görsele gömülü — istemciler görseli ters çevirmez).\n"
        f"// Kaynak: apps/web/public/{SRC.name} · boyut {W}×{H}\n"
        'export const LOGO_CID = "rothern-logo";\n'
        'export const LOGO_FILENAME = "rothern-logo.png";\n'
        f"export const LOGO_WIDTH = {W};\n"
        f"export const LOGO_HEIGHT = {H};\n"
        f'export const ROTHERN_LOGO_BASE64 =\n  "{b64}";\n',
        encoding="utf-8",
    )
    print(f"yazıldı: {OUT.relative_to(ROOT)} ({W}×{H}, {len(b64) // 1024} KB base64)")


if __name__ == "__main__":
    main()
