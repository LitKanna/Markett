#!/usr/bin/env python3
"""Flemington hero v2: real 30-egg wholesale tray + authentic logo on new market scene."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
TRAY_SRC = REFS / "wool-701985-alt.jpg"
BG_SRC = ASSETS / "references" / "flemington-market-bg-v2.png"
OUT_MASTER = ASSETS / "tray-orange-flemington-master.png"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

HERO_SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)

COLS, ROWS = 6, 5


def sample_label_white(img: Image.Image, y0: int, y1: int) -> tuple[int, int, int]:
    w, _ = img.size
    pts: list[tuple[int, int, int]] = []
    for x in range(int(w * 0.40), int(w * 0.62)):
        for y in range(y0 - 10, y1 + 10):
            if y < 0:
                continue
            r, g, b = img.getpixel((x, y))
            if r > 200 and g > 198 and b > 193 and abs(r - g) < 8:
                pts.append((r, g, b))
    return tuple(int(sum(p[i] for p in pts) / len(pts)) for i in range(3)) if pts else (248, 246, 242)


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
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw, ph), radius=4, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2))
    img.paste(patch, (x0, y0), mask)


def patch_label_175kg(img: Image.Image) -> Image.Image:
    """Replace min 1.5kg with min 1.75kg on the authentic wholesale label."""
    w, h = img.size
    px0, px1 = int(w * 0.505), int(w * 0.655)
    py0, py1 = int(h * 0.786), int(h * 0.842)
    bg = sample_label_white(img, py0, py1)
    out = img.copy()
    paste_patch(out, (px0, py0, px1, py1), bg)
    draw = ImageDraw.Draw(out)
    size = max(13, int(w * 0.0175))
    font = ImageFont.truetype(FONT, size)
    text = "min 1.75kg"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = px1 - tw - int(w * 0.008)
    ty = py0 + (py1 - py0 - th) // 2
    draw.text((tx, ty), text, fill=(48, 48, 48), font=font)
    return out


def remove_label_footer(img: Image.Image) -> Image.Image:
    """Remove barcode + fine print only; keep CAGE EGGS row."""
    w, h = img.size
    x0, x1 = int(w * 0.395), int(w * 0.605)
    y0, y1 = int(h * 0.845), int(h * 0.918)
    bg = sample_label_white(img, int(h * 0.830), int(h * 0.844))
    out = img.copy()
    paste_patch(out, (x0, y0, x1, y1), bg)
    return out


def crop_tray_content(img: Image.Image) -> Image.Image:
    px = img.convert("RGB").load()
    w, h = img.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r < 240 or g < 240 or b < 240:
                xs.append(x)
                ys.append(y)
    if not xs:
        return img
    pad = int(min(w, h) * 0.02)
    return img.crop((max(0, min(xs) - pad), max(0, min(ys) - pad), min(w, max(xs) + pad), min(h, max(ys) + pad)))


def white_to_alpha(img: Image.Image, cutoff: int = 238) -> Image.Image:
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


def verify_egg_grid(img: Image.Image) -> None:
    """Sanity check: wholesale tray crop should expose ~30 egg domes in 6×5 grid."""
    tray = crop_tray_content(img)
    w, h = tray.size
    domes = 0
    px = tray.convert("RGB").load()
    cw, rh = w / COLS, h / ROWS
    for row in range(ROWS):
        for col in range(COLS):
            if 1 <= row <= 3 and 2 <= col <= 3:
                continue  # label covers centre cells
            cx = int((col + 0.5) * cw)
            cy = int((row + 0.5) * rh)
            r, g, b = px[cx, cy]
            if r > g + 10 and g > b + 5:
                domes += 1
    print(f"  egg dome sample count (excl. label): {domes}/24 visible cells")


def ground_shadow(scene_size: tuple[int, int], tray_box: tuple[int, int, int, int]) -> Image.Image:
    w, h = scene_size
    x0, y0, x1, y1 = tray_box
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    cx = (x0 + x1) // 2 + int(w * 0.02)
    cy = y1 - int((y1 - y0) * 0.04)
    rw = int((x1 - x0) * 0.44)
    rh = int((y1 - y0) * 0.07)
    draw.ellipse((cx - rw, cy - rh, cx + rw, cy + rh), fill=(28, 16, 8, 135))
    return shadow.filter(ImageFilter.GaussianBlur(max(20, w // 70)))


def warm_tray(tray: Image.Image) -> Image.Image:
    rgb = tray.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.12)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.05)
    rgb = ImageEnhance.Brightness(rgb).enhance(1.03)
    out = rgb.convert("RGBA")
    out.putalpha(tray.split()[-1])
    return ImageEnhance.Sharpness(out).enhance(1.08)


def compose(width: int = 1536, height: int = 1024) -> Image.Image:
    bg = ImageOps.fit(Image.open(BG_SRC).convert("RGB"), (width, height), Image.Resampling.LANCZOS, centering=(0.5, 0.55))
    bg = ImageEnhance.Color(bg).enhance(1.08)
    bg = ImageEnhance.Brightness(bg).enhance(1.01)

    tray_rgb = remove_label_footer(patch_label_175kg(Image.open(TRAY_SRC).convert("RGB")))
    verify_egg_grid(tray_rgb)
    tray = warm_tray(white_to_alpha(crop_tray_content(tray_rgb)))

    max_w, max_h = int(width * 0.78), int(height * 0.52)
    scale = min(max_w / tray.width, max_h / tray.height)
    tray = tray.resize((int(tray.width * scale), int(tray.height * scale)), Image.Resampling.LANCZOS)
    tray = tray.rotate(-3.2, resample=Image.Resampling.BICUBIC, expand=True)

    x = (width - tray.width) // 2 + int(width * 0.01)
    y = int(height * 0.34)
    scene = bg.convert("RGBA")
    box = (x, y, x + tray.width, y + tray.height)
    scene.alpha_composite(ground_shadow((width, height), box))
    scene.alpha_composite(tray, (x, y))

    out = scene.convert("RGB")
    out = ImageEnhance.Color(out).enhance(1.04)
    return out


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.46)) -> Image.Image:
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = max(0, min(int((resized.width - tw) * centering[0]), resized.width - tw))
    top = max(0, min(int((resized.height - th) * centering[1]), resized.height - th))
    return resized.crop((left, top, left + tw, top + th))


def save_pair(img: Image.Image, base: Path) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=93, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=90, method=6)


def main() -> None:
    master = compose()
    master.save(OUT_MASTER, "PNG", optimize=True)
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(master, size), ASSETS / f"tray-orange-flemington-{tag}")
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.52, 0.44)), ASSETS / f"tray-orange-flemington-order-{size}")
    print("exported tray-orange-flemington-* (real 30-egg tray, authentic logo, new market bg)")


if __name__ == "__main__":
    main()
