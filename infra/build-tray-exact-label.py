#!/usr/bin/env python3
"""Composite the exact flat Pace Farm retail label onto real 30-egg tray + market scene."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
LABEL_SRC = REFS / "pace-retail-label-user.png"
TRAY_SRC = REFS / "umall-pace-cage-30-150.jpg"
SCENE_SRC = REFS / "pace-tray-175kg-master-original.png"
OUT_MASTER = ASSETS / "pace-retail-exact-master.png"

HERO_SIZES = {
    "3840": (3840, 2560),
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)
PREFIX = "pace-retail-exact"


def load_label() -> Image.Image:
    """Upscale user label art to print resolution."""
    src = Image.open(LABEL_SRC).convert("RGB")
    target_w = 2800
    scale = target_w / src.width
    up = src.resize((target_w, int(src.height * scale)), Image.Resampling.LANCZOS)
    up = ImageEnhance.Sharpness(up).enhance(1.12)
    return up


def remove_old_sleeve(tray: Image.Image) -> Image.Image:
    """Paint out the old vertical wool sleeve so only the new label shows."""
    w, h = tray.size
    out = tray.copy()
    px = out.load()
    # Sample clear plastic tint from beside the sleeve
    samples: list[tuple[int, int, int]] = []
    for x in range(int(w * 0.32), int(w * 0.38)):
        for y in range(int(h * 0.55), int(h * 0.75)):
            samples.append(px[x, y][:3])
    for x in range(int(w * 0.62), int(w * 0.68)):
        for y in range(int(h * 0.55), int(h * 0.75)):
            samples.append(px[x, y][:3])
    bg = tuple(int(sum(c[i] for c in samples) / len(samples)) for i in range(3))
    x0, x1 = int(w * 0.34), int(w * 0.66)
    y0, y1 = int(h * 0.38), int(h * 0.96)
    for y in range(y0, y1):
        for x in range(x0, x1):
            d = ((x + y) % 5) - 2
            px[x, y] = (
                max(0, min(255, bg[0] + d)),
                max(0, min(255, bg[1] + d)),
                max(0, min(255, bg[2] + d)),
            )
    return out


def tray_with_label(label: Image.Image) -> Image.Image:
    """Paste exact label over wholesale tray centre (covers old sleeve)."""
    tray = remove_old_sleeve(Image.open(TRAY_SRC).convert("RGB"))
    tw, th = tray.size
    lw = int(tw * 0.92)
    lh = int(lw * label.height / label.width)
    lbl = label.resize((lw, lh), Image.Resampling.LANCZOS)
    x = (tw - lw) // 2
    y = int(th * 0.42) - lh // 2
    out = tray.copy()
    out.paste(lbl, (x, y))
    return out


def white_to_alpha(img: Image.Image, cutoff: int = 245) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen: set[tuple[int, int]] = set()
    stack = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]

    def is_bg(r: int, g: int, b: int) -> bool:
        return r >= cutoff and g >= cutoff and b >= cutoff

    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= w or y >= h:
            continue
        r, g, b, _ = px[x, y]
        if not is_bg(r, g, b):
            continue
        seen.add((x, y))
        px[x, y] = (255, 255, 255, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
    return img


def crop_tray(img: Image.Image) -> Image.Image:
    px = img.convert("RGB").load()
    w, h = img.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r < 242 or g < 242 or b < 242:
                xs.append(x)
                ys.append(y)
    pad = int(min(w, h) * 0.02)
    return img.crop((max(0, min(xs) - pad), max(0, min(ys) - pad), min(w, max(xs) + pad), min(h, max(ys) + pad)))


def market_bg(width: int, height: int) -> Image.Image:
    scene = Image.open(SCENE_SRC).convert("RGB")
    return ImageOps.fit(scene, (width, height), Image.Resampling.LANCZOS, centering=(0.5, 0.52))


def ground_shadow(size: tuple[int, int], box: tuple[int, int, int, int]) -> Image.Image:
    w, h = size
    x0, y0, x1, y1 = box
    sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(sh)
    cx = (x0 + x1) // 2 + int(w * 0.015)
    cy = y1 - int((y1 - y0) * 0.035)
    rw = int((x1 - x0) * 0.42)
    rh = int((y1 - y0) * 0.075)
    draw.ellipse((cx - rw, cy - rh, cx + rw, cy + rh), fill=(24, 14, 6, 120))
    return sh.filter(ImageFilter.GaussianBlur(max(18, w // 75)))


def compose(width: int = 1536, height: int = 1024) -> Image.Image:
    label = load_label()
    tray_rgb = tray_with_label(label)
    tray = white_to_alpha(crop_tray(tray_rgb))
    tray = ImageEnhance.Color(tray).enhance(1.1)
    tray = ImageEnhance.Contrast(tray).enhance(1.04)
    tray = ImageEnhance.Sharpness(tray).enhance(1.06)

    max_w, max_h = int(width * 0.76), int(height * 0.50)
    scale = min(max_w / tray.width, max_h / tray.height)
    tray = tray.resize((int(tray.width * scale), int(tray.height * scale)), Image.Resampling.LANCZOS)
    tray = tray.rotate(-2.8, resample=Image.Resampling.BICUBIC, expand=True)

    bg = market_bg(width, height).convert("RGBA")
    x = (width - tray.width) // 2
    y = int(height * 0.36)
    box = (x, y, x + tray.width, y + tray.height)
    bg.alpha_composite(ground_shadow((width, height), box))
    bg.alpha_composite(tray, (x, y))

    out = bg.convert("RGB")
    return ImageEnhance.Color(out).enhance(1.05)


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.47)) -> Image.Image:
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
    master = compose()
    master.save(OUT_MASTER, "PNG", optimize=True)

    up = master.resize((3840, 2560), Image.Resampling.LANCZOS)
    up = ImageEnhance.Sharpness(up).enhance(1.06)
    up.save(ASSETS / "pace-retail-exact-4k.png", "PNG", optimize=True)

    for tag, size in HERO_SIZES.items():
        q = 95 if tag == "3840" else 93
        save_pair(fit_cover(up if tag == "3840" else master, size), ASSETS / f"{PREFIX}-{tag}", quality=q)
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.52, 0.45)), ASSETS / f"{PREFIX}-order-{size}")

    save_pair(fit_cover(master, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit_cover(master, (700, 467)), ASSETS / "hero-eggs-700")
    for tag, size in {"1080": (1080, 720), "1400": (1400, 933), "700": (700, 467), "540": (540, 360)}.items():
        save_pair(fit_cover(master, size), ASSETS / f"pace-tray-175kg-{tag}")
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.52, 0.45)), ASSETS / f"tray-order-{size}")

    print(f"exported {PREFIX}-* using exact label file {LABEL_SRC.name}")


if __name__ == "__main__":
    main()
