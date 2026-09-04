/* ═══════════════════════════════════════════════
   Bear Trap Planner — UI controller
   Renders the board, wires pointer input, roster panel and share tools.
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
  selectedId: null,
  hoverId: null,
  cell: 26,
  rotation: 45,
  packing: "tight",
  history: [],
  drag: null,
  editId: null,
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

/** Map UI packing labels ("loose") onto model values ("spaced"). */
function btNormalizePacking(value) {
  if (value === "spaced" || value === "loose") return "spaced";
  return "tight";
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
    btState.hoverId = null;
    btState.editId = null;
    btCloseModal(btEl.modalEdit);
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
  const hover = piece.id === btState.hoverId ? " hover" : "";
  const label = piece.name ? `<span class="bt-piece-label">${btEscape(piece.name)}</span>` : "";
  const meta =
    piece.pl != null
      ? `<span class="bt-piece-meta">${btFormatPower(piece.pl)}</span>`
      : piece.tc != null
        ? `<span class="bt-piece-meta">TC${btEscape(piece.tc)}</span>`
        : "";
  const title = btEscape(
    [def.label, piece.name, piece.tc != null ? `TC ${piece.tc}` : "", piece.pl != null ? `PL ${piece.pl.toLocaleString()}` : ""]
      .filter(Boolean)
      .join(" · ")
  );

  // .bt-piece-inner counter-rotates so names stay readable on a tilted board.
  return `<div class="bt-piece ${piece.type}${selected}${hover}" style="${style}" data-id="${piece.id}" title="${title}">
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

/* ── Roster panel ────────────────────────────── */

function btRenderRoster() {
  const castles = btRosterCastles(btState.layout);
  if (btEl.rosterCount) btEl.rosterCount.textContent = String(castles.length);

  if (!castles.length) {
    btEl.rosterList.innerHTML = `<div class="bt-empty">No castles yet — use the Castle tool or paste a roster below.</div>`;
    return;
  }

  btEl.rosterList.innerHTML = castles
    .map((piece) => {
      const active = piece.id === btState.selectedId ? " active" : "";
      const hover = piece.id === btState.hoverId ? " hover" : "";
      const meta = [piece.pl != null ? `PL ${btFormatPower(piece.pl)}` : "", piece.tc != null ? `TC ${piece.tc}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `<div class="bt-roster-row${active}${hover}" data-id="${btEscape(piece.id)}">
        <span class="bt-roster-name">${btEscape(piece.name || "Unnamed")}</span>
        ${meta ? `<span class="bt-roster-meta">${btEscape(meta)}</span>` : ""}
      </div>`;
    })
    .join("");
}

function btSetHover(id) {
  if (btState.hoverId === id) return;
  btState.hoverId = id || null;
  btSyncHoverClasses();
}

function btSyncHoverClasses() {
  if (btEl.pieces) {
    btEl.pieces.querySelectorAll(".bt-piece").forEach((el) => {
      el.classList.toggle("hover", el.dataset.id === btState.hoverId);
    });
  }
  if (btEl.rosterList) {
    btEl.rosterList.querySelectorAll(".bt-roster-row").forEach((el) => {
      el.classList.toggle("hover", el.dataset.id === btState.hoverId);
      el.classList.toggle("active", el.dataset.id === btState.selectedId);
    });
  }
}

/* ── Edit modal ──────────────────────────────── */

function btOpenModal(modal) {
  if (!modal) return;
  modal.hidden = false;
}

function btCloseModal(modal) {
  if (!modal) return;
  modal.hidden = true;
}

function btCloseAllModals() {
  btCloseModal(btEl.modalEdit);
  btCloseModal(btEl.modalOrganize);
  btCloseModal(btEl.modalManage);
  btState.editId = null;
}

function btOpenEditModal(pieceId) {
  const piece = btFindPiece(btState.layout, pieceId);
  if (!piece) return;

  if (piece.type === "trap") {
    btState.selectedId = piece.id;
    btRenderAll();
    btStatus("🐻 Bear Trap is locked to the center — it cannot be moved or edited.");
    return;
  }

  btState.selectedId = piece.id;
  btState.editId = piece.id;

  const def = BT_PIECE_TYPES[piece.type];
  const isCastle = piece.type === "castle";
  btEl.editTitle.textContent = `Edit ${def.label.toLowerCase()}`;
  btEl.editName.value = piece.name || "";
  btEl.editCastleFields.hidden = !isCastle;
  if (isCastle) {
    btEl.editTc.value = piece.tc ?? "";
    btEl.editPl.value = piece.pl ?? "";
  }

  btOpenModal(btEl.modalEdit);
  btRenderRoster();
  btRenderBoard();
  btEl.editName.focus();
  btEl.editName.select();
}

function btSaveEditModal() {
  const piece = btState.editId ? btFindPiece(btState.layout, btState.editId) : null;
  if (!piece || piece.type === "trap") return;

  btPushHistory();
  piece.name = btEl.editName.value.trim().slice(0, 24);
  if (piece.type === "castle") {
    piece.tc = btCleanNumber(btEl.editTc.value, { min: 1, max: 40 });
    piece.pl = btCleanNumber(btEl.editPl.value, { min: 0 });
  }
  btState.editId = null;
  btCloseModal(btEl.modalEdit);
  btCommit();
  btStatus("Saved.");
}

function btDeleteFromEditModal() {
  const piece = btState.editId ? btFindPiece(btState.layout, btState.editId) : null;
  if (!piece || piece.type === "trap") return;

  btPushHistory();
  btRemovePiece(btState.layout, piece.id);
  if (btState.selectedId === piece.id) btState.selectedId = null;
  if (btState.hoverId === piece.id) btState.hoverId = null;
  btState.editId = null;
  btCloseModal(btEl.modalEdit);
  btCommit();
  btStatus(piece.name ? `Removed ${piece.name}.` : "Removed.");
}

/* ── Mobile roster drawer ────────────────────── */

function btSetRosterOpen(open) {
  if (!btEl.rosterPanel) return;
  btEl.rosterPanel.classList.toggle("open", open);
  if (btEl.rosterToggle) btEl.rosterToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (btEl.rosterBackdrop) {
    btEl.rosterBackdrop.hidden = !open;
    btEl.rosterBackdrop.classList.toggle("show", open);
  }
}

/* ── Toolbar + stats ────────────────────────── */

function btRenderToolbar() {
  btEl.tools.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === btState.tool);
  });
  btEl.gridSize.value = String(btState.layout.gridSize);
  btEl.shape.value = btState.layout.shape;
  btEl.angle.value = String(btState.rotation);
}

function btRenderStats() {
  const counts = { castle: 0, node: 0, banner: 0 };
  for (const piece of btState.layout.pieces) {
    if (counts[piece.type] != null) counts[piece.type] += 1;
  }
  btEl.stats.innerHTML = `
    <span>🏰 ${counts.castle} castles</span>
    <span>⛏️ ${counts.node} nodes</span>
    <span>🚩 ${counts.banner} banners</span>`;
}

function btRenderAll() {
  btRenderBoard();
  btRenderRoster();
  btRenderToolbar();
  btRenderStats();
  btRenderSavesList();
  btRenderRosterSavesList();
}

/* ── Placement actions ──────────────────────── */

function btDefaultPieceName(type) {
  if (type === "castle") return btNextCastleName(btState.layout);
  if (type === "node") {
    const n = btState.layout.pieces.filter((p) => p.type === "node").length + 1;
    return `Node ${n}`;
  }
  if (type === "banner") {
    const n = btState.layout.pieces.filter((p) => p.type === "banner").length + 1;
    return `Banner ${n}`;
  }
  return "";
}

function btPlaceAt(type, x, y, extras = {}) {
  const check = btCanPlace(btState.layout, type, x, y);
  if (!check.ok) {
    btStatus(check.reason === "overlap" ? "That spot is already taken." : "That spot is off the board.", "warn");
    return false;
  }

  btPushHistory();
  const piece = btAddPiece(btState.layout, {
    type,
    x,
    y,
    name: extras.name != null ? extras.name : btDefaultPieceName(type),
    tc: extras.tc ?? null,
    pl: extras.pl ?? null,
  });
  if (!piece) {
    btState.history.pop();
    return false;
  }
  btState.selectedId = piece.id;
  btCommit();
  btStatus(`Placed ${piece.name || BT_PIECE_TYPES[type].label.toLowerCase()}.`);
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
    btRemovePiece(layout, hit.id);
    if (btState.selectedId === hit.id) btState.selectedId = null;
    if (btState.hoverId === hit.id) btState.hoverId = null;
    btCommit();
    btStatus(hit.name ? `Removed ${hit.name}.` : "Removed.");
    return;
  }

  if (btState.tool === "select") {
    if (!hit) {
      btState.selectedId = null;
      btRenderAll();
      return;
    }
    if (hit.type === "trap") {
      btState.selectedId = hit.id;
      btRenderAll();
      btStatus("🐻 Bear Trap is locked to the center — it cannot be moved or edited.");
      return;
    }
    btOpenEditModal(hit.id);
    return;
  }

  if (hit) {
    btState.selectedId = hit.id;
    btRenderAll();
    btStatus("That spot is already taken.", "warn");
    return;
  }

  btPlaceAt(btState.tool, x, y);
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
  ev.preventDefault();
  document.body.classList.add("bt-dragging");
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
    const cell = btCellFromPoint(ev.clientX, ev.clientY);
    btHandleTap(cell.x, cell.y);
    return;
  }

  const target = drag.target;
  if (!target || !drag.type) return;

  // Dragged out from an empty cell — place the active tool where it was dropped.
  if (drag.source === "cell") {
    btPlaceAt(drag.type, target.x, target.y);
    return;
  }

  if (!btCanPlace(btState.layout, drag.type, target.x, target.y, drag.pieceId).ok) {
    btStatus("Can't drop there — off the board or overlapping.", "warn");
    return;
  }

  btPushHistory();
  if (!btMovePiece(btState.layout, drag.pieceId, target.x, target.y)) {
    btState.history.pop();
    btStatus("Can't drop there — off the board or overlapping.", "warn");
    return;
  }
  btState.selectedId = drag.pieceId;
  btCommit();
  btStatus("Moved.");
}

function btOnDragCancel() {
  btCleanupDrag();
}

function btCleanupDrag() {
  btState.drag = null;
  document.body.classList.remove("bt-dragging");
  btHideGhost();
  btPaintTerritory();
  window.removeEventListener("pointermove", btOnDragMove);
  window.removeEventListener("pointerup", btOnDragEnd);
  window.removeEventListener("pointercancel", btOnDragCancel);
}

/* ── Auto-organize ──────────────────────────── */

function btRunOrganize() {
  const castles = btRosterCastles(btState.layout);
  if (!castles.length) {
    btStatus("Nothing to organize — place castles first.");
    return;
  }

  const packing = btNormalizePacking(btEl.orgPacking?.value || btState.packing);
  const sortBy = btEl.orgSort?.value === "tc" ? "tc" : "pl";

  btPushHistory();
  btState.packing = packing;
  btSaveView();
  const { placed, unplaced } = btReorganizeCastles(btState.layout, { packing, sortBy });
  btState.selectedId = null;
  btState.hoverId = null;
  btCloseModal(btEl.modalOrganize);
  btCommit();
  btStatus(
    unplaced.length
      ? `Organized ${placed.length} castles; ${unplaced.length} did not fit — enlarge the grid or clear space.`
      : `Organized ${placed.length} castles — ${sortBy.toUpperCase()} strongest nearest the trap.`,
    unplaced.length ? "warn" : ""
  );
}

/* ── Bulk roster paste ──────────────────────── */

function btBulkAddRoster() {
  const entries = btParseRoster(btEl.rosterText.value);
  if (!entries.length) {
    btStatus('Add one name per line, e.g. "Maxi, 30, 42000000".', "warn");
    return;
  }

  btPushHistory();
  const packing = btNormalizePacking(btState.packing);
  const { placed, unplaced } = btPlaceRosterEntries(btState.layout, entries, { packing });
  btEl.rosterText.value = "";
  btCommit();
  btStatus(
    unplaced.length
      ? `Placed ${placed.length}; ${unplaced.length} did not fit — enlarge the grid or clear space.`
      : `Placed ${placed.length} castle${placed.length === 1 ? "" : "s"} on the map.`,
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
    btState.hoverId = null;
    btState.editId = null;
    btCloseAllModals();
    btCommit();
    const castles = btRosterCastles(layout).length;
    btStatus(`Loaded layout — ${layout.pieces.length} pieces, ${castles} castles.`);
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

/* ── Named layout saves ─────────────────────── */

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
    btState.hoverId = null;
    btState.editId = null;
    btCloseAllModals();
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

/* ── Named roster saves ─────────────────────── */

function btRenderRosterSavesList(selectedId) {
  if (!btEl.rosterSaves) return;
  const saves = btListRosterSaves();
  if (!saves.length) {
    btEl.rosterSaves.innerHTML = `<option value="">No saved rosters yet</option>`;
    return;
  }
  const pick = selectedId || btEl.rosterSaves.value;
  btEl.rosterSaves.innerHTML = saves
    .map((s) => {
      const stamp = btFormatSaveStamp(s.savedAt);
      const count = Array.isArray(s.roster?.castles) ? s.roster.castles.length : 0;
      const label = stamp
        ? `${btEscape(s.name)} (${count}) — ${btEscape(stamp)}`
        : `${btEscape(s.name)} (${count})`;
      return `<option value="${btEscape(s.id)}">${label}</option>`;
    })
    .join("");
  if (pick && [...btEl.rosterSaves.options].some((o) => o.value === pick)) btEl.rosterSaves.value = pick;
}

function btSaveRosterNamed() {
  const name = (btEl.rosterSaveName?.value || "").trim();
  try {
    const entry = btUpsertRosterSave(name, btState.layout);
    btEl.rosterSaveName.value = entry.name;
    btRenderRosterSavesList(entry.id);
    btStatus(`Saved roster “${entry.name}” on this device.`);
  } catch (err) {
    btStatus(err.message || "Could not save roster.", "warn");
  }
}

/** Load roster entries onto free spots — adds missing castles, does not wipe the board. */
function btApplyRosterEntries(entries, label) {
  if (!entries.length) {
    btStatus("That roster is empty.", "warn");
    return;
  }

  const existing = new Set(
    btRosterCastles(btState.layout).map((c) => String(c.name || "").trim().toLowerCase())
  );
  const missing = entries.filter((e) => !existing.has(String(e.name || "").trim().toLowerCase()));
  if (!missing.length) {
    btStatus(label ? `“${label}” — every name is already on the board.` : "Every name is already on the board.");
    return;
  }

  if (missing.length >= 8) {
    const ok = window.confirm(
      `Add ${missing.length} new castle${missing.length === 1 ? "" : "s"} onto free map spots? Existing pieces stay put.`
    );
    if (!ok) return;
  }

  btPushHistory();
  const packing = btNormalizePacking(btState.packing);
  const { placed, unplaced } = btPlaceRosterEntries(btState.layout, missing, { packing });
  btCommit();
  btStatus(
    unplaced.length
      ? `Added ${placed.length}; ${unplaced.length} did not fit — enlarge the grid or clear space.`
      : `Added ${placed.length} castle${placed.length === 1 ? "" : "s"} from ${label ? `“${label}”` : "roster"}.`,
    unplaced.length ? "warn" : ""
  );
}

function btLoadRosterNamed() {
  const id = btEl.rosterSaves?.value;
  const entry = id ? btGetRosterSave(id) : null;
  if (!entry) {
    btStatus("Pick a saved roster first.", "warn");
    return;
  }
  try {
    const entries = btParseRosterFile(entry.roster);
    btApplyRosterEntries(entries, entry.name);
  } catch (err) {
    btStatus(`Could not load that roster: ${err.message}`, "warn");
  }
}

function btDeleteRosterNamed() {
  const id = btEl.rosterSaves?.value;
  const entry = id ? btGetRosterSave(id) : null;
  if (!entry) {
    btStatus("Pick a saved roster to delete.", "warn");
    return;
  }
  if (!window.confirm(`Delete saved roster “${entry.name}”?`)) return;
  btDeleteRosterSave(id);
  btRenderRosterSavesList();
  btStatus(`Deleted roster “${entry.name}”.`);
}

function btDownloadRoster() {
  const json = JSON.stringify(btSerializeRoster(btState.layout), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sqb-bear-trap-roster-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  btStatus("Downloaded roster JSON.");
}

function btImportRosterFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const entries = btParseRosterFile(JSON.parse(String(reader.result)));
      btApplyRosterEntries(entries, file.name);
    } catch (err) {
      btStatus(`Could not read that roster: ${err.message}`, "warn");
    }
  };
  reader.onerror = () => btStatus("Could not read that file.", "warn");
  reader.readAsText(file);
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

  btEl.pieces.addEventListener("pointerover", (ev) => {
    const el = ev.target.closest(".bt-piece");
    if (!el || el.dataset.id === "trap") return;
    btSetHover(el.dataset.id);
  });

  btEl.pieces.addEventListener("pointerout", (ev) => {
    const el = ev.target.closest(".bt-piece");
    if (!el) return;
    const related = ev.relatedTarget && ev.relatedTarget.closest?.(".bt-piece");
    if (related && related.dataset.id === el.dataset.id) return;
    if (btState.hoverId === el.dataset.id) btSetHover(null);
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

function btWireRoster() {
  btEl.rosterList.addEventListener("pointerover", (ev) => {
    const row = ev.target.closest(".bt-roster-row");
    if (!row) return;
    btSetHover(row.dataset.id);
  });

  btEl.rosterList.addEventListener("pointerleave", () => {
    btSetHover(null);
  });

  btEl.rosterList.addEventListener("click", (ev) => {
    const row = ev.target.closest(".bt-roster-row");
    if (!row) return;
    btOpenEditModal(row.dataset.id);
  });

  document.getElementById("bt-roster-add").addEventListener("click", btBulkAddRoster);

  btEl.rosterToggle?.addEventListener("click", () => {
    const open = !btEl.rosterPanel.classList.contains("open");
    btSetRosterOpen(open);
  });
  btEl.rosterClose?.addEventListener("click", () => btSetRosterOpen(false));
  btEl.rosterBackdrop?.addEventListener("click", () => btSetRosterOpen(false));
}

function btWireModals() {
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", () => {
      const modal = el.closest(".bt-modal");
      btCloseModal(modal);
      if (modal === btEl.modalEdit) btState.editId = null;
    });
  });

  document.getElementById("bt-edit-save").addEventListener("click", btSaveEditModal);
  document.getElementById("bt-edit-delete").addEventListener("click", btDeleteFromEditModal);
  btEl.editName.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btSaveEditModal();
  });

  document.getElementById("bt-open-organize").addEventListener("click", () => {
    if (btEl.orgPacking) btEl.orgPacking.value = btNormalizePacking(btState.packing);
    btOpenModal(btEl.modalOrganize);
  });
  document.getElementById("bt-org-run").addEventListener("click", btRunOrganize);

  document.getElementById("bt-open-manage").addEventListener("click", () => {
    btRenderRosterSavesList();
    btOpenModal(btEl.modalManage);
  });

  btEl.modalManage.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-roster-sort]");
    if (!btn) return;
    const key = btn.dataset.rosterSort || "pl";
    const dir = btn.dataset.rosterDir || "desc";
    btPushHistory();
    btSortRoster(btState.layout, key, dir);
    btCommit();
    btStatus(`Roster sorted by ${key.toUpperCase()} (${dir}).`);
  });

  document.getElementById("bt-roster-save-named").addEventListener("click", btSaveRosterNamed);
  document.getElementById("bt-roster-load-named").addEventListener("click", btLoadRosterNamed);
  document.getElementById("bt-roster-delete-named").addEventListener("click", btDeleteRosterNamed);
  document.getElementById("bt-roster-export").addEventListener("click", btDownloadRoster);
  document.getElementById("bt-roster-file").addEventListener("change", (ev) => {
    btImportRosterFile(ev.target.files && ev.target.files[0]);
    ev.target.value = "";
  });
  btEl.rosterSaveName?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") btSaveRosterNamed();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!btEl.modalEdit.hidden || !btEl.modalOrganize.hidden || !btEl.modalManage.hidden) {
      btCloseAllModals();
    }
  });
}

function btWireToolbar() {
  btEl.tools.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-tool]");
    if (!btn) return;
    btState.tool = btn.dataset.tool;
    btHideGhost();
    btRenderAll();
    btStatus(
      btState.tool === "castle"
        ? "Castle tool — tap an empty cell to place a castle (added to the roster)."
        : btState.tool === "erase"
          ? "Erase tool — tap a piece to remove it."
          : btState.tool === "select"
            ? "Select tool — tap a piece to edit it, drag to move."
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
    btState.hoverId = null;
    btCommit();
    btFitBoard();
    btStatus(
      dropped.length
        ? `Grid set to ${size}×${size} — ${dropped.length} piece(s) no longer fit and were removed.`
        : `Grid set to ${size}×${size}.`,
      dropped.length ? "warn" : ""
    );
  });

  btEl.shape.addEventListener("change", () => {
    btPushHistory();
    const dropped = btSetShape(btState.layout, btEl.shape.value);
    btState.selectedId = null;
    btState.hoverId = null;
    btCommit();
    btStatus(
      dropped.length
        ? `Shape changed — ${dropped.length} piece(s) fell outside and were removed.`
        : "Shape changed.",
      dropped.length ? "warn" : ""
    );
  });
}

function btWireActions() {
  document.getElementById("bt-clear").addEventListener("click", () => {
    if (!btState.layout.pieces.length) return;
    btPushHistory();
    btState.layout.pieces = [];
    btState.layout.rosterOrder = [];
    btState.layout.queue = [];
    btState.selectedId = null;
    btState.hoverId = null;
    btState.editId = null;
    btCloseModal(btEl.modalEdit);
    btCommit();
    btStatus("Board cleared — castles removed from the roster too. Trap stays put.");
  });

  document.getElementById("bt-reset").addEventListener("click", () => {
    btPushHistory();
    btState.layout = btCreateLayout({ gridSize: btState.layout.gridSize, shape: btState.layout.shape });
    btState.selectedId = null;
    btState.hoverId = null;
    btState.editId = null;
    btCloseAllModals();
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
  btSaveView();
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
    !hadSaved && !btState.layout.pieces.length && !btState.history.length;

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
  btEl.rosterPanel = document.getElementById("bt-roster-panel");
  btEl.rosterList = document.getElementById("bt-roster-list");
  btEl.rosterCount = document.getElementById("bt-roster-count");
  btEl.rosterToggle = document.getElementById("bt-roster-toggle");
  btEl.rosterClose = document.getElementById("bt-roster-close");
  btEl.rosterBackdrop = document.getElementById("bt-roster-backdrop");
  btEl.rosterText = document.getElementById("bt-roster-text");
  btEl.stats = document.getElementById("bt-stats");
  btEl.status = document.getElementById("bt-status");
  btEl.share = document.getElementById("bt-share");
  btEl.saveName = document.getElementById("bt-save-name");
  btEl.saves = document.getElementById("bt-saves");
  btEl.gridSize = document.getElementById("bt-grid-size");
  btEl.shape = document.getElementById("bt-shape");
  btEl.angle = document.getElementById("bt-angle");

  btEl.modalEdit = document.getElementById("bt-modal-edit");
  btEl.modalOrganize = document.getElementById("bt-modal-organize");
  btEl.modalManage = document.getElementById("bt-modal-manage");
  btEl.editTitle = document.getElementById("bt-edit-title");
  btEl.editName = document.getElementById("bt-edit-name");
  btEl.editTc = document.getElementById("bt-edit-tc");
  btEl.editPl = document.getElementById("bt-edit-pl");
  btEl.editCastleFields = document.getElementById("bt-edit-castle-fields");
  btEl.orgPacking = document.getElementById("bt-org-packing");
  btEl.orgSort = document.getElementById("bt-org-sort");
  btEl.rosterSaveName = document.getElementById("bt-roster-save-name");
  btEl.rosterSaves = document.getElementById("bt-roster-saves");

  // Paint immediately with in-code defaults; hydrate from JSON when it arrives.
  btEl.gridSize.innerHTML = BT_GRID_SIZES.map(
    (size) => `<option value="${size}">${size} × ${size}</option>`
  ).join("");

  const saved = btLoadLocal();
  const view = btLoadView();
  btState.layout = saved || btCreateLayout();
  btState.cell = Math.min(BT_CELL_MAX, Math.max(BT_CELL_MIN, Number(view.cell) || 26));
  btState.rotation = BT_ANGLES.includes(Number(view.rotation)) ? Number(view.rotation) : 45;
  btState.packing = btNormalizePacking(view.packing);

  btWireBoard();
  btWireRoster();
  btWireModals();
  btWireToolbar();
  btWireActions();

  btRenderAll();
  btFitBoard();
  window.addEventListener("resize", btFitBoard);

  btStatus(
    saved
      ? "Restored your last layout from this device."
      : "Fresh board — tap Castle to place, or paste a roster to fill the map."
  );

  try {
    const defaults = await loadData("bear-trap-defaults.json");
    btHydrateDefaults(defaults, { hadSaved: Boolean(saved) });
  } catch {
    /* built-in footprints / grid already on screen */
  }
}

btInit();
