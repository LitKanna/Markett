# YOLKO Design System — locked (v120)

**Design read:** Local-food conversion landing for Flemington shoppers, quiet modern DTC language (Allbirds / Glossier clarity + market product proof). Not a Pace Farm clone. Not cream craft. Not poster.

**Dials:** VARIANCE 5 · MOTION 3 · DENSITY 4

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Signature (only one)
Closed-lid Pace Farm 30-egg tray (`assets/tray-hero.webp`) on exact page stone — lid closed, 1.75kg label visible. Brand lives in the nav only.

## Hero copy (locked)
```
Flemington Markets · Fri & Sat
30 large eggs this weekend
$12 · one Pace Farm tray
Book online. Pick up Friday or Saturday at the stall.
```

## Tray rules (hard)
1. Page background = solid `--stone` `#F3F4F1` (must match tray asset corners exactly).
2. Hero asset = `tray-hero` closed-lid retail tray on stone. Prefer closed lid with Pace Farm label.
3. No `border-radius`, no gray fill, no `box-shadow`, no `hero-glow`, no CSS `drop-shadow` on the tray.
4. Natural studio shadow stays in the photo; do not add a second CSS shadow plate.

## Tokens
| Token | Hex | Role |
|-------|-----|------|
| stone | `#F3F4F1` | page ground + tray photo ground |
| ink | `#121412` | text + primary CTA |
| soft | `#5C655E` | secondary text |
| line | `#D5D9D3` | rules / borders |
| yolk | `#D9960A` | price accent only |
| mist | `#E5EBE6` | soft panels |
| white | `#FFFFFF` | surfaces |

## Type
- **Outfit** only (400/500/600/700/800)

## Shape
- Buttons / inputs: `10px`
- Cards / panels: `14px`
- **No pill CTAs**

## Kill list
- Pace Farm logo clone / blue pill wordmark
- Floating decorative eggs / orange starburst stickers
- 4-icon navy feature bars
- Soft colored blobs / hero-glow plates
- Cream + Fraunces craft look
- Three equal pricing towers
- Updating `.price-big` by DOM index
- Gray rounded media frame around tray
- Cute slogan headlines
- rembg / aggressive cutouts on clear plastic trays
- Transparent cutout + CSS drop-shadow that reads as a boxed photo

## Business truth
- 1 tray $12 · 2 trays $23 · box $66
- Large eggs · 1.75kg · Fri/Sat Flemington
