# Content Guide — How to Update Game Data

This is the guide for making the *common* kind of change: updating a point value, adding a new resource, adding a new alliance guide. None of this requires touching HTML, CSS, or JS — just editing JSON files in `data/`.

---

## Adding or editing a resource in the ROI Engine

File: `data/resources.json`

Each resource looks like this:

```json
{
  "id": "mithril",
  "cat": "prestige",
  "icon": "💠",
  "name": "Mithril",
  "tag": "Prestige upgrade material",
  "unlock": 4,
  "windows": [
    { "ev": "op1", "pts": 60000, "tier": "best" },
    { "ev": "kvk_d5", "pts": 40000, "tier": "good" },
    { "ev": "arm2", "pts": 8000, "tier": "meh" }
  ],
  "verdict": "<strong>Officer Project T1</strong> pays 60K — 7.5× the Armament rate."
}
```

Field guide:

| Field | What it is | Notes |
|---|---|---|
| `id` | Unique slug | lowercase, hyphen/underscore separated, never shown to users |
| `cat` | Category | One of: `hero`, `speed`, `pet`, `prestige`, `basic` — controls the filter chips on the ROI page |
| `icon` | Emoji | Shown in the card header |
| `name` | Display name | |
| `tag` | One-line description | Shown under the name, small/muted |
| `unlock` | Generation number | `1` = always available, `4` = shows a 🔒 lock badge until Gen 4. Check current gen in `resources.json`'s `_meta.currentGen` |
| `windows` | Array of scoring events | See below |
| `verdict` | HTML string | The plain-English takeaway shown at the bottom of the expanded card. `<strong>` tags are fine and used for emphasis. |

Each entry in `windows`:

| Field | What it is |
|---|---|
| `ev` | Must match a key in the `events` object at the top of the same file (e.g. `kvk_d2`, `op1`, `sg`) |
| `pts` | Points per single unit of this resource in this event |
| `tier` | `best`, `good`, or `meh` — controls the color coding (green/yellow/purple-ish). Use `best` for the single highest-value window(s), `good` for solid alternatives, `meh` for "technically scores but don't prioritize" |
| `note` | *(optional)* Small annotation shown next to the event, e.g. `"stage 7"` or `"T10, scales down"` |

**The card automatically shows whichever window has `tier: "best"` as the headline "Best window" badge.** If multiple windows are tied for best, it'll just pick the first one in the array — order matters slightly for display but not for logic.

To add a brand new resource: copy an existing entry, change every field, done. No code changes needed — `renderResourceCards()` in `js/common.js` will pick it up automatically.

To add a new event that resources can reference: add an entry to the `events` object at the top of `resources.json`:

```json
"new_event_id": { "name": "Display Name", "day": "when it happens", "icon": "🎉" }
```

---

## Updating the "Today" tab guidance

File: `data/today.json`

This is what powers the ✅ Spend Now / ✋ Hold split when someone selects an active event. Each event key (`kvk`, `sg`, `arm1`, `arm2`, `op1`, `op2`) has a `spend` array and a `hold` array, each containing:

```json
{ "icon": "💠", "name": "Mithril", "why": "60K — the single best Mithril window", "pts": "60,000" }
```

This is somewhat redundant with `resources.json` by design — it's a curated, hand-picked "top 5ish" list for quick scanning, not an exhaustive cross-reference. Keep entries here short and punchy; the full detail lives on the ROI Engine's "By Resource" tab.

---

## Updating the KvK or Strongest Governor matrices

Files: `data/kvk-matrix.json`, `data/sg-matrix.json`

Both follow the same shape. For KvK:

```json
{ "icon": "💠", "name": "Mithril", "pts": "40,000 pts", "cells": ["skip","skip","skip","prep","use"] }
```

The `cells` array has one entry per day/stage, **in order**, matching the `days` (KvK) or `stages` (SG) array at the top of the file. Valid values:

- `"use"` → ✅ green, spend now
- `"prep"` → 🆗 yellow, okay but not optimal (SG also uses this for "complete the task, don't claim yet")
- `"skip"` → ⛔ red, don't spend
- `"free"` → 🔷 blue, no scoring value either way (SG only)
- `"na"` → shows as `—`, used when a stage isn't verified yet (see Stage 3 in SG matrix)

SG matrix additionally groups rows into `sections` (e.g. "⚡ Speedups", "🧙 Hero Items") — each section has a `title` and a `rows` array. KvK doesn't currently use sections (everything's in one flat list) but the renderer (`renderMatrix()` in `common.js`) supports it if you want to add grouping later — just wrap the KvK rows in a `sections: [{ title: "...", rows: [...] }]` structure matching the SG file's shape.

**To add a new day/stage:** add an entry to the `days`/`stages` array, then make sure every row's `cells` array gets a new entry in the same position (even if it's just `"skip"` as a placeholder). Mismatched array lengths will misalign the grid visually — the renderer doesn't currently validate this, so double-check by eye after editing.

---

## Adding an alliance guide

File: `data/guides.json`

```json
{
  "id": "unique-slug",
  "title": "Display Title",
  "icon": "🔮",
  "summary": "One-line description shown on the card",
  "table": {
    "headers": ["Col 1", "Col 2", "Col 3"],
    "rows": [
      ["value", "value", "value"],
      ["value", "value", "value"]
    ]
  },
  "note": "Freeform explanation shown below the table. Plain text or simple HTML."
}
```

Every guide renders as a card with a table — this works well for the two current guides (troop composition ratios, timing schedules) but isn't the only shape a "guide" could take. If a future cheat sheet doesn't fit a table (e.g. it's a list of steps, or freeform strategy text), the `guides.html` page's render logic will need a small extension to handle a non-table guide type. Flag this if it comes up rather than forcing a table shape that doesn't fit.

---

## Updating the calendar / milestones

File: `data/windows.json`

`schedule` = recurring event cadence (rarely changes). `upcomingMilestones` = dated, one-time events — prune old ones periodically and add new ones as they're discovered (patch notes, in-game announcements, community wikis).

---

## General rules of thumb

- **Never hand-edit computed/derived values.** Everything in these files is either a direct game fact (a point value) or a hand-written judgment call (a verdict, a tier ranking). There's no build step transforming this data — what's in the JSON is exactly what renders.
- **Emoji icons are used throughout instead of image assets** — this was a deliberate simplicity choice (no asset pipeline needed, renders identically everywhere). Stick with this pattern unless there's a strong reason to switch to real icons.
- **Always validate JSON after editing.** A trailing comma or missing quote will silently break the page (it'll just show empty/broken). Any JSON validator works, or `python3 -m json.tool data/whatever.json` on the command line — no output means it's valid, an error means fix it before committing.
