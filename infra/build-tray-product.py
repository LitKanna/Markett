#!/usr/bin/env python3
"""Clean product shots: real wholesale tray on warm cream — no compositing hacks."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SRC = ASSETS / "references" / "wool-701985-alt.jpg"

SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}


def warm_canvas(w: int, h: int) -> Image.Image:
    base = Image.new("RGB", (w, h), (253, 248, 239))
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((int(w * 0.55), -int(h * 0.2), int(w * 1.15), int(h * 0.55)), fill=(246, 181, 43, 38))
    draw.ellipse((-int(w * 0.2), int(h * 0.45), int(w * 0.45), int(h * 1.1)), fill=(217, 122, 41, 22))
    return Image.alpha_composite(base.convert("RGBA"), glow).convert("RGB")


def fit_tray(src: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    canvas = warm_canvas(tw, th)
    pad = int(min(tw, th) * 0.07)
    max_w, max_h = tw - pad * 2, th - pad * 2
    scale = min(max_w / src.width, max_h / src.height)
    resized = src.resize((int(src.width * scale), int(src.height * scale)), Image.Resampling.LANCZOS)
    x = (tw - resized.width) // 2
    y = (th - resized.height) // 2
    canvas.paste(resized, (x, y))
    return canvas


def save_pair(img: Image.Image, base: Path) -> None:
    img.save(base.with_suffix(".jpg"), "JPEG", quality=91, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=86, method=6)


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    for name, size in SIZES.items():
        save_pair(fit_tray(src, size), ASSETS / f"tray-product-{name}")
    print("exported tray-product-* (real wholesale photo, no composite)")


if __name__ == "__main__":
    main()
