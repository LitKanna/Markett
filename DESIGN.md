# YOLKO Design System — locked (v111)

**Design read:** Local-food conversion landing for Flemington shoppers, quiet modern DTC language (Allbirds / Glossier clarity + market product proof). Not a Pace Farm clone. Not cream craft. Not poster.

**Dials:** VARIANCE 6 · MOTION 3 · DENSITY 3

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Signature (only one)
Clean studio tray beside a clear offer: yolk **$12** + “for 30 large eggs”. Brand lives in the nav — hero uses a statement, not a second YOLKO wordmark.

## Hero copy (locked)
```
Book ahead. Walk out with eggs.
$12 for 30 large eggs
Friday or Saturday pickup at Flemington Markets.
```
Do not repeat YOLKO as the hero headline. Prefer benefit/outcome marketing lines over flat location labels.

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
- Featured bundle = Double up ($23), but prices bound by `data-bundle` never DOM index

## Kill list for this brand (hard ban)
- Pace Farm logo clone / blue pill wordmark
- Floating decorative eggs
- Orange starburst / price sticker overlays
- 4-icon navy feature bars
- Soft colored blobs behind product
- Cream + Fraunces craft look
- Three equal pricing towers
- Updating `.price-big` by querySelectorAll index

## Business truth
- 1 tray $12 · 2 trays $23 · box $66
- Large eggs · 1.75kg · Fri/Sat Flemington
