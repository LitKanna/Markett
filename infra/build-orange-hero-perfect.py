#!/usr/bin/env python3
"""Perfect orange market hero: keep AI scene + label, warp real egg domes per cell."""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SCENE_SRC = ASSETS / "references" / "pace-tray-175kg-master-original.png"
OUT_MASTER = ASSETS / "pace-tray-175kg-master.png"
REF = ASSETS / "references" / "wool-701985-alt.jpg"

TRAY_CROP = (8, 102, 1192, 1094)
COLS, ROWS = 6, 5

TRAY_QUAD = np.float32([
    [415, 358],
    [1120, 358],
    [1225, 708],
    [310, 708],
])

LABEL_BOX = (455, 330, 1085, 710)

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
    canvas.paste(resized, ((tw - resized.width) // 2, (th - resized.height) // 2))
    return canvas


def save_pair(img: Image.Image, base: Path) -> None:
    base.parent.mkdir(parents=True, exist_ok=True)
    img.save(base.with_suffix(".jpg"), "JPEG", quality=92, optimize=True, progressive=True)
    img.save(base.with_suffix(".webp"), "WEBP", quality=88, method=6)


def quad_point(q: np.ndarray, u: float, v: float) -> np.ndarray:
    p00, p10, p11, p01 = q
    return (1 - u) * (1 - v) * p00 + u * (1 - v) * p10 + u * v * p11 + (1 - u) * v * p01


_ref_cache: np.ndarray | None = None


def ref_grid() -> np.ndarray:
    global _ref_cache
    if _ref_cache is None:
        _ref_cache = np.array(Image.open(REF).convert("RGB").crop(TRAY_CROP))
    return _ref_cache


def egg_patch(row: int, col: int) -> tuple[np.ndarray, np.ndarray]:
    """Extract brown egg dome + soft alpha (no clear plastic rails)."""
    src = ref_grid()
    h, w = src.shape[:2]
    cw, rh = w / COLS, h / ROWS
    sr = 0 if (row >= 1 and 1 <= col <= 3) else row
    x0, y0 = int(col * cw), int(sr * rh)
    x1, y1 = int((col + 1) * cw), int((sr + 1) * rh)
    cell = src[y0:y1, x0:x1].copy()
    ch, cw_px = cell.shape[:2]

    r, g, b = cell[:, :, 0], cell[:, :, 1], cell[:, :, 2]
    brown = ((r.astype(np.int16) > g + 12) & (g.astype(np.int16) > b + 8) & (r > 100) & (r < 195))
    brown_u8 = brown.astype(np.uint8) * 255

    # Elliptical feather — egg dome only
    mask = np.zeros((ch, cw_px), dtype=np.float32)
    cx, cy = cw_px / 2, ch / 2
    rx, ry = cw_px * 0.36, ch * 0.36
    yy, xx = np.ogrid[:ch, :cw_px]
    ellipse = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    mask[ellipse <= 1.0] = 1.0
    mask *= brown_u8.astype(np.float32) / 255.0
    mask = cv2.GaussianBlur(mask, (0, 0), max(2, cw_px // 18))

    # Warm tint to match market light
    cell = cell.astype(np.float32)
    cell[:, :, 0] = np.clip(cell[:, :, 0] * 1.05 + 6, 0, 255)
    cell[:, :, 2] = np.clip(cell[:, :, 2] * 0.93, 0, 255)

    return cell.astype(np.uint8), mask


def warp_patch(patch: np.ndarray, alpha: np.ndarray, dst_quad: np.ndarray, size: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    ph, pw = patch.shape[:2]
    src_pts = np.float32([[0, 0], [pw - 1, 0], [pw - 1, ph - 1], [0, ph - 1]])
    m = cv2.getPerspectiveTransform(src_pts, dst_quad.astype(np.float32))
    sw, sh = size
    warped = cv2.warpPerspective(patch, m, (sw, sh), flags=cv2.INTER_LANCZOS4)
    warped_a = cv2.warpPerspective(alpha, m, (sw, sh), flags=cv2.INTER_LANCZOS4)
    return warped, warped_a


def under_label(row: int, col: int) -> bool:
    return 1 <= row <= 3 and 2 <= col <= 3


def build_master() -> Image.Image:
    scene = np.array(Image.open(SCENE_SRC).convert("RGB"))
    sh, sw = scene.shape[:2]
    out = scene.astype(np.float32)

    lx0, ly0, lx1, ly1 = LABEL_BOX
    label_guard = np.ones((sh, sw), dtype=np.float32)
    cv2.rectangle(label_guard, (lx0 - 12, ly0 - 8), (lx1 + 12, ly1 + 8), 0.0, -1)
    label_guard = cv2.GaussianBlur(label_guard, (0, 0), 6)

    for row in range(ROWS):
        for col in range(COLS):
            if under_label(row, col):
                continue
            u0, u1 = col / COLS, (col + 1) / COLS
            v0, v1 = row / ROWS, (row + 1) / ROWS
            dst = np.float32([
                quad_point(TRAY_QUAD, u0, v0),
                quad_point(TRAY_QUAD, u1, v0),
                quad_point(TRAY_QUAD, u1, v1),
                quad_point(TRAY_QUAD, u0, v1),
            ])
            patch, alpha = egg_patch(row, col)
            warped, wa = warp_patch(patch, alpha, dst, (sw, sh))
            m = wa * label_guard
            m = m[:, :, None]
            out = out * (1 - m) + warped.astype(np.float32) * m

    result = np.clip(out, 0, 255).astype(np.uint8)
    lx0, ly0, lx1, ly1 = LABEL_BOX
    result[ly0:ly1, lx0:lx1] = scene[ly0:ly1, lx0:lx1]

    img = Image.fromarray(result)
    return ImageEnhance.Sharpness(img).enhance(1.02)


def export_all(master: Image.Image) -> None:
    master.save(OUT_MASTER, "PNG", optimize=True)
    for tag in ("150", "175"):
        for name, size in DIMENSIONS.items():
            save_pair(fit(master, size), ASSETS / f"pace-tray-{tag}kg-{name}")
    save_pair(fit(master, (1400, 933)), ASSETS / "hero-eggs-1400")
    save_pair(fit(master, (700, 467)), ASSETS / "hero-eggs-700")
    save_pair(fit(master, (1080, 720)), ASSETS / "social-eggs-1080")
    save_pair(fit(master, (540, 360)), ASSETS / "social-eggs-540")
    print("exported perfected orange market hero")


if __name__ == "__main__":
    export_all(build_master())
