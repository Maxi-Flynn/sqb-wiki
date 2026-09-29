/* ═══════════════════════════════════════════════
   Kingdom map — view only
   Draws the surveyed 1200×1200 terrain, rings, structures, and resource nodes.
   Banner routing is a later step. Geometry of the files lives in data/map/.
   ═══════════════════════════════════════════════ */

const MP_NODE_NAMES = ["Bread", "Wood", "Stone", "Iron"];
const MP_NODE_COLORS = ["#FFB300", "#66BB6A", "#B0BEC5", "#42A5F5"];
const MP_ZONE_ORDER = ["forbidden", "ruins", "fertile", "plains", "badlands"];
const MP_ZONE_STROKE = {
  forbidden: "rgba(196,106,106,.85)",
  ruins: "rgba(196,140,70,.7)",
  fertile: "rgba(122,202,122,.45)",
  plains: "rgba(196,163,90,.35)",
  badlands: "rgba(90,74,42,.0)",
};

const mp = {
  grid: 1200,
  terrain: null,
  nodes: [],
  structures: [],
  castle: [],
  zones: null,
  king: null,
  base: null,
  view: { x: 0, y: 0, scale: 1 },
  drag: null,
  pointers: new Map(),
  dirty: true,
};

const mpEl = {};

function mpCell(x, y) {
  if (x < 0 || y < 0 || x >= mp.grid || y >= mp.grid) return 0;
  const byte = mp.terrain[y * 300 + (x >> 2)];
  return (byte >> ((x & 3) * 2)) & 3;
}

function mpGameY(y) {
  return mp.grid - 1 - y;
}

function mpZoneAt(x, y) {
  if (!mp.zones) return "";
  for (const key of MP_ZONE_ORDER) {
    const z = mp.zones[key];
    if (x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2) return z.name;
  }
  return "Badlands";
}

function mpTileName(code) {
  if (code === 1) return "Mountain";
  if (code === 2) return "Lake";
  return "Open";
}

function mpStructureAt(x, y) {
  const lists = mpEl.showStructures.checked ? [mp.castle, mp.structures] : [];
  for (const list of lists) {
    for (const s of list) {
      if (x >= s.x && x < s.x + s.size && y >= s.y && y < s.y + s.size) return s;
    }
  }
  return null;
}

function mpBuildBase() {
  const canvas = document.createElement("canvas");
  canvas.width = mp.grid;
  canvas.height = mp.grid;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(mp.grid, mp.grid);
  const data = img.data;
  const showT = mpEl.showTerrain.checked;
  if (showT) {
    for (let y = 0; y < mp.grid; y += 1) {
      for (let x = 0; x < mp.grid; x += 1) {
        const t = mpCell(x, y);
        if (!t) continue;
        const o = (y * mp.grid + x) * 4;
        if (t === 1) {
          data[o] = 90; data[o + 1] = 92; data[o + 2] = 102;
        } else {
          data[o] = 36; data[o + 1] = 88; data[o + 2] = 140;
        }
        data[o + 3] = 235;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  if (mpEl.showNodes.checked) {
    for (const n of mp.nodes) {
      ctx.fillStyle = MP_NODE_COLORS[n.t];
      ctx.fillRect(n.x, n.y, 2, 2);
    }
  }
  mp.base = canvas;
  mpRequest();
}

function mpResize() {
  const stage = mpEl.stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  mpEl.canvas.width = Math.max(1, Math.floor(stage.width * dpr));
  mpEl.canvas.height = Math.max(1, Math.floor(stage.height * dpr));
  mp.dpr = dpr;
  mpRequest();
}

function mpFit() {
  const stage = mpEl.stage.getBoundingClientRect();
  const pad = 8;
  mp.view.scale = Math.min((stage.width - pad) / mp.grid, (stage.height - pad) / mp.grid);
  mp.view.x = (stage.width - mp.grid * mp.view.scale) / 2;
  mp.view.y = (stage.height - mp.grid * mp.view.scale) / 2;
  mpRequest();
}

function mpZoomAt(clientX, clientY, factor) {
  const rect = mpEl.canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const next = Math.min(8, Math.max(mp.view.scale * factor, 0.2));
  const worldX = (px - mp.view.x) / mp.view.scale;
  const worldY = (py - mp.view.y) / mp.view.scale;
  mp.view.scale = next;
  mp.view.x = px - worldX * next;
  mp.view.y = py - worldY * next;
  mpRequest();
}

function mpWorldFromClient(clientX, clientY) {
  const rect = mpEl.canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - mp.view.x) / mp.view.scale,
    y: (clientY - rect.top - mp.view.y) / mp.view.scale,
  };
}

function mpDrawRings(ctx) {
  if (!mpEl.showZones.checked || !mp.zones) return;
  const order = ["badlands", "plains", "fertile", "ruins", "forbidden"];
  ctx.save();
  ctx.lineWidth = 1;
  for (const key of order) {
    const z = mp.zones[key];
    ctx.strokeStyle = MP_ZONE_STROKE[key];
    ctx.strokeRect(z.x1, z.y1, z.x2 - z.x1 + 1, z.y2 - z.y1 + 1);
  }
  const k = mp.king;
  ctx.strokeStyle = "#a97fe0";
  ctx.strokeRect(k.x1, k.y1, k.x2 - k.x1, k.y2 - k.y1);
  ctx.restore();
}

function mpDrawStructures(ctx) {
  if (!mpEl.showStructures.checked) return;
  const label = mp.view.scale >= 1.1;
  ctx.save();
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const s of [...mp.castle, ...mp.structures]) {
    ctx.fillStyle = s.color || "#C4A35A";
    ctx.globalAlpha = 0.85;
    ctx.fillRect(s.x, s.y, s.size, s.size);
    ctx.globalAlpha = 1;
    if (label) {
      ctx.fillStyle = "#0F0C08";
      ctx.fillText(s.letter || s.name, s.x + s.size / 2, s.y + s.size / 2);
    }
  }
  ctx.restore();
}

function mpRequest() {
  mp.dirty = true;
  if (mp.frameQueued) return;
  mp.frameQueued = true;
  requestAnimationFrame(mpPaint);
}

function mpPaint() {
  mp.frameQueued = false;
  if (!mp.dirty || !mp.base) return;
  mp.dirty = false;
  const ctx = mpEl.canvas.getContext("2d");
  const dpr = mp.dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const stage = mpEl.stage.getBoundingClientRect();
  ctx.clearRect(0, 0, stage.width, stage.height);
  ctx.imageSmoothingEnabled = mp.view.scale < 1;
  ctx.save();
  ctx.translate(mp.view.x, mp.view.y);
  ctx.scale(mp.view.scale, mp.view.scale);
  ctx.drawImage(mp.base, 0, 0);
  mpDrawRings(ctx);
  mpDrawStructures(ctx);
  mpDrawRoute(ctx);
  ctx.restore();
}

function mpDrawRoute(ctx) {
  const route = mp.route;
  if (!route) return;
  ctx.save();
  ctx.strokeStyle = "rgba(196,163,90,.9)";
  ctx.fillStyle = "rgba(196,163,90,.18)";
  ctx.lineWidth = 1;
  const hx = route.hqX + 1;
  const hy = route.hqY + 1;
  ctx.strokeRect(hx - 7, hy - 7, 15, 15);
  ctx.fillRect(route.hqX, route.hqY, 3, 3);
  for (const banner of route.banners) {
    ctx.strokeRect(banner.x - 3, banner.y - 3, 7, 7);
    ctx.fillRect(banner.x, banner.y, 1, 1);
  }
  ctx.restore();
}

function mpReadout(clientX, clientY) {
  const w = mpWorldFromClient(clientX, clientY);
  const x = Math.floor(w.x);
  const y = Math.floor(w.y);
  if (x < 0 || y < 0 || x >= mp.grid || y >= mp.grid) {
    mpEl.readout.textContent = "Off the map";
    return;
  }
  const struct = mpStructureAt(x, y);
  const bits = [
    `X:${x}  Y:${mpGameY(y)}`,
    mpZoneAt(x, y),
    mpTileName(mpCell(x, y)),
  ];
  if (struct) bits.push(struct.name);
  mpEl.readout.textContent = bits.join("  ·  ");
}

function mpCenterOn(s) {
  const stage = mpEl.stage.getBoundingClientRect();
  mp.view.scale = Math.max(mp.view.scale, 2);
  mp.view.x = stage.width / 2 - (s.x + s.size / 2) * mp.view.scale;
  mp.view.y = stage.height / 2 - (s.y + s.size / 2) * mp.view.scale;
  mpRequest();
}

function mpWire() {
  mpEl.showTerrain.addEventListener("change", mpBuildBase);
  mpEl.showNodes.addEventListener("change", mpBuildBase);
  mpEl.showZones.addEventListener("change", () => { mpRequest(); });
  mpEl.showStructures.addEventListener("change", () => { mpRequest(); });
  document.getElementById("mp-fit").addEventListener("click", mpFit);
  document.getElementById("mp-route").addEventListener("click", mpFindRoute);
  mpEl.access.addEventListener("change", () => {
    mp.masks = null;
    mp.maskKey = "";
  });
  document.getElementById("mp-zoom-in").addEventListener("click", () => {
    const r = mpEl.stage.getBoundingClientRect();
    mpZoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25);
  });
  document.getElementById("mp-zoom-out").addEventListener("click", () => {
    const r = mpEl.stage.getBoundingClientRect();
    mpZoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
  });
  mpEl.jump.addEventListener("change", () => {
    const s = mp.structures.find((item) => item.id === mpEl.jump.value)
      || mp.castle.find((item) => item.name === mpEl.jump.value);
    if (s) mpCenterOn(s);
  });

  mpEl.canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    mpZoomAt(ev.clientX, ev.clientY, ev.deltaY > 0 ? 0.9 : 1.1);
  }, { passive: false });

  mpEl.canvas.addEventListener("pointerdown", (ev) => {
    mpEl.canvas.setPointerCapture(ev.pointerId);
    mp.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (mp.pointers.size === 1) {
      mp.drag = { x: ev.clientX, y: ev.clientY, vx: mp.view.x, vy: mp.view.y };
      mpEl.canvas.classList.add("dragging");
    }
  });
  mpEl.canvas.addEventListener("pointermove", (ev) => {
    if (mp.pointers.has(ev.pointerId)) {
      mp.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }
    if (mp.pointers.size === 2) {
      const [a, b] = [...mp.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (mp.pinchDist) mpZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / mp.pinchDist);
      mp.pinchDist = dist;
      mp.drag = null;
      return;
    }
    mp.pinchDist = 0;
    if (!mp.drag) {
      mpReadout(ev.clientX, ev.clientY);
      return;
    }
    mp.view.x = mp.drag.vx + (ev.clientX - mp.drag.x);
    mp.view.y = mp.drag.vy + (ev.clientY - mp.drag.y);
    mpRequest();
    mpReadout(ev.clientX, ev.clientY);
  });
  function mpEndPointer(ev) {
    mp.pointers.delete(ev.pointerId);
    if (mp.pointers.size < 2) mp.pinchDist = 0;
    if (mp.pointers.size === 0) {
      mp.drag = null;
      mpEl.canvas.classList.remove("dragging");
    }
  }
  mpEl.canvas.addEventListener("pointerup", mpEndPointer);
  mpEl.canvas.addEventListener("pointercancel", mpEndPointer);
  mpEl.canvas.addEventListener("pointerleave", (ev) => {
    if (!mp.drag) mpEl.readout.textContent = "Move over the map to read coordinates.";
    mpEndPointer(ev);
  });

  window.addEventListener("resize", () => { mpResize(); mpFit(); });
}

function mpFillJump() {
  const options = ['<option value="">Jump to a structure…</option>'];
  for (const c of mp.castle) options.push(`<option value="${c.name}">${c.name}</option>`);
  const sorted = [...mp.structures].sort((a, b) => a.name.localeCompare(b.name));
  for (const s of sorted) options.push(`<option value="${s.id}">${s.name}</option>`);
  mpEl.jump.innerHTML = options.join("");
}

function mpLegend() {
  const items = [
    ["#5A5C66", "Mountain"],
    ["#24588C", "Lake"],
    ...MP_NODE_NAMES.map((name, i) => [MP_NODE_COLORS[i], name]),
    ["#a97fe0", "King's zone"],
    ["#C48C46", "Ruins"],
    ["#7ACA7A", "Fertile"],
  ];
  mpEl.legend.innerHTML = items
    .map(([color, label]) => `<span><i class="mp-swatch" style="background:${color}"></i>${label}</span>`)
    .join("");
}

async function mpLoadBin(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url);
  return new Uint8Array(await res.arrayBuffer());
}

function mpYield() {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

async function mpFindRoute() {
  if (!mp.world) return;
  mpEl.routeBtn.disabled = true;
  const access = mpEl.access.value;
  try {
    mpEl.readout.textContent = "Building the placement mask…";
    await mpYield();
    if (mp.maskKey !== access) {
      mp.masks = mrBuildMasks(mp.world, access);
      mp.maskKey = access;
    }
    const candidates = mrHqCandidates(mp.masks);
    if (!candidates.length) {
      mpEl.readout.textContent = "No legal headquarters tile in that ring.";
      return;
    }
    let best = null;
    for (let i = 0; i < candidates.length; i += 1) {
      mpEl.readout.textContent = `Trying headquarters ${i + 1} of ${candidates.length}…`;
      await mpYield();
      const cand = candidates[i];
      const route = mrSearch(mp.masks, cand.x, cand.y, mp.structures);
      if (!best || route.reached > best.reached
        || (route.reached === best.reached && route.bannerCount < best.bannerCount)) {
        best = route;
      }
    }
    best.nodes = mrCountNodes(mp.nodes, best.hqX, best.hqY, best.banners);
    mp.route = best;
    const hx = best.hqX + 1;
    const hy = best.hqY + 1;
    mpEl.readout.textContent = `HQ X:${hx} Y:${mpGameY(hy)} · ${best.bannerCount} banners · ${best.reached} of ${best.reachable} reachable outposts · ${best.nodes} nodes covered`;
    mpCenterOn({ x: best.hqX, y: best.hqY, size: 3 });
    mpRequest();
  } finally {
    mpEl.routeBtn.disabled = false;
  }
}

async function mpInit() {
  mountHeader({
    eyebrow: "SQB Alliance · Kingdom #1762",
    title: "🗺️ Kingdom Map",
    sub: "Terrain, outposts, and a first banner chain from one headquarters",
    activeId: "map",
  });

  mpEl.stage = document.getElementById("mp-stage");
  mpEl.canvas = document.getElementById("mp-canvas");
  mpEl.readout = document.getElementById("mp-readout");
  mpEl.legend = document.getElementById("mp-legend");
  mpEl.jump = document.getElementById("mp-jump");
  mpEl.showTerrain = document.getElementById("mp-show-terrain");
  mpEl.showNodes = document.getElementById("mp-show-nodes");
  mpEl.showZones = document.getElementById("mp-show-zones");
  mpEl.showStructures = document.getElementById("mp-show-structures");
  mpEl.access = document.getElementById("mp-access");
  mpEl.routeBtn = document.getElementById("mp-route");

  const [meta, structs, terrain, nodeBytes] = await Promise.all([
    loadData("map/meta.json"),
    loadData("map/structures.json"),
    mpLoadBin("../data/map/terrain.bin"),
    mpLoadBin("../data/map/nodes.bin"),
  ]);

  mp.grid = meta.grid;
  mp.zones = meta.zones;
  mp.king = meta.kingZone;
  mp.terrain = terrain;
  mp.structures = structs.structures;
  mp.castle = structs.castle;
  mp.world = {
    zones: meta.zones,
    king: meta.kingZone,
    terrain,
    nodes: mp.nodes,
    structures: mp.structures,
  };
  for (let i = 0; i + 2 < nodeBytes.length; i += 3) {
    const v = (nodeBytes[i] << 16) | (nodeBytes[i + 1] << 8) | nodeBytes[i + 2];
    mp.nodes.push({ t: (v >> 22) & 3, x: (v >> 11) & 2047, y: v & 2047 });
  }

  mpFillJump();
  mpLegend();
  mpBuildBase();
  mpResize();
  mpFit();
  mpWire();
  mpEl.readout.textContent = `${meta.counts.structures} structures · ${meta.counts.nodes.toLocaleString()} nodes · ${meta.counts.mountain.toLocaleString()} mountain tiles`;
  mpRequest();
}

mpInit();
