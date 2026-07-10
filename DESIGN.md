# YOLKO Design System — locked (v116)

**Design read:** Local-food conversion landing for Flemington shoppers, quiet modern DTC language (Allbirds / Glossier clarity + market product proof). Not a Pace Farm clone. Not cream craft. Not poster.

**Dials:** VARIANCE 5 · MOTION 3 · DENSITY 4

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Signature (only one)
Freestanding cutout tray on the page (no media card) beside a commercial headline + yolk **$12** offer. Brand lives in the nav only.

## Hero copy (locked)
```
30 large eggs this weekend
$12 · one Pace Farm tray
Book online. Pick up Friday or Saturday at Flemington Markets.
```
Always keep a real headline above the price. No cute slogans. No second YOLKO wordmark.

## Craft rules (why v115 felt bad)
1. **Atmosphere** — flat stone alone reads unfinished. Use a soft warm wash behind the hero product, never a gray card.
2. **Composition** — first viewport is one scene: copy left, tray right, proof strip as the floor. Not a sparse template.
3. **Hierarchy** — headline > price > lede > CTAs. Price is accent, not louder than the headline.
4. **Density** — tighten empty gaps; keep breathing room, kill dead space.
5. **Ground the tray** — freestanding cutout + soft radial wash + object drop-shadow. No rounded media frame.

## Tokens
| Token | Hex | Role |
|-------|-----|------|
| stone | `#F3F4F1` | page ground |
| ink | `#121412` | text + primary CTA |
| soft | `#5C655E` | secondary text |
| line | `#D5D9D3` | rules / borders |
| yolk | `#D9960A` | price accent only |
| mist | `#E5EBE6` | soft panels |
| white | `#FFFFFF` | surfaces |
| wash | `rgba(217,150,10,0.10)` | hero atmosphere only |

## Type
- **Outfit** only (400/500/600/700/800)
- No Inter, Fraunces, Syne, Plus Jakarta for this version

## Shape
- Buttons / inputs: `10px`
- Cards / panels: `14px`
- **No pill CTAs** (`border-radius: 999px` banned on buttons)

## Layout rules
- Asymmetric split hero (copy left, product right)
- Hero budget: statement headline + offer line + lede + CTA group + product
- Proof = text strip, no icons
- Cards only on pricing + booking form
- Featured bundle = Double up ($23), prices bound by `data-price` never DOM index

## Kill list for this brand (hard ban)
- Pace Farm logo clone / blue pill wordmark
- Floating decorative eggs
- Orange starburst / price sticker overlays
- 4-icon navy feature bars
- Soft colored blobs behind product (wash ≠ blob — wash is subtle radial only)
- Cream + Fraunces craft look
- Three equal pricing towers
- Updating `.price-big` by querySelectorAll index
- Gray rounded media frame / card around the tray photo
- Cute slogan headlines (“walk out with eggs”)

## Business truth
- 1 tray $12 · 2 trays $23 · box $66
- Large eggs · 1.75kg · Fri/Sat Flemington
