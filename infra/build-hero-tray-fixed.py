#!/usr/bin/env python3
"""Fix hero tray: real 6×5 (30 egg) grid on orange market reference scene."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REF = ASSETS / "references" / "wool-701985-alt.jpg"
SCENE = ASSETS / "pace-tray-175kg-master.png"

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
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=88, method=6)


def white_to_alpha(img: Image.Image, cutoff: int = 228) -> Image.Image:
    """Remove white background via corner flood-fill, then tighten alpha edges."""
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
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b):
            continue
        seen.add((x, y))
        px[x, y] = (255, 255, 255, 0)
        stack.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    # Erode alpha slightly to drop white fringe after rotation/compositing
    alpha = img.split()[3]
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    img.putalpha(alpha)
    return img


def market_background(scene: Image.Image) -> Image.Image:
    """Build warm market backdrop without the AI tray ghost."""
    w, h = scene.size
    rgb = scene.convert("RGB")

    # Sample table tones from lower corners (outside the AI tray)
    samples = [
        rgb.getpixel((int(w * 0.08), int(h * 0.88))),
        rgb.getpixel((int(w * 0.92), int(h * 0.88))),
        rgb.getpixel((int(w * 0.15), int(h * 0.72))),
        rgb.getpixel((int(w * 0.85), int(h * 0.72))),
    ]
    table = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))

    bg = rgb.copy()
    draw = ImageDraw.Draw(bg)
    # Paint over the AI tray region before blur so egg ghosts disappear
    draw.rounded_rectangle(
        (int(w * 0.12), int(h * 0.22), int(w * 0.88), int(h * 0.92)),
        radius=40,
        fill=table,
    )
    bg = bg.filter(ImageFilter.GaussianBlur(24))
    bg = ImageEnhance.Color(bg).enhance(1.14)
    bg = ImageEnhance.Brightness(bg).enhance(1.02)
    return bg


def build_master() -> Image.Image:
    scene = Image.open(SCENE).convert("RGBA")
    tray = white_to_alpha(Image.open(REF).convert("RGBA"))
    w, h = scene.size

    canvas = market_background(scene).convert("RGBA")

    # Soft table shadow
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((w * 0.20, h * 0.64, w * 0.80, h * 0.90), fill=(25, 12, 0, 95))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas = Image.alpha_composite(canvas, shadow)

    # Real 30-egg tray (6×5) — slight tilt only
    tw = int(w * 0.60)
    th = int(tray.height * (tw / tray.width))
    tray_r = tray.resize((tw, th), Image.Resampling.LANCZOS).convert("RGBA")
    tray_r = tray_r.rotate(-3, expand=True, resample=Image.Resampling.BICUBIC)

    tx = (w - tray_r.width) // 2
    ty = int(h * 0.31)
    canvas.paste(tray_r, (tx, ty), tray_r)

    # Orange reference label — fully opaque, hides retail sticker
    label = scene.crop((465, 345, 1070, 695)).convert("RGBA")
    label_rgb = Image.new("RGBA", label.size, (255, 255, 255, 255))
    label = Image.alpha_composite(label_rgb, label)
    lx = (w - label.width) // 2
    ly = ty + int(th * 0.40) - label.height // 2 + 8
    canvas.paste(label, (lx, ly), label)

    rgb = canvas.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.05)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.03)
    return rgb


def export_all(master: Image.Image) -> None:
    master.save(ASSETS / "pace-tray-175kg-fixed-master.jpg", "JPEG", quality=94)
    for tag in ("150", "175"):
        for name, size in DIMENSIONS.items():
            save_pair(fit(master, size), ASSETS / f"pace-tray-{tag}kg-{name}")
    save_pair(fit(master, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit(master, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit(master, (1080, 720)), ASSETS / "social-eggs-1080")
    save_pair(fit(master, (540, 360)), ASSETS / "social-eggs-540")
    print("exported pace-tray-175kg-* with fixed 6×5 egg grid")


if __name__ == "__main__":
    export_all(build_master())
