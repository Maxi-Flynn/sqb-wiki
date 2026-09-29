/* ═══════════════════════════════════════════════
   Kingdom map — banner chain search
   HQ is a 3×3 with a 15×15 square. Each banner is a 1×1 with a 7×7 square.
   The 1×1 may sit outside land you own; the 7×7 must touch it (a corner counts).
   Fresh-server rings can be locked so the 1×1 stays out of Plains or Fertile.
   ═══════════════════════════════════════════════ */

const MR_GRID = 1200;
const MR_INF = 32767;

function mrIndex(x, y) {
  return y * MR_GRID + x;
}

function mrZoneName(zones, x, y) {
  const order = ["forbidden", "ruins", "fertile", "plains", "badlands"];
  for (const key of order) {
    const z = zones[key];
    if (x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2) return z.name;
  }
  return "Badlands";
}

function mrZoneAllowed(name, access) {
  if (name === "Badlands") return true;
  if (name === "Plains") return access !== "badlands";
  if (name === "Fertile") return access === "fertile";
  return false;
}

/**
 * place[i] = 1 when the 1×1 banner (or an HQ tile) may sit here.
 * own[i] = 1 when a covered tile counts as land you own for the next touch.
 */
function mrBuildMasks(world, access) {
  const n = MR_GRID * MR_GRID;
  const place = new Uint8Array(n);
  const own = new Uint8Array(n);
  const { zones, king, terrain, nodes, structures } = world;

  for (let y = 0; y < MR_GRID; y += 1) {
    for (let x = 0; x < MR_GRID; x += 1) {
      const i = mrIndex(x, y);
      const byte = terrain[y * 300 + (x >> 2)];
      const tile = (byte >> ((x & 3) * 2)) & 3;
      const zone = mrZoneName(zones, x, y);
      const allowed = mrZoneAllowed(zone, access);
      const hard = tile === 1 || tile === 2 || zone === "Ruins" || zone === "Forbidden ring"
        || (x >= king.x1 && x < king.x2 && y >= king.y1 && y < king.y2);
      if (allowed && !hard) {
        own[i] = 1;
        place[i] = 1;
      }
    }
  }

  for (const s of structures) {
    const cx = s.x + s.size / 2;
    const cy = s.y + s.size / 2;
    const fx = Math.round(cx - s.forbidden / 2);
    const fy = Math.round(cy - s.forbidden / 2);
    for (let y = fy; y < fy + s.forbidden; y += 1) {
      if (y < 0 || y >= MR_GRID) continue;
      for (let x = fx; x < fx + s.forbidden; x += 1) {
        if (x < 0 || x >= MR_GRID) continue;
        const i = mrIndex(x, y);
        place[i] = 0;
        own[i] = 0;
      }
    }
    for (let y = s.y; y < s.y + s.size; y += 1) {
      for (let x = s.x; x < s.x + s.size; x += 1) {
        const i = mrIndex(x, y);
        place[i] = 0;
        own[i] = 0;
      }
    }
  }

  for (const node of nodes) {
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = node.x + dx;
        const y = node.y + dy;
        if (x < 0 || y < 0 || x >= MR_GRID || y >= MR_GRID) continue;
        place[mrIndex(x, y)] = 0;
      }
    }
  }

  return { place, own };
}

function mrHqLegal(masks, x, y) {
  if (x < 0 || y < 0 || x + 2 >= MR_GRID || y + 2 >= MR_GRID) return false;
  for (let dy = 0; dy < 3; dy += 1) {
    for (let dx = 0; dx < 3; dx += 1) {
      if (!masks.place[mrIndex(x + dx, y + dy)]) return false;
    }
  }
  return true;
}

function mrForbiddenRect(structure) {
  const cx = structure.x + structure.size / 2;
  const cy = structure.y + structure.size / 2;
  const x1 = Math.round(cx - structure.forbidden / 2);
  const y1 = Math.round(cy - structure.forbidden / 2);
  return { x1, y1, x2: x1 + structure.forbidden - 1, y2: y1 + structure.forbidden - 1 };
}

function mrTouchesSquare(cx, cy, radius, x1, y1, x2, y2) {
  const left = cx - radius;
  const right = cx + radius;
  const top = cy - radius;
  const bottom = cy + radius;
  return right >= x1 - 1 && left <= x2 + 1 && bottom >= y1 - 1 && top <= y2 + 1;
}

function mrSearch(masks, hqX, hqY, structures) {
  const place = masks.place;
  const n = MR_GRID * MR_GRID;
  const cost = new Int16Array(n);
  cost.fill(MR_INF);
  const parent = new Int32Array(n);
  parent.fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const hx = hqX + 1;
  const hy = hqY + 1;
  const hqLeft = hx - 7;
  const hqRight = hx + 7;
  const hqTop = hy - 7;
  const hqBottom = hy + 7;

  const goal = new Int16Array(n);
  goal.fill(-1);
  const hitCost = new Int16Array(structures.length);
  hitCost.fill(MR_INF);
  const hitCell = new Int32Array(structures.length);
  hitCell.fill(-1);
  let pending = 0;

  for (let s = 0; s < structures.length; s += 1) {
    const ring = mrForbiddenRect(structures[s]);
    const x1 = ring.x1;
    const y1 = ring.y1;
    const x2 = ring.x2;
    const y2 = ring.y2;
    if (mrTouchesSquare(hx, hy, 7, x1, y1, x2, y2)) {
      hitCost[s] = 0;
      continue;
    }
    let any = false;
    const gx1 = Math.max(0, x1 - 4);
    const gy1 = Math.max(0, y1 - 4);
    const gx2 = Math.min(MR_GRID - 1, x2 + 4);
    const gy2 = Math.min(MR_GRID - 1, y2 + 4);
    for (let y = gy1; y <= gy2; y += 1) {
      for (let x = gx1; x <= gx2; x += 1) {
        if (!place[mrIndex(x, y)]) continue;
        if (!mrTouchesSquare(x, y, 3, x1, y1, x2, y2)) continue;
        goal[mrIndex(x, y)] = s;
        any = true;
      }
    }
    if (any) pending += 1;
  }

  for (let y = Math.max(0, hy - 11); y <= Math.min(MR_GRID - 1, hy + 11); y += 1) {
    for (let x = Math.max(0, hx - 11); x <= Math.min(MR_GRID - 1, hx + 11); x += 1) {
      const i = mrIndex(x, y);
      if (!place[i]) continue;
      if (Math.max(Math.abs(x - hx), Math.abs(y - hy)) > 11) continue;
      if (!mrTouchesSquare(x, y, 3, hqLeft, hqTop, hqRight, hqBottom)) continue;
      cost[i] = 1;
      queue[tail] = i;
      tail += 1;
      const g = goal[i];
      if (g >= 0 && hitCost[g] === MR_INF) {
        hitCost[g] = 1;
        hitCell[g] = i;
        pending -= 1;
      }
    }
  }

  while (head < tail && pending > 0) {
    const i = queue[head];
    head += 1;
    const c = cost[i];
    if (c >= 285) continue;
    const x = i % MR_GRID;
    const y = (i / MR_GRID) | 0;
    const next = c + 1;
    const x1 = Math.max(0, x - 7);
    const x2 = Math.min(MR_GRID - 1, x + 7);
    const y1 = Math.max(0, y - 7);
    const y2 = Math.min(MR_GRID - 1, y + 7);
    for (let ny = y1; ny <= y2; ny += 1) {
      const row = ny * MR_GRID;
      for (let nx = x1; nx <= x2; nx += 1) {
        const j = row + nx;
        if (!place[j] || cost[j] <= next) continue;
        cost[j] = next;
        parent[j] = i;
        queue[tail] = j;
        tail += 1;
        const g = goal[j];
        if (g >= 0 && hitCost[g] === MR_INF) {
          hitCost[g] = next;
          hitCell[g] = j;
          pending -= 1;
        }
      }
    }
  }

  const packed = mrPackWithinCap(structures, hitCost, hitCell, parent, cost, 285);

  return {
    hqX,
    hqY,
    banners: packed.banners,
    bannerCount: packed.banners.length,
    reached: packed.reached,
    reachable: packed.reachable,
    total: structures.length,
    missed: packed.missed,
    hitCost,
  };
}

function mrPackWithinCap(structures, hitCost, hitCell, parent, cost, limit) {
  const n = MR_GRID * MR_GRID;
  const used = new Uint8Array(n);
  const banners = [];
  let reachable = 0;
  const pending = [];
  for (let s = 0; s < structures.length; s += 1) {
    if (hitCost[s] === MR_INF) continue;
    reachable += 1;
    if (hitCost[s] === 0) continue;
    pending.push(s);
  }

  while (pending.length) {
    let best = -1;
    let bestChain = null;
    for (let p = 0; p < pending.length; p += 1) {
      const s = pending[p];
      const chain = [];
      let cell = hitCell[s];
      while (cell >= 0 && !used[cell]) {
        chain.push(cell);
        cell = parent[cell];
      }
      if (!bestChain || chain.length < bestChain.length) {
        bestChain = chain;
        best = p;
      }
    }
    if (banners.length + bestChain.length > limit) break;
    pending.splice(best, 1);
    for (let c = bestChain.length - 1; c >= 0; c -= 1) {
      const cell = bestChain[c];
      used[cell] = 1;
      banners.push({
        x: cell % MR_GRID,
        y: (cell / MR_GRID) | 0,
        n: cost[cell],
      });
    }
  }

  // Re-walk so the chosen outposts are the ones whose chains were actually kept.
  const kept = new Uint8Array(structures.length);
  for (let s = 0; s < structures.length; s += 1) {
    if (hitCost[s] === 0) {
      kept[s] = 1;
      continue;
    }
    if (hitCost[s] === MR_INF) continue;
    let cell = hitCell[s];
    let ok = true;
    let guard = 0;
    while (cell >= 0 && guard < 400) {
      if (!used[cell]) {
        ok = false;
        break;
      }
      cell = parent[cell];
      guard += 1;
    }
    if (ok) kept[s] = 1;
  }

  const missed = [];
  let reached = 0;
  for (let s = 0; s < structures.length; s += 1) {
    if (kept[s]) reached += 1;
    else missed.push(structures[s].name);
  }
  banners.sort((a, b) => a.n - b.n || a.y - b.y || a.x - b.x);
  return { banners, reached, reachable, missed };
}

function mrCountNodes(nodes, hqX, hqY, banners) {
  const hx = hqX + 1;
  const hy = hqY + 1;
  let count = 0;
  for (const node of nodes) {
    let covered = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = node.x + dx;
        const y = node.y + dy;
        if (Math.max(Math.abs(x - hx), Math.abs(y - hy)) <= 7) {
          covered += 1;
          continue;
        }
        for (let b = 0; b < banners.length; b += 1) {
          if (Math.max(Math.abs(x - banners[b].x), Math.abs(y - banners[b].y)) <= 3) {
            covered += 1;
            break;
          }
        }
      }
    }
    if (covered >= 3) count += 1;
  }
  return count;
}

function mrHqCandidates(masks) {
  const points = [];
  const push = (x, y) => {
    for (let dy = 0; dy <= 40; dy += 8) {
      for (let dx = 0; dx <= 40; dx += 8) {
        if (!mrHqLegal(masks, x + dx, y + dy)) continue;
        points.push({ x: x + dx, y: y + dy });
        return;
      }
    }
  };
  const spots = [
    [40, 40], [40, 580], [40, 1100],
    [580, 40], [1100, 40],
    [1100, 580], [1100, 1100], [580, 1100],
  ];
  for (const [x, y] of spots) push(x, y);
  return points;
}

function mrPlan(world, masks, structures) {
  const candidates = mrHqCandidates(masks);
  let best = null;
  for (const cand of candidates) {
    const route = mrSearch(masks, cand.x, cand.y, structures);
    if (!best || route.reached > best.reached
      || (route.reached === best.reached && route.bannerCount < best.bannerCount)) {
      best = route;
    }
  }
  if (!best) return null;
  best.nodes = mrCountNodes(world.nodes, best.hqX, best.hqY, best.banners);
  return best;
}
