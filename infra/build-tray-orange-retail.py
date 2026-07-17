#!/usr/bin/env python3
"""Orange market variant with authentic retail Pace Farm logo + 1.75kg label."""

from __future__ import annotations

import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
SCENE = REFS / "pace-tray-175kg-master-original.png"
TRAY_SRC = REFS / "wool-701985-alt.jpg"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

HERO_SIZES = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}
ORDER_SIZES = (400, 320)


def sample_label_white(img: Image.Image, y0: int, y1: int) -> tuple[int, int, int]:
    w, _ = img.size
    pts: list[tuple[int, int, int]] = []
    for x in range(int(w * 0.40), int(w * 0.62)):
        for y in range(y0 - 12, y1 + 12):
            if y < 0:
                continue
            r, g, b = img.getpixel((x, y))
            if r > 200 and g > 198 and b > 193 and abs(r - g) < 8:
                pts.append((r, g, b))
    return tuple(int(sum(p[i] for p in pts) / len(pts)) for i in range(3)) if pts else (248, 246, 242)


def patch_label_175kg(img: Image.Image) -> Image.Image:
    w, h = img.size
    px0, px1 = int(w * 0.518), int(w * 0.638)
    py0, py1 = int(h * 0.792), int(h * 0.836)
    pw, ph = px1 - px0, py1 - py0
    bg = sample_label_white(img, py0, py1)
    patch = Image.new("RGB", (pw, ph), bg)
    px = patch.load()
    r0, g0, b0 = bg
    random.seed(11)
    for y in range(ph):
        for x in range(pw):
            d = random.randint(-2, 2)
            px[x, y] = (max(0, min(255, r0 + d)), max(0, min(255, g0 + d)), max(0, min(255, b0 + d)))
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pw, ph), radius=4, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(2))
    out = img.copy()
    out.paste(patch, (px0, py0), mask)
    draw = ImageDraw.Draw(out)
    size = max(12, int(w * 0.0182))
    font = ImageFont.truetype(FONT, size)
    text = "min 1.75kg"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((px1 - tw - int(w * 0.005), py0 + (ph - th) // 2), text, fill=(48, 48, 48), font=font)
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
    pad = int(min(w, h) * 0.025)
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


def orange_market_bg(width: int, height: int) -> Image.Image:
    src = Image.open(SCENE).convert("RGB")
    sw, sh = src.size

    market = src.crop((0, 0, sw, int(sh * 0.42)))
    market = ImageOps.fit(market, (width, int(height * 0.62)), Image.Resampling.LANCZOS, centering=(0.5, 0.15))
    market = market.filter(ImageFilter.GaussianBlur(radius=max(5, width // 150)))
    market = ImageEnhance.Color(market).enhance(1.15)
    market = ImageEnhance.Brightness(market).enhance(0.92)

    wood = src.crop((0, int(sh * 0.64), sw, sh))
    wood = ImageOps.fit(wood, (width, int(height * 0.44)), Image.Resampling.LANCZOS, centering=(0.5, 1.0))

    canvas = Image.new("RGB", (width, height), (235, 200, 165))
    canvas.paste(market, (0, 0))
    wood_y = int(height * 0.48)
    canvas.paste(wood, (0, wood_y))

    fade_h = int(height * 0.1)
    y0 = wood_y - fade_h // 2
    fade = Image.new("L", (width, fade_h))
    fd = ImageDraw.Draw(fade)
    for y in range(fade_h):
        fd.line([(0, y), (width, y)], fill=int(255 * (y / max(1, fade_h - 1))))
    strip_a = canvas.crop((0, y0, width, y0 + fade_h))
    strip_b = canvas.crop((0, y0, width, y0 + fade_h))
    canvas.paste(Image.composite(strip_b, strip_a, fade), (0, y0))

    wash = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    wd = ImageDraw.Draw(wash)
    wd.ellipse((-width * 0.15, -height * 0.3, width * 0.8, height * 0.5), fill=(255, 190, 90, 60))
    wash = wash.filter(ImageFilter.GaussianBlur(radius=max(30, width // 24)))
    return Image.alpha_composite(canvas.convert("RGBA"), wash).convert("RGB")


def ground_shadow(scene_size: tuple[int, int], tray_box: tuple[int, int, int, int]) -> Image.Image:
    w, h = scene_size
    x0, y0, x1, y1 = tray_box
    shadow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    cx = (x0 + x1) // 2
    cy = y1 - int((y1 - y0) * 0.05)
    rw = int((x1 - x0) * 0.42)
    rh = int((y1 - y0) * 0.08)
    draw.ellipse((cx - rw, cy - rh, cx + rw, cy + rh), fill=(24, 14, 6, 95))
    return shadow.filter(ImageFilter.GaussianBlur(max(14, w // 85)))


def compose(width: int, height: int) -> Image.Image:
    scene = orange_market_bg(width, height).convert("RGBA")
    tray = white_to_alpha(crop_tray_content(patch_label_175kg(Image.open(TRAY_SRC).convert("RGB"))))
    tray = ImageOps.contain(tray, (int(width * 0.72), int(height * 0.50)), Image.Resampling.LANCZOS)
    tray = ImageEnhance.Contrast(tray).enhance(1.04)
    tray = ImageEnhance.Color(tray).enhance(1.08)
    tray = ImageEnhance.Sharpness(tray).enhance(1.1)

    x = (width - tray.width) // 2
    y = int(height * 0.40)
    scene.alpha_composite(ground_shadow((width, height), (x, y, x + tray.width, y + tray.height)))
    scene.alpha_composite(tray, (x, y))

    out = scene.convert("RGB")
    out = ImageEnhance.Color(out).enhance(1.06)
    out = ImageEnhance.Brightness(out).enhance(1.02)
    return out


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


def main() -> None:
    master = compose(1536, 1024)
    master.save(ASSETS / "references" / "tray-orange-retail-master.png", "PNG", optimize=True)
    for tag, size in HERO_SIZES.items():
        save_pair(fit_cover(master, size, (0.5, 0.46)), ASSETS / f"tray-orange-retail-{tag}")
    for size in ORDER_SIZES:
        save_pair(fit_cover(master, (size, size), (0.5, 0.44)), ASSETS / f"tray-orange-retail-order-{size}")
    print("exported tray-orange-retail-* (authentic logo, 1.75kg, orange market wood)")


if __name__ == "__main__":
    main()
# REMOVED: pace-tray-175kg market-shelf assets were deleted (do not regenerate).
raise SystemExit("pace-tray-175kg market-shelf image was deleted — do not regenerate it")

