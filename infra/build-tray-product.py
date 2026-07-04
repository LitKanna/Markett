#!/usr/bin/env python3
"""Clean product shots: real wholesale tray on warm cream — label patched to 1.75kg."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SRC = ASSETS / "references" / "wool-701985-alt.jpg"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}

# Square crops for inline thumbnails (landscape hero assets letterbox the tray)
ORDER_SIZES = (320, 400)


def sample_label_white(img: Image.Image, y0: int, y1: int) -> tuple[int, int, int]:
    w, _ = img.size
    pts: list[tuple[int, int, int]] = []
    for x in range(int(w * 0.40), int(w * 0.62)):
        for y in range(y0 - 12, y1 + 12):
            if y < 0:
                continue
            r, g, b = img.getpixel((x, y))
            if r > 200 and g > 198 and b > 193 and abs(r - g) < 8:
                pts.append((r, g, b))
    if not pts:
        return (248, 246, 242)
    return tuple(int(sum(p[i] for p in pts) / len(pts)) for i in range(3))


def patch_label_175kg(img: Image.Image) -> Image.Image:
    """Replace min 1.5kg with min 1.75kg on the wholesale label."""
    w, h = img.size
    px0 = int(w * 0.518)
    px1 = int(w * 0.638)
    py0 = int(h * 0.792)
    py1 = int(h * 0.836)
    pw, ph = px1 - px0, py1 - py0

    bg = sample_label_white(img, py0, py1)
    patch = Image.new("RGB", (pw, ph), bg)
    px = patch.load()
    r0, g0, b0 = bg
    random.seed(11)
    for y in range(ph):
        for x in range(pw):
            d = random.randint(-2, 2)
            px[x, y] = (
                max(0, min(255, r0 + d)),
                max(0, min(255, g0 + d)),
                max(0, min(255, b0 + d)),
            )

    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw, ph), radius=4, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2))

    out = img.copy()
    out.paste(patch, (px0, py0), mask)

    draw = ImageDraw.Draw(out)
    size = max(12, int(w * 0.0182))
    font = ImageFont.truetype(FONT, size)
    text = "min 1.75kg"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = px1 - tw - int(w * 0.005)
    ty = py0 + (ph - th) // 2
    draw.text((tx, ty), text, fill=(48, 48, 48), font=font)
    return out


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


def fit_tray_square(src: Image.Image, size: int) -> Image.Image:
    canvas = warm_canvas(size, size)
    pad = int(size * 0.04)
    max_dim = size - pad * 2
    scale = max_dim / max(src.width, src.height)
    resized = src.resize((int(src.width * scale), int(src.height * scale)), Image.Resampling.LANCZOS)
    x = (size - resized.width) // 2
    y = (size - resized.height) // 2
    canvas.paste(resized, (x, y))
    return canvas


def save_pair(img: Image.Image, base: Path) -> None:
    img.save(base.with_suffix(".jpg"), "JPEG", quality=91, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=86, method=6)


def main() -> None:
    src = patch_label_175kg(Image.open(SRC).convert("RGB"))
    for name, size in SIZES.items():
        save_pair(fit_tray(src, size), ASSETS / f"tray-product-{name}")
    for size in ORDER_SIZES:
        save_pair(fit_tray_square(src, size), ASSETS / f"tray-order-{size}")
    print("exported tray-product-* and tray-order-* (real wholesale photo, 1.75kg label)")


if __name__ == "__main__":
    main()
