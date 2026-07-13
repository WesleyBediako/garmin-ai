const COLORS = {
  rhr: "#5eb3ff",
  readiness: "#6ee7a0",
  stress: "#ff9d5e",
  battery: "#c792ea",
  steps: "#5eb3ff",
};

function readinessBadge(score) {
  if (score == null) return '<span class="badge na">n/a</span>';
  if (score <= 25) return `<span class="badge poor">${score} Poor</span>`;
  if (score <= 50) return `<span class="badge low">${score} Low</span>`;
  if (score <= 75) return `<span class="badge moderate">${score} Moderate</span>`;
  return `<span class="badge good">${score} Good</span>`;
}

function fmtDate(d) {
  const [y, m, day] = d.split("-");
  return `${m}/${day}`;
}

function lineChartSVG(points, color, opts = {}) {
  const width = 600, height = 130, padL = 30, padR = 10, padT = 10, padB = 20;
  const values = points.map((p) => p.value).filter((v) => v != null);
  if (values.length === 0) {
    return `<p class="empty">No data for this period</p>`;
  }
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

function card(title, valueHtml, chartHtml, extraClass = "") {
  return `<div class="card ${extraClass}">
    <h2>${title}</h2>
    <div class="value">${valueHtml}</div>
    ${chartHtml}
  </div>`;
}

function daysUntil(dateStr, todayStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(todayStr + "T00:00:00");
  return Math.round((d - t) / 86400000);
}

function sessionStatus(session, activityDates, todayStr) {
  if (session.type === "REST") return "rest";
  if (session.date > todayStr) return "upcoming";
  if (activityDates.has(session.date)) return "done";
  if (session.date === todayStr) return "today";
  return "missed";
}

const STATUS_BADGE = {
  done: '<span class="badge good">Done</span>',
  missed: '<span class="badge poor">Missed</span>',
  upcoming: '<span class="badge na">Upcoming</span>',
  today: '<span class="badge moderate">Today</span>',
  rest: '<span class="badge na">Rest</span>',
};

function renderCountdown(plan, todayStr) {
  const race = plan.sessions.find((s) => s.type === "RACE" && /COPENHAGEN|KOPENHAGEN/i.test(s.title_and_target));
  if (!race) return "";
  const n = daysUntil(race.date, todayStr);
  const label = n > 0 ? `${n} days to go` : n === 0 ? "Race day!" : `${Math.abs(n)} days ago`;
  return `<div class="card">
    <h2>Copenhagen Half Marathon</h2>
    <div class="value">${label}<span class="unit">${race.date} · goal ${race.detail || ""}</span></div>
  </div>`;
}

function renderTrainingPlan(plan, activityDates, todayStr) {
  if (!plan || !plan.sessions || plan.sessions.length === 0) {
    return `<div class="card workouts"><h2>Training Plan</h2><p class="empty">No training plan loaded</p></div>`;
  }
  // Current week = the plan week containing today, or the nearest upcoming week
  let currentWeek = plan.sessions.find((s) => s.date === todayStr)?.week;
  if (!currentWeek) {
    const future = plan.sessions.filter((s) => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    currentWeek = future.length ? future[0].week : plan.sessions[plan.sessions.length - 1].week;
  }
  const weekSessions = plan.sessions.filter((s) => s.week === currentWeek).sort((a, b) => a.date.localeCompare(b.date));

  const rows = weekSessions
    .map((s) => {
      const status = sessionStatus(s, activityDates, todayStr);
      const isToday = s.date === todayStr ? ' style="outline: 1px solid var(--accent)"' : "";
      return `<tr${isToday}>
        <td>${s.date} (${s.day_code})</td>
        <td>${s.type_label}</td>
        <td>${s.title_and_target}</td>
        <td>${s.detail || ""}</td>
        <td>${STATUS_BADGE[status]}</td>
      </tr>`;
    })
    .join("");

  return `<div class="card workouts">
    <h2>Training Plan — ${currentWeek} (${weekSessions[0]?.week_volume || ""})</h2>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Session</th><th>Detail</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderWorkouts(activities) {
  const list = Object.values(activities).sort((a, b) =>
    (b.startTimeLocal || "").localeCompare(a.startTimeLocal || "")
  );
  if (list.length === 0) {
    return `<div class="card workouts"><h2>Workouts</h2><p class="empty">No workouts synced yet</p></div>`;
  }
  const rows = list
    .map((a) => {
      const date = (a.startTimeLocal || "").split(" ")[0] || "n/a";
      const name = a.activityName || "Activity";
      const type = (a.activityType || {}).typeKey || "n/a";
      const dist = a.distance ? (a.distance / 1000).toFixed(2) + " km" : "n/a";
      const dur = a.duration ? Math.round(a.duration / 60) + " min" : "n/a";
      const hr = a.averageHR ? Math.round(a.averageHR) + " bpm" : "n/a";
      return `<tr><td>${date}</td><td>${name}</td><td>${type}</td><td>${dist}</td><td>${dur}</td><td>${hr}</td></tr>`;
    })
    .join("");
  return `<div class="card workouts">
    <h2>Recent Workouts</h2>
    <table>
      <thead><tr><th>Date</th><th>Name</th><th>Type</th><th>Distance</th><th>Duration</th><th>Avg HR</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

async function main() {
  const app = document.getElementById("app");
  let data;
  try {
    const res = await fetch("../garmin/data.json");
    data = await res.json();
  } catch (e) {
    app.innerHTML = `<p class="empty">Could not load garmin/data.json. Make sure you're viewing this via the local server, and that garmin_sync.py has been run at least once.</p>`;
    return;
  }

  let plan = null;
  try {
    const planRes = await fetch("../garmin/training_plan.json");
    plan = await planRes.json();
  } catch (e) {
    plan = null;
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const activityDates = new Set(
    Object.values(data.activities || {}).map((a) => (a.startTimeLocal || "").split(" ")[0])
  );

  const wellness = data.wellness || {};
  const dates = Object.keys(wellness).sort();
  const activities = data.activities || {};

  document.getElementById("range-label").textContent =
    dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]} · ${Object.keys(activities).length} workout(s)` : "No data yet";

  if (dates.length === 0) {
    app.innerHTML = `<p class="empty">No wellness data yet. Run garmin_sync.py to pull some.</p>`;
    return;
  }

  const latest = wellness[dates[dates.length - 1]];

  const rhrPoints = dates.map((d) => {
    const rhr = wellness[d].rhr;
    let val = null;
    try {
      const metrics = rhr?.allMetrics?.metricsMap?.WELLNESS_RESTING_HEART_RATE || [];
      const found = metrics.find((m) => m.value != null);
      val = found ? found.value : null;
    } catch (e) {}
    return { label: d, value: val };
  });

  const readinessPoints = dates.map((d) => {
    const r = wellness[d].training_readiness;
    const val = Array.isArray(r) && r[0] ? r[0].score : null;
    return { label: d, value: val };
  });

  const stressPoints = dates.map((d) => {
    const s = wellness[d].stress;
    return { label: d, value: s ? s.avgStressLevel : null };
  });

  const batteryPoints = dates.map((d) => {
    const b = wellness[d].body_battery;
    return { label: d, value: b ? b.charged : null };
  });

  const stepsPoints = dates.map((d) => {
    const st = wellness[d].steps;
    if (!Array.isArray(st)) return { label: d, value: null };
    const total = st.reduce((sum, s) => sum + (s.steps || 0), 0);
    return { label: d, value: total };
  });

  const latestRhr = rhrPoints[rhrPoints.length - 1]?.value;
  const latestReadiness = readinessPoints[readinessPoints.length - 1]?.value;
  const latestStress = stressPoints[stressPoints.length - 1]?.value;
  const latestSteps = stepsPoints[stepsPoints.length - 1]?.value;

  app.innerHTML = [
    plan ? renderCountdown(plan, todayStr) : "",
    plan ? renderTrainingPlan(plan, activityDates, todayStr) : "",
    card(
      "Resting Heart Rate",
      latestRhr != null ? `${latestRhr}<span class="unit">bpm</span>` : '<span class="empty">n/a</span>',
      lineChartSVG(rhrPoints, COLORS.rhr),
      "chart-card"
    ),
    card(
      "Training Readiness",
      readinessBadge(latestReadiness),
      lineChartSVG(readinessPoints, COLORS.readiness, { minZero: true }),
      "chart-card"
    ),
    card(
      "Average Stress",
      latestStress != null ? `${latestStress}<span class="unit">/ 100</span>` : '<span class="empty">n/a</span>',
      lineChartSVG(stressPoints, COLORS.stress, { minZero: true }),
      "chart-card"
    ),
    card(
      "Body Battery Charged",
      "",
      lineChartSVG(batteryPoints, COLORS.battery, { minZero: true }),
      "chart-card"
    ),
    card(
      "Steps (latest day)",
      latestSteps != null ? `${latestSteps.toLocaleString()}` : '<span class="empty">n/a</span>',
      lineChartSVG(stepsPoints, COLORS.steps, { minZero: true }),
      "chart-card"
    ),
    renderWorkouts(activities),
  ].join("");
}

main();
