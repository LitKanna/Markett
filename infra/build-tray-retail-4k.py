#!/usr/bin/env python3
"""Export 4K retail-label hero (pace-retail-*) from master PNG."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MASTER_IN = ASSETS / "pace-retail-label-hero-4k-master.png"
MASTER_4K = ASSETS / "pace-retail-label-hero-4k.png"

HERO_SIZES = {
    "3840": (3840, 2560),
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)
PREFIX = "pace-retail-hero"


def upscale_4k(src: Image.Image) -> Image.Image:
    target = (3840, 2560)
    if src.size == target:
        return src
    up = src.resize(target, Image.Resampling.LANCZOS)
    up = ImageEnhance.Sharpness(up).enhance(1.08)
    up = ImageEnhance.Contrast(up).enhance(1.02)
    return up


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.48)) -> Image.Image:
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, min(int((resized.width - tw) * centering[0]), resized.width - tw))
    top = max(0, min(int((resized.height - th) * centering[1]), resized.height - th))
    return resized.crop((left, top, left + tw, top + th))


def save_pair(img: Image.Image, base: Path, quality: int = 93) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=quality, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=min(92, quality - 2), method=6)


def main() -> None:
    src = Image.open(MASTER_IN).convert("RGB")
    master = upscale_4k(src)
    master.save(MASTER_4K, "PNG", optimize=True)

    for tag, size in HERO_SIZES.items():
        q = 95 if tag == "3840" else 93
        save_pair(fit_cover(master, size), ASSETS / f"{PREFIX}-{tag}", quality=q)
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.52, 0.46)), ASSETS / f"{PREFIX}-order-{size}")

    # Site aliases
    save_pair(fit_cover(master, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit_cover(master, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit_cover(master, (1080, 720)), ASSETS / "pace-tray-175kg-1080")
    save_pair(fit_cover(master, (1400, 933)), ASSETS / "pace-tray-175kg-1400")
    save_pair(fit_cover(master, (700, 467)), ASSETS / "pace-tray-175kg-700")
    save_pair(fit_cover(master, (540, 360)), ASSETS / "pace-tray-175kg-540")
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.52, 0.46)), ASSETS / f"tray-order-{size}")

    print(f"exported {PREFIX}-* up to 3840×2560 + hero-eggs / pace-tray sync")


if __name__ == "__main__":
    main()
