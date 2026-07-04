#!/usr/bin/env python3
"""Fix hero tray: real 6×5 (30 egg) grid on orange market reference scene."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REF = ASSETS / "references" / "wool-701985-alt.jpg"
SCENE = ASSETS / "pace-tray-175kg-master.png"

TRAY_CROP = (8, 102, 1192, 1094)
COLS, ROWS = 6, 5

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

    return img


def build_tray_grid() -> Image.Image:
    """Reassemble wholesale photo as an exact 6×5 grid (6 cols, 5 rows)."""
    src = Image.open(REF).convert("RGBA").crop(TRAY_CROP)
    w, h = src.size
    cw, rh = w / COLS, h / ROWS

    grid = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            x0, y0 = int(col * cw), int(row * rh)
            x1, y1 = int((col + 1) * cw), int((row + 1) * rh)
            grid.paste(src.crop((x0, y0, x1, y1)), (x0, y0))

    def cell(row: int, col: int) -> Image.Image:
        x0, y0 = int(col * cw), int(row * rh)
        x1, y1 = int((col + 1) * cw), int((row + 1) * rh)
        return grid.crop((x0, y0, x1, y1))

    def paste_cell(row: int, col: int, patch: Image.Image) -> None:
        grid.paste(patch, (int(col * cw), int(row * rh)))

    # Replace retail-sticker cells with real egg cells so every row reads 6 across
    for row in range(1, ROWS):
        for col in range(1, 4):
            paste_cell(row, col, cell(0, col))

    # Soften cloned centre (will sit under orange label)
    lx0, lx1 = int(1.8 * cw), int(4.2 * cw)
    ly0, ly1 = int(0.9 * rh), int(4.2 * rh)
    patch = grid.crop((lx0, ly0, lx1, ly1)).filter(ImageFilter.GaussianBlur(6))
    grid.paste(patch, (lx0, ly0))

    return white_to_alpha(grid)


def market_background(scene: Image.Image) -> Image.Image:
    w, h = scene.size
    rgb = scene.convert("RGB")

    samples = [
        rgb.getpixel((int(w * 0.08), int(h * 0.88))),
        rgb.getpixel((int(w * 0.92), int(h * 0.88))),
        rgb.getpixel((int(w * 0.15), int(h * 0.72))),
        rgb.getpixel((int(w * 0.85), int(h * 0.72))),
    ]
    table = tuple(sum(c[i] for c in samples) // len(samples) for i in range(3))

    bg = rgb.copy()
    draw = ImageDraw.Draw(bg)
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
    tray = build_tray_grid()
    w, h = scene.size

    canvas = market_background(scene).convert("RGBA")

    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((w * 0.20, h * 0.66, w * 0.80, h * 0.92), fill=(25, 12, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    canvas = Image.alpha_composite(canvas, shadow)

    tw = int(w * 0.58)
    th = int(tray.height * (tw / tray.width))
    tray_r = tray.resize((tw, th), Image.Resampling.LANCZOS)

    tx = (w - tw) // 2
    ty = int(h * 0.30)
    canvas.paste(tray_r, (tx, ty), tray_r)

    label_src = scene.crop((465, 345, 1070, 695)).convert("RGBA")
    label_rgb = Image.new("RGBA", label_src.size, (255, 255, 255, 255))
    label_src = Image.alpha_composite(label_rgb, label_src)

    cw, rh = tw / COLS, th / ROWS
    label_w = int(cw * 2.15)
    label_h = int(label_src.height * (label_w / label_src.width))
    label = label_src.resize((label_w, label_h), Image.Resampling.LANCZOS)

    lx = tx + int((tw - label_w) / 2)
    ly = ty + int(rh * 1.05) + int((rh * 3 - label_h) / 2)
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
