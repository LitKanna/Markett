#!/usr/bin/env python3
"""Export premium AI hero master to web sizes."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MASTER = ASSETS / "pace-tray-premium-master.png"

HERO_SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, min(int((resized.width - tw) * centering[0]), resized.width - tw))
    top = max(0, min(int((resized.height - th) * centering[1]), resized.height - th))
    return resized.crop((left, top, left + tw, top + th))


def save_pair(img: Image.Image, base: Path) -> None:
    img.save(base.with_suffix(".jpg"), "JPEG", quality=93, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=90, method=6)


def main() -> None:
    src = Image.open(MASTER).convert("RGB")
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(src, size, (0.5, 0.48)), ASSETS / f"tray-orange-premium-{tag}")
    for size in ORDER_SIZES:
        save_pair(fit_cover(src, (size, size), (0.5, 0.46)), ASSETS / f"tray-orange-premium-order-{size}")
    # Legacy sync
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(src, size, (0.5, 0.48)), ASSETS / f"pace-tray-175kg-{tag}")
    print("exported tray-orange-premium-* (cohesive AI hero, correct logo, 1.75kg)")


if __name__ == "__main__":
    main()
