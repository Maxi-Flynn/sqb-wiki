# SQB War Room — Kingdom #1762 Alliance Wiki

A mobile-first static site for the SQB alliance (Kingdom #1762) in **Kingshot**. Cheat sheets, timing matrices, and a resource-to-event ROI engine, built from alliance chat + community research + in-game screenshots.

**Live once deployed:** `https://trusstopher.github.io/sqb-wiki/`

---

## What this project is

This started as a series of ad-hoc questions to Claude about optimizing Kingshot gameplay — troop compositions, event timing, what to spend vs. hold. It grew into three things:

1. **A Resource ROI Engine** — every spendable resource (Mithril, Forgehammers, hero shards, speedups, taming marks, etc.) mapped to every event that scores it, ranked by points-per-unit, so you always know the *best* window to spend something rather than just *an okay* window.
2. **Two timing matrices** — Strongest Governor (7-stage) and KvK (5-day), each a spend/hold/skip grid built from real in-game screenshots.
3. **An alliance guide library** — cheat sheets (Mystic Trial comps, Watchtower timing tricks) sourced from alliance chat, meant to grow over time.

The whole thing is static HTML/CSS/JS with JSON data files — **no build step, no framework, no backend**. It's designed to be trivially editable: update a JSON file, the page re-renders. This was a deliberate choice so the alliance (or future-you) can maintain it without needing to know React or run `npm install`.

## Why it's built this way

- **Static + GitHub Pages** — free hosting, zero maintenance, works great as a "add to home screen" PWA on mobile (which is how everyone actually plays this game).
- **JSON data files separate from render logic** — `data/*.json` holds all the actual game knowledge (point values, event windows, verdicts). `js/common.js` holds the rendering logic. This means updating a point value or adding a new resource never requires touching JavaScript.
- **Shared `theme.css` + `common.js`** — every page uses the same design system and the same render functions (`renderMatrix()`, `renderResourceCards()`, `renderToday()`) so new pages are cheap to add and stay visually consistent.

## Current state (as of this handoff)

✅ Working:
- Homepage with tile nav
- ROI Engine (3 tabs: By Resource / Today / Windows) — fully functional, 18 resources cataloged
- KvK Matrix — 13 resources × 5 days, cross-verified against a public calculator
- Strongest Governor Matrix — full 7-stage grid (Stage 3 data is missing, flagged as unverified)
- Alliance Guides page — 2 guides cataloged (Mystic Trial, Golden Glaives)
- Calendar page — event cadence + upcoming K1762 milestones
- GitHub Actions workflow for auto-deploy to Pages on push to `main`
- PWA manifest (needs icon files — see Known Gaps)

⚠️ Known gaps — see `NEXT_STEPS.md` for the full prioritized list. Short version:
- No app icons yet (`assets/icon-192.png`, `assets/icon-512.png` referenced in `manifest.json` but not created)
- SG Matrix Stage 3 has no data
- No actual KvK Day 2-5 in-game screenshots yet — the KvK matrix is built from an alliance-provided tip table cross-checked against a third-party calculator, not directly from K1762's own event screens
- Point values are a snapshot from July 2026 and will drift as Century Games patches the game
- No search functionality across guides/resources
- No dark/light theme toggle (currently dark-only, which matches the game's aesthetic but some may want light mode)

## Tech stack

- Plain HTML5 + CSS3 (no preprocessor)
- Vanilla JavaScript (ES6+, no framework, no bundler)
- `fetch()` for JSON data loading (works fine on GitHub Pages, no CORS issues since same-origin)
- Google Fonts (Cinzel for headers, Inter for body) loaded via `@import` in `theme.css`
- GitHub Actions + GitHub Pages for hosting

No `package.json`, no `node_modules`, no build step. Open any HTML file with a local server (or even directly, though `fetch()` requires a server due to CORS-on-file:// restrictions) and it works.

## Local development

```bash
cd sqb-wiki
python3 -m http.server 8080
# visit http://localhost:8080
```

Any static file server works — `npx serve`, PHP's built-in server, VS Code's Live Server extension, etc. The only requirement is that it's served over HTTP(S), not opened as a `file://` URL, because `fetch()` for the JSON data files will be blocked by CORS otherwise.

## Deployment

Push to `main` on GitHub with Pages enabled (Settings → Pages → Source: GitHub Actions) and `.github/workflows/deploy.yml` handles the rest automatically. No manual build step.

## File structure

```
sqb-wiki/
├── index.html              # Homepage
├── manifest.json           # PWA manifest (needs icons — see gaps)
├── css/
│   └── theme.css           # Shared design system — ALL styling lives here
├── js/
│   └── common.js           # Shared render functions + data loading
├── data/                   # ← THE ACTUAL CONTENT LIVES HERE
│   ├── resources.json      # ROI engine's core dataset
│   ├── today.json          # Spend/hold guidance per active event
│   ├── sg-matrix.json      # Strongest Governor 7-stage grid
│   ├── kvk-matrix.json     # KvK 5-day grid
│   ├── windows.json        # Event cadence + kingdom milestones
│   └── guides.json         # Alliance cheat sheets
├── pages/
│   ├── roi-engine.html     # The flagship page
│   ├── kvk-matrix.html
│   ├── sg-matrix.html
│   ├── guides.html
│   └── calendar.html
├── assets/                 # Empty — needs PWA icons (see NEXT_STEPS.md)
└── .github/workflows/
    └── deploy.yml          # Auto-deploy on push to main
```

## For Cursor: how to work on this

See **`NEXT_STEPS.md`** for the prioritized backlog and **`CONTENT_GUIDE.md`** for how to add/edit game data without touching code. The short version of the philosophy:

- **90% of future work should be editing JSON in `data/`**, not touching HTML/CSS/JS. If you find yourself needing to change render logic for a simple content update, something's probably architected wrong — flag it.
- **Keep the "no build step" constraint** unless there's a strong reason to add one (e.g., if this grows enough to need bundling/minification). The whole point was maintainability by a non-developer.
- **Mobile-first always** — this is used almost exclusively on phones, mid-game, often one-handed. Every UI decision should assume a cramped viewport and someone glancing at it for 10 seconds before switching back to the game.
