# Kingshot Advisor (SQB Wiki)

Static HTML/CSS/JS wiki for SQB Alliance (Kingdom #1762), hosted on GitHub Pages from `main`.

**Live site:** https://maxi-flynn.github.io/sqb-wiki/  
**Repo:** https://github.com/Maxi-Flynn/sqb-wiki

## Stack

- No build step, no backend, no npm app
- Pages under `pages/`, shared JS under `js/`, data under `data/*.json`, styles in `css/theme.css`
- Shared helpers: `js/common.js` (`mountHeader`, `loadData`, nav)

## Bear Trap Planner (current focus)

| File | Role |
|------|------|
| `pages/bear-trap.html` | Page markup |
| `js/bear-trap-model.js` | Pure geometry / state (no DOM) |
| `js/bear-trap.js` | UI, pointer input, autosave, export |
| `data/bear-trap-defaults.json` | Footprints + default grid (tunable without code) |

**Footprints:** Bear Trap 3×3 (locked center), Castle 2×2, Node 2×2, Banner 1×1.  
**Grid sizes:** odd only (15 / 19 / 21 / 25 / 29) so the trap centers. Default 21×21.  
**View:** diamond (45°) by default to match Kingshot’s map angle; top-down toggle exists. Rotation is view-only (not in export JSON).  
**Persistence:** layout in `localStorage` (`sqb-bear-trap-layout`); view prefs in `sqb-bear-trap-view`. Share via Export / Import JSON.

## Cursor Cloud specific instructions

1. Preview with a static server from the repo root, e.g. `python -m http.server 8099`, then open `/pages/bear-trap.html`.
2. Do not assume Windows paths or the user’s browser `localStorage` — verify cold load in the VM browser.
3. Prefer small, reviewable PRs. Never force-push `main`.
4. After UI changes: tap-to-place, roster paste (`Name` / `Name, TC` / `Name, TC, Power`), auto-place, export→import, diamond vs top-down hit-testing.
5. Match existing dark gold theme tokens in `css/theme.css`; keep files modular (model vs UI).

## Known follow-ups (team pressure-testing)

- Touch drag on real phones (tap-to-place is solid; finger-drag less proven)
- Roster paste straight from Discord / Excel (odd separators)
- Brief blank board on first load while `bear-trap-defaults.json` fetches — consider render-then-hydrate if reported
- Collect officer feedback, then fix / polish in small PRs
