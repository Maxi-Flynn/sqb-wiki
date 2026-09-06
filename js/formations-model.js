/**
 * Formations planner — pure math (no DOM).
 *
 * Join-cap rule: optional alliance send ceiling (e.g. 100k/join) is NOT march
 * capacity. Balance % is always count / realCapacity so in-game Balance % of
 * capacity hits the send size correctly.
 *
 * Save mode: Count = fixed troops (join caps / scraps). Ratio = scales with
 * army growth (uncapped template marches).
 */
(function (global) {
  "use strict";

  var FM_TYPES = ["inf", "cav", "arch"];
  var FM_LABELS = { inf: "Infantry", cav: "Cavalry", arch: "Archers" };

  var FM_PROFILES = {
    "bear-lead": {
      id: "bear-lead",
      label: "Bear — Rally lead",
      blurb: "Gen4+ lead recipe (~1 / 10 / 89). Put your best skill-damage heroes here.",
      ratio: { inf: 0.01, cav: 0.1, arch: 0.89 },
      infFloor: 5000,
      saveModeDefault: "ratio"
    },
    "bear-join": {
      id: "bear-join",
      label: "Bear — Rally join",
      blurb: "Joiner recipe (~0 / 20 / 80) with a small infantry floor. Slot-1 skill #1 only.",
      ratio: { inf: 0, cav: 0.2, arch: 0.8 },
      infFloor: 5000,
      saveModeDefault: "count"
    }
  };

  function clampInt(n, min, max) {
    var v = Math.round(Number(n) || 0);
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function fmSum(c) {
    return (c.inf || 0) + (c.cav || 0) + (c.arch || 0);
  }

  function fmFormatPct(n) {
    var v = Math.round(Number(n) * 10) / 10;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function clonePool(p) {
    return { inf: p.inf | 0, cav: p.cav | 0, arch: p.arch | 0 };
  }

  function idealForCap(profile, targetCap) {
    var r = profile.ratio;
    var inf = Math.round(targetCap * r.inf);
    var cav = Math.round(targetCap * r.cav);
    var arch = targetCap - inf - cav;
    if (arch < 0) {
      cav += arch;
      arch = 0;
      if (cav < 0) {
        inf += cav;
        cav = 0;
      }
    }
    return { inf: inf, cav: cav, arch: arch };
  }

  function applyInfFloor(counts, profile, pool, targetCap) {
    if (profile.infFloor <= 0) return counts;
    if (counts.inf >= profile.infFloor) return counts;
    if (pool.inf < profile.infFloor) {
      var take = Math.min(pool.inf, targetCap - fmSum(counts) + counts.inf);
      if (take > counts.inf) {
        var steal = take - counts.inf;
        var fromArch = Math.min(counts.arch, steal);
        counts.arch -= fromArch;
        steal -= fromArch;
        var fromCav = Math.min(counts.cav, steal);
        counts.cav -= fromCav;
        counts.inf = take;
      }
      return counts;
    }
    var need = profile.infFloor - counts.inf;
    var room = targetCap - fmSum(counts);
    if (room < need) {
      var steal2 = need - room;
      var sArch = Math.min(counts.arch, steal2);
      counts.arch -= sArch;
      steal2 -= sArch;
      var sCav = Math.min(counts.cav, steal2);
      counts.cav -= sCav;
    }
    counts.inf = Math.min(pool.inf, profile.infFloor);
    while (fmSum(counts) > targetCap) {
      if (counts.arch > 0) counts.arch -= 1;
      else if (counts.cav > 0) counts.cav -= 1;
      else if (counts.inf > profile.infFloor) counts.inf -= 1;
      else break;
    }
    return counts;
  }

  function fillRoom(counts, pool, targetCap, prefer) {
    var room = targetCap - fmSum(counts);
    var i;
    for (i = 0; i < prefer.length && room > 0; i++) {
      var k = prefer[i];
      var can = Math.min(room, pool[k] - counts[k]);
      if (can > 0) {
        counts[k] += can;
        room -= can;
      }
    }
    return counts;
  }

  function allocateMarch(profile, targetCap, pool, strategy) {
    var avail = fmSum(pool);
    if (avail < 500) return null;

    var ideal = idealForCap(profile, targetCap);
    var counts;

    if (strategy === "strict") {
      var scale = 1;
      if (ideal.inf > 0) scale = Math.min(scale, pool.inf / ideal.inf);
      if (ideal.cav > 0) scale = Math.min(scale, pool.cav / ideal.cav);
      if (ideal.arch > 0) scale = Math.min(scale, pool.arch / ideal.arch);
      if (!isFinite(scale) || scale < 0) scale = 0;

      if (scale < 0.4 && avail < targetCap * 0.4) return null;

      counts = {
        inf: Math.min(pool.inf, Math.floor(ideal.inf * scale)),
        cav: Math.min(pool.cav, Math.floor(ideal.cav * scale)),
        arch: Math.min(pool.arch, Math.floor(ideal.arch * scale))
      };
      var want = Math.floor(targetCap * Math.min(1, scale));
      counts = fillRoom(counts, pool, Math.min(want, targetCap), ["arch", "cav", "inf"]);
    } else {
      counts = {
        inf: Math.min(pool.inf, ideal.inf),
        cav: Math.min(pool.cav, ideal.cav),
        arch: Math.min(pool.arch, ideal.arch)
      };
      counts = fillRoom(counts, pool, targetCap, ["arch", "cav", "inf"]);
    }

    counts = applyInfFloor(counts, profile, pool, targetCap);
    if (fmSum(counts) < 500) return null;

    pool.inf -= counts.inf;
    pool.cav -= counts.cav;
    pool.arch -= counts.arch;

    return { counts: counts, send: fmSum(counts) };
  }

  function balancePct(counts, realCapacity) {
    if (!realCapacity) return { inf: 0, cav: 0, arch: 0 };
    return {
      inf: Math.round((counts.inf / realCapacity) * 1000) / 10,
      cav: Math.round((counts.cav / realCapacity) * 1000) / 10,
      arch: Math.round((counts.arch / realCapacity) * 1000) / 10
    };
  }

  function pickSaveMode(profile, formationKind, capped) {
    if (formationKind === "leftover") {
      return {
        saveMode: "count",
        saveWhy:
          "Save as Count. This is a scrap / remainder fill — Ratio would distort it when your army grows."
      };
    }
    if (capped) {
      return {
        saveMode: "count",
        saveWhy:
          "Save as Count. An alliance join cap is active — Ratio would grow the march past the cap as you recruit."
      };
    }
    if (profile.saveModeDefault === "ratio") {
      return {
        saveMode: "ratio",
        saveWhy:
          "Save as Ratio. No join cap — this template should grow with your army while keeping the troop mix."
      };
    }
    return {
      saveMode: "count",
      saveWhy:
        "Save as Count. Join recipes are usually fixed sends; use Ratio only if you want this mix to scale as you recruit."
    };
  }

  /**
   * @param {object} input  from UI fmReadInputs()
   * @param {object} input.inventory  { inf, cav, arch }
   * @param {number|string} input.capacity
   * @param {number|string} input.slots
   * @param {number|string|null} input.joinCap
   * @param {string} input.profileId
   * @param {string} input.strategy  "fill" | "strict"
   */
  function fmPlan(input) {
    var profile = FM_PROFILES[input.profileId] || FM_PROFILES["bear-join"];
    var realCapacity = clampInt(input.capacity, 1000, 5000000);
    var slots = clampInt(input.slots, 1, 8);
    var strategy = input.strategy === "strict" ? "strict" : "fill";
    var inv = input.inventory || {};

    var joinCap = null;
    if (input.joinCap != null && input.joinCap !== "" && Number(input.joinCap) > 0) {
      joinCap = clampInt(input.joinCap, 1000, realCapacity);
    }

    var maxSend = joinCap != null ? joinCap : realCapacity;
    var capped = joinCap != null;

    var startPool = {
      inf: clampInt(inv.inf, 0, 50000000),
      cav: clampInt(inv.cav, 0, 50000000),
      arch: clampInt(inv.arch, 0, 50000000)
    };
    var pool = clonePool(startPool);

    var notes = [];
    if (capped) {
      notes.push(
        "Join cap " +
          joinCap.toLocaleString() +
          " is a send ceiling only. Balance % uses your real capacity (" +
          realCapacity.toLocaleString() +
          ") — do not set capacity to the cap in-game."
      );
    }
    if (profile.id === "bear-lead") {
      notes.push("Lead: best skill-damage heroes on this march. Joiner heroes on joins.");
    } else {
      notes.push(
        "Join: only slot-1 skill #1 fires. Utility heroes (Diana/Fahd) do not replace damage dealers."
      );
    }
    notes.push(
      strategy === "strict"
        ? "Packing: Strict ratio — skips thin marches rather than warping the mix; scraps become Count leftovers."
        : "Packing: Fill heroes first — packs inventory into marches (ratio-first, then leftover room)."
    );

    var marches = [];
    var i;
    for (i = 0; i < slots; i++) {
      var built = allocateMarch(profile, maxSend, pool, strategy);
      if (!built) break;

      var pct = balancePct(built.counts, realCapacity);
      var save = pickSaveMode(profile, "normal", capped);
      var pctSum = Math.round((pct.inf + pct.cav + pct.arch) * 10) / 10;

      marches.push({
        index: marches.length + 1,
        label: profile.label + " · March " + (marches.length + 1),
        kind: "normal",
        counts: built.counts,
        send: built.send,
        capacity: realCapacity,
        maxSend: maxSend,
        capped: capped,
        balancePct: pct,
        pctSum: pctSum,
        emptyPct: Math.max(0, Math.round((100 - pctSum) * 10) / 10),
        saveMode: save.saveMode,
        saveWhy: save.saveWhy
      });
    }

    var leftover = clonePool(pool);
    var leftoverTotal = fmSum(leftover);
    if (leftoverTotal >= 500) {
      var leftCounts = clonePool(leftover);
      if (leftoverTotal > maxSend) {
        var over = leftoverTotal - maxSend;
        var trim = Math.min(over, leftCounts.arch);
        leftCounts.arch -= trim;
        over -= trim;
        trim = Math.min(over, leftCounts.cav);
        leftCounts.cav -= trim;
        over -= trim;
        leftCounts.inf -= Math.min(over, leftCounts.inf);
      }
      var leftPct = balancePct(leftCounts, realCapacity);
      var leftSave = pickSaveMode(profile, "leftover", capped);
      var leftSum = Math.round((leftPct.inf + leftPct.cav + leftPct.arch) * 10) / 10;
      marches.push({
        index: marches.length + 1,
        label: "Leftover / scrap fill",
        kind: "leftover",
        counts: leftCounts,
        send: fmSum(leftCounts),
        capacity: realCapacity,
        maxSend: maxSend,
        capped: capped,
        balancePct: leftPct,
        pctSum: leftSum,
        emptyPct: Math.max(0, Math.round((100 - leftSum) * 10) / 10),
        saveMode: leftSave.saveMode,
        saveWhy: leftSave.saveWhy
      });
      notes.push(
        "Leftover troops after hero’d marches — park in a Count scrap formation or keep recruiting into ratio."
      );
      pool.inf -= leftCounts.inf;
      pool.cav -= leftCounts.cav;
      pool.arch -= leftCounts.arch;
      leftover = clonePool(pool);
      leftoverTotal = fmSum(leftover);
    }

    if (!marches.length) {
      notes.push("Not enough troops to build a march. Check inventory counts.");
    }

    var used = {
      inf: startPool.inf - leftover.inf,
      cav: startPool.cav - leftover.cav,
      arch: startPool.arch - leftover.arch
    };

    return {
      profile: profile,
      capacity: realCapacity,
      maxSend: maxSend,
      capped: capped,
      joinCap: joinCap,
      strategy: strategy,
      marches: marches,
      used: used,
      leftover: leftover,
      leftoverTotal: leftoverTotal,
      notes: notes
    };
  }

  global.FM_TYPES = FM_TYPES;
  global.FM_LABELS = FM_LABELS;
  global.FM_PROFILES = FM_PROFILES;
  global.fmPlan = fmPlan;
  global.fmSum = fmSum;
  global.fmFormatPct = fmFormatPct;

  global.FormationsModel = {
    FM_TYPES: FM_TYPES,
    FM_LABELS: FM_LABELS,
    FM_PROFILES: FM_PROFILES,
    fmPlan: fmPlan,
    fmSum: fmSum,
    fmFormatPct: fmFormatPct
  };
})(typeof window !== "undefined" ? window : globalThis);
