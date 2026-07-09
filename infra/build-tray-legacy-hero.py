#!/usr/bin/env python3
"""Legacy orange market hero: patch 1.75kg label + remove barcode strip, export web sizes."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
SRC = REFS / "pace-tray-175kg-master-original.png"
OUT_MASTER = ASSETS / "pace-tray-175kg-master.png"

HERO_SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)


def sample_white(img: Image.Image, x0: int, x1: int, y0: int, y1: int) -> tuple[int, int, int]:
    px = img.convert("RGB").load()
    w, h = img.size
    pts: list[tuple[int, int, int]] = []
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            r, g, b = px[x, y]
            if r > 210 and g > 208 and b > 200:
                pts.append((r, g, b))
    if not pts:
        return (248, 246, 242)
    return tuple(int(sum(p[i] for p in pts) / len(pts)) for i in range(3))


def noise_fill(size: tuple[int, int], bg: tuple[int, int, int], seed: int = 11) -> Image.Image:
    patch = Image.new("RGB", size, bg)
    px = patch.load()
    r0, g0, b0 = bg
    random.seed(seed)
    for y in range(size[1]):
        for x in range(size[0]):
            d = random.randint(-2, 2)
            px[x, y] = (
                max(0, min(255, r0 + d)),
                max(0, min(255, g0 + d)),
                max(0, min(255, b0 + d)),
            )
    return patch


def paste_patch(img: Image.Image, box: tuple[int, int, int, int], bg: tuple[int, int, int]) -> None:
    x0, y0, x1, y1 = box
    pw, ph = x1 - x0, y1 - y0
    patch = noise_fill((pw, ph), bg)
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw, ph), radius=5, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2))
    img.paste(patch, (x0, y0), mask)


def patch_weight_175(img: Image.Image) -> Image.Image:
    """Leave weight untouched — master already reads 1.75kg."""
    return img


def remove_bottom_strip(img: Image.Image) -> Image.Image:
    """Remove the barcode box at the foot of the label (keep 1.75kg + MIN NET WEIGHT)."""
    w, h = img.size
    x0, x1 = int(w * 0.395), int(w * 0.605)
    y0, y1 = int(h * 0.748), int(h * 0.782)
    bg = sample_white(img, x0, x1, int(h * 0.718), int(h * 0.744))
    out = img.copy()
    paste_patch(out, (x0, y0, x1, y1), bg)
    return out


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.48)) -> Image.Image:
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, min(int((resized.width - tw) * centering[0]), resized.width - tw))
    top = max(0, min(int((resized.height - th) * centering[1]), resized.height - th))
    return resized.crop((left, top, left + tw, top + th))


def save_pair(img: Image.Image, base: Path) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=88, method=6)


def build_master() -> Image.Image:
    src = Image.open(SRC).convert("RGB")
    out = patch_weight_175(src)
    out = remove_bottom_strip(out)
    return out


def export_all(master: Image.Image) -> None:
    master.save(OUT_MASTER, "PNG", optimize=True)
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(master, size), ASSETS / f"pace-tray-175kg-{tag}")
        save_pair(fit_cover(master, size), ASSETS / "variants" / f"tray-orange-legacy-{tag}")
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.5, 0.46)), ASSETS / f"tray-order-{size}")
        save_pair(fit_cover(master, (size, size), (0.5, 0.46)), ASSETS / f"tray-orange-golden-order-{size}")
    save_pair(fit_cover(master, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit_cover(master, (700, 467)), ASSETS / "hero-eggs-700")
    print("exported pace-tray-175kg-* + tray-orange-legacy-* (label patched, barcode removed)")


if __name__ == "__main__":
    export_all(build_master())
