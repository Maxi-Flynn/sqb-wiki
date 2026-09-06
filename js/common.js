/* ═══════════════════════════════════════════════
   SQB Wiki — Shared render utilities
   Used by every page to fetch JSON data and hydrate the DOM
   ═══════════════════════════════════════════════ */

/** Fetch a JSON data file relative to /data/ */
async function loadData(filename) {
  const res = await fetch(`../data/${filename}`);
  if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`);
  return res.json();
}

/** Build the site nav bar. Pass the current page id to highlight it. */
function renderNav(activeId) {
  const pages = [
    { id: "home", label: "🏠 Home", href: "../index.html" },
    { id: "roi", label: "⚔ ROI Engine", href: "roi-engine.html" },
    { id: "kvk", label: "👑 KvK", href: "kvk-matrix.html" },
    { id: "sg", label: "🏆 Str. Gov", href: "sg-matrix.html" },
    { id: "beartrap", label: "🐻 Bear Trap", href: "bear-trap.html" },
    { id: "formations", label: "📐 Formations", href: "formations.html" },
    { id: "guides", label: "📜 Guides", href: "guides.html" },
    { id: "calendar", label: "🗓 Calendar", href: "calendar.html" },
  ];
  const nav = document.createElement("div");
  nav.className = "site-nav";
  nav.innerHTML = pages
    .map(
      (p) =>
        `<a href="${p.href}" class="${p.id === activeId ? "active" : ""}">${p.label}</a>`
    )
    .join("");
  return nav;
}

/** Mount the standard header + nav into a container */
function mountHeader({ eyebrow, title, sub, activeId }) {
  const header = document.querySelector(".header");
  header.innerHTML = `
    <div class="header-eyebrow">${eyebrow}</div>
    <div class="header-title">${title}</div>
    <div class="header-sub">${sub}</div>
  `;
  header.appendChild(renderNav(activeId));
}

/** Render a matrix table (used by both SG and KvK pages) */
function renderMatrix({ containerId, stagebarId, columns, sections, notes, legendId }) {
  // stage/day header bar
  const stagebar = document.getElementById(stagebarId);
  const colCount = columns.length;
  stagebar.style.gridTemplateColumns = `130px repeat(${colCount}, 1fr)`;
  stagebar.innerHTML =
    `<div class="matrix-label"></div>` +
    columns
      .map(
        (c) =>
          `<div class="matrix-label" style="color:${c.color};border-bottom:2px solid ${c.color}">
            D${c.num}<span>${c.name}</span>
          </div>`
      )
      .join("");

  // rows, grouped by section
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = sections
    .map((section) => {
      const rowsHtml = section.rows
        .map((row) => {
          const cellsHtml = row.cells
            .map((cell) => {
              const symbol =
                cell === "use" ? "✅" : cell === "prep" ? "🆗" : cell === "skip" ? "⛔" : cell === "free" ? "🔷" : "—";
              return `<div class="matrix-cell ${cell}">${symbol}</div>`;
            })
            .join("");
          return `
            <div class="matrix-row" style="grid-template-columns:130px repeat(${colCount}, 1fr)">
              <div class="matrix-rowlabel">
                <span class="icon">${row.icon}</span>
                <div><div>${row.name}</div><div class="pts">${row.pts}</div></div>
              </div>
              ${cellsHtml}
            </div>`;
        })
        .join("");
      return `<div class="section-title">${section.title}</div>${rowsHtml}`;
    })
    .join("");

  // notes
  if (notes) {
    const notesBox = document.getElementById("matrix-notes");
    if (notesBox) {
      notesBox.innerHTML =
        `<div class="tile-title" style="margin-bottom:10px">⚠️ Important Notes</div>` +
        notes
          .map(
            (n) =>
              `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-dim);line-height:1.6">
                <span>${n.icon}</span><span>${n.text}</span>
              </div>`
          )
          .join("");
    }
  }
}

/** Render resource ROI cards (used by roi-engine.html) */
function renderResourceCards(resources, events, containerId, filter = "all") {
  const list = document.getElementById(containerId);
  list.innerHTML = "";
  const currentGen = 3; // TODO: move to config if this needs to be dynamic

  resources
    .filter((r) => filter === "all" || r.cat === filter)
    .forEach((r) => {
      const locked = r.unlock > currentGen;
      const best = r.windows.find((w) => w.tier === "best") || r.windows[0];
      const bestEv = events[best.ev];

      const windowsHtml = r.windows
        .map((w) => {
          const ev = events[w.ev];
          const noteHtml = w.note ? `<span class="r-day">· ${w.note}</span>` : "";
          return `<div class="row-item ${w.tier}">
            <div class="row-event">
              <span class="r-icon">${ev.icon}</span>
              <span class="r-name">${ev.name}</span>
              <span class="r-day">${ev.day}</span>
              ${noteHtml}
            </div>
            <div class="row-pts">${w.pts.toLocaleString()}</div>
          </div>`;
        })
        .join("");

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-head">
          <div class="card-icon">${r.icon}</div>
          <div class="card-name-wrap">
            <div class="card-name">${r.name}${locked ? `<span class="lock-badge">🔒 Gen ${r.unlock}</span>` : ""}</div>
            <div class="card-tag">${r.tag}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:1px">Best window</div>
            <div style="font-size:12px;color:var(--best);font-weight:600">${bestEv.icon} ${bestEv.name}</div>
          </div>
          <div class="card-chevron">▼</div>
        </div>
        <div class="card-detail">
          ${windowsHtml}
          <div class="verdict">${r.verdict}</div>
        </div>`;

      card.querySelector(".card-head").addEventListener("click", () => {
        const d = card.querySelector(".card-detail");
        const c = card.querySelector(".card-chevron");
        d.classList.toggle("open");
        c.textContent = d.classList.contains("open") ? "▲" : "▼";
      });
      list.appendChild(card);
    });
}

/** Render the Today tab content */
function renderToday(todayData, key) {
  const data = todayData[key];
  const evName = document.getElementById("today-event");
  const evTimer = document.getElementById("today-timer");
  const content = document.getElementById("today-content");

  if (!data) {
    evName.textContent = "No major event active";
    evTimer.textContent = "Select your current event above for tailored guidance";
    content.innerHTML = `<div class="note-box">Pick the live event and the engine shows what to <strong>spend</strong> vs <strong>hold</strong>.</div>`;
    return;
  }

  evName.textContent = data.name;
  evTimer.textContent = data.timer;

  let html = "";
  if (data.spend.length) {
    html += `<div class="today-section"><div class="today-head spend">✅ SPEND NOW</div>`;
    html += data.spend
      .map(
        (i) => `<div class="today-item spend">
          <div class="ti-icon">${i.icon}</div>
          <div class="ti-body"><div class="ti-name">${i.name}</div><div class="ti-why">${i.why}</div></div>
          <div class="ti-pts">${i.pts}</div>
        </div>`
      )
      .join("");
    html += `</div>`;
  }
  if (data.hold.length) {
    html += `<div class="today-section"><div class="today-head hold">✋ HOLD — better window coming</div>`;
    html += data.hold
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
  content.innerHTML = html;
}

/** Render one guide content block (table, section, list, callout) */
function renderGuideBlock(block) {
  if (block.type === "section") {
    const body = block.body ? `<div class="guide-body">${block.body}</div>` : "";
    return `<div class="guide-section"><div class="guide-section-title">${block.title}</div>${body}</div>`;
  }
  if (block.type === "list") {
    const items = (block.items || [])
      .map((item) => `<li>${item}</li>`)
      .join("");
    const title = block.title ? `<div class="guide-section-title">${block.title}</div>` : "";
    return `<div class="guide-section">${title}<ul class="guide-list">${items}</ul></div>`;
  }
  if (block.type === "callout") {
    const variant = block.variant || "tip";
    return `<div class="guide-callout ${variant}">${block.text}</div>`;
  }
  if (block.type === "table" || block.headers) {
    const headers = block.headers || [];
    const rows = block.rows || [];
    return `
      <table class="guide-table">
        <thead>
          <tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>`;
  }
  return "";
}

/** Render guide blocks array, or legacy table + note */
function renderGuideContent(guide) {
  if (guide.blocks && guide.blocks.length) {
    return guide.blocks.map(renderGuideBlock).join("");
  }
  let html = "";
  if (guide.table) {
    html += renderGuideBlock(guide.table);
  }
  if (guide.note) {
    html += `<div class="verdict" style="margin-top:12px">${guide.note}</div>`;
  }
  return html;
}

/** Generic tab wiring: [data-panel] buttons toggle .panel elements by id */
function wireTabs() {
  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      document.getElementById(t.dataset.panel).classList.add("active");
    });
  });
}

/** Generic chip filter wiring */
function wireChips(selector, onSelect) {
  document.querySelectorAll(selector).forEach((c) => {
    c.addEventListener("click", () => {
      document.querySelectorAll(selector).forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      onSelect(c.dataset.filter || c.dataset.today);
    });
  });
}
