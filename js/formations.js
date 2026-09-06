/* ═══════════════════════════════════════════════
   Formations Planner — UI
   ═══════════════════════════════════════════════ */

const FM_STORAGE_KEY = "sqb-formations-inputs";

const fmEl = {};

function fmEscape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function fmReadInputs() {
  const joinRaw = fmEl.joinCap.value.trim();
  return {
    inventory: {
      inf: fmEl.inf.value,
      cav: fmEl.cav.value,
      arch: fmEl.arch.value,
    },
    capacity: fmEl.capacity.value,
    slots: fmEl.slots.value,
    joinCap: joinRaw === "" ? null : joinRaw,
    profileId: fmEl.profile.value,
    strategy: fmEl.strategy.value,
  };
}

function fmPersist() {
  try {
    localStorage.setItem(FM_STORAGE_KEY, JSON.stringify(fmReadInputs()));
  } catch {
    /* ignore */
  }
}

function fmRestore() {
  try {
    const raw = JSON.parse(localStorage.getItem(FM_STORAGE_KEY) || "null");
    if (!raw) return;
    if (raw.inventory) {
      fmEl.inf.value = raw.inventory.inf ?? fmEl.inf.value;
      fmEl.cav.value = raw.inventory.cav ?? fmEl.cav.value;
      fmEl.arch.value = raw.inventory.arch ?? fmEl.arch.value;
    }
    if (raw.capacity != null) fmEl.capacity.value = raw.capacity;
    if (raw.slots != null) fmEl.slots.value = raw.slots;
    if (raw.joinCap != null && raw.joinCap !== "") fmEl.joinCap.value = raw.joinCap;
    if (raw.profileId && FM_PROFILES[raw.profileId]) fmEl.profile.value = raw.profileId;
    if (raw.strategy) fmEl.strategy.value = raw.strategy;
  } catch {
    /* ignore */
  }
}

function fmUpdateBlurb() {
  const p = FM_PROFILES[fmEl.profile.value];
  fmEl.blurb.textContent = p ? p.blurb : "";
}

function fmRenderSummary(plan) {
  const inv = plan.used;
  const left = plan.leftover;
  fmEl.summary.hidden = false;
  fmEl.summary.innerHTML = `
    <div class="fm-stat"><span>Deployed</span><strong>${fmSum(inv).toLocaleString()}</strong></div>
    <div class="fm-stat"><span>Per-march send ≤</span><strong>${plan.maxSend.toLocaleString()}</strong></div>
    <div class="fm-stat"><span>Real capacity</span><strong>${plan.capacity.toLocaleString()}</strong></div>
    <div class="fm-stat"><span>Leftover</span><strong>${plan.leftoverTotal.toLocaleString()}</strong>
      <small>Inf ${left.inf.toLocaleString()} · Cav ${left.cav.toLocaleString()} · Arch ${left.arch.toLocaleString()}</small>
    </div>`;
}

function fmRenderNotes(plan) {
  if (!plan.notes.length) {
    fmEl.notes.hidden = true;
    fmEl.notes.innerHTML = "";
    return;
  }
  fmEl.notes.hidden = false;
  fmEl.notes.innerHTML = `<ul>${plan.notes.map((n) => `<li>${fmEscape(n)}</li>`).join("")}</ul>`;
}

function fmMarchCard(m) {
  const saveClass = m.saveMode === "count" ? "fm-save-count" : "fm-save-ratio";
  const saveLabel = m.saveMode === "count" ? "Save as Count" : "Save as Ratio";
  const pctRow = FM_TYPES.map(
    (t) =>
      `<div class="fm-pct"><span>${FM_LABELS[t]}</span><strong>${fmFormatPct(m.balancePct[t])}%</strong></div>`
  ).join("");
  const countRow = FM_TYPES.map(
    (t) =>
      `<div class="fm-count"><span>${FM_LABELS[t]}</span><strong>${m.counts[t].toLocaleString()}</strong></div>`
  ).join("");

  const title = m.kind === "leftover" ? `Formation ${m.index} · Scrap` : `Formation ${m.index}`;
  return `<article class="fm-card${m.kind === "leftover" ? " fm-card-scrap" : ""}">
    <header class="fm-card-head">
      <div>
        <div class="fm-card-title">${fmEscape(title)}</div>
        <div class="fm-card-sub">Send ${m.send.toLocaleString()} / capacity ${m.capacity.toLocaleString()}${
          m.capped ? ` · join cap ${m.maxSend.toLocaleString()}` : ""
        }</div>
      </div>
      <div class="fm-save-badge ${saveClass}" title="${fmEscape(m.saveWhy)}">${saveLabel}</div>
    </header>

    <div class="fm-block">
      <div class="fm-block-label">Absolute troops (verify these)</div>
      <div class="fm-row">${countRow}</div>
    </div>

    <div class="fm-block">
      <div class="fm-block-label">Balance % of real capacity (${m.capacity.toLocaleString()})</div>
      <div class="fm-row">${pctRow}</div>
      <div class="fm-empty-pct">${
        m.emptyPct >= 0.5
          ? `Leave ~${fmFormatPct(m.emptyPct)}% empty so you stay under the send ceiling.`
          : `Percents sum to ~${fmFormatPct(m.pctSum)}%.`
      }</div>
    </div>

    <div class="fm-why">${fmEscape(m.saveWhy)}</div>
  </article>`;
}

function fmRun() {
  const plan = fmPlan(fmReadInputs());
  fmPersist();
  fmRenderSummary(plan);
  fmRenderNotes(plan);
  fmEl.results.innerHTML = plan.marches.map(fmMarchCard).join("");
}

function fmResetDemo() {
  fmEl.inf.value = 40000;
  fmEl.cav.value = 80000;
  fmEl.arch.value = 220000;
  fmEl.capacity.value = 107000;
  fmEl.slots.value = 4;
  fmEl.joinCap.value = 100000;
  fmEl.profile.value = "bear-join";
  fmEl.strategy.value = "fill";
  fmUpdateBlurb();
  fmRun();
}

function fmInit() {
  mountHeader({
    eyebrow: "SQB Alliance · Kingdom #1762",
    title: "📐 Formations Planner",
    sub: "Inventory → Balance % recipes · Count vs Ratio · join-cap aware",
    activeId: "formations",
  });

  fmEl.inf = document.getElementById("fm-inf");
  fmEl.cav = document.getElementById("fm-cav");
  fmEl.arch = document.getElementById("fm-arch");
  fmEl.capacity = document.getElementById("fm-capacity");
  fmEl.slots = document.getElementById("fm-slots");
  fmEl.joinCap = document.getElementById("fm-joincap");
  fmEl.profile = document.getElementById("fm-profile");
  fmEl.strategy = document.getElementById("fm-strategy");
  fmEl.blurb = document.getElementById("fm-profile-blurb");
  fmEl.notes = document.getElementById("fm-notes");
  fmEl.summary = document.getElementById("fm-summary");
  fmEl.results = document.getElementById("fm-results");

  document.getElementById("fm-run").addEventListener("click", fmRun);
  document.getElementById("fm-reset").addEventListener("click", fmResetDemo);
  fmEl.profile.addEventListener("change", () => {
    fmUpdateBlurb();
    fmRun();
  });
  ["fm-inf", "fm-cav", "fm-arch", "fm-capacity", "fm-slots", "fm-joincap", "fm-strategy"].forEach((id) => {
    document.getElementById(id).addEventListener("change", fmRun);
  });

  fmRestore();
  // First visit demo: show join-cap scenario
  if (!localStorage.getItem(FM_STORAGE_KEY)) {
    fmEl.joinCap.value = 100000;
  }
  fmUpdateBlurb();
  fmRun();
}

fmInit();
