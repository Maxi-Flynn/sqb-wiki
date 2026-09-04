/* ═══════════════════════════════════════════════
   Bear Trap Planner — layout model
   Pure geometry + state helpers. No DOM access here.
   ═══════════════════════════════════════════════ */

const BT_STORAGE_KEY = "sqb-bear-trap-layout";
const BT_SCHEMA = 2;
const BT_ROSTER_SAVES_KEY = "sqb-bear-trap-rosters";
const BT_ROSTER_SAVES_MAX = 24;

/** Footprint (in cells) and display info per piece type. */
const BT_PIECE_TYPES = {
  trap: { w: 3, h: 3, label: "Bear Trap", icon: "🐻" },
  castle: { w: 2, h: 2, label: "Castle", icon: "🏰" },
  node: { w: 2, h: 2, label: "Node", icon: "⛏️" },
  banner: { w: 1, h: 1, label: "Banner", icon: "🚩" },
};

/** Odd sizes only — keeps the 3×3 trap exactly centered on the board. */
const BT_GRID_SIZES = [15, 19, 21, 25, 29];
const BT_GRID_DEFAULT = 21;

/**
 * Banner territory footprint in cells (odd). A 1×1 banner at (x,y) paints a
 * square of this side length centered on that cell — matches the common
 * Kingshot / Whiteout-style 7×7 banner perimeter.
 */
let BT_BANNER_COVERAGE = 7;

const BT_SAVES_KEY = "sqb-bear-trap-saves";
const BT_SAVES_MAX = 24;

let btIdSeq = 0;

function btNewId(prefix) {
  btIdSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${btIdSeq}`;
}

/** Allow data/bear-trap-defaults.json to override footprints without code changes. */
function btConfigurePieceTypes(overrides) {
  if (!overrides) return;
  for (const [type, def] of Object.entries(overrides)) {
    if (!BT_PIECE_TYPES[type]) continue;
    const w = Number(def.w);
    const h = Number(def.h);
    if (w > 0) BT_PIECE_TYPES[type].w = w;
    if (h > 0) BT_PIECE_TYPES[type].h = h;
    if (def.label) BT_PIECE_TYPES[type].label = def.label;
    if (def.icon) BT_PIECE_TYPES[type].icon = def.icon;
  }
}

/** Odd coverage sizes only so a 1×1 banner stays centered in its territory square. */
function btConfigureBannerCoverage(size) {
  const n = Number(size);
  if (Number.isFinite(n) && n >= 1 && n % 2 === 1) BT_BANNER_COVERAGE = n;
}

/** Every cell painted by a banner whose top-left is at (x, y). */
function btBannerCoverageCells(x, y) {
  const half = Math.floor(BT_BANNER_COVERAGE / 2);
  const cells = [];
  for (let cy = y - half; cy <= y + half; cy += 1) {
    for (let cx = x - half; cx <= x + half; cx += 1) {
      cells.push({ x: cx, y: cy });
    }
  }
  return cells;
}

/**
 * Alliance territory from placed banners.
 * `excludeId` skips a banner being dragged; `preview` paints its live ghost spot
 * into the active (bold) set instead.
 * Returns { idle: Set<"x,y">, active: Set<"x,y"> }.
 */
function btTerritoryMaps(layout, { excludeId = null, preview = null, activeId = null } = {}) {
  const idle = new Set();
  const active = new Set();

  for (const piece of layout.pieces) {
    if (piece.type !== "banner") continue;
    if (excludeId && piece.id === excludeId) continue;
    const target = activeId && piece.id === activeId ? active : idle;
    for (const cell of btBannerCoverageCells(piece.x, piece.y)) {
      if (!btCellPlayable(layout, cell.x, cell.y)) continue;
      target.add(`${cell.x},${cell.y}`);
    }
  }

  if (preview && Number.isFinite(preview.x) && Number.isFinite(preview.y)) {
    for (const cell of btBannerCoverageCells(preview.x, preview.y)) {
      if (!btCellPlayable(layout, cell.x, cell.y)) continue;
      active.add(`${cell.x},${cell.y}`);
    }
  }

  // Active wins over idle where they overlap.
  for (const key of active) idle.delete(key);

  return { idle, active };
}

function btFootprint(type) {
  const def = BT_PIECE_TYPES[type] || BT_PIECE_TYPES.banner;
  return { w: def.w, h: def.h };
}

/** Top-left cell that centers the trap on a grid of `size`. */
function btCenteredTrapOrigin(size) {
  const { w, h } = btFootprint("trap");
  return { x: Math.floor((size - w) / 2), y: Math.floor((size - h) / 2) };
}

function btCreateLayout({ gridSize = BT_GRID_DEFAULT, shape = "square" } = {}) {
  const size = BT_GRID_SIZES.includes(gridSize) ? gridSize : BT_GRID_DEFAULT;
  const origin = btCenteredTrapOrigin(size);
  return {
    schema: BT_SCHEMA,
    gridSize: size,
    shape: shape === "round" ? "round" : "square",
    trap: { id: "trap", type: "trap", name: "Bear Trap", x: origin.x, y: origin.y },
    pieces: [],
    /** Display order of castle piece ids — independent of map positions. */
    rosterOrder: [],
    /** Legacy unplaced queue — kept empty; migrated into placed castles on load. */
    queue: [],
  };
}

/** Castles currently on the board, in roster-list order. */
function btRosterCastles(layout) {
  const byId = new Map(layout.pieces.filter((p) => p.type === "castle").map((p) => [p.id, p]));
  const ordered = [];
  for (const id of layout.rosterOrder || []) {
    const piece = byId.get(id);
    if (piece) {
      ordered.push(piece);
      byId.delete(id);
    }
  }
  for (const piece of byId.values()) ordered.push(piece);
  return ordered;
}

/** Next free "Castle N" label — skips names already in use. */
function btNextCastleName(layout) {
  const used = new Set(layout.pieces.filter((p) => p.type === "castle").map((p) => p.name));
  let n = 1;
  while (used.has(`Castle ${n}`)) n += 1;
  return `Castle ${n}`;
}

function btSyncRosterOrder(layout) {
  const castleIds = new Set(layout.pieces.filter((p) => p.type === "castle").map((p) => p.id));
  const order = Array.isArray(layout.rosterOrder) ? layout.rosterOrder.filter((id) => castleIds.has(id)) : [];
  for (const id of castleIds) {
    if (!order.includes(id)) order.push(id);
  }
  layout.rosterOrder = order;
  return layout.rosterOrder;
}

function btAllPieces(layout) {
  return [layout.trap, ...layout.pieces];
}

function btCells(piece) {
  const { w, h } = btFootprint(piece.type);
  const cells = [];
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      cells.push({ x: piece.x + dx, y: piece.y + dy });
    }
  }
  return cells;
}

/** Geometric center of a piece, in cell units. */
function btPieceCenter(piece) {
  const { w, h } = btFootprint(piece.type);
  return { x: piece.x + w / 2, y: piece.y + h / 2 };
}

function btTrapCenter(layout) {
  return btPieceCenter(layout.trap);
}

/**
 * Is this cell part of the playable board?
 * Square boards use every cell; round boards mask the corners.
 */
function btCellPlayable(layout, x, y) {
  const size = layout.gridSize;
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  if (layout.shape !== "round") return true;
  const center = size / 2;
  const radius = center - 0.35;
  const dx = x + 0.5 - center;
  const dy = y + 0.5 - center;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

/** Does a footprint at (x,y) sit entirely on playable cells? */
function btFits(layout, type, x, y) {
  const { w, h } = btFootprint(type);
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      if (!btCellPlayable(layout, x + dx, y + dy)) return false;
    }
  }
  return true;
}

/** Map of "x,y" -> piece for every occupied cell. */
function btOccupancy(layout, excludeId) {
  const map = new Map();
  for (const piece of btAllPieces(layout)) {
    if (excludeId && piece.id === excludeId) continue;
    for (const cell of btCells(piece)) {
      map.set(`${cell.x},${cell.y}`, piece);
    }
  }
  return map;
}

function btPieceAt(layout, x, y) {
  for (const piece of btAllPieces(layout)) {
    const { w, h } = btFootprint(piece.type);
    if (x >= piece.x && x < piece.x + w && y >= piece.y && y < piece.y + h) return piece;
  }
  return null;
}

/**
 * Can `type` be placed with its top-left at (x,y)?
 * Returns { ok, reason } so callers can show why a drop was rejected.
 */
function btCanPlace(layout, type, x, y, excludeId) {
  if (!btFits(layout, type, x, y)) return { ok: false, reason: "off-board" };
  const occupied = btOccupancy(layout, excludeId);
  const { w, h } = btFootprint(type);
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      if (occupied.has(`${x + dx},${y + dy}`)) return { ok: false, reason: "overlap" };
    }
  }
  return { ok: true, reason: "" };
}

function btAddPiece(layout, { type, x, y, name = "", tc = null, pl = null, id = null }) {
  const check = btCanPlace(layout, type, x, y);
  if (!check.ok) return null;
  const piece = { id: id || btNewId(type), type, name, x, y, tc, pl };
  layout.pieces.push(piece);
  if (type === "castle") {
    if (!Array.isArray(layout.rosterOrder)) layout.rosterOrder = [];
    if (!layout.rosterOrder.includes(piece.id)) layout.rosterOrder.push(piece.id);
  }
  return piece;
}

function btFindPiece(layout, id) {
  if (id === "trap") return layout.trap;
  return layout.pieces.find((p) => p.id === id) || null;
}

function btMovePiece(layout, id, x, y) {
  const piece = btFindPiece(layout, id);
  if (!piece || piece.type === "trap") return false;
  if (!btCanPlace(layout, piece.type, x, y, id).ok) return false;
  piece.x = x;
  piece.y = y;
  return true;
}

function btRemovePiece(layout, id) {
  const idx = layout.pieces.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = layout.pieces.splice(idx, 1);
  if (removed.type === "castle" && Array.isArray(layout.rosterOrder)) {
    layout.rosterOrder = layout.rosterOrder.filter((rid) => rid !== id);
  }
  return removed;
}

/** Every legal top-left position for `type`, nearest the trap first. */
function btCandidateSpots(layout, type) {
  const trap = btTrapCenter(layout);
  const { w, h } = btFootprint(type);
  const spots = [];
  for (let y = 0; y <= layout.gridSize - h; y += 1) {
    for (let x = 0; x <= layout.gridSize - w; x += 1) {
      if (!btFits(layout, type, x, y)) continue;
      const cx = x + w / 2;
      const cy = y + h / 2;
      spots.push({ x, y, dist: Math.hypot(cx - trap.x, cy - trap.y) });
    }
  }
  spots.sort((a, b) => a.dist - b.dist || a.y - b.y || a.x - b.x);
  return spots;
}

/** Spaced packing keeps a one-cell breathing gap between castles. */
function btHasCastleBuffer(layout, x, y) {
  const { w, h } = btFootprint("castle");
  for (const piece of layout.pieces) {
    if (piece.type !== "castle") continue;
    const f = btFootprint(piece.type);
    const overlapX = x - 1 < piece.x + f.w && x + w + 1 > piece.x;
    const overlapY = y - 1 < piece.y + f.h && y + h + 1 > piece.y;
    if (overlapX && overlapY) return false;
  }
  return true;
}

function btBestSpot(layout, type, packing) {
  for (const spot of btCandidateSpots(layout, type)) {
    if (!btCanPlace(layout, type, spot.x, spot.y).ok) continue;
    if (type === "castle" && packing === "spaced" && !btHasCastleBuffer(layout, spot.x, spot.y)) continue;
    return spot;
  }
  return null;
}

/**
 * Compare castles for roster / auto-organize sorts.
 * `key`: "pl" | "tc" | "name"   `dir`: "asc" | "desc"
 */
function btCompareCastles(a, b, key = "pl", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const av = key === "name" ? String(a.name || "") : a[key];
  const bv = key === "name" ? String(b.name || "") : b[key];
  const aMissing = av == null || av === "";
  const bMissing = bv == null || bv === "";
  if (aMissing && bMissing) return String(a.name || "").localeCompare(String(b.name || ""));
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (key === "name") return sign * String(av).localeCompare(String(bv));
  if (av !== bv) return sign * (av - bv);
  return String(a.name || "").localeCompare(String(b.name || ""));
}

/** Reorder rosterOrder only — does not move pieces on the map. */
function btSortRoster(layout, key = "pl", dir = "desc") {
  const castles = btRosterCastles(layout).sort((a, b) => btCompareCastles(a, b, key, dir));
  layout.rosterOrder = castles.map((c) => c.id);
  return castles;
}

/**
 * Strongest-first fallback used when auto-organize doesn't specify a key.
 * PL-ranked castles lead, then TC-only, then unranked.
 */
function btCompareStrength(a, b) {
  return btCompareCastles(a, b, a.pl != null || b.pl != null ? "pl" : "tc", "desc");
}

/**
 * Place castles into free spots near the trap.
 * `sortBy`: "pl" | "tc" | "none" — "none" keeps the given array order (roster order).
 * Preserves existing piece ids when provided so roster links stay stable.
 */
function btAutoLayout(layout, castles, { packing = "tight", sortBy = "pl" } = {}) {
  const ordered =
    sortBy === "none"
      ? [...castles]
      : [...castles].sort((a, b) => btCompareCastles(a, b, sortBy, "desc"));
  const placed = [];
  const unplaced = [];
  for (const castle of ordered) {
    let spot = btBestSpot(layout, "castle", packing);
    if (!spot && packing === "spaced") spot = btBestSpot(layout, "castle", "tight");
    if (!spot) {
      unplaced.push(castle);
      continue;
    }
    const piece = btAddPiece(layout, {
      type: "castle",
      x: spot.x,
      y: spot.y,
      name: castle.name,
      tc: castle.tc,
      pl: castle.pl,
      id: castle.id && String(castle.id).startsWith("castle") ? castle.id : undefined,
    });
    if (piece) placed.push({ sourceId: castle.id, piece });
    else unplaced.push(castle);
  }
  btSyncRosterOrder(layout);
  return { placed, unplaced };
}

/**
 * Pull every castle off the board and re-ring them by PL or TC.
 * Roster order is updated to match the organize sort.
 */
function btReorganizeCastles(layout, { packing = "tight", sortBy = "pl" } = {}) {
  const castles = btRosterCastles(layout).map((c) => ({
    id: c.id,
    name: c.name,
    tc: c.tc,
    pl: c.pl,
  }));
  layout.pieces = layout.pieces.filter((p) => p.type !== "castle");
  layout.rosterOrder = [];
  return btAutoLayout(layout, castles, { packing, sortBy });
}

/**
 * Drop roster entries onto any free spots (bulk paste). Uses roster order, not strength.
 * Returns { placed, unplaced }.
 */
function btPlaceRosterEntries(layout, entries, { packing = "tight" } = {}) {
  return btAutoLayout(layout, entries, { packing, sortBy: "none" });
}

/** Migrate legacy unplaced queue into on-map castles (best-effort). */
function btMigrateQueueToMap(layout) {
  if (!Array.isArray(layout.queue) || !layout.queue.length) {
    layout.queue = [];
    btSyncRosterOrder(layout);
    return { placed: [], unplaced: [] };
  }
  const pending = layout.queue.map((q) => ({
    id: q.id,
    name: q.name || btNextCastleName(layout),
    tc: q.tc ?? null,
    pl: q.pl ?? null,
  }));
  layout.queue = [];
  const result = btPlaceRosterEntries(layout, pending, { packing: "tight" });
  btSyncRosterOrder(layout);
  return result;
}

/** Re-center the trap for a new grid size and drop anything that no longer fits. */
function btResizeGrid(layout, size) {
  const next = BT_GRID_SIZES.includes(size) ? size : layout.gridSize;
  layout.gridSize = next;
  const origin = btCenteredTrapOrigin(next);
  layout.trap.x = origin.x;
  layout.trap.y = origin.y;

  const kept = [];
  const dropped = [];
  const probe = { ...layout, pieces: [] };
  for (const piece of layout.pieces) {
    probe.pieces = kept;
    if (btCanPlace(probe, piece.type, piece.x, piece.y, piece.id).ok) kept.push(piece);
    else dropped.push(piece);
  }
  layout.pieces = kept;
  return dropped;
}

function btSetShape(layout, shape) {
  layout.shape = shape === "round" ? "round" : "square";
  const kept = [];
  const dropped = [];
  const probe = { ...layout, pieces: [] };
  for (const piece of layout.pieces) {
    probe.pieces = kept;
    if (btCanPlace(probe, piece.type, piece.x, piece.y, piece.id).ok) kept.push(piece);
    else dropped.push(piece);
  }
  layout.pieces = kept;
  return dropped;
}

/** Export shape: footprints are written out so the file reads standalone. */
function btSerialize(layout) {
  btSyncRosterOrder(layout);
  const trapF = btFootprint("trap");
  return {
    schema: BT_SCHEMA,
    gridSize: layout.gridSize,
    shape: layout.shape,
    trap: { x: layout.trap.x, y: layout.trap.y, w: trapF.w, h: trapF.h },
    pieces: layout.pieces.map((p) => {
      const f = btFootprint(p.type);
      return {
        id: p.id,
        type: p.type,
        name: p.name || "",
        x: p.x,
        y: p.y,
        w: f.w,
        h: f.h,
        tc: p.tc ?? null,
        pl: p.pl ?? null,
      };
    }),
    rosterOrder: [...(layout.rosterOrder || [])],
    queue: [],
  };
}

function btCleanNumber(value, { min, max }) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (min != null && num < min) return null;
  if (max != null && num > max) return null;
  return num;
}

/** Accepts our own export plus older/looser shapes (queue as plain strings). */
function btDeserialize(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Layout must be a JSON object");

  const size = BT_GRID_SIZES.includes(Number(raw.gridSize)) ? Number(raw.gridSize) : BT_GRID_DEFAULT;
  const layout = btCreateLayout({ gridSize: size, shape: raw.shape });

  if (raw.trap && Number.isFinite(Number(raw.trap.x)) && Number.isFinite(Number(raw.trap.y))) {
    const tx = Number(raw.trap.x);
    const ty = Number(raw.trap.y);
    if (btFits(layout, "trap", tx, ty)) {
      layout.trap.x = tx;
      layout.trap.y = ty;
    }
  }

  const idMap = new Map();
  for (const piece of Array.isArray(raw.pieces) ? raw.pieces : []) {
    const type = piece && BT_PIECE_TYPES[piece.type] && piece.type !== "trap" ? piece.type : null;
    if (!type) continue;
    const x = Number(piece.x);
    const y = Number(piece.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const added = btAddPiece(layout, {
      type,
      x,
      y,
      name: typeof piece.name === "string" ? piece.name : "",
      tc: btCleanNumber(piece.tc, { min: 1, max: 40 }),
      pl: btCleanNumber(piece.pl, { min: 0 }),
      id: typeof piece.id === "string" ? piece.id : undefined,
    });
    if (added && typeof piece.id === "string") idMap.set(piece.id, added.id);
  }

  if (Array.isArray(raw.rosterOrder) && raw.rosterOrder.length) {
    layout.rosterOrder = raw.rosterOrder.map((id) => idMap.get(id) || id);
  }

  for (const entry of Array.isArray(raw.queue) ? raw.queue : []) {
    if (typeof entry === "string") {
      if (entry.trim()) layout.queue.push({ id: btNewId("q"), name: entry.trim(), tc: null, pl: null });
      continue;
    }
    if (entry && typeof entry.name === "string" && entry.name.trim()) {
      layout.queue.push({
        id: btNewId("q"),
        name: entry.name.trim(),
        tc: btCleanNumber(entry.tc, { min: 1, max: 40 }),
        pl: btCleanNumber(entry.pl, { min: 0 }),
      });
    }
  }

  btMigrateQueueToMap(layout);
  btSyncRosterOrder(layout);
  return layout;
}

function btSaveLocal(layout) {
  try {
    localStorage.setItem(BT_STORAGE_KEY, JSON.stringify(btSerialize(layout)));
    return true;
  } catch {
    return false;
  }
}

function btLoadLocal() {
  try {
    const raw = localStorage.getItem(BT_STORAGE_KEY);
    if (!raw) return null;
    return btDeserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Named layout library — separate from the autosave scratch pad. */
function btListNamedSaves() {
  try {
    const raw = JSON.parse(localStorage.getItem(BT_SAVES_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function btWriteNamedSaves(saves) {
  localStorage.setItem(BT_SAVES_KEY, JSON.stringify(saves.slice(0, BT_SAVES_MAX)));
}

function btUpsertNamedSave(name, layout) {
  const trimmed = String(name || "").trim().slice(0, 48);
  if (!trimmed) throw new Error("Give this save a name");
  const saves = btListNamedSaves();
  const existing = saves.findIndex((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const entry = {
    id: existing >= 0 ? saves[existing].id : btNewId("save"),
    name: trimmed,
    savedAt: new Date().toISOString(),
    layout: btSerialize(layout),
  };
  if (existing >= 0) saves.splice(existing, 1);
  saves.unshift(entry);
  btWriteNamedSaves(saves);
  return entry;
}

function btGetNamedSave(id) {
  return btListNamedSaves().find((s) => s.id === id) || null;
}

function btDeleteNamedSave(id) {
  const next = btListNamedSaves().filter((s) => s.id !== id);
  btWriteNamedSaves(next);
  return next;
}

/** Parse a pasted roster. One castle per line: "Name", "Name, TC", "Name, TC, PL". */
function btParseRoster(text) {
  const entries = [];
  for (const line of String(text || "").split(/[\n\r]+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[,\t;|]+/).map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    entries.push({
      id: btNewId("q"),
      name: name.slice(0, 24),
      tc: btCleanNumber(parts[1], { min: 1, max: 40 }),
      pl: btCleanNumber(parts[2], { min: 0 }),
    });
  }
  return entries;
}

/** Roster-only export — people list without board coordinates. */
function btSerializeRoster(layout) {
  return {
    schema: BT_SCHEMA,
    type: "sqb-bear-trap-roster",
    savedAt: new Date().toISOString(),
    castles: btRosterCastles(layout).map((c) => ({
      name: c.name || "",
      tc: c.tc ?? null,
      pl: c.pl ?? null,
    })),
  };
}

function btParseRosterFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Roster must be a JSON object");
  if (Array.isArray(raw.castles)) {
    return raw.castles
      .filter((c) => c && typeof c.name === "string" && c.name.trim())
      .map((c) => ({
        id: btNewId("q"),
        name: c.name.trim().slice(0, 24),
        tc: btCleanNumber(c.tc, { min: 1, max: 40 }),
        pl: btCleanNumber(c.pl, { min: 0 }),
      }));
  }
  if (Array.isArray(raw.queue)) {
    return btParseRoster(
      raw.queue
        .map((q) => (typeof q === "string" ? q : [q.name, q.tc, q.pl].filter((v) => v != null && v !== "").join(", ")))
        .join("\n")
    );
  }
  throw new Error("No castles found in that file");
}

function btListRosterSaves() {
  try {
    const raw = JSON.parse(localStorage.getItem(BT_ROSTER_SAVES_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function btWriteRosterSaves(saves) {
  localStorage.setItem(BT_ROSTER_SAVES_KEY, JSON.stringify(saves.slice(0, BT_ROSTER_SAVES_MAX)));
}

function btUpsertRosterSave(name, layout) {
  const trimmed = String(name || "").trim().slice(0, 48);
  if (!trimmed) throw new Error("Give this roster a name");
  const saves = btListRosterSaves();
  const existing = saves.findIndex((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const entry = {
    id: existing >= 0 ? saves[existing].id : btNewId("roster"),
    name: trimmed,
    savedAt: new Date().toISOString(),
    roster: btSerializeRoster(layout),
  };
  if (existing >= 0) saves.splice(existing, 1);
  saves.unshift(entry);
  btWriteRosterSaves(saves);
  return entry;
}

function btGetRosterSave(id) {
  return btListRosterSaves().find((s) => s.id === id) || null;
}

function btDeleteRosterSave(id) {
  const next = btListRosterSaves().filter((s) => s.id !== id);
  btWriteRosterSaves(next);
  return next;
}
