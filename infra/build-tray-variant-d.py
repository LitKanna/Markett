#!/usr/bin/env python3
"""Variant D: authentic clear plastic wholesale tray + correct Pace Farm label on orange market."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
VARIANTS = ASSETS / "variants"
SCENE = ASSETS / "references" / "pace-tray-175kg-master-original.png"
TRAY_SRC = REFS / "wool-701985-alt.jpg"

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


def white_to_alpha(img: Image.Image, cutoff: int = 235) -> Image.Image:
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


def patch_label_175kg(tray: Image.Image) -> Image.Image:
    img = tray.convert("RGB")
    draw = ImageDraw.Draw(img)
    w, h = img.size
    x0, y0, x1, y1 = int(w * 0.54), int(h * 0.655), int(w * 0.76), int(h * 0.705)
    draw.rectangle((x0, y0, x1, y1), fill=(255, 255, 255))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", max(14, w // 80))
    except OSError:
        font = ImageFont.load_default()
    draw.text((x0 + 3, y0 + 3), "min 1.75kg", fill=(40, 40, 40), font=font)
    return img


def market_bg(width: int, height: int) -> Image.Image:
    """Warm orange market table — no ghost eggs from AI scene."""
# REMOVED: pace-tray-175kg market-shelf assets were deleted (do not regenerate).
raise SystemExit("pace-tray-175kg market-shelf image was deleted — do not regenerate it")

    src = Image.open(SCENE).convert("RGB")
    sw, sh = src.size

    sky = src.crop((0, 0, sw, int(sh * 0.30)))
    sky = ImageOps.fit(sky, (width, int(height * 0.52)), Image.Resampling.LANCZOS, centering=(0.5, 0.05))
    sky = sky.filter(ImageFilter.GaussianBlur(max(12, width // 90)))

    wood_strip = src.crop((0, int(sh * 0.88), sw, sh))
    table = wood_strip.resize((width, int(height * 0.42)), Image.Resampling.LANCZOS)
    table = table.filter(ImageFilter.GaussianBlur(2))

    canvas = Image.new("RGB", (width, height), (235, 210, 175))
    canvas.paste(sky, (0, 0))
    canvas.paste(table, (0, int(height * 0.52)))

    fade = Image.new("L", (width, int(height * 0.06)))
    fd = ImageDraw.Draw(fade)
    for y in range(fade.height):
        fd.line([(0, y), (width, y)], fill=int(255 * y / max(1, fade.height - 1)))
    y0 = int(height * 0.48)
    strip = canvas.crop((0, y0, width, y0 + fade.height))
    canvas.paste(Image.composite(table.crop((0, 0, width, fade.height)), strip, fade), (0, y0))

    glow = Image.new("RGBA", (width, height), (255, 175, 80, 35))
    glow = glow.filter(ImageFilter.GaussianBlur(max(50, width // 18)))
    return Image.alpha_composite(canvas.convert("RGBA"), glow).convert("RGB")


def tray_shadow(tray: Image.Image, blur: int, dy: int, opacity: float) -> Image.Image:
    alpha = tray.split()[3]
    shadow = Image.new("RGBA", tray.size, (28, 16, 6, 0))
    shadow.putalpha(alpha.point(lambda p: int(p * opacity)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    pad = blur * 2
    out = Image.new("RGBA", (tray.width + pad, tray.height + pad + dy), (0, 0, 0, 0))
    out.alpha_composite(shadow, (blur, blur + dy))
    out.alpha_composite(tray, (blur, blur))
    return out


def compose(width: int, height: int) -> Image.Image:
    scene = market_bg(width, height).convert("RGBA")

    tray = patch_label_175kg(Image.open(TRAY_SRC))
    tray = white_to_alpha(tray)
    tray = ImageOps.contain(tray, (int(width * 0.70), int(height * 0.48)), Image.Resampling.LANCZOS)
    tray = tray.rotate(-8, expand=True, resample=Image.Resampling.BICUBIC)
    tray = ImageEnhance.Contrast(tray).enhance(1.05)
    tray = ImageEnhance.Color(tray).enhance(1.06)
    tray = ImageEnhance.Sharpness(tray).enhance(1.12)
    tray = tray_shadow(tray, max(20, width // 60), 24, 0.5)

    x = (width - tray.width) // 2
    y = int(height * 0.37)
    scene.alpha_composite(tray, (x, y))

    out = scene.convert("RGB")
    out = ImageEnhance.Color(out).enhance(1.05)
    out = ImageEnhance.Brightness(out).enhance(1.02)
    return out


def export_live(master: Image.Image) -> None:
    master.save(ASSETS / "pace-tray-175kg-master.png", "PNG", optimize=True)
    for tag in ("150", "175"):
        for name, size in DIMENSIONS.items():
            save_pair(fit(master, size), ASSETS / f"pace-tray-{tag}kg-{name}")
    save_pair(fit(master, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit(master, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit(master, (1080, 720)), ASSETS / "social-eggs-1080")
    save_pair(fit(master, (540, 360)), ASSETS / "social-eggs-540")


def main() -> None:
    VARIANTS.mkdir(parents=True, exist_ok=True)
    master = compose(1536, 1024)
    master.save(VARIANTS / "tray-d-authentic-plastic-175kg-master.png", "PNG", optimize=True)
    for name, size in DIMENSIONS.items():
        save_pair(fit(master, size), VARIANTS / f"tray-d-authentic-plastic-175kg-{name}")
    export_live(master)
    print("variant D: real plastic tray, correct Pace Farm logo, 1.75kg, orange market")


if __name__ == "__main__":
    main()
