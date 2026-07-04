#!/usr/bin/env python3
"""Export responsive tray images from the hero master PNG."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
MASTER = ASSETS / "pace-tray-modern-master.png"

DIMENSIONS = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}


def fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def save_pair(img: Image.Image, base: Path) -> None:
    img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=88, method=6)


def main() -> None:
    if not MASTER.exists():
        raise SystemExit(f"Missing master: {MASTER}")

    src = Image.open(MASTER).convert("RGB")
    for tag in ("150", "175"):
        for name, size in DIMENSIONS.items():
            save_pair(fit(src, size), ASSETS / f"pace-tray-{tag}kg-{name}")
    save_pair(fit(src, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit(src, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit(src, (1080, 720)), ASSETS / "social-eggs-1080")
    save_pair(fit(src, (540, 360)), ASSETS / "social-eggs-540")
    print("done")


if __name__ == "__main__":
    main()
