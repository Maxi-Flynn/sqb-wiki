# Next Steps — Prioritized Backlog

Organized by priority. "P0" = blocks basic functionality or launch, "P1" = important but not blocking, "P2" = nice-to-have.

---

## P0 — Before first real deploy

- [ ] **Create PWA icons.** `manifest.json` references `assets/icon-192.png` and `assets/icon-512.png` that don't exist yet. Without these, "Add to Home Screen" on Android will use a generic icon. Suggest a simple sword/shield emblem in the gold-on-black theme (`#C4A35A` on `#0F0C08`) matching the site. Can be generated with any icon tool or AI image gen — doesn't need to be fancy, just needs to exist at both sizes.
- [ ] **Verify GitHub Pages deployment actually works end-to-end.** The workflow file (`.github/workflows/deploy.yml`) is written but untested against the real repo. After first push: confirm Settings → Pages → Source is set to "GitHub Actions" (not "Deploy from branch"), and confirm the Action runs green.
- [ ] **Test on an actual Android phone**, not just desktop browser dev tools. Font sizes, tap targets, and the sticky matrix header behavior all need real-device verification. The matrix pages in particular (`kvk-matrix.html`, `sg-matrix.html`) have horizontal scroll on narrow viewports — confirm this is usable, not janky.

## P1 — Content completeness

- [ ] **Get real KvK Day 2–5 screenshots from in-game.** The current `kvk-matrix.json` is built from an alliance-provided tip table cross-referenced against `kingshotguide.org`'s calculator — it's *probably* accurate but has never been directly verified against K1762's own event screens the way the SG matrix was. Next time KvK is live (prep estimated ~Aug 11 2026, see `data/windows.json`), screenshot every day's scoring screen the same way the SG data was collected, and update `kvk-matrix.json` accordingly. Update `_meta.sourceNote` once verified directly.
- [ ] **Fill in Strongest Governor Stage 3.** `sg-matrix.json` has a stage column marked `unverified: true` with no row data. Same process — grab screenshots when Stage 3 is next visible in-game.
- [ ] **Expand the Alliance Guides page.** Only 2 guides cataloged so far (Mystic Trial, Golden Glaives). This page is meant to grow — whenever someone in alliance chat drops a cheat sheet, it should get added to `data/guides.json` following the existing schema (see `CONTENT_GUIDE.md`).
- [ ] **Add Bear Trap, Merchant Empire, and Alliance Championship as full pages** (not just calendar entries). These were mentioned during research but never got their own timing matrix or ROI breakdown the way KvK/SG did. Lower priority than KvK verification since they're smaller events, but would round out the wiki.
- [ ] **Cross-check `resources.json` point values against a second source.** Everything currently traces back to a mix of alliance screenshots and 2-3 community wiki sites (kingshot.wiki, kingshotoptimizer.com, kingshotguide.com). Worth periodically spot-checking a few high-value entries (Mithril, Forgehammer) against the live game screen to catch any drift from patches.

## P1 — Functionality

- [ ] **"Today" tab persistence.** Currently the Today tab resets to "none" on every page load — if someone bookmarks the page mid-KvK, they have to re-select the event every time. Consider `localStorage` to remember the last-selected event (with a manual "clear" option, since events do end).
- [ ] **Auto-detect current event from the calendar data**, rather than requiring manual selection. `data/windows.json` has cadence info; if kingdom start dates and cycle lengths are tracked precisely enough, the Today tab could auto-select the live event instead of asking the user. This is a nice UX win but requires reliable date math — start simple (manual selection, which already works) and only build this if manual selection proves annoying in practice.
- [ ] **Search.** No way to search across resources/guides currently — you have to know which page to check. A simple client-side search box on the homepage that filters across `resources.json` + `guides.json` by name would help as content grows.

## P2 — Polish

- [ ] **Light mode toggle.** Currently dark-only. Matches the game's aesthetic and is probably fine to leave as-is, but flagging in case anyone asks.
- [ ] **Point value change history / changelog.** When a resource's point value gets updated (game patch, corrected data, etc.), it'd be nice to show "last changed" per-resource rather than just a global `lastUpdated` in `_meta`. Not urgent — only useful once the site has been live a while and values have actually drifted.
- [ ] **Offline support via Service Worker.** The manifest.json sets up PWA basics but there's no service worker for actual offline caching. Since this is meant to be checked mid-game (possibly with spotty connection), caching the JSON + assets for offline use would be a genuine quality improvement. Moderate complexity — worth doing once content has stabilized.
- [ ] **Print/export view for the matrices.** Someone might want to screenshot or print the KvK matrix to share outside the app (Discord, etc.). Current design is screenshot-able as-is on mobile, but a dedicated "compact" view might render more cleanly.

## Explicitly out of scope (for now)

These came up during the original conversation but were deliberately deferred — don't build these unless asked:

- **Machine-vision auto-parsing of screenshots into the data files.** There was an earlier exploration of building a pipeline where screenshots get sent to a vision API and auto-populate the JSON. That's a separate, much bigger project (see the "advisor app" concept discussed earlier in the project history) and shouldn't be conflated with this wiki. This wiki is meant to be manually curated — that's a feature, not a limitation, since it means every number has been eyeballed by a human before going live.
- **Protocol-level game state reading** (reverse-engineering the game's network traffic). Explored as a curiosity, not something this project needs or should depend on.
- **Multi-alliance / multi-kingdom support.** This is built specifically for SQB / K1762. If it needs to serve other alliances/kingdoms later, that's a real architecture decision (config-driven kingdom ID, etc.) — don't half-build it speculatively.
