/* ═══════════════════════════════════════════════
   Bear Trap Planner — layout model
   Pure geometry + state helpers. No DOM access here.
   ═══════════════════════════════════════════════ */

const BT_STORAGE_KEY = "sqb-bear-trap-layout";
const BT_SCHEMA = 1;

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
    queue: [],
  };
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

function btAddPiece(layout, { type, x, y, name = "", tc = null, pl = null }) {
  const check = btCanPlace(layout, type, x, y);
  if (!check.ok) return null;
  const piece = { id: btNewId(type), type, name, x, y, tc, pl };
  layout.pieces.push(piece);
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
  return layout.pieces.splice(idx, 1)[0];
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
 * Strongest-first ordering: PL-ranked castles lead, then TC-only, then unranked.
 * PL and TC live on different scales, so they are bucketed rather than mixed.
 */
function btCompareStrength(a, b) {
  const bucket = (c) => (c.pl != null ? 0 : c.tc != null ? 1 : 2);
  const ba = bucket(a);
  const bb = bucket(b);
  if (ba !== bb) return ba - bb;
  if (ba === 0) return b.pl - a.pl;
  if (ba === 1) return b.tc - a.tc;
  return 0;
}

/**
 * Ring layout: sort castles strongest-first and pack them outward from the
 * trap, skipping cells already held by nodes, banners, or placed castles.
 */
function btAutoLayout(layout, castles, { packing = "tight" } = {}) {
  const placed = [];
  const unplaced = [];
  for (const castle of [...castles].sort(btCompareStrength)) {
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
    });
    if (piece) placed.push({ queueId: castle.id, piece });
    else unplaced.push(castle);
  }
  return { placed, unplaced };
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
    queue: layout.queue.map((q) => ({ name: q.name, tc: q.tc ?? null, pl: q.pl ?? null })),
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

  for (const piece of Array.isArray(raw.pieces) ? raw.pieces : []) {
    const type = piece && BT_PIECE_TYPES[piece.type] && piece.type !== "trap" ? piece.type : null;
    if (!type) continue;
    const x = Number(piece.x);
    const y = Number(piece.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    btAddPiece(layout, {
      type,
      x,
      y,
      name: typeof piece.name === "string" ? piece.name : "",
      tc: btCleanNumber(piece.tc, { min: 1, max: 40 }),
      pl: btCleanNumber(piece.pl, { min: 0 }),
    });
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
      name,
      tc: btCleanNumber(parts[1], { min: 1, max: 40 }),
      pl: btCleanNumber(parts[2], { min: 0 }),
    });
  }
  return entries;
}
