# Agent rules for YOLKO / Markett

## Design authority (non-negotiable)
1. Read `DESIGN.md` before any visual change.
2. Follow `docs/MODERN-WEB-TASTE-GUIDE.md` and `.cursor/skills/modern-web-taste/SKILL.md`.
3. Do not invent a new aesthetic mid-task. If tokens must change, update `DESIGN.md` first and explain why.
4. After UI work: screenshot desktop 1440 and mobile 390; verify kill-list absence; verify bundle prices by key.

## Coding rules for this site
- Preserve booking IDs: `order-form`, `bundle`, `pickupDay`, `qty-*`, `name`, `phone`, `submit-btn`, `buynow-btn`, `done`, `r-*`, `whatsapp-send`, `stripe-pay`, `mobile-cta`, `tray-spec`, `faq-eggs`, `stock-note`.
- Bind prices with `[data-price="tray1|tray2|box"]` / `[data-per="..."]` — never by DOM order of `.price-big`.
- Keep assetVersion bumps in `config.js` + cache-bust query params + worker `X-Yolko-Build` in sync.
- Prefer full commit SHA in `DEPLOY_SHA`.

## Definition of done
- Live header build tag matches the shipped version
- Bundle cards show correct $12 / $23 / $66 mapping
- No kill-list items from `DESIGN.md`
- LCP hero image WebP present and preloaded
