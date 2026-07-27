#!/usr/bin/env python3
"""
YOLKO egg price scout — live Australian retail check.

Tracks:
  A) CAGED 700g packs only (usually 12 eggs / dozen; also rare 10-packs at 700g)
  B) CAGED 30-packs separately (these are almost never 700g — typically 1.5kg / 1.75kg)

Major chains (Woolworths/Coles) often block bots and have largely removed caged stock
online. Open sources (Shopify / WooCommerce) are scraped directly; Playwright can be
used optionally for JS-heavy stores.

Usage:
  python3 infra/egg-price-scout.py
  python3 infra/egg-price-scout.py --json /tmp/egg-prices.json
  python3 infra/egg-price-scout.py --with-browser   # needs: npx playwright install chromium
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from typing import Any, Iterable, Optional

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
CTX = ssl.create_default_context()
TODAY = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d")
NOW_ISO = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

CAGED_RE = re.compile(r"\b(caged?|cage[\s-]?raised|natural\s+cage)\b", re.I)
NOT_CAGED_RE = re.compile(
    r"\b(cage[\s-]?free|free[\s-]?range|barn|organic|pasture|omega)\b", re.I
)
W700_RE = re.compile(r"\b700\s*g\b|\b700g\b", re.I)
PACK30_RE = re.compile(r"\b30[\s-]*(pack|pk|piece|eggs?)\b|\b30pk\b", re.I)
EGGS12_RE = re.compile(r"\b(12[\s-]*(pack|pk|piece|eggs?)|dozen)\b", re.I)
EGGS10_RE = re.compile(r"\b10[\s-]*(pack|pk|piece|eggs?)\b", re.I)
WEIGHT_RE = re.compile(r"\b(350|500|600|700|800|900|1500|1750|1\.5|1\.75)\s*k?g\b", re.I)


@dataclass
class Offer:
    retailer: str
    title: str
    brand: str
    category: str  # "caged_700g" | "caged_30pack" | "skipped"
    housing: str
    pack_eggs: Optional[int]
    pack_weight_g: Optional[int]
    price_aud: Optional[float]
    per_egg_aud: Optional[float]
    stock: str
    url: str
    source: str
    notes: str = ""
    fetched_at: str = field(default_factory=lambda: NOW_ISO)

    def ok_for_report(self) -> bool:
        return self.category in ("caged_700g", "caged_30pack") and self.price_aud is not None


def http_get(url: str, accept: str = "*/*", timeout: int = 30) -> tuple[int, str, bytes]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": accept,
            "Accept-Language": "en-AU,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=timeout) as resp:
            return resp.status, resp.headers.get("content-type", ""), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, "", e.read() if e.fp else b""
    except Exception as e:
        return 0, str(e), b""


def money(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "").replace("$", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_weight_g(text: str) -> Optional[int]:
    m = WEIGHT_RE.search(text or "")
    if not m:
        return None
    raw = m.group(1).lower()
    if raw == "1.5":
        return 1500
    if raw == "1.75":
        return 1750
    try:
        return int(raw)
    except ValueError:
        return None


def classify(title: str, weight_g: Optional[int], eggs: Optional[int]) -> tuple[str, str]:
    """Return (category, reason). Strict: caged only; 700g bucket only if weight is 700g."""
    t = title or ""
    tl = t.lower()

    # Must look caged, and not clearly non-caged.
    looks_caged = bool(CAGED_RE.search(t))
    looks_not = bool(NOT_CAGED_RE.search(t))
    if looks_not and not looks_caged:
        return "skipped", "not caged"
    if looks_not and "cage free" in tl.replace("-", " "):
        return "skipped", "cage-free"
    if "free range" in tl.replace("-", " "):
        return "skipped", "free-range"
    if not looks_caged:
        return "skipped", "housing unclear / not caged"

    w = weight_g or parse_weight_g(t)
    e = eggs
    if e is None:
        if EGGS12_RE.search(t):
            e = 12
        elif EGGS10_RE.search(t):
            e = 10
        elif PACK30_RE.search(t):
            e = 30

    # 30-pack lane (weight usually 1500/1750 — never treat as 700g)
    if e == 30 or PACK30_RE.search(t) or (w in (1500, 1750) and ("30" in tl)):
        return "caged_30pack", "caged 30-pack"

    # Strict 700g lane
    if w == 700 or W700_RE.search(t):
        if w and w != 700:
            return "skipped", f"weight {w}g not 700g"
        return "caged_700g", "caged 700g"

    if w in (600, 800, 500, 350, 900):
        return "skipped", f"wrong weight {w}g (need 700g or 30-pack)"

    return "skipped", "could not confirm 700g or 30-pack"


def offer_from_fields(
    *,
    retailer: str,
    title: str,
    brand: str,
    price: Any,
    url: str,
    source: str,
    stock: str = "unknown",
    eggs: Optional[int] = None,
    weight_g: Optional[int] = None,
    notes: str = "",
) -> Offer:
    w = weight_g or parse_weight_g(title)
    e = eggs
    if e is None:
        if PACK30_RE.search(title):
            e = 30
        elif EGGS10_RE.search(title):
            e = 10
        elif EGGS12_RE.search(title) or W700_RE.search(title):
            e = 12
    cat, reason = classify(title, w, e)
    p = money(price)
    per = round(p / e, 4) if p is not None and e else None
    housing = "caged" if cat != "skipped" else "unknown/other"
    note = notes or reason
    if cat == "caged_30pack" and w == 700:
        note += " | WARNING: 30-pack labeled 700g is unusual — verify pack"
    if cat == "caged_30pack" and (w is None or w == 700):
        # 30 packs are not 700g product class
        if w is None:
            note += " | weight not stated (30-packs are usually 1.5–1.75kg, not 700g)"
    return Offer(
        retailer=retailer,
        title=unescape(re.sub(r"\s+", " ", title)).strip(),
        brand=brand,
        category=cat,
        housing=housing,
        pack_eggs=e,
        pack_weight_g=w,
        price_aud=p,
        per_egg_aud=per,
        stock=stock,
        url=url,
        source=source,
        notes=note,
    )


# ---------------------------------------------------------------------------
# Source collectors
# ---------------------------------------------------------------------------

def collect_umall() -> list[Offer]:
    offers: list[Offer] = []
    # Known product handles + flash-sale / catalog sweeps
    handles = [
        "pace-farm-cage-eggs-xl-12-pieces-700g",
        "pace-farm-caged-eggs-large-30-pack-1-5kg",
    ]
    for handle in handles:
        status, _, body = http_get(
            f"https://www.umall.com.au/products/{handle}.json",
            accept="application/json",
        )
        if status != 200:
            offers.append(
                Offer(
                    "Umall",
                    handle,
                    "Pace Farm",
                    "skipped",
                    "unknown",
                    None,
                    None,
                    None,
                    None,
                    f"http_{status}",
                    f"https://www.umall.com.au/products/{handle}",
                    "shopify_json",
                    notes=f"fetch failed ({status})",
                )
            )
            continue
        prod = json.loads(body).get("product") or {}
        variant = (prod.get("variants") or [{}])[0]
        available = variant.get("available")
        stock = "in_stock" if available is True else "out_of_stock" if available is False else "unknown"
        grams = variant.get("grams") or parse_weight_g(prod.get("title", ""))
        offers.append(
            offer_from_fields(
                retailer="Umall",
                title=prod.get("title") or handle,
                brand=prod.get("vendor") or "Pace Farm",
                price=variant.get("price"),
                url=f"https://www.umall.com.au/products/{handle}",
                source="shopify_json",
                stock=stock,
                weight_g=int(grams) if grams else None,
                notes=f"compare_at={variant.get('compare_at_price')}; updated={prod.get('updated_at')}",
            )
        )

    # Sweep flash sales + first catalog page for more caged egg SKUs
    for list_url in (
        "https://www.umall.com.au/collections/flash-sales/products.json?limit=250",
        "https://www.umall.com.au/products.json?limit=250",
    ):
        status, _, body = http_get(list_url, accept="application/json")
        if status != 200:
            continue
        for prod in json.loads(body).get("products") or []:
            title = prod.get("title") or ""
            if "egg" not in title.lower():
                continue
            if "cage" not in title.lower() and "caged" not in title.lower():
                continue
            variant = (prod.get("variants") or [{}])[0]
            handle = prod.get("handle")
            available = variant.get("available")
            stock = "in_stock" if available is True else "out_of_stock" if available is False else "unknown"
            grams = variant.get("grams") or parse_weight_g(title)
            offers.append(
                offer_from_fields(
                    retailer="Umall",
                    title=title,
                    brand=prod.get("vendor") or "",
                    price=variant.get("price"),
                    url=f"https://www.umall.com.au/products/{handle}",
                    source="shopify_catalog",
                    stock=stock,
                    weight_g=int(grams) if grams else None,
                )
            )
    return _dedupe(offers)


def collect_gourmet_grocer() -> list[Offer]:
    urls = [
        (
            "https://gourmetgroceronline.com.au/product/pace-farm-cage-eggs-xl-12-pieces-700g/",
            "Pace Farm Cage Eggs XL - 12 Pieces, 700g",
            12,
            700,
        ),
        (
            "https://gourmetgroceronline.com.au/product/pace-farm-caged-eggs-large-30-pack-1-5kg/",
            "Pace Farm Caged Eggs Large 30 Pack - 1.5kg",
            30,
            1500,
        ),
    ]
    out: list[Offer] = []
    for url, fallback_title, eggs, weight in urls:
        status, _, body = http_get(url, accept="text/html")
        html = body.decode("utf-8", "ignore")
        if status != 200:
            out.append(
                Offer(
                    "Gourmet Grocer",
                    fallback_title,
                    "Pace Farm",
                    "skipped",
                    "unknown",
                    eggs,
                    weight,
                    None,
                    None,
                    f"http_{status}",
                    url,
                    "woocommerce_html",
                    notes=f"fetch failed ({status})",
                )
            )
            continue
        # WooCommerce JSON-LD / meta price
        price = None
        m = re.search(r'"price"\s*:\s*"([0-9]+(?:\.[0-9]+)?)"', html)
        if m:
            price = m.group(1)
        if price is None:
            m = re.search(r'woocommerce-Price-amount[^>]*>\s*<span[^>]*>[^<]*</span>([0-9.]+)', html)
            if m:
                price = m.group(1)
        title_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
        title = re.sub(r"<[^>]+>", "", title_m.group(1)).strip() if title_m else fallback_title
        stock = "unknown"
        if re.search(r"out[\s-]of[\s-]stock", html, re.I):
            stock = "out_of_stock"
        elif re.search(r"in[\s-]stock|add to cart|add-to-cart", html, re.I):
            stock = "in_stock"
        out.append(
            offer_from_fields(
                retailer="Gourmet Grocer",
                title=title,
                brand="Pace Farm",
                price=price,
                url=url,
                source="woocommerce_html",
                stock=stock,
                eggs=eggs,
                weight_g=weight,
            )
        )
    return out


def collect_manual_browser_seeds() -> list[Offer]:
    """
    Seed rows for major chains that need a browser / postcode.
    Values are filled when --with-browser succeeds; otherwise left as probes.
    """
    seeds = [
        {
            "retailer": "Woolworths",
            "title": "Pace Farm 12 Extra Large Caged Eggs 700g",
            "brand": "Pace Farm",
            "url": "https://www.woolworths.com.au/shop/productdetails/92940/pace-farm-12-extra-large-caged-eggs",
            "eggs": 12,
            "weight_g": 700,
        },
        {
            "retailer": "IGA",
            "title": "Pace Farm Natural Cage Eggs 700g",
            "brand": "Pace Farm",
            "url": "https://www.igashop.com.au/product/pace-farm-natural-cage-eggs-104744",
            "eggs": 12,
            "weight_g": 700,
        },
        {
            "retailer": "IGA",
            "title": "Canabolas Eggs 30 Pack",
            "brand": "Canabolas",
            "url": "https://www.igashop.com.au/product/canabolas-eggs-30-pack-20000005474",
            "eggs": 30,
            "weight_g": 1500,
        },
    ]
    return [
        Offer(
            retailer=s["retailer"],
            title=s["title"],
            brand=s["brand"],
            category="caged_700g" if s["weight_g"] == 700 else "caged_30pack",
            housing="caged",
            pack_eggs=s["eggs"],
            pack_weight_g=s["weight_g"],
            price_aud=None,
            per_egg_aud=None,
            stock="needs_browser",
            url=s["url"],
            source="seed",
            notes="Blocked or JS-rendered for plain HTTP — use --with-browser",
        )
        for s in seeds
    ]


def collect_with_playwright(seeds: list[Offer]) -> list[Offer]:
    """Optional Playwright pass for Woolworths / IGA product pages."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright not installed in this Python env; skipping --with-browser", file=sys.stderr)
        return []

    filled: list[Offer] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=UA)
        for seed in seeds:
            if seed.source != "seed":
                continue
            try:
                page.goto(seed.url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2500)
                text = page.inner_text("body")
                html = page.content()
                price = None
                # common patterns
                for pat in (
                    r"\$([0-9]+\.[0-9]{2})\s*(?:each|/ea)?",
                    r'"price"\s*:\s*([0-9]+\.[0-9]{2})',
                    r'"Amount"\s*:\s*([0-9]+\.[0-9]{2})',
                ):
                    m = re.search(pat, text) or re.search(pat, html)
                    if m:
                        price = float(m.group(1))
                        break
                stock = "unknown"
                low = (text + " " + html).lower()
                if "out of stock" in low or "unavailable" in low:
                    stock = "out_of_stock"
                elif "add to cart" in low or "add to trolley" in low or "in stock" in low:
                    stock = "in_stock"
                if price is None and stock == "out_of_stock":
                    filled.append(
                        offer_from_fields(
                            retailer=seed.retailer,
                            title=seed.title,
                            brand=seed.brand,
                            price=None,
                            url=seed.url,
                            source="playwright",
                            stock=stock,
                            eggs=seed.pack_eggs,
                            weight_g=seed.pack_weight_g,
                            notes="No price shown (likely OOS / location-gated)",
                        )
                    )
                    # overwrite category from seed classification
                    filled[-1].category = seed.category
                    filled[-1].housing = "caged"
                    continue
                o = offer_from_fields(
                    retailer=seed.retailer,
                    title=seed.title,
                    brand=seed.brand,
                    price=price,
                    url=seed.url,
                    source="playwright",
                    stock=stock,
                    eggs=seed.pack_eggs,
                    weight_g=seed.pack_weight_g,
                )
                # Keep intended category if classifier agrees on caged
                if o.category == "skipped" and seed.category != "skipped":
                    o.category = seed.category
                    o.housing = "caged"
                    if price and seed.pack_eggs:
                        o.per_egg_aud = round(price / seed.pack_eggs, 4)
                filled.append(o)
            except Exception as e:
                filled.append(
                    Offer(
                        seed.retailer,
                        seed.title,
                        seed.brand,
                        seed.category,
                        "caged",
                        seed.pack_eggs,
                        seed.pack_weight_g,
                        None,
                        None,
                        "error",
                        seed.url,
                        "playwright",
                        notes=f"browser error: {e}",
                    )
                )
        browser.close()
    return filled


def yolko_reference() -> list[Offer]:
    """YOLKO own list prices for comparison (from site defaults)."""
    return [
        offer_from_fields(
            retailer="YOLKO (own)",
            title="Cage dozen 700g",
            brand="Pace Farm",
            price=7.0,
            url="https://getyolko.com/#prices",
            source="yolko_config",
            stock="sell",
            eggs=12,
            weight_g=700,
            notes="Site default cage700 price — not a competitor scrape",
        ),
        offer_from_fields(
            retailer="YOLKO (own)",
            title="Fresh tray 30 eggs ~1.75kg caged",
            brand="Pace Farm",
            price=13.0,
            url="https://getyolko.com/#prices",
            source="yolko_config",
            stock="sell",
            eggs=30,
            weight_g=1750,
            notes="Site tray1 default — 30-pack lane (NOT 700g)",
        ),
    ]


def load_manual_notes(path: Path) -> list[Offer]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    out: list[Offer] = []
    for row in data.get("offers") or []:
        out.append(
            Offer(
                retailer=row.get("retailer", "manual"),
                title=row.get("title", ""),
                brand=row.get("brand", ""),
                category=row.get("category", "skipped"),
                housing=row.get("housing", "caged"),
                pack_eggs=row.get("pack_eggs"),
                pack_weight_g=row.get("pack_weight_g"),
                price_aud=money(row.get("price_aud")),
                per_egg_aud=money(row.get("per_egg_aud")),
                stock=row.get("stock", "unknown"),
                url=row.get("url", ""),
                source=row.get("source", "manual"),
                notes=row.get("notes", ""),
                fetched_at=row.get("fetched_at", data.get("as_of", NOW_ISO)),
            )
        )
    return out


def _dedupe(offers: Iterable[Offer]) -> list[Offer]:
    best: dict[str, Offer] = {}
    for o in offers:
        # Include title + category so two SKUs on the same store URL don't collapse.
        key = (
            o.retailer
            + "|"
            + o.url.split("?")[0]
            + "|"
            + o.category
            + "|"
            + re.sub(r"\s+", " ", (o.title or "").lower())
        )
        prev = best.get(key)
        if prev is None:
            best[key] = o
            continue
        # Prefer rows with a price and clearer stock
        score = (o.price_aud is not None, o.stock == "in_stock", o.source != "seed")
        prev_score = (prev.price_aud is not None, prev.stock == "in_stock", prev.source != "seed")
        if score >= prev_score:
            best[key] = o
    return list(best.values())


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

def cheapest(offers: list[Offer], category: str, in_stock_only: bool = False) -> Optional[Offer]:
    rows = [
        o
        for o in offers
        if o.category == category
        and o.price_aud is not None
        and o.per_egg_aud is not None
        and o.retailer != "YOLKO (own)"
        and (not in_stock_only or o.stock == "in_stock")
    ]
    if not rows:
        return None
    return min(rows, key=lambda o: (o.per_egg_aud, o.price_aud))


def print_table(title: str, rows: list[Offer]) -> None:
    print()
    print("=" * 88)
    print(title)
    print("=" * 88)
    if not rows:
        print("  (none found)")
        return
    print(
        f"{'Retailer':16} {'Price':>8} {'Eggs':>5} {'Weight':>7} {'Per egg':>8} {'Stock':12} Title"
    )
    print("-" * 88)
    for o in sorted(rows, key=lambda x: (x.per_egg_aud or 999, x.price_aud or 999)):
        w = f"{o.pack_weight_g}g" if o.pack_weight_g else "?"
        pe = f"${o.per_egg_aud:.3f}" if o.per_egg_aud is not None else "—"
        pr = f"${o.price_aud:.2f}" if o.price_aud is not None else "—"
        eggs = str(o.pack_eggs or "?")
        print(
            f"{o.retailer[:16]:16} {pr:>8} {eggs:>5} {w:>7} {pe:>8} {o.stock[:12]:12} {o.title[:40]}"
        )
        print(f"{'':16} {o.url}")


def build_report(offers: list[Offer]) -> dict[str, Any]:
    c700 = [o for o in offers if o.category == "caged_700g"]
    c30 = [o for o in offers if o.category == "caged_30pack"]
    cheap700 = cheapest(c700, "caged_700g")
    cheap700_stock = cheapest(c700, "caged_700g", in_stock_only=True)
    cheap30 = cheapest(c30, "caged_30pack")
    cheap30_stock = cheapest(c30, "caged_30pack", in_stock_only=True)

    return {
        "as_of_local_date": TODAY,
        "fetched_at": NOW_ISO,
        "scope": {
            "caged_700g": "Caged eggs ONLY, pack weight exactly 700g (usually 12-pack).",
            "caged_30pack": "Caged 30-egg trays — typically 1.5kg or 1.75kg, NOT 700g.",
            "excluded": "Cage-free, free-range, organic, 600g/800g dozens.",
        },
        "summary": {
            "cheapest_700g_per_egg": asdict(cheap700) if cheap700 else None,
            "cheapest_700g_per_egg_in_stock": asdict(cheap700_stock) if cheap700_stock else None,
            "cheapest_30pack_per_egg": asdict(cheap30) if cheap30 else None,
            "cheapest_30pack_per_egg_in_stock": asdict(cheap30_stock) if cheap30_stock else None,
        },
        "offers_caged_700g": [asdict(o) for o in c700],
        "offers_caged_30pack": [asdict(o) for o in c30],
        "skipped_or_blocked": [
            asdict(o)
            for o in offers
            if o.category == "skipped" or o.price_aud is None
        ],
        "limitations": [
            "Woolworths/Coles often 403 bots and hide prices without a delivery address.",
            "Online stock ≠ every physical store; Sydney postcode can change price/stock.",
            "Flash-sale prices (Umall/Gourmet Grocer) may be 1-per-customer and sell out fast.",
            "National egg supply ('how many eggs left in Australia') is not published as a live SKU field; only retailer stock flags are available.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Scout live AU caged egg prices (700g + 30-packs)")
    ap.add_argument("--json", type=Path, help="Write full JSON report to this path")
    ap.add_argument(
        "--with-browser",
        action="store_true",
        help="Also open Woolworths/IGA via Playwright (optional)",
    )
    ap.add_argument(
        "--include-yolko",
        action="store_true",
        help="Include YOLKO own prices in the tables for comparison",
    )
    ap.add_argument(
        "--manual",
        type=Path,
        default=Path(__file__).with_name("egg-price-manual-notes.json"),
        help="Merge manually verified offers JSON (default: infra/egg-price-manual-notes.json)",
    )
    ap.add_argument("--no-manual", action="store_true", help="Skip manual notes file")
    args = ap.parse_args()

    print(f"YOLKO egg price scout — {TODAY}")
    print("Strict filter: CAGED + 700g for dozen lane; 30-packs reported separately (not 700g).")

    offers: list[Offer] = []
    print("\nFetching Umall (Shopify)…")
    offers.extend(collect_umall())
    print("Fetching Gourmet Grocer (WooCommerce)…")
    offers.extend(collect_gourmet_grocer())
    seeds = collect_manual_browser_seeds()
    offers.extend(seeds)

    if args.with_browser:
        print("Playwright pass for major chains…")
        browser_rows = collect_with_playwright(seeds)
        # Replace seed rows for same URL when browser got a result
        by_url = {o.url: o for o in offers}
        for o in browser_rows:
            by_url[o.url] = o
        offers = list(by_url.values())

    if args.include_yolko:
        offers.extend(yolko_reference())

    if not args.no_manual and args.manual:
        print(f"Merging manual notes ← {args.manual}")
        offers.extend(load_manual_notes(args.manual))

    offers = _dedupe(offers)
    report = build_report(offers)

    c700 = [o for o in offers if o.category == "caged_700g"]
    c30 = [o for o in offers if o.category == "caged_30pack"]
    print_table(f"CAGED 700g packs ({TODAY})", c700)
    print_table(f"CAGED 30-packs — NOT 700g ({TODAY})", c30)

    print("\n" + "=" * 88)
    print("CHEAPEST PER EGG")
    print("=" * 88)
    for label, key in (
        ("700g any listed price", "cheapest_700g_per_egg"),
        ("700g in stock only", "cheapest_700g_per_egg_in_stock"),
        ("30-pack any listed price", "cheapest_30pack_per_egg"),
        ("30-pack in stock only", "cheapest_30pack_per_egg_in_stock"),
    ):
        row = report["summary"].get(key)
        if not row:
            print(f"  {label}: not found")
            continue
        print(
            f"  {label}: ${row['per_egg_aud']:.3f}/egg  "
            f"(${row['price_aud']:.2f} / {row['pack_eggs']} eggs) @ {row['retailer']} — {row['stock']}"
        )
        print(f"    {row['url']}")

    print("\nSupply note:")
    print("  Retail sites expose in_stock / out_of_stock per SKU only.")
    print("  There is no public live feed for national 'eggs left in supply'.")
    print("  For wholesale supply, check Sydney Markets / your Pace Farm rep.")

    out_path = args.json or Path("/tmp/yolko-egg-price-scout.json")
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote JSON report → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
