#!/usr/bin/env python3
"""Orange market family: cohesive hero shots with 1.75kg labels (no compositing)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
VARIANTS = ASSETS / "variants"

# Each variant is a single cohesive photo — colour grades or alternate label layout.
MASTERS: dict[str, Path] = {
    "golden": REFS / "pace-tray-175kg-master-original.png",
    "amber": REFS / "pace-tray-175kg-master-original.png",
    "sunset": REFS / "pace-tray-175kg-master-original.png",
    "market": VARIANTS / "tray-c-orange-market-30-master.png",
}

HERO_SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}

ORDER_SIZES = (400, 320)


def grade(name: str, img: Image.Image) -> Image.Image:
    if name == "golden":
        return img
    if name == "amber":
        out = ImageEnhance.Color(img).enhance(1.14)
        out = ImageEnhance.Brightness(out).enhance(1.04)
        return out
    if name == "sunset":
        out = ImageEnhance.Color(img).enhance(1.22)
        out = ImageEnhance.Contrast(out).enhance(1.06)
        out = ImageEnhance.Brightness(out).enhance(0.96)
        return out
    return img


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
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


def export_variant(name: str, master: Image.Image) -> None:
    graded = grade(name, master)
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(graded, size, (0.5, 0.48)), ASSETS / f"tray-orange-{name}-{tag}")
    for size in ORDER_SIZES:
        save_pair(fit_cover(graded, (size, size), (0.5, 0.46)), ASSETS / f"tray-orange-{name}-order-{size}")


def main() -> None:
    for name, path in MASTERS.items():
        if not path.exists():
            raise SystemExit(f"missing master for {name}: {path}")
        export_variant(name, Image.open(path).convert("RGB"))
        print(f"  tray-orange-{name}-*")

    # Keep legacy pace-tray filenames in sync with the default golden variant.
    golden = grade("golden", Image.open(MASTERS["golden"]).convert("RGB"))
    golden.save(ASSETS / "pace-tray-175kg-master.png", "PNG", optimize=True)
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(golden, size, (0.5, 0.48)), ASSETS / f"pace-tray-175kg-{tag}")

    print("exported orange family (golden, amber, sunset, market) + pace-tray-175kg sync")


if __name__ == "__main__":
    main()
