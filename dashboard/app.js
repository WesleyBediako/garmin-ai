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

function weeklyVolumeChartSVG(weeks) {
  if (weeks.length === 0) return `<p class="empty">Noch keine Wochendaten</p>`;
  const width = 700, height = 170, padL = 36, padR = 10, padT = 10, padB = 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const maxVal = Math.max(1, ...weeks.map((w) => Math.max(w.actual, w.planned || 0))) * 1.15;
  const groupW = innerW / weeks.length;
  const barW = Math.min(26, groupW * 0.32);

  const bars = weeks
    .map((w, i) => {
      const cx = padL + groupW * i + groupW / 2;
      const actualH = (w.actual / maxVal) * innerH;
      const plannedH = w.planned ? (w.planned / maxVal) * innerH : 0;
      const ay = padT + innerH - actualH;
      const py = padT + innerH - plannedH;
      const aBar = `<rect class="bar" x="${cx - barW - 2}" y="${ay}" width="${barW}" height="${actualH}" fill="${COLORS.volume}"><title>${w.label}: ${w.actual.toFixed(1)} km ist</title></rect>`;
      const pBar = w.planned
        ? `<rect class="bar" x="${cx + 2}" y="${py}" width="${barW}" height="${plannedH}" fill="${COLORS.volumeTarget}"><title>${w.label}: ~${w.planned} km geplant</title></rect>`
        : "";
      const label = `<text class="bar-label" x="${cx}" y="${height - 4}">${w.label}</text>`;
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

function sessionStatus(session, activities, todayStr) {
  const typesToday = activityTypesOnDate(activities, session.date);
  if (session.type === "REST") return "rest";
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
  missed: '<span class="badge poor">Verpasst</span>',
  upcoming: '<span class="badge na">Kommt</span>',
  today: '<span class="badge moderate">Heute</span>',
  rest: '<span class="badge na">Ruhetag</span>',
};

function parsePaceRangeSecPerKm(text) {
  if (!text) return null;
  const m = text.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*\/?\s*km/);
  if (!m) return null;
  const fast = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const slow = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
  return { fast, slow };
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
    return {
      ...s,
      type: o.type,
      type_label: o.type_label,
      title_and_target: o.title_and_target,
      detail: o.detail,
      note: "note" in o ? o.note : s.note,
      _original: { type_label: s.type_label, title_and_target: s.title_and_target, detail: s.detail, note: s.note },
      _swapNote: o.reason,
      _kind: "override",
    };
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

const HARD_TYPES = ["TRACK", "SCHWELLE", "HMPACE", "FARTLEK"];

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
    if (!weeks[week]) weeks[week] = { km: 0, bikeKm: 0, hours: 0, count: 0 };
    const actType = ((a.activityType || {}).typeKey || "").toLowerCase();
    const distKm = (a.distance || 0) / 1000;
    // The plan's weekly km target is a running target — cycling km aren't
    // comparable distance-for-distance, so keep them out of "Volumen".
    if (actType.includes("running")) {
      weeks[week].km += distKm;
    } else if (actType.includes("cycl") || actType.includes("biking")) {
      weeks[week].bikeKm += distKm;
    }
    weeks[week].hours += (a.duration || 0) / 3600;
    weeks[week].count += 1;
  });
  const weekOrder = plan ? [...new Set(plan.sessions.map((s) => s.week))] : Object.keys(weeks).sort();
  const series = weekOrder
    .filter((w) => weeks[w])
    .map((w) => ({
      label: w,
      actual: weeks[w].km,
      bikeKm: weeks[w].bikeKm,
      hours: weeks[w].hours,
      count: weeks[w].count,
      planned: weekPlanned[w] || null,
    }));
  return series;
}

/* ---------- insights (rule-based, computed from your actual numbers) ---------- */

function computeInsights(wellness, dates, activities, plan, todayStr) {
  const insights = [];

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
  const plannedByDate = {};
  if (plan) plan.sessions.forEach((s) => (plannedByDate[s.date] = s));

  const driftHits = [];
  Object.values(activities).forEach((a) => {
    const date = (a.startTimeLocal || "").split(" ")[0];
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

  // 4) Missing sleep/HRV data
  const missingSleep = dates.filter((d) => !wellness[d].sleep || !wellness[d].sleep.dailySleepDTO || wellness[d].sleep.dailySleepDTO.sleepTimeSeconds == null);
  if (missingSleep.length === dates.length && dates.length >= 2) {
    insights.push({
      tone: "info",
      title: "Keine Schlafdaten in diesem Zeitraum",
      body: `Für die letzten ${dates.length} Tage liegen keine Schlafwerte vor. Falls du die Uhr nachts normalerweise trägst, lohnt sich ein Blick in die Garmin Connect App, ob die Nächte dort erfasst wurden — sonst fehlt ein wichtiger Recovery-Baustein.`,
    });
  }

  // 5) Stress trend
  const stressSeries = dates.map((d) => wellness[d].stress?.avgStressLevel).filter((v) => v != null);
  if (stressSeries.length >= 2 && stressSeries[stressSeries.length - 1] > 40 && stressSeries[stressSeries.length - 1] > stressSeries[0]) {
    insights.push({
      tone: "warn",
      title: "Stresslevel steigt an",
      body: `Durchschnittlicher Stresswert zuletzt bei ${stressSeries[stressSeries.length - 1]} (Anstieg gegenüber ${stressSeries[0]} zu Beginn des Zeitraums). Kombiniert mit den Trainingswerten oben lohnt es sich, auf ausreichend Schlaf und Erholungstage zu achten.`,
    });
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
  const hardTypes = ["TRACK", "SCHWELLE", "HMPACE", "FARTLEK"];
  const isHardDay = targetSession && hardTypes.includes(targetSession.type);
  const isEasyDay = targetSession && ["EASY", "LONG", "RECOVERY", "RAD", "RAD+EASY"].includes(targetSession.type);
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
    return {
      forTomorrow: todayHasActivity,
      headline: `${dayWordCap}: ${targetSession.type_label}`,
      body: `${sessionName} — ${targetSession.detail || ""}. Keine besonderen Auffälligkeiten in den Recovery-Werten, dem Plan folgen.`,
    };
  }

  return {
    forTomorrow: todayHasActivity,
    headline: `Kein Trainingsplan für ${dayWord} gefunden`,
    body: "Prüfe, ob das richtige Plan-PDF eingelesen wurde.",
  };
}

function renderCoachTip(tip) {
  return `<section>
    <div class="card" style="border-left:4px solid var(--accent)">
      <h3>Coach-Tipp für ${tip.forTomorrow ? "morgen" : "heute"}</h3>
      <div class="value" style="font-size:1.15rem">${tip.headline}</div>
      <p style="color:var(--text-dim);font-size:0.9rem;margin:0">${tip.body}</p>
    </div>
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
  return `<section>
    <div class="section-head"><h2>Was deine Daten zeigen</h2><span class="hint">automatisch berechnet, keine Ferndiagnose</span></div>
    ${cards}
  </section>`;
}

/* ---------- render sections ---------- */

function renderHero(plan, todayStr, dates, activityCount) {
  const race = plan
    ? plan.sessions.find((s) => s.type === "RACE" && /COPENHAGEN|KOPENHAGEN/i.test(s.title_and_target))
    : null;
  const countdownHtml = race
    ? (() => {
        const n = daysUntil(race.date, todayStr);
        const label = n > 0 ? `${n}` : n === 0 ? "🏁" : `+${Math.abs(n)}`;
        const sub = n > 0 ? "Tage bis Kopenhagen" : n === 0 ? "Renntag!" : "Tage seit dem Rennen";
        return `<div class="countdown">
          <div class="num">${label}</div>
          <div class="label">${sub}</div>
          <div class="goal">${race.date} · Ziel ${race.detail || ""}</div>
        </div>`;
      })()
    : "";
  const rangeLabel = dates.length ? `${dates[0]} bis ${dates[dates.length - 1]} · ${activityCount} Workout(s) synced` : "Noch keine Daten";
  return `<div class="hero">
    <div class="hero-inner">
      <div>
        <h1>Dein Training</h1>
        <p class="subtitle">${rangeLabel}</p>
      </div>
      ${countdownHtml}
    </div>
  </div>`;
}

function renderWeekStats(weeklyStats, currentWeekLabel) {
  const cur = weeklyStats.find((w) => w.label === currentWeekLabel) || { actual: 0, hours: 0, count: 0, planned: null };
  const pct = cur.planned ? Math.round((cur.actual / cur.planned) * 100) : null;
  return `<section>
    <div class="section-head"><h2>Diese Woche (${currentWeekLabel || "—"})</h2></div>
    <div class="grid">
      ${statCard("Volumen", `${cur.actual.toFixed(1)}<span class="unit inline"> / ${cur.planned ? "~" + cur.planned : "?"} km</span>`)}
      ${statCard("Stunden", fmtHM(cur.hours))}
      ${statCard("Einheiten absolviert", `${cur.count}`)}
      ${statCard("Wochen-Fortschritt", pct != null ? `${pct}%` : "n/a")}
    </div>
  </section>`;
}

function renderWeeklyVolumeChart(weeklyStats) {
  return `<section>
    <div class="section-head"><h2>Wochenvolumen im Verlauf</h2><span class="hint">Ist vs. Plan</span></div>
    <div class="table-card">${weeklyVolumeChartSVG(weeklyStats)}</div>
  </section>`;
}

const PACE_NAMES = /@\s*(HMP|Schwelle|mod-Tempo|Tempo)\b/i;

function extractPaceLabel(session) {
  const combined = `${session.title_and_target || ""} ${session.detail || ""}`;
  const range = parsePaceRangeSecPerKm(combined);
  if (range) return `${fmtPace(range.fast).replace("/km", "")}–${fmtPace(range.slow)}`;
  // Lenient fallback: a time-range without an explicit /km suffix nearby
  // (some plan rows lost the unit during PDF extraction, but in this
  // context an H:MM–H:MM range is always a per-km pace).
  const lenient = combined.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (lenient) {
    const fast = parseInt(lenient[1], 10) * 60 + parseInt(lenient[2], 10);
    const slow = parseInt(lenient[3], 10) * 60 + parseInt(lenient[4], 10);
    return `${fmtPace(fast).replace("/km", "")}–${fmtPace(slow)}`;
  }
  const single = combined.match(/(\d{1,2}:\d{2})\s*\/?\s*km/);
  if (single) return `${single[1]}/km`;
  const named = combined.match(PACE_NAMES);
  if (named) return named[1];
  return session.type === "REST" ? "—" : "siehe Details";
}

function extractDistanceLabel(session) {
  // Only trust simple, unambiguous cases — plain "16 km Easy" style.
  const m = (session.detail || "").match(/^(\d+(?:[.,]\d+)?)\s*km\b/);
  if (m) return `${m[1]} km`;
  if (session.type === "REST") return "—";
  return "siehe Details";
}

function renderDetailSegments(session) {
  const parts = [];
  if (session.title_and_target) parts.push(`<p style="margin:0 0 8px;font-size:0.88rem"><strong>Ziel:</strong> ${session.title_and_target}</p>`);
  if (session.detail) {
    const segments = session.detail.split("·").map((s) => s.trim()).filter(Boolean);
    parts.push(
      `<ul style="margin:0 0 8px;padding-left:18px;font-size:0.88rem;line-height:1.8">` +
        segments
          .map((seg) => {
            const restMatch = seg.match(/r\s?(\d+)\s?(min|s)\b/i);
            let html = seg;
            if (restMatch) {
              html = seg.replace(restMatch[0], "").trim() + ` <span class="badge na">Pause ${restMatch[1]}${restMatch[2]}</span>`;
            }
            return `<li>${html}</li>`;
          })
          .join("") +
        `</ul>`
    );
  }
  if (session.note) parts.push(`<p style="margin:0;font-size:0.85rem;color:var(--text-dim)"><strong>Coach-Notiz:</strong> ${session.note}</p>`);
  return parts.join("") || '<p class="empty">Keine weiteren Details</p>';
}

function togglePlanRow(el) {
  const detailRow = el.nextElementSibling;
  const isOpen = detailRow.style.display === "table-row";
  detailRow.style.display = isOpen ? "none" : "table-row";
  const chevron = el.querySelector(".chevron");
  if (chevron) chevron.textContent = isOpen ? "▸" : "▾";
}
window.togglePlanRow = togglePlanRow;

function renderTrainingPlan(plan, activities, todayStr, adjustments) {
  if (!plan || !plan.sessions || plan.sessions.length === 0) {
    return `<section><div class="section-head"><h2>Trainingsplan</h2></div><div class="table-card"><p class="empty">Kein Trainingsplan geladen</p></div></section>`;
  }
  let currentWeek = plan.sessions.find((s) => s.date === todayStr)?.week;
  if (!currentWeek) {
    const future = plan.sessions.filter((s) => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
    currentWeek = future.length ? future[0].week : plan.sessions[plan.sessions.length - 1].week;
  }
  const weekSessions = plan.sessions.filter((s) => s.week === currentWeek).sort((a, b) => a.date.localeCompare(b.date));

  const rows = weekSessions
    .map((s) => {
      const status = sessionStatus(s, activities, todayStr);
      const adj = adjustments[s.date];
      const swapped = !!s._original;
      const rowClass = s.date === todayStr ? "is-today" : "";

      let typCell;
      if (swapped) {
        const badgeText = s._kind === "override" ? "Manuell angepasst" : "Getauscht";
        typCell = `<span style="text-decoration:line-through;color:var(--muted)">${s._original.type_label}</span><br><strong style="color:var(--accent)">${s.type_label}</strong> <span class="badge na">${badgeText}</span>`;
      } else if (adj) {
        typCell = `<span style="text-decoration:line-through;color:var(--muted)">${s.type_label}</span><br><strong style="color:var(--warn)">Easy Run</strong> <span class="badge warn">Angepasst</span>`;
      } else {
        typCell = s.type_label;
      }
      const paceCell = adj ? "locker" : extractPaceLabel(s);
      const distCell = adj ? "~gleich" : extractDistanceLabel(s);

      const row = `<tr class="${rowClass}" style="cursor:pointer" onclick="togglePlanRow(this)">
        <td><span class="chevron" style="display:inline-block;width:14px;color:var(--muted)">▸</span>${s.date} (${s.day_code})</td>
        <td>${typCell}</td>
        <td>${paceCell}</td>
        <td>${distCell}</td>
        <td>${STATUS_BADGE[status]}</td>
      </tr>`;

      const swapNote = swapped ? `<p style="margin:0 0 8px;font-size:0.85rem;color:var(--accent)">↳ ${s._swapNote}</p>` : "";
      const adjNote = adj ? `<p style="margin:0 0 8px;font-size:0.85rem;color:var(--warn)">↳ ${adj.reason}</p>` : "";
      const detailRow = `<tr class="${rowClass}" style="display:none"><td colspan="5" style="background:var(--bg-soft)">
          <div style="padding:14px 4px">${swapNote}${adjNote}${renderDetailSegments(s)}</div>
        </td></tr>`;

      return row + detailRow;
    })
    .join("");

  const offWeekAdj = Object.values(adjustments).find((a) => a.original.week !== currentWeek);
  const offWeekNote = offWeekAdj
    ? `<p style="color:var(--warn);font-size:0.85rem;margin:10px 0 0">Hinweis: für ${offWeekAdj.original.date} (${offWeekAdj.original.week}) ist ebenfalls eine Anpassung vorgeschlagen — ${offWeekAdj.reason}</p>`
    : "";

  return `<section>
    <div class="section-head"><h2>Trainingsplan — ${currentWeek}</h2><span class="hint">${weekSessions[0]?.week_volume || ""} · Zeile klicken für Details</span></div>
    <div class="table-card">
      <table>
        <thead><tr><th>Datum</th><th>Typ</th><th>Pace</th><th>Distanz</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${offWeekNote}
    </div>
  </section>`;
}

function renderRecoveryCharts(rhrPoints, readinessPoints, stressPoints, batteryPoints, stepsPoints) {
  const latest = (pts) => pts[pts.length - 1]?.value;
  return `<section>
    <div class="section-head"><h2>Recovery & Belastung</h2></div>
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
  const items = [
    detailStat("Kalorien", a.calories ? `${Math.round(a.calories)} kcal` : null),
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

  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px 18px;padding:14px 4px">${items.join("")}</div>${hrZoneHtml}`;
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
    return `<section><div class="section-head"><h2>Workouts</h2></div><div class="table-card"><p class="empty">Noch keine Workouts synced</p></div></section>`;
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
  return `<section>
    <div class="section-head"><h2>Letzte Workouts</h2><span class="hint">Zeile klicken für Details</span></div>
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
    renderHero(plan, todayStr, dates, Object.keys(activities).length) +
    `<div class="wrap">` +
    renderCoachTip(coachTip) +
    renderWeekStats(weeklyStats, currentWeekLabel) +
    renderInsights(insights) +
    (plan ? renderTrainingPlan(plan, activities, todayStr, adjustments) : "") +
    renderWeeklyVolumeChart(weeklyStats) +
    renderRecoveryCharts(rhrPoints, readinessPoints, stressPoints, batteryPoints, stepsPoints) +
    renderWorkouts(activities) +
    renderDisclaimer() +
    `</div>`;
}

main();
