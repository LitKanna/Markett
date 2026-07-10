# YOLKO Design System — locked (v125)

**Design read:** Local-food conversion landing for Flemington shoppers, quiet modern DTC language (Allbirds / Glossier clarity + market product proof). Not a Pace Farm clone. Not cream craft. Not poster.

**Dials:** VARIANCE 5 · MOTION 3 · DENSITY 4

**Must follow:** `docs/MODERN-WEB-TASTE-GUIDE.md` + `.cursor/skills/modern-web-taste/SKILL.md`

## One job
Book a Pace Farm tray for Friday or Saturday pickup at Flemington.

## Signature (only one)
Higgsfield **open studio tray** as a designed hero mark (`assets/tray-hero.webp`) — absolute product graphic on exact page stone, soft-dissolved edges, not a photo column. Closed-lid pack lives in the order section only (`assets/tray-closed.webp`). Brand lives in the nav only.

## Hero copy (locked)
```
Flemington · Friday & Saturday
30 large eggs for the weekend
$12 · Pace Farm tray · 1.75kg
Book online. Collect at Paddy's Markets Flemington.
```

## Tray rules (hard)
1. Page background = solid `--stone` `#E2E4DE` (matches Higgsfield hero ground) so the tray looks engraved, not pasted.
2. Hero = open studio tray. Soft CSS mask dissolves edges into the page — no rectangular media frame.
3. Closed-lid pack is allowed only in the order section as “what you pick up,” also edge-dissolved.
4. No `border-radius`, no gray fill, no `box-shadow`, no `hero-glow`, no CSS `drop-shadow` on the tray.
5. Never rembg clear open trays for the hero.
6. New product shots: generate with Higgsfield on seamless stone matching `--stone`, then soft-engrave edges.

## Tokens
| Token | Hex | Role |
|-------|-----|------|
| stone | `#E2E4DE` | page ground + matches Higgsfield hero floor |
| ink | `#121412` | text + primary CTA |
| soft | `#5C655E` | secondary text |
| line | `#CFD2CB` | rules / borders |
| yolk | `#D9960A` | price accent + eyebrow rule |
| mist | `#E5EBE6` | soft panels + closed-tray ground |
| white | `#FFFFFF` | surfaces |

## Kill list
- Purple / indigo gradients, cream craft, broadsheet columns
- Pills, chip clusters, floating badges on hero media
- Cards in the hero; framed product photos
- Busy closed-lid retail pack as the hero visual
- Inter / Roboto / system-only type
