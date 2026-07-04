#!/usr/bin/env python3
"""Build tray hero variants: orange market look + correct 30-egg tray."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
REFS = ASSETS / "references"
VARIANTS = ASSETS / "variants"
MASTER = ASSETS / "pace-tray-175kg-master.png"
TRAY_SRC = REFS / "wool-701985-alt.jpg"

DIMENSIONS = {
    "1400": (1400, 933),
    "1080": (1080, 720),
    "700": (700, 467),
    "540": (540, 360),
}


def remove_white_bg(img: Image.Image, threshold: int = 242) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                px[x, y] = (255, 255, 255, 0)
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.GaussianBlur(1.2))
    return Image.merge("RGBA", (r, g, b, a))


def orange_market_bg(width: int, height: int) -> Image.Image:
    src = Image.open(MASTER).convert("RGB")
    sw, sh = src.size

    market = src.crop((0, 0, sw, int(sh * 0.42)))
    market = ImageOps.fit(market, (width, int(height * 0.62)), method=Image.Resampling.LANCZOS, centering=(0.5, 0.15))
    market = market.filter(ImageFilter.GaussianBlur(radius=max(5, width // 150)))
    market = ImageEnhance.Color(market).enhance(1.18)
    market = ImageEnhance.Brightness(market).enhance(0.9)

    wood = src.crop((0, int(sh * 0.64), sw, sh))
    wood = ImageOps.fit(wood, (width, int(height * 0.44)), method=Image.Resampling.LANCZOS, centering=(0.5, 1.0))

    canvas = Image.new("RGB", (width, height), (253, 248, 239))
    canvas.paste(market, (0, 0))
    wood_y = int(height * 0.56)
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
    wd.ellipse((-width * 0.15, -height * 0.3, width * 0.8, height * 0.5), fill=(255, 190, 90, 65))
    wash = wash.filter(ImageFilter.GaussianBlur(radius=max(30, width // 24)))
    return Image.alpha_composite(canvas.convert("RGBA"), wash).convert("RGB")


def tray_shadow(tray: Image.Image, blur: int, dy: int, opacity: int) -> Image.Image:
    alpha = tray.split()[3]
    shadow = Image.new("RGBA", tray.size, (35, 22, 8, 0))
    shadow.putalpha(alpha.point(lambda p: int(p * opacity / 255)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", (tray.width + blur * 2, tray.height + blur * 2 + dy), (0, 0, 0, 0))
    out.alpha_composite(shadow, (blur, blur + dy))
    out.alpha_composite(tray, (blur, blur))
    return out


def compose_real_tray(width: int, height: int) -> Image.Image:
    """Variant A: authentic 30-egg retail tray on orange market wood."""
    scene = orange_market_bg(width, height).convert("RGBA")
    tray = remove_white_bg(Image.open(TRAY_SRC))
    tray = ImageOps.contain(tray, (int(width * 0.76), int(height * 0.54)), Image.Resampling.LANCZOS)
    tray = ImageEnhance.Sharpness(tray).enhance(1.08)
    tray = ImageEnhance.Color(tray).enhance(1.1)
    tray = tray_shadow(tray, max(16, width // 70), 16, 60)
    x = (width - tray.width) // 2
    y = int(height * 0.33)
    scene.alpha_composite(tray, (x, y))
    out = scene.convert("RGB")
    out = ImageEnhance.Color(out).enhance(1.08)
    out = ImageEnhance.Brightness(out).enhance(1.03)
    return out


def fit(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    resized = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - tw) // 2
    top = (resized.height - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def save_pair(img: Image.Image, base: Path) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=88, method=6)


def export_sizes(img: Image.Image, prefix: str) -> None:
    for name, size in DIMENSIONS.items():
        save_pair(fit(img, size), VARIANTS / f"{prefix}-{name}")


def main() -> None:
    VARIANTS.mkdir(parents=True, exist_ok=True)
    a = compose_real_tray(1400, 933)
    save_pair(a, VARIANTS / "tray-a-real30-market")
    export_sizes(a, "tray-a-real30-market")
    print("variant A: real 30-egg tray on orange market wood")
    print("done — run GenerateImage for variants B/C or copy preferred variant to pace-tray-*")


if __name__ == "__main__":
    main()
