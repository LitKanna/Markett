#!/usr/bin/env python3
"""Rebuild tray hero/order images using authentic 30-egg retail photos."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"

# Authentic retail shots: 6×5 grid = 30 eggs, correct Pace Farm tray shape.
TRAY_SOURCES = {
    "150": REFS / "wool-caged-701985.jpg",
    "175": REFS / "wool-caged-701985.jpg",
}

MARKET_BG = ASSETS / "pace-tray-175kg-master.png"

SIZES = {
    "1400": 1400,
    "1080": 1080,
    "700": 700,
    "540": 540,
}


def remove_white_bg(img: Image.Image, threshold: int = 246) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)
    return img


def market_background(width: int, height: int) -> Image.Image:
    src = Image.open(MARKET_BG).convert("RGB")
    # Use only the upper market-stall area so the blurred bg has no ghost tray.
    crop = src.crop((0, 0, src.width, int(src.height * 0.55)))
    bg = ImageOps.fit(crop, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.2))
    bg = bg.filter(ImageFilter.GaussianBlur(radius=max(5, width // 120)))
    bg = ImageEnhance.Color(bg).enhance(1.15)
    bg = ImageEnhance.Brightness(bg).enhance(0.88)
    return bg


def drop_shadow(tray: Image.Image, blur: int = 18, offset: tuple[int, int] = (0, 14)) -> Image.Image:
    alpha = tray.split()[3]
    shadow = Image.new("RGBA", tray.size, (20, 12, 4, 0))
    shadow.putalpha(alpha)
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas = Image.new("RGBA", tray.size, (0, 0, 0, 0))
    ox, oy = offset
    canvas.alpha_composite(shadow, (ox, oy))
    canvas.alpha_composite(tray, (0, 0))
    return canvas


def compose_tray(width: int, height: int, tray_src: Path) -> Image.Image:
    bg = market_background(width, height)
    canvas = bg.convert("RGBA")

    tray = remove_white_bg(Image.open(tray_src))
    tray_w = int(width * 0.82)
    tray = ImageOps.contain(tray, (tray_w, int(height * 0.72)), method=Image.Resampling.LANCZOS)
    tray = ImageEnhance.Sharpness(tray).enhance(1.08)
    tray = ImageEnhance.Color(tray).enhance(1.06)
    tray = drop_shadow(tray, blur=max(10, width // 90))

    x = (width - tray.width) // 2
    y = int(height * 0.18)
    canvas.alpha_composite(tray, (x, y))
    return canvas.convert("RGB")


def save_jpg_webp(img: Image.Image, base: Path) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=88, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=84, method=6)


def main() -> None:
    for tag, src in TRAY_SOURCES.items():
        if not src.exists():
            raise SystemExit(f"Missing tray source: {src}")

        for name, long_edge in SIZES.items():
            w, h = (long_edge, int(long_edge * 2 / 3)) if long_edge >= 700 else (long_edge, int(long_edge * 2 / 3))
            if name == "540":
                w, h = 540, 360
            elif name == "700":
                w, h = 700, 467
            elif name == "1080":
                w, h = 1080, 720
            elif name == "1400":
                w, h = 1400, 933

            img = compose_tray(w, h, src)
            out = ASSETS / f"pace-tray-{tag}kg-{name}"
            save_jpg_webp(img, out)
            print(f"wrote {out.name}.jpg / .webp ({w}x{h})")

    # Shared social / OG sizes from 1.75kg 1080
    hero = compose_tray(1400, 933, TRAY_SOURCES["175"])
    save_jpg_webp(hero, ASSETS / "hero-eggs-1400")
    save_jpg_webp(ImageOps.fit(hero, (700, 467), method=Image.Resampling.LANCZOS), ASSETS / "hero-eggs-700")

    social = compose_tray(1080, 720, TRAY_SOURCES["175"])
    save_jpg_webp(social, ASSETS / "social-eggs-1080")
    save_jpg_webp(ImageOps.fit(social, (540, 360), method=Image.Resampling.LANCZOS), ASSETS / "social-eggs-540")

    print("done")


if __name__ == "__main__":
    main()
