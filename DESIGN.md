# YOLKO Design System — locked (v134)

**Design read:** Local-food conversion landing for Flemington shoppers — honest market brand with modern DTC clarity. Forest ink + yolk amber on cool stone. Premium = air + photoreal product presence, not density. Not Pace Farm chrome. Not cream craft. Not purple AI.

**Dials:** VARIANCE 5 · MOTION 4 · DENSITY 3

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Brand values
1. **Fair price** — market-direct trays at $12
2. **Book ahead** — reserve online so you don’t miss out
3. **Weekend-fresh** — Friday & Saturday pickup
4. **Real Pace Farm** — large eggs, 1.75kg trays

## 2026 first-page taste (Apr–Jul research lock)
Quiet DTC + cinematic product-shot hero — the winning mid-2026 pattern for physical goods:
1. **Photoreal product as the visual idea** (not stock, not abstract mesh)
2. **Brand as a hero-level signal** (not nav-only)
3. **Bold type + air** — one claim, one CTA, generous rhythm
4. **Soft tactile depth** — cutout layers, contact shadow, light wash (not flat fill)
5. **Trust near the offer** — specific facts, not logo walls

**Not for this page:** dark luxury perfume UI, WebGL spectacle, autoplay video headers, purple SaaS mesh. Those are “another level” for fashion/tech — wrong for weekend market eggs.

**Signature technique (B1 lite):** transparent tray cutout over live stone + soft light bloom + gentle parallax. Feels volumetric without a heavy cinema scrub that would hurt conversion.

## Signature
Higgsfield **2K marketing-studio tray** → rembg cutout (`assets/tray-cutout.webp`) as a designed hero mark on live page stone — real alpha, no photo rectangle. Soft contact shadow + light bloom + gentle float/parallax. **YOLKO** wordmark is hero-level (larger than the claim line).

## Hero copy (locked)
```
YOLKO
Flemington · Fri & Sat
Fresh eggs.
Fair price.
$12 · 30 large · Pace Farm
Book online. Collect at Paddy's Markets Flemington.
[Book your tray]
```
Premium rules: brand first, intentional 2-line claim, generous vertical rhythm, one CTA, weight 700–800, no cramped stacks.

## Tray rules
1. Page stone matches the hero ground.
2. Hero tray = transparent cutout mark, not a photo/video rectangle.
3. Closed lid only in order section.
4. Soft **contact shadow** under the cutout is required for grounding (`drop-shadow` + ground ellipse). No gray fill, no media frame, no hard card box-shadow.
5. Hero uses Higgsfield background-removed cutout (true alpha). Do not place opaque rectangular video/photo boxes in the hero.
6. Soft yolk light bloom behind the mark is allowed; keep it subtle (atmosphere, not glow-slop).

## Tokens
| Token | Hex | Role |
|-------|-----|------|
| stone | `#E2E4DE` | page + tray match |
| ink | `#14201A` | text + CTA |
| soft | `#5A6B60` | secondary |
| line | `#C9D1C8` | borders |
| yolk | `#E89B12` | price accent |
| leaf | `#1F6B45` | values accent |
| mist | `#DCE4DC` | panels |
| white | `#F7F9F6` | surfaces |
| font | Sora | UI |
| radius | 8–12px | quiet corners |

## Kill list
- Congested hero / ultra-tight leading
- Purple, cream craft, broadsheet
- Pills, chips, hero badges
- Framed product photos
- Inter / Roboto / system-only type
- Brand only in the nav (hero must carry YOLKO)
- Flat single-fill hero with no atmosphere
