#!/usr/bin/env python3
"""Composite real 30-egg Pace Farm tray onto warm orange market background."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"

SIZES = {"1400": 1400, "1080": 1080, "700": 700, "540": 540}


def build() -> None:
    scene = Image.open(ASSETS / "pace-tray-175kg-master.png").convert("RGB")
    tray = Image.open(ASSETS / "references/wool-701985-alt.jpg").convert("RGBA")

    w, h = 1536, 1024
    canvas = scene.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(14))

    draw = ImageDraw.Draw(canvas)
    for i in range(280):
        alpha = i / 280 * 0.22
        y = h - 280 + i
        draw.line([(0, y), (w, y)], fill=(int(30 * alpha), int(18 * alpha), int(8 * alpha)))

    tw = int(w * 0.58)
    th = int(tray.height * (tw / tray.width))
    tray_r = tray.resize((tw, th), Image.LANCZOS)

    shadow = Image.new("RGBA", (tw + 100, th + 90), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((30, th - 10, tw + 50, th + 65), fill=(15, 8, 0, 130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))

    x = (w - tw) // 2
    y = int(h * 0.36)
    out = canvas.convert("RGBA")
    out.alpha_composite(shadow, (x - 50, y - 5))
    out.alpha_composite(tray_r, (x, y))
    rgb = out.convert("RGB")

    rgb = ImageEnhance.Color(rgb).enhance(1.15)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)

    rgb.save(ASSETS / "hero-orange-tray-master.jpg", "JPEG", quality=94)
    for name, width in SIZES.items():
        height = int(rgb.height * width / rgb.width)
        img = rgb.resize((width, height), Image.LANCZOS)
        base = ASSETS / f"hero-orange-tray-{name}"
        img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True)
        img.save(base.with_suffix(".webp"), "WEBP", quality=86, method=6)

    print("exported hero-orange-tray-* from real 30-egg tray + orange market scene")


if __name__ == "__main__":
    build()
