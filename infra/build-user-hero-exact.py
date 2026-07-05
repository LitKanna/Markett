#!/usr/bin/env python3
"""Export hero assets from the user's exact product photo — no compositing or AI."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
SRC = REFS / "pace-user-hero-exact.jpg"
MASTER = ASSETS / "pace-user-hero-exact-master.jpg"

HERO_SIZES = {
    "3840": (3840, 2560),
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)
PREFIX = "pace-user-hero"


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
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
    if not SRC.exists():
        raise SystemExit(f"Missing source photo: {SRC}")

    src = Image.open(SRC).convert("RGB")
    src.save(MASTER, "JPEG", quality=96, optimize=True, progressive=True)

    for tag, size in HERO_SIZES.items():
        q = 95 if tag == "3840" else 93
        save_pair(fit_cover(src, size), ASSETS / f"{PREFIX}-{tag}", quality=q)
    for size in ORDER_SIZES:
        save_pair(fit_cover(src, (size, size)), ASSETS / f"{PREFIX}-order-{size}")

    save_pair(fit_cover(src, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit_cover(src, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit_cover(src, (1080, 720)), ASSETS / "social-eggs-1080")
    save_pair(fit_cover(src, (540, 360)), ASSETS / "social-eggs-540")
    for size in ORDER_SIZES:
        save_pair(fit_cover(src, (size, size)), ASSETS / f"tray-order-{size}")

    print(f"exported {PREFIX}-* from {SRC.name} ({src.width}×{src.height}) — no compositing")


if __name__ == "__main__":
    main()
