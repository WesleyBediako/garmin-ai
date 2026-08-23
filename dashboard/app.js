const COLORS = {
  rhr: "#5eb3ff",
  readiness: "#6ee7a0",
  stress: "#ff9d5e",
  battery: "#c792ea",
  steps: "#5eb3ff",
  volume: "#5eb3ff",
  volumeTarget: "#3a4252",
};

const TYPE_LABELS_DE = {
  EASY: "Easy Run",
  TRACK: "Bahn / Intervalle",
  FARTLEK: "Fartlek",
  SCHWELLE: "Schwelle",
  LONG: "Long Run",
  RACE: "Rennen",
  RECOVERY: "Erholung",
  REST: "Ruhetag",
  RAD: "Rad",
  "RAD+EASY": "Rad + Easy Run",
  HMPACE: "HM-Pace",
};

function readinessBadge(score) {
  if (score == null) return '<span class="badge na">n/a</span>';
  if (score <= 25) return `<span class="badge poor">${score} Schwach</span>`;
  if (score <= 50) return `<span class="badge low">${score} Niedrig</span>`;
  if (score <= 75) return `<span class="badge moderate">${score} Mittel</span>`;
  return `<span class="badge good">${score} Gut</span>`;
}

function fmtDate(d) {
  const [, m, day] = d.split("-");
  return `${day}.${m}.`;
}

function fmtHM(hoursFloat) {
  const h = Math.floor(hoursFloat);
  const m = Math.round((hoursFloat - h) * 60);
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/* ---------- charts ---------- */

function lineChartSVG(points, color, opts = {}) {
  const width = 600, height = 120, padL = 30, padR = 10, padT = 10, padB = 20;
  const values = points.map((p) => p.value).filter((v) => v != null);
  if (values.length === 0) return `<p class="empty">Keine Daten für diesen Zeitraum</p>`;
  const min = opts.minZero ? 0 : Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = padL + i * step;
    const y = p.value == null ? null : padT + innerH - ((p.value - min) / range) * innerH;
    return { x, y, label: p.label, value: p.value };
  });

  const pathParts = coords.filter((c) => c.y != null).map((c) => `${c.x},${c.y}`);
  const path = pathParts.length > 1 ? `M ${pathParts.join(" L ")}` : "";

  const dots = coords
    .filter((c) => c.y != null)
    .map((c) => `<circle class="dot" cx="${c.x}" cy="${c.y}" r="4" stroke="${color}"><title>${c.label}: ${c.value}</title></circle>`)
    .join("");

  const labels = coords
    .map((c) => `<text class="axis-label" x="${c.x}" y="${height - 2}" text-anchor="middle">${fmtDate(c.label)}</text>`)
    .join("");

  const gridline = `<line class="gridline" x1="${padL}" y1="${padT + innerH}" x2="${width - padR}" y2="${padT + innerH}" />`;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}">
    ${gridline}
    ${path ? `<path class="line" d="${path}" stroke="${color}" />` : ""}
    ${dots}
    ${labels}
  </svg>`;
}

const PHASE_COLORS = { p0: "#6B7A94", p1: "#2FBFA6", p2: "#F2B134", p3: "#FF5A45", p4: "#6B7A94" };

function weeklyVolumeChartSVG(weeks) {
  if (weeks.length === 0) return `<p class="empty">Noch keine Wochendaten</p>`;
  const width = 1000, height = 200, padL = 36, padR = 10, padT = 10, padB = 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxVal = Math.max(1, ...weeks.map((w) => Math.max(w.actual, w.planned || 0))) * 1.15;
  const groupW = innerW / weeks.length;
  const barW = Math.min(26, groupW * 0.34);

  const bars = weeks
    .map((w, i) => {
      const cx = padL + groupW * i + groupW / 2;
      const actualH = (w.actual / maxVal) * innerH;
      const plannedH = w.planned ? (w.planned / maxVal) * innerH : 0;
      const ay = padT + innerH - actualH;
      const py = padT + innerH - plannedH;
      const phaseColor = PHASE_COLORS[w.phase] || COLORS.volumeTarget;
      const aBar = `<rect class="bar" x="${cx - barW - 1}" y="${ay}" width="${barW}" height="${actualH}" fill="${COLORS.volume}"><title>${w.label}: ${w.actual.toFixed(1)} km ist</title></rect>`;
      const pBar = w.planned
        ? `<rect class="bar" x="${cx + 1}" y="${py}" width="${barW}" height="${plannedH}" fill="${phaseColor}" opacity="0.85"><title>${w.label}: ~${w.planned} km geplant</title></rect>`
        : "";
      const label = `<text class="bar-label" x="${cx}" y="${height - 4}">${w.label.replace("W", "")}</text>`;
      return aBar + pBar + label;
    })
    .join("");

  const gridline = `<line class="gridline" x1="${padL}" y1="${padT + innerH}" x2="${width - padR}" y2="${padT + innerH}" />`;

  return `<svg class="chart" viewBox="0 0 ${width} ${height}">
    ${gridline}
    ${bars}
  </svg>
  <div style="display:flex;gap:16px;font-size:0.75rem;color:var(--muted);margin-top:6px">
    <span><span style="display:inline-block;width:9px;height:9px;background:${COLORS.volume};border-radius:2px;margin-right:5px"></span>Ist</span>
    <span><span style="display:inline-block;width:9px;height:9px;background:${COLORS.volumeTarget};border-radius:2px;margin-right:5px"></span>Plan</span>
  </div>`;
}

function statCard(title, valueHtml, chartHtml) {
  return `<div class="card">
    <h3>${title}</h3>
    <div class="value">${valueHtml}</div>
    ${chartHtml || ""}
  </div>`;
}

/* ---------- plan / status helpers ---------- */

function daysUntil(dateStr, todayStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayStr + "T00:00:00");
  return Math.round((d - t) / 86400000);
}

function activityTypesOnDate(activities, date) {
  return Object.values(activities)
    .filter((a) => (a.startTimeLocal || "").startsWith(date))
    .map((a) => ((a.activityType || {}).typeKey || "").toLowerCase());
}

const BIKE_PLAN_TYPES = ["RAD", "RAD+EASY"];
// Session types that a wearable can't verify (lab tests etc.) — no Garmin
// activity on that day doesn't mean it was skipped, so never call it "missed".
const UNTRACKED_TYPES = ["TEST"];

function sessionStatus(session, activities, todayStr) {
  const typesToday = activityTypesOnDate(activities, session.date);
  if (session.type === "REST") return "rest";
  if (UNTRACKED_TYPES.includes(session.type)) return session.date > todayStr ? "upcoming" : "untracked";
  if (session.date > todayStr) return "upcoming";
  if (typesToday.length > 0) {
    const plannedIsBike = BIKE_PLAN_TYPES.includes(session.type);
    const didRun = typesToday.some((t) => t.includes("running"));
    const didBike = typesToday.some((t) => t.includes("cycl") || t.includes("biking"));
    if (!plannedIsBike && didBike && !didRun) return "substituted-bike";
    if (plannedIsBike && didRun && !didBike) return "substituted-run";
    return "done";
  }
  if (session.date === todayStr) return "today";
  return "missed";
}

const STATUS_BADGE = {
  done: '<span class="badge good">Erledigt</span>',
  "substituted-bike": '<span class="badge low">Ersetzt (Rad statt Lauf)</span>',
  "substituted-run": '<span class="badge low">Ersetzt (Lauf statt Rad)</span>',
  untracked: '<span class="badge na">Nicht per Garmin erfasst</span>',
  missed: '<span class="badge poor">Verpasst</span>',
  upcoming: '<span class="badge na">Kommt</span>',
  today: '<span class="badge moderate">Heute</span>',
  rest: '<span class="badge na">Ruhetag</span>',
};

function parsePaceRangeSecPerKm(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*\/?\s*km/);
  if (!m) return null;
  const a = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const b = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  // Written order isn't consistent across the plan (easy-run ranges go
  // fast-first e.g. "4:35–5:00", threshold ranges go slow-first e.g.
  // "4:05–3:55") — always resolve to the true fast/slow regardless of order.
  return { fast: Math.min(a, b), slow: Math.max(a, b) };
}

function fmtPace(secPerKm) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/* ---------- manual plan swaps (explicit user overrides, persist across syncs) ---------- */

function applyManualSwaps(sessions, swaps) {
  if (!swaps || !swaps.length) return sessions;
  const byDate = {};
  sessions.forEach((s) => (byDate[s.date] = s));
  const swapMap = {};
  swaps.forEach((sw) => {
    swapMap[sw.date_a] = { otherDate: sw.date_b, note: sw.note };
    swapMap[sw.date_b] = { otherDate: sw.date_a, note: sw.note };
  });
  return sessions.map((s) => {
    const swap = swapMap[s.date];
    if (!swap || !byDate[swap.otherDate]) return s;
    const other = byDate[swap.otherDate];
    return {
      ...s,
      type: other.type,
      type_label: other.type_label,
      title_and_target: other.title_and_target,
      detail: other.detail,
      note: other.note,
      _original: { type_label: s.type_label, title_and_target: s.title_and_target, detail: s.detail, note: s.note },
      _swapNote: swap.note,
      _kind: "swap",
    };
  });
}

// Freeform manual overrides — for changes that aren't a clean swap between
// two existing plan days (e.g. a custom brick session dictated by the user).
function applyManualOverrides(sessions, overrides) {
  if (!overrides || !overrides.length) return sessions;
  const byDate = {};
  overrides.forEach((o) => (byDate[o.date] = o));
  return sessions.map((s) => {
    const o = byDate[s.date];
    if (!o) return s;
    const pick = (field) => (field in o ? o[field] : s[field]);
    const merged = {
      ...s,
      type: pick("type"),
      type_label: pick("type_label"),
      title_and_target: pick("title_and_target"),
      detail: pick("detail"),
      note: pick("note"),
      week_volume: pick("week_volume"),
    };
    // "silent" overrides (e.g. just correcting the week's km target) don't
    // show a badge or strikethrough — only visible content changes do.
    if (!o.silent) {
      merged._original = { type_label: s.type_label, title_and_target: s.title_and_target, detail: s.detail, note: s.note };
      merged._swapNote = o.reason;
      merged._kind = "override";
    }
    return merged;
  });
}

/* ---------- plan phase awareness ---------- */

function getWeekPhase(block) {
  if (!block) return "normal";
  const b = block.toUpperCase();
  if (/PEAK/.test(b)) return "peak";
  if (/TAPER/.test(b)) return "taper";
  if (/WETTKAMPFWOCHE|RACE WEEK|RENNTAG/.test(b)) return "raceweek";
  if (/ERHOLUNGSWOCHE|RECOVERY/.test(b)) return "recoveryweek";
  return "normal";
}

const HARD_TYPES = ["TRACK", "SCHWELLE", "HMPACE", "FARTLEK", "MPACE"];

/* Small, conservative adjustments to the *upcoming* plan — only the next
   hard/quality session gets touched, and only if the signal is strong enough
   for the current training phase. Original plan is never deleted, only
   annotated. */
function computeUpcomingAdjustments(wellness, dates, activities, plan, todayStr) {
  if (!plan) return {};

  const readinessSeries = dates
    .map((d) => {
      const r = wellness[d].training_readiness;
      return { date: d, value: Array.isArray(r) && r[0] ? r[0].score : null };
    })
    .filter((p) => p.value != null);
  let poorStreak = 0;
  for (let i = readinessSeries.length - 1; i >= 0; i--) {
    if (readinessSeries[i].value <= 25) poorStreak++;
    else break;
  }
  if (poorStreak < 2) return {}; // nothing to adjust, signal too weak

  const upcoming = plan.sessions
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  const nextHard = upcoming.find((s) => HARD_TYPES.includes(s.type));
  if (!nextHard) return {};

  const phase = getWeekPhase(nextHard.block);
  // Peak/race weeks are intentionally hard/short by design — require a
  // stronger, longer signal before touching them.
  const requiredStreak = phase === "peak" || phase === "raceweek" ? 4 : phase === "taper" ? 3 : 2;
  if (poorStreak < requiredStreak) return {};
  if (phase === "recoveryweek") return {}; // already an easy week, nothing to soften further

  const reason =
    phase === "peak"
      ? `Trotz Peak-Woche: Readiness ist seit ${poorStreak} Tagen durchgehend schwach — das übersteigt normale Peak-Week-Müdigkeit. Lieber diese eine Einheit entschärfen als das ganze Peak-Konzept zu gefährden.`
      : phase === "taper"
      ? `Auch im Taper sollte Readiness nicht ${poorStreak} Tage am Stück im Keller sein — Frische geht hier vor Schärfe.`
      : `Readiness seit ${poorStreak} Tagen schwach — vor der nächsten intensiven Einheit lieber einen Gang runterschalten.`;

  return {
    [nextHard.date]: {
      original: nextHard,
      newTitle: `${nextHard.type_label} → Easy Run`,
      newDetail: "Locker laufen, gleiche ungefähre Dauer, kein Tempo",
      reason,
      phase,
    },
  };
}

/* ---------- weekly aggregation ---------- */

function computeWeeklyStats(plan, activities) {
  const dateToWeek = {};
  const weekPlanned = {};
  if (plan) {
    plan.sessions.forEach((s) => {
      dateToWeek[s.date] = s.week;
      if (!(s.week in weekPlanned)) {
        const m = (s.week_volume || "").match(/(\d+)/);
        weekPlanned[s.week] = m ? parseInt(m[1], 10) : null;
      }
    });
  }
  const weeks = {};
  Object.values(activities).forEach((a) => {
    const date = (a.startTimeLocal || "").split(" ")[0];
    const week = dateToWeek[date] || "?";
    if (!weeks[week]) weeks[week] = { km: 0, bikeKm: 0, hours: 0, bikeHours: 0, count: 0, bikeCount: 0 };
    const actType = ((a.activityType || {}).typeKey || "").toLowerCase();
    const distKm = (a.distance || 0) / 1000;
    const durHours = (a.duration || 0) / 3600;
    // The plan's weekly km/hours/session targets are running-specific —
    // cycling isn't comparable minute-for-minute or km-for-km, so keep it
    // separate rather than silently inflating "Volumen"/"Stunden"/"Einheiten".
    if (actType.includes("running")) {
      weeks[week].km += distKm;
      weeks[week].hours += durHours;
      weeks[week].count += 1;
    } else if (actType.includes("cycl") || actType.includes("biking")) {
      weeks[week].bikeKm += distKm;
      weeks[week].bikeHours += durHours;
      weeks[week].bikeCount += 1;
    } else {
      weeks[week].count += 1;
    }
  });
  const weekOrder = plan ? [...new Set(plan.sessions.map((s) => s.week))] : Object.keys(weeks).sort();
  const weekBlock = {};
  if (plan) plan.sessions.forEach((s) => { if (!(s.week in weekBlock)) weekBlock[s.week] = s.block; });

  const series = weekOrder.map((w) => {
    const wk = weeks[w] || { km: 0, bikeKm: 0, hours: 0, bikeHours: 0, count: 0, bikeCount: 0 };
    return {
      label: w,
      actual: wk.km,
      bikeKm: wk.bikeKm,
      hours: wk.hours,
      bikeHours: wk.bikeHours,
      count: wk.count,
      bikeCount: wk.bikeCount,
      planned: weekPlanned[w] || null,
      phase: getPhaseKey(weekBlock[w]),
    };
  });
  return series;
}

/* ---------- aerobic efficiency trend (HR-per-speed, per session category) ---------- */

// Which planned session types count as a sample for each category. Classification
// goes by what the PLAN said that day, not just raw pace — more reliable than
// guessing from pace alone, especially for telling Steady apart from Easy.
const EFFICIENCY_CATEGORIES = {
  easy: { types: ["EASY", "RECOVERY"], label: "Easy-Läufe", windowDays: 14, minSamples: 3 },
  steady: { types: ["STEADY"], label: "Steady-Läufe", windowDays: 28, minSamples: 2 },
  long: { types: ["LONG"], label: "Long Runs", windowDays: 28, minSamples: 2 },
  workout: { types: ["SCHWELLE"], label: "Schwelle-Workouts (Arbeitsabschnitte)", windowDays: 28, minSamples: 2 },
};

// For threshold workouts, the whole-activity average is contaminated by
// warm-up/cooldown/rest jogs — only the classified "work" laps (see
// garmin_sync.py's classify_laps) give a meaningful HR-per-speed number.
function extractEfficiencySample(a, category) {
  if (category === "workout") {
    const workLaps = (a.lap_structure || []).filter((l) => l.kind === "work" && l.avg_hr);
    if (workLaps.length < 2) return null;
    const totalDist = workLaps.reduce((s, l) => s + l.distance_m, 0);
    const totalDur = workLaps.reduce((s, l) => s + l.duration_s, 0);
    if (!totalDist || !totalDur) return null;
    const avgHr = workLaps.reduce((s, l) => s + l.avg_hr, 0) / workLaps.length;
    return { hr: avgHr, speedKmh: totalDist / 1000 / (totalDur / 3600) };
  }
  if (!a.distance || !a.duration || !a.averageHR) return null;
  return { hr: a.averageHR, speedKmh: a.distance / 1000 / (a.duration / 3600) };
}

function computeEfficiencyTrend(activities, plan, todayStr, category) {
  const cfg = EFFICIENCY_CATEGORIES[category];
  const plannedByDate = {};
  if (plan) plan.sessions.forEach((s) => (plannedByDate[s.date] = s));

  const samples = Object.values(activities)
    .map((a) => {
      const type = ((a.activityType || {}).typeKey || "").toLowerCase();
      if (!type.includes("running")) return null;
      const date = (a.startTimeLocal || "").split(" ")[0];
      const planned = plannedByDate[date];
      if (!planned || !cfg.types.includes(planned.type)) return null;
      const s = extractEfficiencySample(a, category);
      if (!s) return null;
      return { date, hr: s.hr, speedKmh: s.speedKmh, efficiency: s.hr / s.speedKmh };
    })
    .filter(Boolean);

  const recentCutoff = addDays(todayStr, -cfg.windowDays);
  const priorCutoff = addDays(todayStr, -cfg.windowDays * 2);
  const recent = samples.filter((r) => r.date > recentCutoff && r.date <= todayStr);
  const prior = samples.filter((r) => r.date > priorCutoff && r.date <= recentCutoff);

  if (recent.length < cfg.minSamples || prior.length < cfg.minSamples) {
    return { insufficientData: true, recentCount: recent.length, priorCount: prior.length };
  }

  const avg = (arr, key) => arr.reduce((s, r) => s + r[key], 0) / arr.length;
  const recentEff = avg(recent, "efficiency");
  const priorEff = avg(prior, "efficiency");
  const pctChange = ((recentEff - priorEff) / priorEff) * 100;

  return {
    insufficientData: false,
    pctChange,
    recentAvgHR: avg(recent, "hr"),
    priorAvgHR: avg(prior, "hr"),
    recentAvgPace: 3600 / avg(recent, "speedKmh"),
    priorAvgPace: 3600 / avg(prior, "speedKmh"),
    recentCount: recent.length,
    priorCount: prior.length,
  };
}

/* ---------- insights (rule-based, computed from your actual numbers) ---------- */

function computeInsights(wellness, dates, activities, plan, todayStr) {
  const insights = [];
  // Only the last 7 days are relevant for "what's happening right now" —
  // older history shouldn't surface as a current insight.
  const recentCutoff = addDays(todayStr, -7);
  const recentDates = dates.filter((d) => d >= recentCutoff && d <= todayStr);

  // 1) Training Readiness Trend
  const readinessSeries = dates
    .map((d) => {
      const r = wellness[d].training_readiness;
      const v = Array.isArray(r) && r[0] ? r[0].score : null;
      return { date: d, value: v };
    })
    .filter((p) => p.value != null);

  let poorStreak = 0;
  for (let i = readinessSeries.length - 1; i >= 0; i--) {
    if (readinessSeries[i].value <= 25) poorStreak++;
    else break;
  }
  if (poorStreak >= 2) {
    insights.push({
      tone: "warn",
      title: `Training Readiness seit ${poorStreak} Tagen im schwachen Bereich`,
      body: `Dein Readiness-Score war die letzten ${poorStreak} Tage durchgehend niedrig (≤25) — kumulative Ermüdung baut sich schneller auf als sie abgebaut wird. → Empfehlung: die nächste intensive Einheit gegen einen lockeren Lauf oder Ruhetag tauschen.`,
    });
  } else if (readinessSeries.length && readinessSeries[readinessSeries.length - 1].value >= 75) {
    insights.push({
      tone: "good",
      title: "Training Readiness ist gut",
      body: `Aktueller Score: ${readinessSeries[readinessSeries.length - 1].value}. Grünes Licht für die geplante Einheit.`,
    });
  }

  // 2) Effort drift: Easy/Long/Recovery sessions run notably faster than prescribed pace
  // (only the last 7 days matter here — an old drift from weeks ago isn't actionable today)
  const plannedByDate = {};
  if (plan) plan.sessions.forEach((s) => (plannedByDate[s.date] = s));

  const driftHits = [];
  Object.values(activities).forEach((a) => {
    const date = (a.startTimeLocal || "").split(" ")[0];
    if (date < recentCutoff || date > todayStr) return;
    const planned = plannedByDate[date];
    if (!planned || !["EASY", "LONG", "RECOVERY"].includes(planned.type)) return;
    const actType = ((a.activityType || {}).typeKey || "").toLowerCase();
    if (!actType.includes("running")) return; // don't compare bike/other activities to a running pace target
    if (!a.distance || !a.duration) return;
    const range = parsePaceRangeSecPerKm(planned.title_and_target) || parsePaceRangeSecPerKm(planned.detail);
    if (!range) return;
    const actualPace = a.duration / (a.distance / 1000);
    if (actualPace < range.fast - 8) {
      driftHits.push({ date, planned, actualPace, range, hr: a.averageHR });
    }
  });
  if (driftHits.length > 0) {
    driftHits.sort((a, b) => a.date.localeCompare(b.date));
    const h = driftHits[driftHits.length - 1];
    insights.push({
      tone: "warn",
      title: `"${h.planned.type_label}" am ${h.date} lief schneller als vorgesehen`,
      body: `Vorgesehen war ${fmtPace(h.range.fast)}–${fmtPace(h.range.slow)}, gelaufen wurde im Schnitt ${fmtPace(h.actualPace)}${h.hr ? ` bei Ø ${Math.round(h.hr)} bpm` : ""}. → Empfehlung: bei der nächsten Easy-Einheit bewusst bremsen, auch wenn es sich langsam anfühlt — das ist der Punkt dieser Läufe.`,
    });
  }

  // 3) Weekly volume vs plan (current week)
  const weeklyStats = computeWeeklyStats(plan, activities);
  const currentWeekLabel = plan
    ? plan.sessions.find((s) => s.date === todayStr)?.week
    : null;
  const currentWeek = weeklyStats.find((w) => w.label === currentWeekLabel);
  if (currentWeek && currentWeek.planned) {
    const pct = Math.round((currentWeek.actual / currentWeek.planned) * 100);
    if (pct < 60 && daysUntil(todayStr, todayStr) === 0) {
      insights.push({
        tone: "info",
        title: `Wochenvolumen ${currentWeekLabel}: ${currentWeek.actual.toFixed(1)} von ~${currentWeek.planned} km`,
        body: `Das ist normal, wenn die Woche noch läuft — nur zur Einordnung, wo du gerade stehst (${pct}% des geplanten Volumens bisher).`,
      });
    }
  }

  // 4) Missing sleep/HRV data (last 7 days)
  const missingSleep = recentDates.filter((d) => !wellness[d].sleep || !wellness[d].sleep.dailySleepDTO || wellness[d].sleep.dailySleepDTO.sleepTimeSeconds == null);
  if (missingSleep.length === recentDates.length && recentDates.length >= 2) {
    insights.push({
      tone: "info",
      title: "Keine Schlafdaten diese Woche",
      body: `Für die letzten ${recentDates.length} Tage liegen keine Schlafwerte vor. Falls du die Uhr nachts normalerweise trägst, lohnt sich ein Blick in die Garmin Connect App, ob die Nächte dort erfasst wurden — sonst fehlt ein wichtiger Recovery-Baustein.`,
    });
  }

  // 5) Stress trend (last 7 days)
  const stressSeries = recentDates.map((d) => wellness[d].stress?.avgStressLevel).filter((v) => v != null);
  if (stressSeries.length >= 2 && stressSeries[stressSeries.length - 1] > 40 && stressSeries[stressSeries.length - 1] > stressSeries[0]) {
    insights.push({
      tone: "warn",
      title: "Stresslevel steigt an",
      body: `Durchschnittlicher Stresswert zuletzt bei ${stressSeries[stressSeries.length - 1]} (Anstieg gegenüber ${stressSeries[0]} vor ein paar Tagen). Kombiniert mit den Trainingswerten oben lohnt es sich, auf ausreichend Schlaf und Erholungstage zu achten.`,
    });
  }

  // 6) Aerobic efficiency trend per session category (HR per speed, recent vs. prior window)
  const EFFICIENCY_SUGGESTIONS = {
    easy: "Die FatMax/Easy-Pace-Range könnte bald etwas schneller werden",
    steady: "Die Steady-Pace-Range könnte bald etwas schneller werden",
    long: "Long Runs könnten etwas mehr Tempo oder mehr marathonspezifische Kilometer vertragen",
    workout: "Die Schwelle-Zielpaces könnten enger Richtung VT2 gezogen werden (immer noch nicht schneller als VT2)",
  };
  const EFFICIENCY_CAUTIONS = {
    easy: "ein Signal, Easy-Tage wirklich easy zu halten",
    steady: "ein Signal, die Steady-Läufe nicht zu forcieren",
    long: "ein Signal, die Long-Run-Pace nicht zu forcieren und auf Fueling/Schlaf zu achten",
    workout: "ein Signal, die Schwelle-Sessions eher konservativer anzugehen, nicht enger an VT2",
  };
  for (const category of Object.keys(EFFICIENCY_CATEGORIES)) {
    const eff = computeEfficiencyTrend(activities, plan, todayStr, category);
    if (!eff || eff.insufficientData) continue;
    const label = EFFICIENCY_CATEGORIES[category].label;
    if (eff.pctChange <= -4) {
      insights.push({
        tone: "good",
        title: `Aerobe Effizienz verbessert sich (${label})`,
        body: `Ø-HF jetzt bei ${Math.round(eff.recentAvgHR)} bpm (Ø ${fmtPace(Math.round(eff.recentAvgPace))}), vorher ${Math.round(eff.priorAvgHR)} bpm (Ø ${fmtPace(Math.round(eff.priorAvgPace))}) — ${Math.abs(eff.pctChange).toFixed(1)}% weniger HF-Kosten pro Tempo (${eff.recentCount} vs. ${eff.priorCount} Einheiten verglichen). → ${EFFICIENCY_SUGGESTIONS[category]}, wenn sich das bestätigt. Sag Bescheid, wenn ich das im Plan anpassen soll.`,
      });
    } else if (eff.pctChange >= 5) {
      insights.push({
        tone: "warn",
        title: `Aerobe Effizienz lässt gerade nach (${label})`,
        body: `Dieselbe Pace kostet zuletzt mehr Herzfrequenz als vorher (Ø ${Math.round(eff.recentAvgHR)} vs. ${Math.round(eff.priorAvgHR)} bpm, +${eff.pctChange.toFixed(1)}%, ${eff.recentCount} vs. ${eff.priorCount} Einheiten verglichen). Kann Ermüdung, Hitze oder unvollständige Erholung sein — kein Grund zur Panik, aber ${EFFICIENCY_CAUTIONS[category]}.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      tone: "info",
      title: "Alles im grünen Bereich",
      body: "Keine auffälligen Muster in den aktuellen Daten. Weiter so.",
    });
  }

  return insights;
}

function addDays(dateStr, n) {
  // UTC-based calendar math — avoids toISOString() rolling the date back
  // a day for timezones ahead of UTC (e.g. Europe).
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeCoachTip(wellness, dates, activities, plan, todayStr, activityDates) {
  // Once today's session is logged (e.g. after the 08:30 sync catches your
  // run), the tip has nothing left to say about today — shift the focus to
  // tomorrow's session instead. This is behavior-triggered, not time-based,
  // so it still works if you run earlier/later than usual.
  const todayHasActivity = activityDates && activityDates.has(todayStr);
  const targetDate = todayHasActivity ? addDays(todayStr, 1) : todayStr;
  const dayWord = targetDate === todayStr ? "heute" : "morgen";
  const dayWordCap = targetDate === todayStr ? "Heute" : "Morgen";

  const readinessSeries = dates
    .map((d) => {
      const r = wellness[d].training_readiness;
      return { date: d, value: Array.isArray(r) && r[0] ? r[0].score : null };
    })
    .filter((p) => p.value != null);
  const latestReadiness = readinessSeries.length ? readinessSeries[readinessSeries.length - 1].value : null;
  let poorStreak = 0;
  for (let i = readinessSeries.length - 1; i >= 0; i--) {
    if (readinessSeries[i].value <= 25) poorStreak++;
    else break;
  }

  const targetSession = plan ? plan.sessions.find((s) => s.date === targetDate) : null;
  const hardTypes = ["TRACK", "SCHWELLE", "HMPACE", "FARTLEK", "MPACE"];
  const isHardDay = targetSession && hardTypes.includes(targetSession.type);
  const isEasyDay = targetSession && ["EASY", "LONG", "RECOVERY", "STEADY", "RAD", "RAD+EASY"].includes(targetSession.type);
  const isRestDay = targetSession && targetSession.type === "REST";

  const sessionName = targetSession ? `"${targetSession.title_and_target}"` : `deine ${dayWord === "heute" ? "heutige" : "morgige"} Einheit`;
  const readinessNote = todayHasActivity
    ? ` (Readiness-Stand von heute Morgen — kann sich bis morgen früh noch ändern)`
    : "";

  if (isRestDay) {
    return {
      forTomorrow: todayHasActivity,
      headline: `${dayWordCap} ist Ruhetag laut Plan — auch nutzen.`,
      body: `Kein Training ${dayWord} vorgesehen. Genau das ist der Moment, in dem sich die Anpassung an das bisherige Training festigt — nicht schummeln, auch wenn du dich fit fühlst.`,
    };
  }

  if (poorStreak >= 2 && isHardDay) {
    return {
      forTomorrow: todayHasActivity,
      headline: `Readiness seit ${poorStreak} Tagen schwach → ${dayWord} runterschrauben`,
      body: `Geplant wäre ${sessionName}${readinessNote}, aber dein Körper zeigt seit ${poorStreak} Tagen Anzeichen unvollständiger Erholung. Empfehlung: ${dayWord} stattdessen easy laufen oder Umfang/Tempo der Einheit deutlich reduzieren. Der Plan selbst sagt an mehreren Stellen "Gefühl > Uhr" — das ist so ein Tag.`,
    };
  }

  if (poorStreak >= 2 && isEasyDay) {
    return {
      forTomorrow: todayHasActivity,
      headline: `Readiness niedrig, aber der Plan passt bereits`,
      body: `${sessionName} ist ${dayWord} ohnehin locker angesetzt${readinessNote} — genau richtig bei ${poorStreak} Tagen schwacher Readiness. Bewusst langsam laufen, nicht ins Tempo verfallen.`,
    };
  }

  if (latestReadiness != null && latestReadiness >= 75 && isHardDay) {
    return {
      forTomorrow: todayHasActivity,
      headline: `Grünes Licht — ${dayWord} wie geplant`,
      body: `Readiness bei ${latestReadiness}${readinessNote}, Erholung sieht gut aus. ${sessionName} kann wie im Plan angegangen werden.`,
    };
  }

  if (targetSession) {
    const detailPart = targetSession.detail ? ` — ${targetSession.detail}` : "";
    return {
      forTomorrow: todayHasActivity,
      headline: `${dayWordCap}: ${targetSession.type_label}`,
      body: `${sessionName}${detailPart}. Keine besonderen Auffälligkeiten in den Recovery-Werten, dem Plan folgen.`,
    };
  }

  return {
    forTomorrow: todayHasActivity,
    headline: `Kein Trainingsplan für ${dayWord} gefunden`,
    body: "Prüfe, ob das richtige Plan-PDF eingelesen wurde.",
  };
}

function renderCoachTip(tip) {
  return `<section class="panel" style="border-left:3px solid var(--threshold)">
    <div class="panel-head"><div class="panel-title">Coach-Tipp für ${tip.forTomorrow ? "morgen" : "heute"}</div></div>
    <div style="font-family:var(--font-head);font-size:1.15rem;font-weight:600;margin-bottom:8px">${tip.headline}</div>
    <p style="color:var(--text-dim);font-size:0.9rem;margin:0">${tip.body}</p>
  </section>`;
}

function renderInsights(insights) {
  const cards = insights
    .map(
      (i) => `<div class="insight tone-${i.tone}">
      <p class="insight-title">${i.title}</p>
      <p class="insight-body">${i.body}</p>
    </div>`
    )
    .join("");
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Was deine Daten zeigen</div><div class="panel-note">automatisch berechnet, keine Ferndiagnose</div></div>
    ${cards}
  </section>`;
}

/* ---------- render sections ---------- */

function raceLabel(session) {
  if (/valencia/i.test(session.title_and_target)) return "Valencia Marathon";
  if (/kopenhagen|copenhagen/i.test(session.title_and_target)) return "Kopenhagen Halbmarathon";
  return session.title_and_target;
}

function renderPageHeader(plan, dates, activityCount) {
  const races = plan ? plan.sessions.filter((s) => s.type === "RACE").sort((a, b) => a.date.localeCompare(b.date)) : [];
  const valencia = races.find((r) => /valencia/i.test(r.title_and_target));
  const kopenhagen = races.find((r) => /kopenhagen|copenhagen/i.test(r.title_and_target));
  const start = plan && plan.sessions.length ? plan.sessions[0].date : "";

  const metaItems = [];
  if (start) metaItems.push(`Start <strong>${start}</strong>`);
  if (kopenhagen) metaItems.push(`Tune-up <strong>Kopenhagen HM · ${kopenhagen.date}</strong>`);
  if (valencia) metaItems.push(`Renntag <strong>${valencia.date}</strong>`);
  metaItems.push(`A-Ziel <strong>2:32–2:34</strong>`);
  metaItems.push(`B-Ziel <strong>2:38–2:41</strong>`);

  const rangeLabel = dates.length ? `${dates[0]} bis ${dates[dates.length - 1]} · ${activityCount} Workout(s) synced` : "Noch keine Daten";

  return `<header class="page-header">
    <div class="eyebrow">Trainingsblock · 22 Wochen · ${rangeLabel}</div>
    <h1>Valencia Marathon</h1>
    <div class="hero-meta">${metaItems.map((m) => `<div>${m}</div>`).join("")}</div>
  </header>`;
}

// VT2 isn't frozen at the 10.08. CPET number for the whole block — months of
// threshold training should shift it faster, same as FatMax/Steady already
// do. Deriving it from the prescribed Threshold rep paces doesn't work: reps
// are deliberately run with reserve (control > pace), so they'd always look
// slower than true VT2 early on. Instead, use the SAME real efficiency-trend
// data (HR-per-speed, recent vs. prior window) already surfacing as insights
// — a genuine measured signal, dampened 50% since HR-efficiency on easy/long
// runs doesn't map 1:1 onto a lactate-threshold shift.
function estimateCurrentVT2Kmh(activities, plan, todayStr) {
  const baselineKmh = 3600 / (3 * 60 + 45);
  const changes = [];
  const labels = [];
  for (const category of Object.keys(EFFICIENCY_CATEGORIES)) {
    const trend = computeEfficiencyTrend(activities, plan, todayStr, category);
    if (trend && !trend.insufficientData) {
      changes.push(trend.pctChange);
      labels.push(EFFICIENCY_CATEGORIES[category].label);
    }
  }
  if (!changes.length) {
    return { vt2Kmh: baselineKmh, source: "CPET 10.08.2026 (noch keine bestätigte Effizienzänderung gemessen)" };
  }
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length; // negative = improving
  const dampenedPct = (-avgChange * 0.5).toFixed(1);
  const vt2Kmh = baselineKmh * (1 + parseFloat(dampenedPct) / 100);
  return { vt2Kmh, source: `Schätzung aus gemessener Effizienz (${labels.join(", ")}): ${dampenedPct >= 0 ? "+" : ""}${dampenedPct}% ggü. CPET-Baseline, gedämpft übertragen` };
}

// FatMax should shift right too ("shift FatMax/LTP1 toward faster speeds" is
// an explicit block goal) — derive it from the Easy-run efficiency trend
// specifically, since FatMax IS the easy/fat-oxidation zone, rather than the
// blended cross-category signal used for VT2.
function estimateCurrentFatMaxKmh(activities, plan, todayStr) {
  const baselineKmh = 12.0;
  const trend = computeEfficiencyTrend(activities, plan, todayStr, "easy");
  if (!trend || trend.insufficientData) {
    return { fatMaxKmh: baselineKmh, source: "CPET 10.08.2026 (noch keine bestätigte Effizienzänderung gemessen)" };
  }
  const dampenedPct = (-trend.pctChange * 0.5).toFixed(1);
  return {
    fatMaxKmh: baselineKmh * (1 + parseFloat(dampenedPct) / 100),
    source: `Schätzung aus gemessener Easy-Lauf-Effizienz: ${dampenedPct >= 0 ? "+" : ""}${dampenedPct}% ggü. CPET-Baseline`,
  };
}

function renderPaceGapGauge(activities, plan, todayStr) {
  // From CPET (Longevity Center Nürnberg, 10.08.2026): FatMax started at 12.0
  // km/h, VT1 at 13.0 km/h (VT1 stays fixed for now). FatMax and VT2 are live
  // estimates that shift right as real efficiency data comes in.
  const vt2Estimate = estimateCurrentVT2Kmh(activities, plan, todayStr);
  const fatMaxEstimate = estimateCurrentFatMaxKmh(activities, plan, todayStr);
  const fatmax = fatMaxEstimate.fatMaxKmh,
    vt1 = 13.0,
    vt2 = vt2Estimate.vt2Kmh,
    target = 16.67;
  const minKmh = 10,
    maxKmh = 18;
  const x = (kmh) => 40 + ((kmh - minKmh) / (maxKmh - minKmh)) * 920;
  const gapSec = Math.round(3600 / vt2 - 3600 / target); // seconds/km target is faster than VT2
  const gapLabel = gapSec > 0 ? `+0:${String(gapSec).padStart(2, "0")}/km` : `${gapSec}s/km`;

  // As VT2 climbs (real progress!), it can end up right next to Target on
  // the axis — center-anchored labels would then overlap. Split them apart
  // horizontally whenever they'd be closer than ~2 label-widths.
  const labelGapPx = x(target) - x(vt2);
  const labelsCollide = labelGapPx < 80;
  const labelMid = (x(vt2) + x(target)) / 2;
  const vt2LabelX = labelsCollide ? labelMid - 4 : x(vt2);
  const vt2Anchor = labelsCollide ? "end" : "middle";
  const targetLabelX = labelsCollide ? labelMid + 4 : x(target);
  const targetAnchor = labelsCollide ? "start" : "middle";

  return `<section class="panel gauge-panel">
    <div class="hero-top">
      <div>
        <div class="hero-title">Target Marathon Pace vs. aktuell geschätztes VT2</div>
        <div class="hero-sub">VT2 startete bei 3:45/km (Spiroergometrie 10.08.2026), ist aber <strong>kein fixer Deckel für den ganzen Block</strong> — die Schätzung hier bewegt sich automatisch mit den gemessenen Effizienz-Trends aus deinen echten Läufen (${vt2Estimate.source}). Kopenhagen (20.09.) liefert zusätzlich einen echten Renn-Datenpunkt zur Rekalibrierung. 3:36/km bleibt das <strong>aspirative A-Ziel-Tempo</strong> (2:32–2:34).</div>
      </div>
      <div class="gap-readout">
        <div class="num">${gapLabel}</div>
        <div class="lbl">Target-Pace schneller als aktuelles VT2</div>
      </div>
    </div>
    <svg class="gauge-svg" viewBox="0 0 1000 170" xmlns="http://www.w3.org/2000/svg">
      <line x1="40" y1="90" x2="960" y2="90" stroke="#2B323D" stroke-width="2"/>
      <g font-family="monospace" font-size="11" fill="#5C6673">
        <text x="40" y="120">10</text>
        <text x="${x(12)}" y="120">12</text>
        <text x="${x(14)}" y="120">14</text>
        <text x="${x(16)}" y="120">16</text>
        <text x="895" y="120">18 km/h</text>
      </g>
      <rect x="40" y="78" width="${x(fatmax) - 40}" height="24" fill="#2FBFA6" opacity="0.18"/>
      <rect x="${x(fatmax)}" y="78" width="${x(vt1) - x(fatmax)}" height="24" fill="#2FBFA6" opacity="0.32"/>
      <rect x="${x(vt1)}" y="78" width="${x(vt2) - x(vt1)}" height="24" fill="#F2B134" opacity="0.20"/>
      <rect x="${x(vt2)}" y="78" width="${x(target) - x(vt2)}" height="24" fill="#FF5A45" opacity="0.22"/>
      <rect x="${x(target)}" y="78" width="${960 - x(target)}" height="24" fill="#FF5A45" opacity="0.40"/>

      <line x1="${x(fatmax)}" y1="68" x2="${x(fatmax)}" y2="112" stroke="#2FBFA6" stroke-width="2"/>
      <circle cx="${x(fatmax)}" cy="90" r="4" fill="#2FBFA6"/>
      <text x="${x(fatmax)}" y="55" text-anchor="middle" font-family="monospace" font-size="11.5" fill="#2FBFA6" font-weight="600">FatMax ${fatmax.toFixed(1).replace(".", ",")}</text>

      <line x1="${x(vt1)}" y1="68" x2="${x(vt1)}" y2="112" stroke="#8C96A3" stroke-width="2"/>
      <circle cx="${x(vt1)}" cy="90" r="4" fill="#8C96A3"/>
      <text x="${x(vt1)}" y="150" text-anchor="middle" font-family="monospace" font-size="11.5" fill="#8C96A3" font-weight="600">VT1 13,0</text>

      <line x1="${x(vt2)}" y1="60" x2="${x(vt2)}" y2="112" stroke="#FF5A45" stroke-width="2.5"/>
      <circle cx="${x(vt2)}" cy="90" r="5" fill="#FF5A45"/>
      <text x="${vt2LabelX}" y="48" text-anchor="${vt2Anchor}" font-family="monospace" font-size="12.5" fill="#FF5A45" font-weight="700">VT2 ${vt2.toFixed(1).replace(".", ",")}</text>
      <text x="${x(vt2)}" y="165" text-anchor="middle" font-family="monospace" font-size="9.5" fill="#FF5A45">aktuelle Schätzung</text>

      <line x1="${x(target)}" y1="60" x2="${x(target)}" y2="112" stroke="#F2B134" stroke-width="2.5" stroke-dasharray="3,3"/>
      <circle cx="${x(target)}" cy="90" r="5" fill="#F2B134"/>
      <text x="${targetLabelX}" y="48" text-anchor="${targetAnchor}" font-family="monospace" font-size="12.5" fill="#F2B134" font-weight="700">Target 16,7</text>

      <path d="M ${x(vt2)} 30 L ${x(vt2)} 22 L ${x(target)} 22 L ${x(target)} 30" fill="none" stroke="#F2B134" stroke-width="1.5"/>
      <text x="${(x(vt2) + x(target)) / 2}" y="16" text-anchor="middle" font-family="monospace" font-size="11" fill="#F2B134">aspirativ, nicht Trainingsziel</text>
    </svg>
    <div class="gauge-legend">
      <div class="leg-item"><span class="leg-dot" style="background:#2FBFA6"></span>FatMax — Fettstoffwechsel-Obergrenze</div>
      <div class="leg-item"><span class="leg-dot" style="background:#8C96A3"></span>VT1 — aerobe Schwelle</div>
      <div class="leg-item"><span class="leg-dot" style="background:#FF5A45"></span>VT2 — laufende Schätzung, verschiebt sich mit jeder Schwelle-Einheit; Threshold-Sessions bleiben knapp darunter, Marathon-Effort darf ab W16 evidenzbasiert darüber hinaus</div>
      <div class="leg-item"><span class="leg-dot" style="border:1.5px dashed #F2B134;background:transparent"></span>Target Marathon Pace (3:36/km) — A-Ziel, wird nicht routinemäßig trainiert</div>
    </div>
  </section>`;
}

function renderWeekStats(weeklyStats, currentWeekLabel) {
  const cur = weeklyStats.find((w) => w.label === currentWeekLabel) || { actual: 0, hours: 0, bikeHours: 0, count: 0, bikeCount: 0, planned: null };
  const pct = cur.planned ? Math.round((cur.actual / cur.planned) * 100) : null;
  const bikeHoursNote = cur.bikeHours > 0 ? `<div style="font-size:0.78rem;color:var(--muted);margin-top:2px">+ ${fmtHM(cur.bikeHours)} Rad (separat)</div>` : "";
  const bikeCountNote = cur.bikeCount > 0 ? `<div style="font-size:0.78rem;color:var(--muted);margin-top:2px">+ ${cur.bikeCount} Rad-Einheit${cur.bikeCount === 1 ? "" : "en"} (separat)</div>` : "";
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Diese Woche (${currentWeekLabel || "—"})</div></div>
    <div class="grid">
      ${statCard("Volumen (Lauf)", `${cur.actual.toFixed(1)}<span class="unit inline"> / ${cur.planned ? "~" + cur.planned : "?"} km</span>`)}
      ${statCard("Laufstunden", fmtHM(cur.hours), bikeHoursNote)}
      ${statCard("Lauf-Einheiten", `${cur.count}`, bikeCountNote)}
      ${statCard("Wochen-Fortschritt", pct != null ? `${pct}%` : "n/a")}
    </div>
  </section>`;
}

function renderWeeklyVolumeChart(weeklyStats) {
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Wochenumfang · 22 Wochen</div><div class="panel-note">Ist vs. Plan</div></div>
    ${weeklyVolumeChartSVG(weeklyStats)}
    <div class="vol-phase-legend">
      <div class="leg-item"><span class="leg-dot" style="background:#6B7A94"></span>Vorbereitung — Berlin 10K</div>
      <div class="leg-item"><span class="leg-dot" style="background:#2FBFA6"></span>Phase 1 · Schwellenaufbau</div>
      <div class="leg-item"><span class="leg-dot" style="background:#F2B134"></span>Kopenhagen & Reload</div>
      <div class="leg-item"><span class="leg-dot" style="background:#FF5A45"></span>Phase 2 · Marathonspezifisch</div>
      <div class="leg-item"><span class="leg-dot" style="background:#6B7A94"></span>Phase 3 · Taper & Rennen</div>
    </div>
  </section>`;
}

function renderRecoveryCharts(rhrPoints, readinessPoints, stressPoints, batteryPoints, stepsPoints) {
  const latest = (pts) => pts[pts.length - 1]?.value;
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Recovery & Belastung</div></div>
    <div class="grid charts">
      ${statCard("Ruhepuls", latest(rhrPoints) != null ? `${latest(rhrPoints)}<span class="unit inline"> bpm</span>` : '<span class="empty">n/a</span>', lineChartSVG(rhrPoints, COLORS.rhr))}
      ${statCard("Training Readiness", readinessBadge(latest(readinessPoints)), lineChartSVG(readinessPoints, COLORS.readiness, { minZero: true }))}
      ${statCard("Ø Stress", latest(stressPoints) != null ? `${latest(stressPoints)}<span class="unit inline"> / 100</span>` : '<span class="empty">n/a</span>', lineChartSVG(stressPoints, COLORS.stress, { minZero: true }))}
      ${statCard("Body Battery (Aufladung)", "", lineChartSVG(batteryPoints, COLORS.battery, { minZero: true }))}
      ${statCard("Schritte (letzter Tag)", latest(stepsPoints) != null ? latest(stepsPoints).toLocaleString("de-DE") : '<span class="empty">n/a</span>', lineChartSVG(stepsPoints, COLORS.steps, { minZero: true }))}
    </div>
  </section>`;
}

function fmtSecToMin(sec) {
  return sec != null ? `${Math.round(sec / 60)} min` : "n/a";
}

function detailStat(label, value) {
  if (value == null || value === "") return "";
  return `<div><div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.03em">${label}</div><div style="font-size:0.92rem;margin-top:2px">${value}</div></div>`;
}

function workoutDetailGrid(a) {
  const pauseInActivity = a.elapsedDuration != null && a.duration != null ? Math.round(a.elapsedDuration - a.duration) : null;
  const items = [
    detailStat("Kalorien", a.calories ? `${Math.round(a.calories)} kcal` : null),
    detailStat("Pause (Stopps während des Laufs)", pauseInActivity && pauseInActivity >= 15 ? fmtSecToMin(pauseInActivity) : null),
    detailStat("Höhenmeter", a.elevationGain != null ? `+${Math.round(a.elevationGain)}m / -${Math.round(a.elevationLoss || 0)}m` : null),
    detailStat("Max HF", a.maxHR ? `${Math.round(a.maxHR)} bpm` : null),
    detailStat("Ø Kadenz", a.averageRunningCadenceInStepsPerMinute ? `${Math.round(a.averageRunningCadenceInStepsPerMinute)} spm` : null),
    detailStat("Aerober Trainingseffekt", a.aerobicTrainingEffect != null ? `${a.aerobicTrainingEffect.toFixed(1)} / 5.0` : null),
    detailStat("Anaerober Trainingseffekt", a.anaerobicTrainingEffect != null ? `${a.anaerobicTrainingEffect.toFixed(1)} / 5.0` : null),
    detailStat("Trainingsbelastung", a.activityTrainingLoad ? Math.round(a.activityTrainingLoad) : null),
    detailStat("VO2max (geschätzt)", a.vO2MaxValue || null),
    detailStat("Ø Leistung", a.avgPower ? `${Math.round(a.avgPower)} W` : null),
    detailStat("Schrittlänge", a.avgStrideLength ? `${Math.round(a.avgStrideLength)} cm` : null),
    detailStat("Bodenkontaktzeit", a.avgGroundContactTime ? `${Math.round(a.avgGroundContactTime)} ms` : null),
    detailStat("Vert. Oszillation", a.avgVerticalOscillation ? `${a.avgVerticalOscillation.toFixed(1)} cm` : null),
    detailStat("Ort", a.locationName || null),
    detailStat("Schritte", a.steps ? a.steps.toLocaleString("de-DE") : null),
  ].filter(Boolean);

  const hrZones = [1, 2, 3, 4, 5]
    .map((z) => ({ z, sec: a[`hrTimeInZone_${z}`] }))
    .filter((x) => x.sec);
  const hrZoneHtml = hrZones.length
    ? `<div style="margin-top:14px">
        <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.03em;margin-bottom:6px">Zeit in HF-Zonen</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap">
          ${hrZones.map((x) => `<span style="font-size:0.85rem"><strong>Z${x.z}</strong> ${fmtSecToMin(x.sec)}</span>`).join("")}
        </div>
      </div>`
    : "";

  const lapHtml = renderLapStructure(a.lap_structure);

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px 18px;padding:14px 4px">${items.join("")}</div>${hrZoneHtml}${lapHtml}`;
}

const LAP_KIND_LABEL = { warmup: "Aufwärmen", cooldown: "Cooldown" };

function renderLapStructure(laps) {
  if (!laps || !laps.length) return "";
  const rows = laps
    .map((lap) => {
      const mins = Math.floor(lap.duration_s / 60);
      const secs = lap.duration_s % 60;
      const durStr = `${mins}:${String(secs).padStart(2, "0")}`;
      const paceStr = lap.pace_sec_per_km ? ` @ ${fmtPace(lap.pace_sec_per_km)}` : "";
      const hrStr = lap.avg_hr ? ` · Ø${Math.round(lap.avg_hr)} bpm` : "";
      const isRest = lap.kind === "rest";
      const label = LAP_KIND_LABEL[lap.kind] || (isRest ? `Pause ${lap.rest_index}` : `Arbeit ${lap.work_index}`);
      const color = isRest ? "var(--target)" : lap.kind === "work" ? "var(--aerobic)" : "var(--muted)";
      return `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem">
        <span style="color:${color};font-weight:${isRest || lap.kind === "work" ? 600 : 400}">${label}</span>
        <span style="color:var(--text-dim)">${durStr} min${paceStr}${hrStr}</span>
      </div>`;
    })
    .join("");
  return `<div style="margin-top:14px">
    <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.03em;margin-bottom:6px">Intervall-Struktur (tatsächlich gelaufen)</div>
    ${rows}
  </div>`;
}

function toggleWorkout(el) {
  const detailRow = el.nextElementSibling;
  const isOpen = detailRow.style.display === "table-row";
  detailRow.style.display = isOpen ? "none" : "table-row";
  const chevron = el.querySelector(".chevron");
  if (chevron) chevron.textContent = isOpen ? "▸" : "▾";
}
window.toggleWorkout = toggleWorkout;

function renderWorkouts(activities) {
  const list = Object.values(activities).sort((a, b) => (b.startTimeLocal || "").localeCompare(a.startTimeLocal || ""));
  if (list.length === 0) {
    return `<section class="panel"><div class="panel-head"><div class="panel-title">Workouts</div></div><p class="empty">Noch keine Workouts synced</p></section>`;
  }
  const rows = list
    .map((a) => {
      const date = (a.startTimeLocal || "").split(" ")[0] || "n/a";
      const name = a.activityName || "Aktivität";
      const type = (a.activityType || {}).typeKey || "n/a";
      const dist = a.distance ? (a.distance / 1000).toFixed(2) + " km" : "n/a";
      const dur = a.duration ? Math.round(a.duration / 60) + " min" : "n/a";
      const hr = a.averageHR ? Math.round(a.averageHR) + " bpm" : "n/a";
      return `<tr style="cursor:pointer" onclick="toggleWorkout(this)">
          <td><span class="chevron" style="display:inline-block;width:14px;color:var(--muted)">▸</span>${date}</td>
          <td>${name}</td><td>${type}</td><td>${dist}</td><td>${dur}</td><td>${hr}</td>
        </tr>
        <tr style="display:none"><td colspan="6" style="padding:0;background:var(--bg-soft)">${workoutDetailGrid(a)}</td></tr>`;
    })
    .join("");
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Letzte Workouts</div><div class="panel-note">Zeile klicken für Details</div></div>
    <div class="table-card">
      <table>
        <thead><tr><th>Datum</th><th>Name</th><th>Typ</th><th>Distanz</th><th>Dauer</th><th>Ø HF</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderDisclaimer() {
  return `<p class="disclaimer">Coach-Tipp und Hinweise werden automatisch aus deinen Garmin-Zahlen und deinem Trainingsplan berechnet (einfache Regeln, keine KI-Ferndiagnose). Bei anhaltenden Beschwerden oder Unsicherheit zur Trainingssteuerung sprich mit deinem Trainer oder Arzt.</p>`;
}

/* ---------- Calibration Checkpoints ---------- */

function renderCalibrationCheckpoints(plan, todayStr) {
  const checkpoints = [
    { date: "2026-09-20", label: "Kopenhagen Halbmarathon", desc: "Wichtigster Reality-Check vor Valencia. Faustregel: Current Marathon Effort ≈ Kopenhagen-HM-Pace + 25–35 s/km. Die Effort-Paces ab W13 sind vorläufige Schätzungen — nach dem Rennen mit echtem Ergebnis, Perceived Effort und Long-Run-Durability abgleichen, nicht blind der Vorgabe folgen." },
    { date: "2026-09-13", label: "Erste marathonspezifische Einheit", desc: "Long Run mit ersten 8 km @Current Marathon Effort — erste Standortbestimmung vor Kopenhagen." },
    { date: "2026-11-01", label: "Peak-Marathon-Simulation", desc: "34 km mit 2×8km @Current Marathon Effort, Fueling-Strategie live getestet (75–90 g KH/h)." },
  ];
  const rows = checkpoints
    .map((c) => {
      const n = daysUntil(c.date, todayStr);
      const status = n > 0 ? `in ${n} Tagen` : n === 0 ? "heute" : `vor ${Math.abs(n)} Tagen`;
      const isPast = n < 0;
      return `<div class="day-row">
        <div class="dd">${c.date}<br><span style="color:${isPast ? "var(--aerobic)" : "var(--target)"}">${status}</span></div>
        <div class="ds"><strong>${c.label}</strong><div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px">${c.desc}</div></div>
      </div>`;
    })
    .join("");
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Calibration Checkpoints</div><div class="panel-note">Wo die Marathon-Pace nachjustiert wird</div></div>
    ${rows}
  </section>`;
}

/* ---------- Zone reference (from CPET, Longevity Center Nürnberg 10.08.2026) ---------- */

function renderZones() {
  const zones = [
    { name: "Recovery", pace: "&gt; 5:13/km", kmh: "&lt; 11,5 km/h", use: "sehr locker, aktive Erholung", target: false },
    { name: "FatMax / Easy", pace: "5:13–4:48/km", kmh: "11,5–12,5 km/h", use: "Grundlage, Fettstoffwechsel (LTP1)", target: false },
    { name: "Steady", pace: "4:48–4:17/km", kmh: "12,5–14,0 km/h", use: "aerob, zwischen LTP1 und Schwelle", target: false },
    { name: "Threshold (kontrolliert)", pace: "4:05–3:50/km", kmh: "~14,6–15,3 km/h", use: "Norwegian-Style, dauerhaft nie schneller als VT2", target: false },
    { name: "Current Marathon Effort", pace: "wird kalibriert, ~4:05→3:37/km", kmh: "steigend über den Block", use: "ab W16 evidenzbasiert über VT2 hinaus Richtung Zielpace", target: false },
    { name: "Target Marathon Pace", pace: "3:36/km", kmh: "16,7 km/h", use: "A-Ziel 2:32–2:34 — ab W17 echte Long-Run-Segmente, kein reines Taper-Extra", target: true },
  ];
  const cards = zones
    .map(
      (z) => `<div class="zone-card${z.target ? " target" : ""}">
        <div class="zone-name">${z.name}</div>
        <div class="zone-pace">${z.pace}</div>
        <div class="zone-kmh">${z.kmh}</div>
        <div class="zone-use">${z.use}</div>
      </div>`
    )
    .join("");
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Pace-Kategorien (aus CPET)</div><div class="panel-note">Laufband-Spiroergometrie, 10.08.2026</div></div>
    <div class="zones">${cards}</div>
    <p class="disclaimer">VO₂max 87,1 ml/kg/min (kein limitierender Faktor laut Befund) · VT1 13,0 km/h (4:37/km) · VT2/LTP2 16,0 km/h (3:45/km) · Laktatbasiert liegt LTP1 eher bei 11,5–12,5 km/h (FatMax) — Grundlagenläufe bewusst darunter halten. Der fixe 4-mmol-Punkt wird nicht als LT2 behandelt, Laktat wird individuell interpretiert.</p>
  </section>`;
}

/* ---------- Fueling ---------- */

function renderFueling() {
  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Verpflegungsstrategie</div></div>
    <div class="fuel-grid">
      <div class="fuel-block">
        <div class="fuel-stat">75–90 g/h</div>
        <div class="fuel-lbl">Kohlenhydrate im Wettkampf, z. B. 25–30 g alle 20 Minuten</div>
      </div>
      <div class="fuel-block">
        <div class="fuel-stat">590–890 g/Tag</div>
        <div class="fuel-lbl">Carb-Loading letzte 36–48h (8–12 g/kg bei ~74 kg, oberes Ende nur bei guter Verträglichkeit)</div>
      </div>
    </div>
    <div class="fuel-block">
      <table class="fuel-table">
        <thead><tr><th>Einheit</th><th>Zufuhr währenddessen</th><th>Ziel</th></tr></thead>
        <tbody>
          <tr><td>locker &lt; 75 min</td><td>meist nicht nötig</td><td>Fettstoffwechsel</td></tr>
          <tr><td>75–120 min locker</td><td>20–40 g/h</td><td>stabile Energie</td></tr>
          <tr><td>langer Lauf 2–2,5h</td><td>40–70 g/h</td><td>Ermüdung begrenzen</td></tr>
          <tr><td>langer Lauf + Tempo</td><td>60–90 g/h</td><td>Race-Fueling</td></tr>
          <tr><td>Marathon-Simulation</td><td>75–90 g/h</td><td>Wettkampfstrategie</td></tr>
        </tbody>
      </table>
    </div>
    <p class="disclaimer" style="margin-top:14px">Fueling-Strategie ab Phase 3 aktiv in den langen Läufen testen — nicht erst am Renntag. Quelle: CPET-Befund Longevity Center Nürnberg, 10.08.2026.</p>
  </section>`;
}

/* ---------- Full training plan: phase tabs + week accordion ---------- */

const PHASE_TITLES = {
  p0: "Vorbereitung — Berlin 10K",
  p1: "Phase 1 — Schwellenaufbau",
  p2: "Kopenhagen & Reload",
  p3: "Phase 2 — Marathonspezifisch",
  p4: "Phase 3 — Taper & Rennen",
};

const PHASE_INTROS = {
  p0: "Ursprünglicher Aufbau vor der Leistungsdiagnostik — Berlin City Night 10K als erster Formcheck.",
  p1: "Kontrollierte Schwellenarbeit nach Norwegian-Prinzipien, Volumen von 85 auf 107 km aufgebaut — Grundlage vor Spezifität.",
  p2: "Kopenhagen Halbmarathon als wichtigster Reality-Check vor Valencia, danach eine bewusste Reload-Woche vor dem marathonspezifischen Block.",
  p3: "Marathonspezifischer Aufbau von 85 auf 140 km Peak — Schwelle, Marathon-Effort-Blöcke und Long Runs abwechselnd dosiert, damit keine Woche drei maximale Reize stapelt.",
  p4: "Progressiver Taper: Umfang runter, Schärfe halten — bis zum Valencia Marathon am 6. Dezember.",
};

function getPhaseKey(block) {
  if (!block) return "p0";
  if (block.includes("BLOCK 1") || block.includes("WETTKAMPFWOCHE")) return "p0";
  if (block.includes("KOPENHAGEN-BLOCK") || block.startsWith("PHASE 1")) return "p1";
  if (block.includes("KOPENHAGEN HALBMARATHON") || block.includes("RELOAD NACH KOPENHAGEN")) return "p2";
  if (block.startsWith("PHASE 2")) return "p3";
  if (block.startsWith("PHASE 3") || block.includes("RENNWOCHE")) return "p4";
  return "p0";
}

function switchPhaseTab(el, phase) {
  const tabsBar = el.parentElement;
  tabsBar.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  el.classList.add("active");
  const section = tabsBar.closest("section");
  section.querySelectorAll(".phase-panel").forEach((p) => p.classList.remove("active"));
  section.querySelector(`#${phase}-panel`).classList.add("active");
}
window.switchPhaseTab = switchPhaseTab;

const WEEKDAY_NAMES = { MO: "Montag", DI: "Dienstag", MI: "Mittwoch", DO: "Donnerstag", FR: "Freitag", SA: "Samstag", SO: "Sonntag" };

// Rest-between-reps reference values from the CPET report's "Exemplarische
// Einheiten" table (Longevity Center Nürnberg, 10.08.2026) — the plan's own
// day-by-day text usually names the workout but doesn't repeat the rest
// spec, so we surface it here as a guideline.
const REST_GUIDANCE = [
  { pattern: /cruise-intervalle/i, rest: "3 min locker" },
  { pattern: /schwellenintervalle/i, rest: "2–3 min Trab" },
  { pattern: /marathonpace-block|marathonblöcke|marathonblock/i, rest: "~1 km locker" },
];

function inferRestGuidance(session) {
  const text = `${session.title_and_target || ""} ${session.detail || ""}`;
  if (/r\d+\s*(min|s|km)\b|\blocker\b.*\bCD\b|Trab\b/i.test(text)) return null; // already states its own rest
  const match = REST_GUIDANCE.find((r) => r.pattern.test(text));
  return match ? match.rest : null;
}

// Pace ranges straight from the CPET zone reference panel — sessions that
// only name a zone (e.g. "(Z1–Z2)") without a number get the pace spelled
// out too, so you don't have to cross-reference the zone table separately.
const ZONE_PACE = {
  "Z1–Z2": "5:13–4:48/km",
  "Z2": "5:13–4:48/km",
  "Z3": "4:48–4:17/km",
  "Z4": "4:17–3:45/km",
};

function withZonePace(text) {
  if (/\d:\d{2}\s*\/?\s*km/.test(text)) return text; // already has an explicit pace, don't clutter
  return text.replace(/\((Z1–Z2|Z2|Z3|Z4)\)/, (m, zone) => `(${zone} · ${ZONE_PACE[zone]})`);
}

function renderWeekAccordion(weekLabel, sessions, activities, todayStr, adjustments, isCurrent) {
  const sorted = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const dateRange = `${fmtDate(first.date)}–${fmtDate(last.date)}`;
  const hasRace = sorted.some((s) => s.type === "RACE");
  const hasDoubleThreshold = sorted.some((s) => s.double_threshold);
  const focus = (first.block || "").split("·").pop().trim();

  const rows = sorted
    .map((s) => {
      const status = sessionStatus(s, activities, todayStr);
      const mainText = withZonePace(s.title_and_target + (s.detail ? ` — ${s.detail}` : ""));
      let html;
      if (s._original) {
        const badgeText = s._kind === "override" ? "Manuell angepasst" : "Getauscht";
        html = `<div><span style="text-decoration:line-through;color:var(--muted)">${s._original.type_label}: ${s._original.title_and_target}</span></div>
          <div><strong style="color:var(--aerobic)">${mainText}</strong> <span class="badge na">${badgeText}</span></div>`;
        if (s._swapNote) html += `<div style="font-size:0.72rem;color:var(--warn);margin-top:2px">↳ ${s._swapNote}</div>`;
      } else {
        html = mainText;
        if (s.note) html += `<div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${s.note}</div>`;
      }
      const restGuidance = inferRestGuidance(s);
      if (restGuidance) {
        html += `<div style="font-size:0.72rem;color:var(--target);margin-top:2px">↳ Pause zwischen den Wiederholungen: ${restGuidance} <span style="color:var(--muted)">(Richtwert aus deiner Leistungsdiagnostik)</span></div>`;
      }
      if (s.double_threshold) {
        html += `<div style="margin-top:4px"><span class="badge low">2× Schwelle (AM/PM)</span></div>`;
      }
      const raceClass = s.type === "RACE" ? " race" : "";
      const isToday = s.date === todayStr;
      const todayStyle = isToday ? ' style="outline:1px solid var(--aerobic)"' : "";
      const dayLabel = `${WEEKDAY_NAMES[s.day_code] || s.day_code}, ${fmtDate(s.date)}${isToday ? ' <span style="color:var(--aerobic);font-weight:600">· heute</span>' : ""}`;
      return `<div class="day-row"${todayStyle}>
        <div class="dd">${dayLabel}</div>
        <div class="ds${raceClass}">${html}</div>
        <div>${STATUS_BADGE[status]}</div>
      </div>`;
    })
    .join("");

  return `<details class="week${hasRace ? " race" : ""}${isCurrent ? " current" : ""}"${isCurrent ? " open" : ""}>
    <summary>
      <span class="sw-week">${weekLabel}</span>
      <span class="sw-dates">${dateRange}</span>
      <span class="sw-vol">${first.week_volume || ""}</span>
      <span class="sw-focus">${focus}${hasDoubleThreshold ? ' <span class="badge low" style="margin-left:6px">2× Schwelle</span>' : ""}</span>
      <span class="sw-arrow">▸</span>
    </summary>
    <div class="week-body">${rows}</div>
  </details>`;
}

function renderTrainingPlanFull(plan, activities, todayStr, adjustments) {
  if (!plan || !plan.sessions || plan.sessions.length === 0) {
    return `<section class="panel"><div class="panel-head"><div class="panel-title">Trainingsplan</div></div><p class="empty">Kein Trainingsplan geladen</p></section>`;
  }

  const weekMap = {};
  plan.sessions.forEach((s) => {
    if (!weekMap[s.week]) weekMap[s.week] = [];
    weekMap[s.week].push(s);
  });
  const weekLabels = Object.keys(weekMap).sort();

  const currentWeek =
    plan.sessions.find((s) => s.date === todayStr)?.week ||
    plan.sessions.filter((s) => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date))[0]?.week ||
    weekLabels[weekLabels.length - 1];
  const currentPhase = getPhaseKey(weekMap[currentWeek]?.[0]?.block);

  const phaseOrder = ["p0", "p1", "p2", "p3", "p4"].filter((p) => weekLabels.some((w) => getPhaseKey(weekMap[w][0].block) === p));

  const tabsHtml = phaseOrder
    .map((p) => `<button class="tab-btn${p === currentPhase ? " active" : ""}" onclick="switchPhaseTab(this,'${p}')">${PHASE_TITLES[p]}</button>`)
    .join("");

  const panelsHtml = phaseOrder
    .map((p) => {
      const weeksInPhase = weekLabels.filter((w) => getPhaseKey(weekMap[w][0].block) === p);
      const weeksHtml = weeksInPhase.map((w) => renderWeekAccordion(w, weekMap[w], activities, todayStr, adjustments, w === currentWeek)).join("");
      return `<div class="phase-panel${p === currentPhase ? " active" : ""}" id="${p}-panel">
        <div class="phase-intro">${PHASE_INTROS[p]}</div>
        <div class="week-list">${weeksHtml}</div>
      </div>`;
    })
    .join("");

  return `<section class="panel">
    <div class="panel-head"><div class="panel-title">Wochenplan im Detail</div><div class="panel-note">Klick auf eine Woche für den Tagesplan</div></div>
    <div class="tabs">${tabsHtml}</div>
    ${panelsHtml}
  </section>`;
}

/* ---------- main ---------- */

async function main() {
  const app = document.getElementById("app");
  let data;
  try {
    const res = await fetch("../garmin/data.json");
    data = await res.json();
  } catch (e) {
    app.innerHTML = `<div class="wrap" style="padding-top:40px"><p class="empty">garmin/data.json konnte nicht geladen werden. Läuft die Seite über den lokalen Server, und wurde garmin_sync.py schon einmal ausgeführt?</p></div>`;
    return;
  }

  let plan = null;
  try {
    const planRes = await fetch("../garmin/training_plan.json");
    plan = await planRes.json();
  } catch (e) {
    plan = null;
  }

  let manualAdjustments = null;
  try {
    const manualRes = await fetch("../garmin/manual_adjustments.json");
    manualAdjustments = await manualRes.json();
  } catch (e) {
    manualAdjustments = null;
  }
  if (plan && manualAdjustments && manualAdjustments.swaps) {
    plan.sessions = applyManualSwaps(plan.sessions, manualAdjustments.swaps);
  }
  if (plan && manualAdjustments && manualAdjustments.overrides) {
    plan.sessions = applyManualOverrides(plan.sessions, manualAdjustments.overrides);
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const activities = data.activities || {};
  const activityDates = new Set(Object.values(activities).map((a) => (a.startTimeLocal || "").split(" ")[0]));

  const wellness = data.wellness || {};
  const dates = Object.keys(wellness).sort();

  if (dates.length === 0) {
    app.innerHTML = `<div class="wrap" style="padding-top:40px"><p class="empty">Noch keine Wellness-Daten. Führe garmin_sync.py aus.</p></div>`;
    return;
  }

  const rhrPoints = dates.map((d) => {
    let val = null;
    try {
      const metrics = wellness[d].rhr?.allMetrics?.metricsMap?.WELLNESS_RESTING_HEART_RATE || [];
      const found = metrics.find((m) => m.value != null);
      val = found ? found.value : null;
    } catch (e) {}
    return { label: d, value: val };
  });

  const readinessPoints = dates.map((d) => {
    const r = wellness[d].training_readiness;
    return { label: d, value: Array.isArray(r) && r[0] ? r[0].score : null };
  });

  const stressPoints = dates.map((d) => ({ label: d, value: wellness[d].stress ? wellness[d].stress.avgStressLevel : null }));
  const batteryPoints = dates.map((d) => ({ label: d, value: wellness[d].body_battery ? wellness[d].body_battery.charged : null }));
  const stepsPoints = dates.map((d) => {
    const st = wellness[d].steps;
    if (!Array.isArray(st)) return { label: d, value: null };
    return { label: d, value: st.reduce((sum, s) => sum + (s.steps || 0), 0) };
  });

  const weeklyStats = computeWeeklyStats(plan, activities);
  const currentWeekLabel = plan ? plan.sessions.find((s) => s.date === todayStr)?.week : null;
  const insights = computeInsights(wellness, dates, activities, plan, todayStr);

  const coachTip = computeCoachTip(wellness, dates, activities, plan, todayStr, activityDates);
  const adjustments = computeUpcomingAdjustments(wellness, dates, activities, plan, todayStr);

  app.innerHTML =
    renderPageHeader(plan, dates, Object.keys(activities).length) +
    `<div class="wrap">` +
    renderPaceGapGauge(activities, plan, todayStr) +
    renderCalibrationCheckpoints(plan, todayStr) +
    renderCoachTip(coachTip) +
    renderWeekStats(weeklyStats, currentWeekLabel) +
    renderInsights(insights) +
    renderWeeklyVolumeChart(weeklyStats) +
    (plan ? renderTrainingPlanFull(plan, activities, todayStr, adjustments) : "") +
    renderRecoveryCharts(rhrPoints, readinessPoints, stressPoints, batteryPoints, stepsPoints) +
    renderWorkouts(activities) +
    renderZones() +
    renderFueling() +
    renderDisclaimer() +
    renderFooter() +
    `</div>`;
}

function renderFooter() {
  return `<footer style="margin-top:32px;font-size:0.78rem;color:var(--muted);border-top:1px solid var(--border);padding-top:20px">
    Basierend auf CPET-Befund vom 10.08.2026 (Longevity Center Nürnberg) · VO₂max 87,1 ml/kg/min · VT2/RCP 16,0 km/h · A-Ziel 2:32–2:34 setzt eine Schwellenverschiebung über den Block voraus — Kopenhagen dient als Realitäts-Check.
  </footer>`;
}

main();
