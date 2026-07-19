#!/usr/bin/env python3
"""Export tray hero sizes from a variant master image."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
VARIANTS = ASSETS / "variants"

MASTERS = {
    "a": VARIANTS / "tray-a-real30-market-master.jpg",
    "b": VARIANTS / "tray-b-orange-gen-master.png",
    "c": VARIANTS / "tray-c-orange-market-30-master.png",
    "orange": ASSETS / "pace-tray-175kg-master.png",
}

DIMENSIONS = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}


def fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    scale = min(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (tw, th), (253, 248, 239))
    x = (tw - resized.width) // 2
    y = (th - resized.height) // 2
    canvas.paste(resized, (x, y))
    return canvas


def save_pair(img: Image.Image, base: Path) -> None:
    img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=88, method=6)


def export_live(src: Image.Image) -> None:
    for tag in ("150", "175"):
        for name, size in DIMENSIONS.items():
            save_pair(fit(src, size), ASSETS / f"pace-tray-{tag}kg-{name}")
    save_pair(fit(src, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit(src, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit(src, (1080, 720)), ASSETS / "social-eggs-1080")
    save_pair(fit(src, (540, 360)), ASSETS / "social-eggs-540")


def main() -> None:
    key = (sys.argv[1] if len(sys.argv) > 1 else "c").lower()
    master = MASTERS.get(key)
    if not master or not master.exists():
        raise SystemExit(f"Unknown or missing variant master: {key}")

    src = Image.open(master).convert("RGB")
    export_live(src)

    # Also refresh variant preview sizes for the chosen key
    prefix = {"a": "tray-a-real30-market", "b": "tray-b-orange-gen", "c": "tray-c-orange-market-30", "orange": "tray-orange-legacy"}[key]
    for name, size in DIMENSIONS.items():
        save_pair(fit(src, size), VARIANTS / f"{prefix}-{name}")

    ASSETS.joinpath("pace-tray-modern-master.png").write_bytes(
        master.read_bytes() if master.suffix == ".png" else b""
    ) if master.suffix == ".png" else None

    print(f"exported live site images from variant {key} ({master.name})")


if __name__ == "__main__":
    main()
# REMOVED: pace-tray-175kg market-shelf assets were deleted (do not regenerate).
raise SystemExit("pace-tray-175kg market-shelf image was deleted — do not regenerate it")

