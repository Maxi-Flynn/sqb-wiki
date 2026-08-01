/* ═══════════════════════════════════════════════
   Today tab — multi-event stack & day scoring
   ═══════════════════════════════════════════════ */

const TODAY_STORAGE_KEY = "sqb-today-stack";

/** Matrix row label → resources.json id */
const MATRIX_ROW_TO_RESOURCE = {
  Construction: "construction",
  Research: "research",
  "Troop Training": "training",
  "Master Skills": "research",
  Speedups: ["construction", "research", "training"],
  Forgehammer: "forgehammer",
  "Widget (Hero Gear)": "widget",
  "Hero Roulette": "roulette",
  "Epic Hero Shard": "epic_shard",
  "Rare Hero Shard": "rare_shard",
  "Mythic Hero Shard": "mythic_shard",
  "Master Emblem": "forgehammer",
  "Master's Manuscript": "rare_shard",
  "Adv. Taming Mark": "adv_taming",
  "Common Taming Mark": "common_taming",
  "Pet Advancement": "adv_taming",
  "Lv.7 Brave Troops": "troops",
  "Lower Tier Troops": "troops",
  Truegold: "truegold",
  Mithril: "mithril",
  "Gov. Charm Score": "charms",
  "Gov. Gear Score": "chief_gear",
  "Gathering (wild)": "gather",
  "Hero Shards": "mythic_shard",
  Speedups: "construction",
  "Train Troops": "troops",
  Charms: "charms",
  "Chief/Gov Gear": "chief_gear",
  "Pet Adv./Refine": "adv_taming",
  "Lucky Wheel": "roulette",
  "Gather Resources": "gather",
  "Intel Mission": "intel",
  Forgehammers: "forgehammer",
  Widgets: "widget",
};

const SCOREABLE_CELLS = new Set(["use", "prep"]);

function loadTodayStack() {
  try {
    const raw = localStorage.getItem(TODAY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTodayStack(stack) {
  localStorage.setItem(TODAY_STORAGE_KEY, JSON.stringify(stack));
}

function scoreKeyForDay(prefix, dayNum) {
  return `${prefix}_d${dayNum}`;
}

function getResourceById(resources, id) {
  return resources.find((r) => r.id === id);
}

function getPointsForKey(resource, scoreKey) {
  if (!resource) return 0;
  const exact = resource.windows.find((w) => w.ev === scoreKey);
  if (exact) return exact.pts;
  const dayMatch = scoreKey.match(/^(.+)_d\d+$/);
  if (dayMatch) {
    const base = resource.windows.find((w) => w.ev === dayMatch[1]);
    if (base) return base.pts;
  }
  return 0;
}

function getBestOtherWindow(resource, activeKeys) {
  let best = null;
  for (const w of resource.windows) {
    if (activeKeys.has(w.ev)) continue;
    const base = w.ev.replace(/_d\d+$/, "");
    if (activeKeys.has(base)) continue;
    if (!best || w.pts > best.pts) best = w;
  }
  return best;
}

function parseMatrixRows(matrix) {
  if (matrix.sections) {
    return matrix.sections.flatMap((s) => s.rows);
  }
  return matrix.rows || [];
}

function scoringFromMatrix(matrix, prefix, dayNum, resources, events) {
  const dayIndex = dayNum - 1;
  const scoreKey = scoreKeyForDay(prefix, dayNum);
  const stageName =
    (matrix.stages || matrix.days || []).find((s) => s.num === dayNum)?.name || `Day ${dayNum}`;
  const items = new Map();

  for (const row of parseMatrixRows(matrix)) {
    const cell = row.cells?.[dayIndex];
    if (!SCOREABLE_CELLS.has(cell)) continue;
    const mapped = MATRIX_ROW_TO_RESOURCE[row.name];
    const resourceIds = mapped ? (Array.isArray(mapped) ? mapped : [mapped]) : [];
    if (!resourceIds.length) continue;

    for (const resourceId of resourceIds) {
      const resource = getResourceById(resources, resourceId);
      if (!resource) continue;

      const pts = getPointsForKey(resource, scoreKey);
      if (pts <= 0) continue;

      const prep = cell === "prep";
      const label = events[scoreKey]?.name || events[prefix]?.name || prefix.toUpperCase();
      const dayLabel = events[scoreKey]?.day || stageName;

      items.set(resourceId, {
        resourceId,
        icon: resource.icon,
        name: resource.name,
        pts,
        prep,
        sources: [{ eventKey: scoreKey, label: `${label} · ${dayLabel}`, pts }],
      });
    }
  }

  return { scoreKey, stageName, items };
}

function scoringFromBrawlDay(dayDef, dayNum, resources, events) {
  const scoreKey = `brawl_d${dayNum}`;
  const items = new Map();

  for (const resourceId of dayDef.resources || []) {
    const resource = getResourceById(resources, resourceId);
    if (!resource) continue;
    const pts = getPointsForKey(resource, scoreKey) || getPointsForKey(resource, "brawl");
    if (pts <= 0) continue;

    items.set(resourceId, {
      resourceId,
      icon: resource.icon,
      name: resource.name,
      pts,
      prep: false,
      sources: [{ eventKey: scoreKey, label: `Brawl · ${dayDef.name}`, pts }],
    });
  }

  return { scoreKey, stageName: dayDef.name, items };
}

function scoringFromSingle(scoreKey, eventDef, resources, events) {
  const items = new Map();
  for (const resource of resources) {
    const pts = getPointsForKey(resource, scoreKey);
    if (pts <= 0) continue;
    items.set(resource.id, {
      resourceId: resource.id,
      icon: resource.icon,
      name: resource.name,
      pts,
      prep: false,
      sources: [{ eventKey: scoreKey, label: eventDef.name, pts }],
    });
  }
  return { scoreKey, stageName: eventDef.name, items };
}

function mergeScoringResults(results) {
  const merged = new Map();
  for (const result of results) {
    if (!result?.items) continue;
    for (const [id, item] of result.items) {
      if (!merged.has(id)) {
        merged.set(id, { ...item, sources: [...item.sources] });
        continue;
      }
      const existing = merged.get(id);
      existing.sources.push(...item.sources);
      existing.pts = existing.sources.reduce((sum, s) => sum + s.pts, 0);
      existing.stacked = existing.sources.length > 1;
    }
  }
  return merged;
}

function buildHoldList(mergedItems, resources, activeKeys, events) {
  const holds = [];
  for (const resource of resources) {
    const active = mergedItems.get(resource.id);
    const bestOther = getBestOtherWindow(resource, activeKeys);
    if (!bestOther) continue;

    const activePts = active?.pts ?? 0;
    if (bestOther.pts > activePts * 1.25 && bestOther.pts >= 1000) {
      const ev = events[bestOther.ev] || { name: bestOther.ev, icon: "📅" };
      holds.push({
        icon: resource.icon,
        name: resource.name,
        why: active
          ? `Active stack ${activePts.toLocaleString()} pts — ${ev.name} pays ${bestOther.pts.toLocaleString()}`
          : `${ev.name} pays ${bestOther.pts.toLocaleString()} — not scoring in your active stack`,
        pts: bestOther.pts.toLocaleString(),
      });
    }
  }
  holds.sort((a, b) => {
    const ap = parseInt(a.pts.replace(/,/g, ""), 10) || 0;
    const bp = parseInt(b.pts.replace(/,/g, ""), 10) || 0;
    return bp - ap;
  });
  return holds.slice(0, 8);
}

async function resolveStackScoring(stack, catalog, resources, events, matrixCache) {
  const results = [];
  const activeKeys = new Set();
  const combatEvents = [];
  const notes = [];

  for (const entry of stack) {
    const eventDef = catalog.events.find((e) => e.id === entry.id);
    if (!eventDef) continue;

    if (eventDef.type === "note") {
      notes.push({ icon: eventDef.icon, name: eventDef.name, text: eventDef.note });
      continue;
    }

    if (eventDef.type === "combat") {
      const day = eventDef.days?.find((d) => d.num === entry.day) || eventDef.days?.[0];
      combatEvents.push({ icon: eventDef.icon, name: eventDef.name, day: entry.day, dayName: day?.name });
      continue;
    }

    if (eventDef.type === "matrix") {
      if (!matrixCache[eventDef.id]) {
        matrixCache[eventDef.id] = await loadData(eventDef.matrixFile);
      }
      const r = scoringFromMatrix(
        matrixCache[eventDef.id],
        eventDef.prefix,
        entry.day,
        resources,
        events
      );
      results.push(r);
      activeKeys.add(r.scoreKey);
      activeKeys.add(eventDef.prefix);
      continue;
    }

    if (eventDef.type === "brawl") {
      const dayDef = eventDef.days.find((d) => d.num === entry.day);
      if (!dayDef) continue;
      const r = scoringFromBrawlDay(dayDef, entry.day, resources, events);
      results.push(r);
      activeKeys.add(r.scoreKey);
      activeKeys.add("brawl");
      continue;
    }

    if (eventDef.type === "single") {
      const r = scoringFromSingle(eventDef.scoreKey, eventDef, resources, events);
      results.push(r);
      activeKeys.add(eventDef.scoreKey);
    }
  }

  const merged = mergeScoringResults(results);
  const spend = [...merged.values()]
    .sort((a, b) => b.pts - a.pts)
    .map((item) => ({
      icon: item.icon,
      name: item.name,
      why: item.stacked
        ? item.sources.map((s) => `${s.label} (${s.pts.toLocaleString()})`).join(" + ")
        : item.sources[0].label + (item.prep ? " · OK to spend, not optimal" : ""),
      pts: item.stacked ? `${item.pts.toLocaleString()} combined` : item.pts.toLocaleString(),
      stacked: item.stacked,
      prep: item.prep,
    }));

  const stackedItems = spend.filter((s) => s.stacked);
  const holds = buildHoldList(merged, resources, activeKeys, events);

  return { spend, holds, stackedItems, combatEvents, notes, activeKeys };
}

function formatStackBanner(stack, catalog) {
  if (!stack.length) return "No events selected";
  return stack
    .map((entry) => {
      const ev = catalog.events.find((e) => e.id === entry.id);
      if (!ev) return entry.id;
      if (ev.type === "note") return `${ev.icon} ${ev.name}`;
      const dayPart = entry.day ? ` D${entry.day}` : "";
      return `${ev.icon} ${ev.name}${dayPart}`;
    })
    .join(" + ");
}

function renderTodayStackUI(container, catalog, onChange) {
  let stack = loadTodayStack();

  function render() {
    const addRow = catalog.events
      .filter((e) => !stack.some((s) => s.id === e.id))
      .map(
        (e) =>
          `<button type="button" class="chip today-add" data-add="${e.id}">${e.icon} ${e.name}</button>`
      )
      .join("");

    const stackHtml =
      stack.length === 0
        ? `<div class="note-box">Add one or more active events below. Pick the day/stage for each — stack SG Day 6 + All Out Day 2 when both are live.</div>`
        : stack
            .map((entry, idx) => {
              const ev = catalog.events.find((e) => e.id === entry.id);
              if (!ev) return "";
              const dayLabel = ev.dayLabel || "Day";
              let dayPicker = "";

              if (ev.type === "matrix") {
                const maxDays = ev.id === "sg" ? 7 : 5;
                dayPicker = `<div class="today-day-row">${Array.from({ length: maxDays }, (_, i) => {
                  const n = i + 1;
                  return `<button type="button" class="today-day-btn ${entry.day === n ? "active" : ""}" data-idx="${idx}" data-day="${n}">${n}</button>`;
                }).join("")}</div>`;
              } else if (ev.days?.length) {
                dayPicker = `<div class="today-day-row">${ev.days
                  .map(
                    (d) =>
                      `<button type="button" class="today-day-btn ${entry.day === d.num ? "active" : ""}" data-idx="${idx}" data-day="${d.num}">${d.num}</button>`
                  )
                  .join("")}</div>`;
              }

              const sub =
                ev.type === "matrix"
                  ? `<div class="today-stack-sub">${dayLabel} ${entry.day} — change below</div>`
                  : ev.days?.length
                    ? `<div class="today-stack-sub">${ev.days.find((d) => d.num === entry.day)?.name || ""}</div>`
                    : "";

              return `
          <div class="today-stack-card">
            <div class="today-stack-head">
              <span>${ev.icon} <strong>${ev.name}</strong></span>
              <button type="button" class="today-remove" data-idx="${idx}" aria-label="Remove">×</button>
            </div>
            ${sub}
            ${dayPicker}
          </div>`;
            })
            .join("");

    container.innerHTML = `
      <div class="today-stack-list">${stackHtml}</div>
      <div class="today-add-row">
        <div class="today-add-label">Add event</div>
        <div class="filters">${addRow || '<span class="today-add-label">All events added</span>'}</div>
      </div>
      <div style="margin-top:12px">
        <button type="button" class="chip" id="today-clear" style="font-size:10px">Clear stack</button>
      </div>`;

    container.querySelectorAll(".today-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.add;
        const ev = catalog.events.find((e) => e.id === id);
        const day = ev?.days?.[0]?.num ?? (ev?.type === "matrix" ? 1 : null);
        stack.push({ id, day: day ?? 1 });
        saveTodayStack(stack);
        onChange(stack);
        render();
      });
    });

    container.querySelectorAll(".today-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        stack.splice(Number(btn.dataset.idx), 1);
        saveTodayStack(stack);
        onChange(stack);
        render();
      });
    });

    container.querySelectorAll(".today-day-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        stack[idx].day = Number(btn.dataset.day);
        saveTodayStack(stack);
        onChange(stack);
        render();
      });
    });

    container.querySelector("#today-clear")?.addEventListener("click", () => {
      stack = [];
      saveTodayStack(stack);
      onChange(stack);
      render();
    });
  }

  render();
}

async function renderTodayStacked({
  stack,
  catalog,
  resources,
  events,
  bannerEl,
  timerEl,
  contentEl,
}) {
  if (!stack.length) {
    bannerEl.textContent = "No events selected";
    timerEl.textContent = "Add active events below — stack multiple when overlaps are live";
    contentEl.innerHTML = `<div class="note-box">Example: <strong>SG Stage 6</strong> + <strong>All Out Day 2</strong>, or <strong>Brawl Stage 2</strong> + <strong>Treasure Raiders</strong>.</div>`;
    return;
  }

  bannerEl.textContent = formatStackBanner(stack, catalog);
  timerEl.textContent = `${stack.length} active event${stack.length > 1 ? "s" : ""} — combined spend guidance below`;

  const matrixCache = {};
  const { spend, holds, stackedItems, combatEvents, notes } = await resolveStackScoring(
    stack,
    catalog,
    resources,
    events,
    matrixCache
  );

  let html = "";

  if (stackedItems.length) {
    html += `<div class="today-section"><div class="today-head spend">🔥 DOUBLE DIP — scores in multiple active events</div>`;
    html += stackedItems
      .map(
        (i) => `<div class="today-item spend stacked">
          <div class="ti-icon">${i.icon}</div>
          <div class="ti-body"><div class="ti-name">${i.name}</div><div class="ti-why">${i.why}</div></div>
          <div class="ti-pts">${i.pts}</div>
        </div>`
      )
      .join("");
    html += `</div>`;
  }

  if (spend.length) {
    html += `<div class="today-section"><div class="today-head spend">✅ SPEND NOW</div>`;
    html += spend
      .filter((i) => !i.stacked)
      .slice(0, 12)
      .map(
        (i) => `<div class="today-item spend${i.prep ? " prep" : ""}">
          <div class="ti-icon">${i.icon}</div>
          <div class="ti-body"><div class="ti-name">${i.name}</div><div class="ti-why">${i.why}</div></div>
          <div class="ti-pts">${i.pts}</div>
        </div>`
      )
      .join("");
    html += `</div>`;
  }

  if (combatEvents.length) {
    html += `<div class="today-section"><div class="today-head spend">⚔️ COMBAT SCORING (no resource spend)</div>`;
    html += combatEvents
      .map(
        (c) => `<div class="today-item spend">
          <div class="ti-icon">${c.icon}</div>
          <div class="ti-body"><div class="ti-name">${c.name} · Day ${c.day}</div><div class="ti-why">Earn points by defeating enemy troops (PvP). Use combat presets — shields for weaker accounts.</div></div>
        </div>`
      )
      .join("");
    html += `</div>`;
  }

  if (notes.length) {
    html += notes
      .map((n) => `<div class="guide-callout tip">${n.icon} <strong>${n.name}:</strong> ${n.text}</div>`)
      .join("");
  }

  if (holds.length) {
    html += `<div class="today-section"><div class="today-head hold">✋ HOLD — better window elsewhere</div>`;
    html += holds
      .map(
        (i) => `<div class="today-item hold">
          <div class="ti-icon">${i.icon}</div>
          <div class="ti-body"><div class="ti-name">${i.name}</div><div class="ti-why">${i.why}</div></div>
          <div class="ti-pts">${i.pts}</div>
        </div>`
      )
      .join("");
    html += `</div>`;
  }

  if (!html) {
    html = `<div class="note-box">No spendable resources score in this combination. Check day/stage selection or add another event.</div>`;
  }

  contentEl.innerHTML = html;
}
