/* ═══════════════════════════════════════════════
   Bear Trap Planner — UI controller
   Renders the board, wires pointer input, roster queue and share tools.
   Layout maths live in bear-trap-model.js
   ═══════════════════════════════════════════════ */

const BT_CELL_MIN = 14;
const BT_CELL_MAX = 48;
const BT_HISTORY_MAX = 40;
const BT_DRAG_THRESHOLD = 6;

/**
 * Board angles. Kingshot renders its map as a diamond grid, so 45° lines the
 * planner up with what you actually see in game. A square grid has 90°
 * symmetry, so 45° and the -135° some tools quote draw the same diamond.
 */
const BT_ANGLES = [45, 0];

/** View preferences are per-device chrome, deliberately kept out of the layout data. */
const BT_VIEW_KEY = "sqb-bear-trap-view";

const btState = {
  layout: null,
  tool: "select",
  activeQueueId: null,
  selectedId: null,
  cell: 26,
  rotation: 45,
  packing: "tight",
  history: [],
  drag: null,
};

const btEl = {};

function btSaveView() {
  try {
    localStorage.setItem(
      BT_VIEW_KEY,
      JSON.stringify({ rotation: btState.rotation, packing: btState.packing, cell: btState.cell })
    );
  } catch {
    /* private browsing — view prefs simply do not persist */
  }
}

function btLoadView() {
  try {
    return JSON.parse(localStorage.getItem(BT_VIEW_KEY)) || {};
  } catch {
    return {};
  }
}

/** How far a rotated square spreads relative to its side: 1 when square, √2 at 45°. */
function btSpread() {
  const rad = (btState.rotation * Math.PI) / 180;
  return Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad));
}

function btEscape(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  );
}

function btStatus(message, variant = "") {
  if (!btEl.status) return;
  btEl.status.textContent = message || "";
  btEl.status.className = `bt-status${variant ? ` ${variant}` : ""}`;
}

/* ── History ─────────────────────────────────── */

function btPushHistory() {
  btState.history.push(JSON.stringify(btSerialize(btState.layout)));
  if (btState.history.length > BT_HISTORY_MAX) btState.history.shift();
}

function btUndo() {
  const previous = btState.history.pop();
  if (!previous) {
    btStatus("Nothing left to undo.");
    return;
  }
  try {
    btState.layout = btDeserialize(JSON.parse(previous));
    btState.selectedId = null;
    btState.activeQueueId = null;
    btCommit();
    btStatus("Undone.");
  } catch {
    btStatus("Could not undo that step.", "warn");
  }
}

/** Persist + re-render. Call after every mutation. */
function btCommit() {
  btSaveLocal(btState.layout);
  btRenderAll();
}

/* ── Board rendering ─────────────────────────── */

function btRenderBoard() {
  const layout = btState.layout;
  const size = layout.gridSize;
  const cell = btState.cell;

  const side = size * cell;
  btEl.board.style.setProperty("--bt-cell", `${cell}px`);
  btEl.board.style.setProperty("--bt-angle", `${btState.rotation}deg`);
  btEl.board.style.width = `${side}px`;
  btEl.board.style.height = `${side}px`;
  btEl.board.style.transform = `translate(-50%, -50%) rotate(${btState.rotation}deg)`;
  btEl.cells.style.gridTemplateColumns = `repeat(${size}, ${cell}px)`;
  btEl.cells.style.gridTemplateRows = `repeat(${size}, ${cell}px)`;

  // The stage reserves the rotated bounding box so the diamond's corners are scrollable.
  const extent = Math.ceil(side * btSpread());
  btEl.stage.style.width = `${extent}px`;
  btEl.stage.style.height = `${extent}px`;

  const trap = btTrapCenter(layout);
  const territory = btCurrentTerritoryMaps();
  let cellsHtml = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!btCellPlayable(layout, x, y)) {
        cellsHtml += `<div class="bt-cell off"></div>`;
        continue;
      }
      const key = `${x},${y}`;
      const ring = Math.max(Math.abs(x + 0.5 - trap.x), Math.abs(y + 0.5 - trap.y)) <= 4 ? " inner" : "";
      const terr = territory.active.has(key)
        ? " territory-active"
        : territory.idle.has(key)
          ? " territory"
          : "";
      cellsHtml += `<div class="bt-cell${ring}${terr}"></div>`;
    }
  }
  btEl.cells.innerHTML = cellsHtml;

  btEl.pieces.innerHTML = btAllPieces(layout).map(btPieceHtml).join("");
}

/** Territory shading for the current selection / in-progress banner drag. */
function btCurrentTerritoryMaps() {
  const drag = btState.drag;
  let excludeId = null;
  let preview = null;

  if (drag && drag.moved && drag.type === "banner" && drag.target) {
    excludeId = drag.pieceId || null;
    preview = drag.target;
  }

  const selected = btState.selectedId ? btFindPiece(btState.layout, btState.selectedId) : null;
  const activeId = !preview && selected && selected.type === "banner" ? selected.id : null;

  return btTerritoryMaps(btState.layout, { excludeId, preview, activeId });
}

/** Update cell territory classes without rebuilding pieces (used while dragging). */
function btPaintTerritory() {
  if (!btEl.cells || !btState.layout) return;
  const size = btState.layout.gridSize;
  const territory = btCurrentTerritoryMaps();
  const cells = btEl.cells.children;
  let i = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const el = cells[i++];
      if (!el || el.classList.contains("off")) continue;
      const key = `${x},${y}`;
      el.classList.toggle("territory-active", territory.active.has(key));
      el.classList.toggle("territory", territory.idle.has(key) && !territory.active.has(key));
    }
  }
}

function btPieceHtml(piece) {
  const def = BT_PIECE_TYPES[piece.type];
  const cell = btState.cell;
  const style = [
    `left:${piece.x * cell}px`,
    `top:${piece.y * cell}px`,
    `width:${def.w * cell}px`,
    `height:${def.h * cell}px`,
  ].join(";");

  const selected = piece.id === btState.selectedId ? " selected" : "";
  const label = piece.name ? `<span class="bt-piece-label">${btEscape(piece.name)}</span>` : "";
  const meta = piece.pl != null ? `<span class="bt-piece-meta">${btFormatPower(piece.pl)}</span>`
    : piece.tc != null ? `<span class="bt-piece-meta">TC${btEscape(piece.tc)}</span>`
    : "";
  const title = btEscape(
    [def.label, piece.name, piece.tc != null ? `TC ${piece.tc}` : "", piece.pl != null ? `PL ${piece.pl.toLocaleString()}` : ""]
      .filter(Boolean)
      .join(" · ")
  );

  // .bt-piece-inner counter-rotates so names stay readable on a tilted board.
  return `<div class="bt-piece ${piece.type}${selected}" style="${style}" data-id="${piece.id}" title="${title}">
    <span class="bt-piece-inner"><span class="bt-piece-icon">${def.icon}</span>${label}${meta}</span>
  </div>`;
}

function btFormatPower(value) {
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e3) return `${Math.round(value / 1e3)}K`;
  return String(value);
}

/* ── Ghost / drop preview ────────────────────── */

function btShowGhost(type, x, y, valid) {
  const def = BT_PIECE_TYPES[type];
  const cell = btState.cell;
  btEl.ghost.style.display = "block";
  btEl.ghost.style.left = `${x * cell}px`;
  btEl.ghost.style.top = `${y * cell}px`;
  btEl.ghost.style.width = `${def.w * cell}px`;
  btEl.ghost.style.height = `${def.h * cell}px`;
  btEl.ghost.className = `bt-ghost ${valid ? "valid" : "invalid"}`;
}

function btHideGhost() {
  btEl.ghost.style.display = "none";
}

/* ── Roster queue ────────────────────────────── */

function btRenderQueue() {
  const queue = btState.layout.queue;
  btEl.queueCount.textContent = String(queue.length);

  if (!queue.length) {
    btEl.queue.innerHTML = `<div class="bt-empty">Roster empty — paste names above, then tap the board to place them.</div>`;
    return;
  }

  btEl.queue.innerHTML = queue
    .map((entry) => {
      const active = entry.id === btState.activeQueueId ? " active" : "";
      const meta = [entry.pl != null ? `PL ${btFormatPower(entry.pl)}` : "", entry.tc != null ? `TC ${entry.tc}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<div class="bt-queue-item${active}" data-queue-id="${entry.id}">
        <span class="bt-queue-name">${btEscape(entry.name)}</span>
        ${meta ? `<span class="bt-queue-meta">${btEscape(meta)}</span>` : ""}
        <button type="button" class="bt-queue-drop" data-remove-queue="${entry.id}" aria-label="Remove ${btEscape(entry.name)}">×</button>
      </div>`;
    })
    .join("");
}

/* ── Inspector ───────────────────────────────── */

function btRenderInspector() {
  const piece = btState.selectedId ? btFindPiece(btState.layout, btState.selectedId) : null;

  if (!piece) {
    btEl.inspector.innerHTML = `<div class="bt-empty">Nothing selected. Use the <strong>Select</strong> tool and tap a castle, node or banner to rename it.</div>`;
    return;
  }

  if (piece.type === "trap") {
    btEl.inspector.innerHTML = `<div class="bt-empty">🐻 <strong>Bear Trap</strong> is locked to the center of the board and cannot be moved or deleted.</div>`;
    return;
  }

  const def = BT_PIECE_TYPES[piece.type];
  const isCastle = piece.type === "castle";
  btEl.inspector.innerHTML = `
    <div class="bt-field">
      <label for="bt-edit-name">${def.icon} ${btEscape(def.label)} name</label>
      <input id="bt-edit-name" type="text" value="${btEscape(piece.name)}" placeholder="${isCastle ? "Player name" : "e.g. North Node"}" maxlength="24">
    </div>
    ${isCastle ? `
    <div class="bt-field-row">
      <div class="bt-field">
        <label for="bt-edit-tc">TC level</label>
        <input id="bt-edit-tc" type="number" min="1" max="40" value="${piece.tc ?? ""}" placeholder="—">
      </div>
      <div class="bt-field">
        <label for="bt-edit-pl">Power (PL)</label>
        <input id="bt-edit-pl" type="number" min="0" step="100000" value="${piece.pl ?? ""}" placeholder="—">
      </div>
    </div>` : ""}
    <div class="bt-btn-row">
      <button type="button" class="bt-btn" id="bt-edit-save">Save</button>
      <button type="button" class="bt-btn danger" id="bt-edit-delete">Remove</button>
    </div>`;

  btEl.inspector.querySelector("#bt-edit-save").addEventListener("click", btSaveInspector);
  btEl.inspector.querySelector("#bt-edit-delete").addEventListener("click", () => {
    btPushHistory();
    btReturnCastleToQueue(piece);
    btRemovePiece(btState.layout, piece.id);
    btState.selectedId = null;
    btCommit();
    btStatus("Removed.");
  });
  btEl.inspector.querySelector("#bt-edit-name").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btSaveInspector();
  });
}

function btSaveInspector() {
  const piece = btState.selectedId ? btFindPiece(btState.layout, btState.selectedId) : null;
  if (!piece || piece.type === "trap") return;

  const nameInput = btEl.inspector.querySelector("#bt-edit-name");
  const tcInput = btEl.inspector.querySelector("#bt-edit-tc");
  const plInput = btEl.inspector.querySelector("#bt-edit-pl");

  btPushHistory();
  piece.name = nameInput ? nameInput.value.trim().slice(0, 24) : piece.name;
  if (tcInput) piece.tc = btCleanNumber(tcInput.value, { min: 1, max: 40 });
  if (plInput) piece.pl = btCleanNumber(plInput.value, { min: 0 });
  btCommit();
  btStatus("Saved.");
}

/* ── Toolbar + stats ────────────────────────── */

function btRenderToolbar() {
  btEl.tools.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === btState.tool);
  });
  btEl.gridSize.value = String(btState.layout.gridSize);
  btEl.shape.value = btState.layout.shape;
  btEl.packing.value = btState.packing;
  btEl.angle.value = String(btState.rotation);
}

function btRenderStats() {
  const counts = { castle: 0, node: 0, banner: 0 };
  for (const piece of btState.layout.pieces) counts[piece.type] += 1;
  btEl.stats.innerHTML = `
    <span>🏰 ${counts.castle} castles</span>
    <span>⛏️ ${counts.node} nodes</span>
    <span>🚩 ${counts.banner} banners</span>
    <span>📋 ${btState.layout.queue.length} unplaced</span>`;
}

function btRenderAll() {
  btRenderBoard();
  btRenderQueue();
  btRenderInspector();
  btRenderToolbar();
  btRenderStats();
}

/* ── Placement actions ──────────────────────── */

function btActiveQueueEntry() {
  const queue = btState.layout.queue;
  if (!queue.length) return null;
  if (btState.activeQueueId) {
    const found = queue.find((q) => q.id === btState.activeQueueId);
    if (found) return found;
  }
  return queue[0];
}

function btConsumeQueueEntry(id) {
  const idx = btState.layout.queue.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  const [entry] = btState.layout.queue.splice(idx, 1);
  if (btState.activeQueueId === id) btState.activeQueueId = null;
  return entry;
}

/** Deleting a named castle puts the name back on the roster so it is not lost. */
function btReturnCastleToQueue(piece) {
  if (piece.type !== "castle" || !piece.name) return;
  btState.layout.queue.push({ id: btNewId("q"), name: piece.name, tc: piece.tc ?? null, pl: piece.pl ?? null });
}

function btPlaceAt(type, x, y, queueEntry) {
  const check = btCanPlace(btState.layout, type, x, y);
  if (!check.ok) {
    btStatus(check.reason === "overlap" ? "That spot is already taken." : "That spot is off the board.", "warn");
    return false;
  }

  btPushHistory();
  const nodeCount = btState.layout.pieces.filter((p) => p.type === "node").length;
  const piece = btAddPiece(btState.layout, {
    type,
    x,
    y,
    name: queueEntry ? queueEntry.name : type === "node" ? `Node ${nodeCount + 1}` : "",
    tc: queueEntry ? queueEntry.tc : null,
    pl: queueEntry ? queueEntry.pl : null,
  });
  if (!piece) {
    btState.history.pop();
    return false;
  }
  if (queueEntry) btConsumeQueueEntry(queueEntry.id);
  btState.selectedId = piece.id;
  btCommit();
  btStatus(queueEntry ? `Placed ${queueEntry.name}.` : `Placed ${BT_PIECE_TYPES[type].label.toLowerCase()}.`);
  return true;
}

function btHandleTap(x, y) {
  const layout = btState.layout;
  if (!btCellPlayable(layout, x, y)) return;
  const hit = btPieceAt(layout, x, y);

  if (btState.tool === "erase") {
    if (!hit || hit.type === "trap") {
      btStatus(hit ? "The bear trap cannot be removed." : "Nothing to erase there.");
      return;
    }
    btPushHistory();
    btReturnCastleToQueue(hit);
    btRemovePiece(layout, hit.id);
    if (btState.selectedId === hit.id) btState.selectedId = null;
    btCommit();
    btStatus(hit.name ? `Removed ${hit.name}.` : "Removed.");
    return;
  }

  if (btState.tool === "select") {
    btState.selectedId = hit ? hit.id : null;
    btRenderAll();
    return;
  }

  if (hit) {
    btState.selectedId = hit.id;
    btRenderAll();
    btStatus("That spot is already taken.", "warn");
    return;
  }

  const queueEntry = btState.tool === "castle" ? btActiveQueueEntry() : null;
  btPlaceAt(btState.tool, x, y, queueEntry);
}

/* ── Pointer drag ───────────────────────────── */

/**
 * Screen point -> grid cell. The board is rotated about its own center, so we
 * rotate the pointer back by the same angle before dividing into cells.
 * getBoundingClientRect gives the axis-aligned box, but rotation preserves the
 * center, so its midpoint is still the board's pivot.
 */
function btCellFromPoint(clientX, clientY) {
  const rect = btEl.board.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);

  const rad = (-btState.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const half = (btState.layout.gridSize * btState.cell) / 2;
  return {
    x: Math.floor((localX + half) / btState.cell),
    y: Math.floor((localY + half) / btState.cell),
  };
}

function btBeginDrag(ev, payload) {
  btState.drag = { ...payload, startX: ev.clientX, startY: ev.clientY, moved: false };
  window.addEventListener("pointermove", btOnDragMove);
  window.addEventListener("pointerup", btOnDragEnd);
  window.addEventListener("pointercancel", btOnDragCancel);
}

function btOnDragMove(ev) {
  const drag = btState.drag;
  if (!drag) return;

  if (!drag.moved) {
    const dist = Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY);
    if (dist < BT_DRAG_THRESHOLD) return;
    drag.moved = true;
  }

  if (!drag.type) return;

  const cell = btCellFromPoint(ev.clientX, ev.clientY);
  const target = { x: cell.x - drag.grabDx, y: cell.y - drag.grabDy };
  drag.target = target;
  const valid = btCanPlace(btState.layout, drag.type, target.x, target.y, drag.pieceId).ok;
  btShowGhost(drag.type, target.x, target.y, valid);
  if (drag.type === "banner") btPaintTerritory();
}

function btOnDragEnd(ev) {
  const drag = btState.drag;
  btCleanupDrag();
  if (!drag) return;

  if (!drag.moved) {
    if (drag.source === "queue") {
      btState.activeQueueId = drag.queueId;
      btState.tool = "castle";
      btRenderAll();
      const entry = btState.layout.queue.find((q) => q.id === drag.queueId);
      btStatus(entry ? `${entry.name} ready — tap the board to place.` : "");
      return;
    }
    const cell = btCellFromPoint(ev.clientX, ev.clientY);
    btHandleTap(cell.x, cell.y);
    return;
  }

  const target = drag.target;
  if (!target || !drag.type) return;

  if (drag.source === "queue") {
    const entry = btState.layout.queue.find((q) => q.id === drag.queueId);
    if (entry) btPlaceAt("castle", target.x, target.y, entry);
    return;
  }

  // Dragged out from an empty cell — place the active tool where it was dropped.
  if (drag.source === "cell") {
    const queueEntry = drag.type === "castle" ? btActiveQueueEntry() : null;
    btPlaceAt(drag.type, target.x, target.y, queueEntry);
    return;
  }

  if (!btMovePiece(btState.layout, drag.pieceId, target.x, target.y)) {
    btStatus("Can't drop there — off the board or overlapping.", "warn");
    return;
  }
  btPushHistory();
  btState.selectedId = drag.pieceId;
  btCommit();
  btStatus("Moved.");
}

function btOnDragCancel() {
  btCleanupDrag();
}

function btCleanupDrag() {
  btState.drag = null;
  btHideGhost();
  btPaintTerritory();
  window.removeEventListener("pointermove", btOnDragMove);
  window.removeEventListener("pointerup", btOnDragEnd);
  window.removeEventListener("pointercancel", btOnDragCancel);
}

/* ── Auto-layout (TC / PL) ──────────────────── */

function btAutoPlaceRoster() {
  if (!btState.layout.queue.length) {
    btStatus("Roster is empty — add castle names first.");
    return;
  }
  btPushHistory();
  const castles = [...btState.layout.queue];
  const { placed, unplaced } = btAutoLayout(btState.layout, castles, { packing: btState.packing });
  const unplacedIds = new Set(unplaced.map((c) => c.id));
  btState.layout.queue = btState.layout.queue.filter((q) => unplacedIds.has(q.id));
  btState.activeQueueId = null;
  btCommit();
  btStatus(
    unplaced.length
      ? `Placed ${placed.length}; ${unplaced.length} did not fit — enlarge the grid or clear space.`
      : `Placed ${placed.length} castles strongest-first around the trap.`,
    unplaced.length ? "warn" : ""
  );
}

function btRegenerateLayout() {
  const placedCastles = btState.layout.pieces.filter((p) => p.type === "castle");
  if (!placedCastles.length && !btState.layout.queue.length) {
    btStatus("Nothing to arrange yet — add castle names first.");
    return;
  }

  btPushHistory();
  const pool = [
    ...placedCastles.map((p) => ({ id: btNewId("q"), name: p.name, tc: p.tc, pl: p.pl })),
    ...btState.layout.queue.map((q) => ({ ...q })),
  ];
  btState.layout.pieces = btState.layout.pieces.filter((p) => p.type !== "castle");

  const { placed, unplaced } = btAutoLayout(btState.layout, pool, { packing: btState.packing });
  btState.layout.queue = unplaced.map((c) => ({ id: btNewId("q"), name: c.name, tc: c.tc, pl: c.pl }));
  btState.selectedId = null;
  btState.activeQueueId = null;
  btCommit();
  btStatus(
    unplaced.length
      ? `Re-packed ${placed.length} castles; ${unplaced.length} left on the roster.`
      : `Re-packed ${placed.length} castles — highest power nearest the trap.`,
    unplaced.length ? "warn" : ""
  );
}

/* ── Share / persistence ────────────────────── */

function btExport() {
  const json = JSON.stringify(btSerialize(btState.layout), null, 2);
  btEl.share.value = json;
  btStatus("Layout exported below — copy it or download the file.");
}

function btCopyShare() {
  if (!btEl.share.value.trim()) btExport();
  btEl.share.select();
  navigator.clipboard
    ?.writeText(btEl.share.value)
    .then(() => btStatus("Copied to clipboard."))
    .catch(() => btStatus("Select the text and copy manually.", "warn"));
}

function btDownload() {
  const json = JSON.stringify(btSerialize(btState.layout), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sqb-bear-trap-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  btStatus("Downloaded.");
}

function btImport(text) {
  if (!text || !text.trim()) {
    btStatus("Paste an exported layout first.", "warn");
    return;
  }
  try {
    const layout = btDeserialize(JSON.parse(text));
    btPushHistory();
    btState.layout = layout;
    btState.selectedId = null;
    btState.activeQueueId = null;
    btCommit();
    btStatus(`Loaded layout — ${layout.pieces.length} pieces, ${layout.queue.length} on roster.`);
  } catch (err) {
    btStatus(`Could not read that layout: ${err.message}`, "warn");
  }
}

function btImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => btImport(String(reader.result));
  reader.onerror = () => btStatus("Could not read that file.", "warn");
  reader.readAsText(file);
}

/* ── Named browser saves ─────────────────────── */

function btFormatSaveStamp(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function btRenderSavesList(selectedId) {
  if (!btEl.saves) return;
  const saves = btListNamedSaves();
  if (!saves.length) {
    btEl.saves.innerHTML = `<option value="">No saved layouts yet</option>`;
    return;
  }
  const pick = selectedId || btEl.saves.value;
  btEl.saves.innerHTML = saves
    .map((s) => {
      const stamp = btFormatSaveStamp(s.savedAt);
      const label = stamp ? `${btEscape(s.name)} — ${btEscape(stamp)}` : btEscape(s.name);
      return `<option value="${btEscape(s.id)}">${label}</option>`;
    })
    .join("");
  if (pick && [...btEl.saves.options].some((o) => o.value === pick)) btEl.saves.value = pick;
}

function btSaveNamed() {
  const name = (btEl.saveName?.value || "").trim();
  try {
    const entry = btUpsertNamedSave(name, btState.layout);
    btEl.saveName.value = entry.name;
    btRenderSavesList(entry.id);
    btStatus(`Saved “${entry.name}” on this device.`);
  } catch (err) {
    btStatus(err.message || "Could not save.", "warn");
  }
}

function btLoadNamed() {
  const id = btEl.saves?.value;
  const entry = id ? btGetNamedSave(id) : null;
  if (!entry) {
    btStatus("Pick a saved layout first.", "warn");
    return;
  }
  try {
    const layout = btDeserialize(entry.layout);
    btPushHistory();
    btState.layout = layout;
    btState.selectedId = null;
    btState.activeQueueId = null;
    btCommit();
    btEl.saveName.value = entry.name;
    btStatus(`Loaded “${entry.name}”.`);
  } catch (err) {
    btStatus(`Could not load that save: ${err.message}`, "warn");
  }
}

function btDownloadNamed() {
  const id = btEl.saves?.value;
  const entry = id ? btGetNamedSave(id) : null;
  if (!entry) {
    btStatus("Pick a saved layout to download.", "warn");
    return;
  }
  const json = JSON.stringify(entry.layout, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safe = entry.name.replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || "layout";
  link.href = url;
  link.download = `sqb-bear-trap-${safe}.json`;
  link.click();
  URL.revokeObjectURL(url);
  btStatus(`Downloaded “${entry.name}”.`);
}

function btDeleteNamed() {
  const id = btEl.saves?.value;
  const entry = id ? btGetNamedSave(id) : null;
  if (!entry) {
    btStatus("Pick a saved layout to delete.", "warn");
    return;
  }
  if (!window.confirm(`Delete saved layout “${entry.name}”?`)) return;
  btDeleteNamedSave(id);
  btRenderSavesList();
  btStatus(`Deleted “${entry.name}”.`);
}

/* ── Wiring ─────────────────────────────────── */

function btWireBoard() {
  btEl.pieces.addEventListener("pointerdown", (ev) => {
    const el = ev.target.closest(".bt-piece");
    if (!el) return;
    const piece = btFindPiece(btState.layout, el.dataset.id);
    if (!piece) return;

    if (piece.type === "trap" || btState.tool === "erase") {
      const cell = btCellFromPoint(ev.clientX, ev.clientY);
      btHandleTap(cell.x, cell.y);
      return;
    }

    const cell = btCellFromPoint(ev.clientX, ev.clientY);
    btBeginDrag(ev, {
      source: "piece",
      pieceId: piece.id,
      type: piece.type,
      grabDx: cell.x - piece.x,
      grabDy: cell.y - piece.y,
    });
  });

  btEl.cells.addEventListener("pointerdown", (ev) => {
    const placeable = btState.tool !== "select" && btState.tool !== "erase" && BT_PIECE_TYPES[btState.tool];
    btBeginDrag(ev, {
      source: "cell",
      type: placeable ? btState.tool : null,
      grabDx: 0,
      grabDy: 0,
    });
  });

  btEl.board.addEventListener("pointermove", (ev) => {
    if (btState.drag) return;
    if (btState.tool === "select" || btState.tool === "erase") {
      btHideGhost();
      return;
    }
    const cell = btCellFromPoint(ev.clientX, ev.clientY);
    const valid = btCanPlace(btState.layout, btState.tool, cell.x, cell.y).ok;
    btShowGhost(btState.tool, cell.x, cell.y, valid);
  });

  btEl.board.addEventListener("pointerleave", () => {
    if (!btState.drag) btHideGhost();
  });
}

function btWireQueue() {
  btEl.queue.addEventListener("pointerdown", (ev) => {
    if (ev.target.closest("[data-remove-queue]")) return;
    const item = ev.target.closest(".bt-queue-item");
    if (!item) return;
    btBeginDrag(ev, { source: "queue", queueId: item.dataset.queueId, type: "castle", grabDx: 0, grabDy: 0 });
  });

  btEl.queue.addEventListener("click", (ev) => {
    const removeBtn = ev.target.closest("[data-remove-queue]");
    if (!removeBtn) return;
    btPushHistory();
    btConsumeQueueEntry(removeBtn.dataset.removeQueue);
    btCommit();
    btStatus("Removed from roster.");
  });
}

function btWireRoster() {
  document.getElementById("bt-roster-add").addEventListener("click", () => {
    const entries = btParseRoster(btEl.rosterText.value);
    if (!entries.length) {
      btStatus("Add one name per line, e.g. \"Maxi, 30, 42000000\".", "warn");
      return;
    }
    btPushHistory();
    btState.layout.queue.push(...entries);
    btEl.rosterText.value = "";
    btCommit();
    btStatus(`Added ${entries.length} to the roster.`);
  });

  document.getElementById("bt-single-add").addEventListener("click", () => {
    const name = btEl.singleName.value.trim();
    if (!name) {
      btStatus("Enter a castle name.", "warn");
      return;
    }
    btPushHistory();
    btState.layout.queue.push({
      id: btNewId("q"),
      name: name.slice(0, 24),
      tc: btCleanNumber(btEl.singleTc.value, { min: 1, max: 40 }),
      pl: btCleanNumber(btEl.singlePl.value, { min: 0 }),
    });
    btEl.singleName.value = "";
    btEl.singleTc.value = "";
    btEl.singlePl.value = "";
    btCommit();
    btStatus(`Added ${name}.`);
    btEl.singleName.focus();
  });

  btEl.singleName.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") document.getElementById("bt-single-add").click();
  });

  document.getElementById("bt-roster-clear").addEventListener("click", () => {
    if (!btState.layout.queue.length) return;
    btPushHistory();
    btState.layout.queue = [];
    btState.activeQueueId = null;
    btCommit();
    btStatus("Roster cleared.");
  });
}

function btWireToolbar() {
  btEl.tools.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-tool]");
    if (!btn) return;
    btState.tool = btn.dataset.tool;
    if (btState.tool !== "castle") btState.activeQueueId = null;
    btHideGhost();
    btRenderAll();
    btStatus(
      btState.tool === "castle"
        ? "Castle tool — tap the board to place the next roster name."
        : btState.tool === "erase"
          ? "Erase tool — tap a piece to remove it."
          : btState.tool === "select"
            ? "Select tool — tap a piece to rename it, drag to move."
            : `${BT_PIECE_TYPES[btState.tool].label} tool — tap the board to place.`
    );
  });

  document.getElementById("bt-zoom-in").addEventListener("click", () => btSetCell(btState.cell + 4));
  document.getElementById("bt-zoom-out").addEventListener("click", () => btSetCell(btState.cell - 4));
  document.getElementById("bt-zoom-fit").addEventListener("click", btFitBoard);
  document.getElementById("bt-undo").addEventListener("click", btUndo);

  btEl.angle.addEventListener("change", () => {
    const angle = Number(btEl.angle.value);
    btState.rotation = BT_ANGLES.includes(angle) ? angle : 45;
    btHideGhost();
    btSaveView();
    btRenderBoard();
    btFitBoard();
    btStatus(btState.rotation ? "Diamond view — matches the in-game map angle." : "Square view — straight top-down.");
  });

  btEl.gridSize.addEventListener("change", () => {
    const size = Number(btEl.gridSize.value);
    btPushHistory();
    const dropped = btResizeGrid(btState.layout, size);
    btState.selectedId = null;
    btCommit();
    btFitBoard();
    btStatus(dropped.length ? `Grid set to ${size}×${size} — ${dropped.length} piece(s) no longer fit and were removed.` : `Grid set to ${size}×${size}.`, dropped.length ? "warn" : "");
  });

  btEl.shape.addEventListener("change", () => {
    btPushHistory();
    const dropped = btSetShape(btState.layout, btEl.shape.value);
    btState.selectedId = null;
    btCommit();
    btStatus(dropped.length ? `Shape changed — ${dropped.length} piece(s) fell outside and were removed.` : "Shape changed.", dropped.length ? "warn" : "");
  });

  btEl.packing.addEventListener("change", () => {
    btState.packing = btEl.packing.value;
    btSaveView();
    btStatus(btState.packing === "spaced" ? "Auto-layout will leave a one-cell gap between castles." : "Auto-layout will pack castles tightly.");
  });
}

function btWireActions() {
  document.getElementById("bt-auto").addEventListener("click", btAutoPlaceRoster);
  document.getElementById("bt-regen").addEventListener("click", btRegenerateLayout);

  document.getElementById("bt-clear").addEventListener("click", () => {
    if (!btState.layout.pieces.length) return;
    btPushHistory();
    for (const piece of btState.layout.pieces) btReturnCastleToQueue(piece);
    btState.layout.pieces = [];
    btState.selectedId = null;
    btCommit();
    btStatus("Board cleared — castle names returned to the roster. Trap stays put.");
  });

  document.getElementById("bt-reset").addEventListener("click", () => {
    btPushHistory();
    btState.layout = btCreateLayout({ gridSize: btState.layout.gridSize, shape: btState.layout.shape });
    btState.selectedId = null;
    btState.activeQueueId = null;
    btCommit();
    btStatus("Reset to an empty board.");
  });

  document.getElementById("bt-export").addEventListener("click", btExport);
  document.getElementById("bt-copy").addEventListener("click", btCopyShare);
  document.getElementById("bt-download").addEventListener("click", btDownload);
  document.getElementById("bt-load").addEventListener("click", () => btImport(btEl.share.value));
  document.getElementById("bt-file").addEventListener("change", (ev) => {
    btImportFile(ev.target.files && ev.target.files[0]);
    ev.target.value = "";
  });

  document.getElementById("bt-save-named").addEventListener("click", btSaveNamed);
  document.getElementById("bt-load-named").addEventListener("click", btLoadNamed);
  document.getElementById("bt-download-named").addEventListener("click", btDownloadNamed);
  document.getElementById("bt-delete-named").addEventListener("click", btDeleteNamed);
  btEl.saveName.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btSaveNamed();
  });
}

/* ── Zoom ───────────────────────────────────── */

function btSetCell(size) {
  btState.cell = Math.min(BT_CELL_MAX, Math.max(BT_CELL_MIN, size));
  btHideGhost();
  btRenderBoard();
}

function btFitBoard() {
  const available = btEl.boardWrap.clientWidth - 4;
  if (available <= 0) return;
  btSetCell(Math.floor(available / (btState.layout.gridSize * btSpread())));
}

/* ── Init ───────────────────────────────────── */

/**
 * Apply tunables from data/bear-trap-defaults.json after first paint.
 * Does not yank an already-restored layout or a board the user has started editing.
 */
function btHydrateDefaults(defaults, { hadSaved }) {
  if (!defaults || typeof defaults !== "object") return;

  btConfigurePieceTypes(defaults.pieceTypes);
  btConfigureBannerCoverage(defaults.bannerCoverage);

  let needsFit = false;
  const untouched =
    !hadSaved &&
    !btState.layout.pieces.length &&
    !btState.layout.queue.length &&
    !btState.history.length;

  if (untouched) {
    const size = Number(defaults.gridSize);
    const shape = defaults.shape === "round" ? "round" : "square";
    if (
      BT_GRID_SIZES.includes(size) &&
      (size !== btState.layout.gridSize || shape !== btState.layout.shape)
    ) {
      btState.layout = btCreateLayout({ gridSize: size, shape });
      needsFit = true;
    }

    const cell = Number(defaults.cellSize);
    if (cell >= BT_CELL_MIN && cell <= BT_CELL_MAX && cell !== btState.cell) {
      btState.cell = cell;
      needsFit = true;
    }
  }

  btRenderAll();
  if (needsFit) btFitBoard();
}

async function btInit() {
  mountHeader({
    eyebrow: "SQB Alliance · Kingdom #1762",
    title: "🐻 Bear Trap Planner",
    sub: "Lay out castles, nodes & banners around the trap — replaces the Excel grid",
    activeId: "beartrap",
  });

  btEl.board = document.getElementById("bt-board");
  btEl.boardWrap = document.getElementById("bt-board-wrap");
  btEl.stage = document.getElementById("bt-stage");
  btEl.cells = document.getElementById("bt-cells");
  btEl.pieces = document.getElementById("bt-pieces");
  btEl.ghost = document.getElementById("bt-ghost");
  btEl.tools = document.getElementById("bt-tools");
  btEl.queue = document.getElementById("bt-queue");
  btEl.queueCount = document.getElementById("bt-queue-count");
  btEl.inspector = document.getElementById("bt-inspector");
  btEl.stats = document.getElementById("bt-stats");
  btEl.status = document.getElementById("bt-status");
  btEl.share = document.getElementById("bt-share");
  btEl.saveName = document.getElementById("bt-save-name");
  btEl.saves = document.getElementById("bt-saves");
  btEl.rosterText = document.getElementById("bt-roster-text");
  btEl.singleName = document.getElementById("bt-single-name");
  btEl.singleTc = document.getElementById("bt-single-tc");
  btEl.singlePl = document.getElementById("bt-single-pl");
  btEl.gridSize = document.getElementById("bt-grid-size");
  btEl.shape = document.getElementById("bt-shape");
  btEl.packing = document.getElementById("bt-packing");
  btEl.angle = document.getElementById("bt-angle");

  // Paint immediately with in-code defaults; hydrate from JSON when it arrives.
  btEl.gridSize.innerHTML = BT_GRID_SIZES.map(
    (size) => `<option value="${size}">${size} × ${size}</option>`
  ).join("");

  const saved = btLoadLocal();
  const view = btLoadView();
  btState.layout = saved || btCreateLayout();
  btState.cell = Math.min(BT_CELL_MAX, Math.max(BT_CELL_MIN, Number(view.cell) || 26));
  btState.rotation = BT_ANGLES.includes(Number(view.rotation)) ? Number(view.rotation) : 45;
  if (view.packing === "spaced" || view.packing === "tight") btState.packing = view.packing;

  btWireBoard();
  btWireQueue();
  btWireRoster();
  btWireToolbar();
  btWireActions();

  btRenderSavesList();
  btRenderAll();
  btFitBoard();
  window.addEventListener("resize", btFitBoard);

  btStatus(
    saved
      ? "Restored your last layout from this device."
      : "Fresh board — paste your castle roster, then tap to place."
  );

  try {
    const defaults = await loadData("bear-trap-defaults.json");
    btHydrateDefaults(defaults, { hadSaved: Boolean(saved) });
  } catch {
    /* built-in footprints / grid already on screen */
  }
}

btInit();
