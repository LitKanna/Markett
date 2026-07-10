# YOLKO Design System — locked (v122)

**Design read:** Local-food conversion landing for Flemington shoppers, quiet modern DTC language (Allbirds / Glossier clarity + market product proof). Not a Pace Farm clone. Not cream craft. Not poster.

**Dials:** VARIANCE 5 · MOTION 3 · DENSITY 4

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Signature (only one)
Clean **open studio tray** in the hero (`assets/tray-hero.webp`) on exact page stone — angled product proof, no busy retail label. Closed-lid pack lives in the order section only (`assets/tray-closed.webp`). Brand lives in the nav only.

## Hero copy (locked)
```
Flemington · Friday & Saturday
30 large eggs for the weekend
$12 · Pace Farm tray · 1.75kg
Book online. Collect at Paddy's Markets Flemington.
```

## Tray rules (hard)
1. Page background = solid `--stone` `#E8EBE8` (matches studio tray floor) (must match tray asset corners exactly).
2. Hero = open studio tray (landscape). Do **not** put the busy closed-lid retail label pack in the hero.
3. Closed-lid pack is allowed only in the order section as “what you pick up.”
4. No `border-radius`, no gray fill, no `box-shadow`, no `hero-glow`, no CSS `drop-shadow` on the tray.
5. Never rembg clear open trays for the hero.

## Tokens
| Token | Hex | Role |
|-------|-----|------|
| stone | `#E8EBE8` | page ground + matches studio tray floor |
| ink | `#121412` | text + primary CTA |
| soft | `#5C655E` | secondary text |
| line | `#D5D9D3` | rules / borders |
| yolk | `#D9960A` | price accent + eyebrow rule |
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
- Busy closed-lid retail pack as the hero image
- rembg / aggressive cutouts on clear open trays

## Business truth
- 1 tray $12 · 2 trays $23 · box $66
- Large eggs · 1.75kg · Fri/Sat Flemington
