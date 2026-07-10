# YOLKO Design System — locked (v118)

**Design read:** Local-food conversion landing for Flemington shoppers, quiet modern DTC language (Allbirds / Glossier clarity + market product proof). Not a Pace Farm clone. Not cream craft. Not poster.

**Dials:** VARIANCE 5 · MOTION 3 · DENSITY 4

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Signature (only one)
True transparent tray cutout (`assets/tray-cutout.webp`) sitting on solid `--stone` page ground. Contact shadow is baked into the alpha. No media card, no CSS glow, no CSS drop-shadow plate. Brand lives in the nav only.

## Hero copy (locked)
```
Flemington Markets · Fri & Sat
30 large eggs this weekend
$12 · one Pace Farm tray
Book online. Pick up Friday or Saturday at the stall.
```

## Tray rules (hard)
1. Page background must be solid `--stone` `#F3F4F1` — no page washes.
2. Hero tray = transparent cutout with baked contact shadow only.
3. No `border-radius`, no gray fill, no `box-shadow`, no `hero-glow`, no CSS `filter: drop-shadow` on the tray.
4. Never use an opaque studio photo with a different gray — that creates a visible image box.

## Tokens
| Token | Hex | Role |
|-------|-----|------|
| stone | `#F3F4F1` | page ground + tray asset ground |
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
- Soft colored blobs / hero-glow plates behind product
- Cream + Fraunces craft look
- Three equal pricing towers
- Updating `.price-big` by DOM index
- Gray rounded media frame around tray
- Cute slogan headlines
- Transparent cutout + CSS drop-shadow that reads as a boxed photo

## Business truth
- 1 tray $12 · 2 trays $23 · box $66
- Large eggs · 1.75kg · Fri/Sat Flemington
