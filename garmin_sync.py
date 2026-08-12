"""
Pulls recent Garmin Connect activities and daily wellness data (sleep, HRV,
resting heart rate, body battery, stress, steps, training readiness) and
saves them as plain-English markdown notes plus a data.json file in garmin/.

Usage:
    ./venv/bin/python3 garmin_sync.py            # last 3 days
    ./venv/bin/python3 garmin_sync.py --days 7    # last 7 days

Requires garmin_login.py to have been run once already (this script only
reads the saved session token, it never asks for a password).
"""

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from garminconnect import Garmin

ROOT = Path(__file__).parent
TOKEN_STORE = str(ROOT / ".garmintokens")
OUT_DIR = ROOT / "garmin"
WELLNESS_DIR = OUT_DIR / "wellness"
ACTIVITIES_DIR = OUT_DIR / "activities"
DATA_JSON = OUT_DIR / "data.json"


def login():
    client = Garmin()
    try:
        client.login(TOKEN_STORE)
    except Exception as e:
        print(f"Could not load saved session ({e}).")
        print("Run garmin_login.py again to log in.")
        sys.exit(1)
    return client


def safe_call(fn, *args):
    try:
        return fn(*args)
    except Exception:
        return None


def sec_to_hm(seconds):
    if not seconds:
        return "n/a"
    h, m = divmod(int(seconds) // 60, 60)
    return f"{h}h {m}m"


def classify_laps(laps):
    """Guesses which laps of a multi-lap activity were work vs. rest, purely
    from pace — Garmin's own lapDTOs don't reliably tag this for manually- or
    auto-lapped runs (only for watch-programmed interval workouts)."""
    if not laps or len(laps) < 3:
        return None

    n = len(laps)
    middle = laps[1:-1] if n > 2 else laps
    middle_speeds = sorted((l.get("averageSpeed") or 0 for l in middle), reverse=True)
    if not middle_speeds:
        return None
    fast_ref = middle_speeds[len(middle_speeds) // 2]
    if fast_ref <= 0:
        return None

    result = []
    work_i = 0
    rest_i = 0
    for i, lap in enumerate(laps):
        speed = lap.get("averageSpeed") or 0
        dur = lap.get("duration") or 0
        dist = lap.get("distance") or 0
        pace = (dur / (dist / 1000)) if dist > 0 else None
        entry = {
            "index": i + 1,
            "duration_s": round(dur),
            "distance_m": round(dist),
            "pace_sec_per_km": round(pace) if pace else None,
            "avg_hr": lap.get("averageHR"),
        }
        if i == 0 and speed < 0.85 * fast_ref:
            entry["kind"] = "warmup"
        elif i == n - 1 and speed < 0.85 * fast_ref:
            entry["kind"] = "cooldown"
        elif speed < 0.7 * fast_ref:
            rest_i += 1
            entry["kind"] = "rest"
            entry["rest_index"] = rest_i
        else:
            work_i += 1
            entry["kind"] = "work"
            entry["work_index"] = work_i
        result.append(entry)

    has_work = any(e["kind"] == "work" for e in result)
    has_rest = any(e["kind"] == "rest" for e in result)
    if not (has_work and has_rest):
        return None
    return result


def load_data_json():
    if DATA_JSON.exists():
        return json.loads(DATA_JSON.read_text())
    return {"wellness": {}, "activities": {}}


def save_data_json(data):
    DATA_JSON.write_text(json.dumps(data, indent=2, default=str))


def write_wellness_note(d, sleep, hrv, rhr, battery, stress, steps, readiness):
    lines = [f"# Wellness — {d}", ""]

    lines.append("## Sleep")
    if sleep and sleep.get("dailySleepDTO"):
        s = sleep["dailySleepDTO"]
        lines.append(f"- Total sleep: {sec_to_hm(s.get('sleepTimeSeconds'))}")
        lines.append(
            f"- Deep: {sec_to_hm(s.get('deepSleepSeconds'))}, "
            f"REM: {sec_to_hm(s.get('remSleepSeconds'))}, "
            f"Light: {sec_to_hm(s.get('lightSleepSeconds'))}, "
            f"Awake: {sec_to_hm(s.get('awakeSleepSeconds'))}"
        )
        score = (sleep.get("dailySleepDTO", {}).get("sleepScores", {}) or {}).get("overall", {})
        if score:
            lines.append(f"- Sleep score: {score.get('value', 'n/a')} ({score.get('qualifierKey', '')})")
    else:
        lines.append("- No sleep data available")
    lines.append("")

    lines.append("## Resting Heart Rate")
    if rhr:
        rhr_val = None
        for group in rhr.get("allMetrics", {}).get("metricsMap", {}).get("WELLNESS_RESTING_HEART_RATE", []):
            rhr_val = group.get("value")
        lines.append(f"- Resting HR: {rhr_val if rhr_val else 'n/a'} bpm")
    else:
        lines.append("- No resting heart rate data available")
    lines.append("")

    lines.append("## HRV (Heart Rate Variability)")
    if hrv and hrv.get("hrvSummary"):
        h = hrv["hrvSummary"]
        lines.append(f"- Last night avg: {h.get('lastNightAvg', 'n/a')} ms")
        lines.append(f"- Status: {h.get('status', 'n/a')}")
    else:
        lines.append("- No HRV data available")
    lines.append("")

    lines.append("## Body Battery")
    if battery:
        charged = battery.get("charged")
        drained = battery.get("drained")
        lines.append(f"- Charged: +{charged if charged is not None else 'n/a'}")
        lines.append(f"- Drained: -{drained if drained is not None else 'n/a'}")
    else:
        lines.append("- No body battery data available")
    lines.append("")

    lines.append("## Stress")
    if stress:
        lines.append(f"- Average stress: {stress.get('avgStressLevel', 'n/a')}")
        lines.append(f"- Max stress: {stress.get('maxStressLevel', 'n/a')}")
    else:
        lines.append("- No stress data available")
    lines.append("")

    lines.append("## Training Readiness")
    if readiness and isinstance(readiness, list) and readiness:
        r = readiness[0]
        lines.append(f"- Score: {r.get('score', 'n/a')} ({r.get('level', 'n/a')})")
    else:
        lines.append("- No training readiness data available")
    lines.append("")

    lines.append("## Steps")
    if steps and isinstance(steps, list):
        total = sum(s.get("steps", 0) or 0 for s in steps)
        lines.append(f"- Total steps: {total:,}")
    else:
        lines.append("- No steps data available")

    (WELLNESS_DIR / f"{d}.md").write_text("\n".join(lines) + "\n")


def write_activity_note(a):
    name = a.get("activityName", "Activity")
    start = a.get("startTimeLocal", "unknown-date")
    date_part = start.split(" ")[0] if start != "unknown-date" else "unknown-date"
    activity_type = (a.get("activityType") or {}).get("typeKey", "activity")
    duration_s = a.get("duration")
    distance_m = a.get("distance")
    avg_hr = a.get("averageHR")
    max_hr = a.get("maxHR")
    calories = a.get("calories")
    training_effect = a.get("aerobicTrainingEffect")

    lines = [f"# {name}", "", f"Date: {date_part}", f"Type: {activity_type}", ""]
    if duration_s:
        lines.append(f"- Duration: {sec_to_hm(duration_s)}")
    if distance_m:
        lines.append(f"- Distance: {distance_m / 1000:.2f} km")
    if avg_hr:
        lines.append(f"- Avg HR: {avg_hr} bpm")
    if max_hr:
        lines.append(f"- Max HR: {max_hr} bpm")
    if calories:
        lines.append(f"- Calories: {calories}")
    if training_effect:
        lines.append(f"- Aerobic training effect: {training_effect}")

    lap_structure = a.get("lap_structure")
    if lap_structure:
        lines.append("")
        lines.append("## Intervall-Struktur")
        for lap in lap_structure:
            mins, secs = divmod(lap["duration_s"], 60)
            dur_str = f"{mins}:{secs:02d}"
            pace = lap.get("pace_sec_per_km")
            pace_str = f" @ {pace // 60}:{pace % 60:02d}/km" if pace else ""
            hr_str = f" Ø{lap['avg_hr']:.0f}bpm" if lap.get("avg_hr") else ""
            kind = lap["kind"]
            if kind == "warmup":
                label = "Aufwärmen"
            elif kind == "cooldown":
                label = "Cooldown"
            elif kind == "work":
                label = f"Arbeit {lap['work_index']}"
            else:
                label = f"Pause {lap['rest_index']}"
            lines.append(f"- {label}: {dur_str} min{pace_str}{hr_str}")

    activity_id = a.get("activityId", "unknown")
    safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)[:40]
    filename = f"{date_part}-{safe_name}-{activity_id}.md"
    (ACTIVITIES_DIR / filename).write_text("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=3, help="How many recent days to pull")
    args = parser.parse_args()

    WELLNESS_DIR.mkdir(parents=True, exist_ok=True)
    ACTIVITIES_DIR.mkdir(parents=True, exist_ok=True)

    client = login()
    data = load_data_json()

    today = date.today()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(args.days)]

    print(f"Pulling wellness data for {len(dates)} day(s): {dates[-1]} to {dates[0]}")
    for d in dates:
        sleep = safe_call(client.get_sleep_data, d)
        hrv = safe_call(client.get_hrv_data, d)
        rhr = safe_call(client.get_rhr_day, d)
        battery_list = safe_call(client.get_body_battery, d, d)
        battery = battery_list[0] if battery_list else None
        stress = safe_call(client.get_all_day_stress, d)
        steps = safe_call(client.get_steps_data, d)
        readiness = safe_call(client.get_training_readiness, d)

        data["wellness"][d] = {
            "sleep": sleep,
            "hrv": hrv,
            "rhr": rhr,
            "body_battery": battery,
            "stress": stress,
            "steps": steps,
            "training_readiness": readiness,
        }
        write_wellness_note(d, sleep, hrv, rhr, battery, stress, steps, readiness)
        print(f"  wrote wellness/{d}.md")

    start_date = dates[-1]
    end_date = dates[0]
    print(f"Pulling activities from {start_date} to {end_date}")
    activities = safe_call(client.get_activities_by_date, start_date, end_date) or []
    for a in activities:
        activity_id = str(a.get("activityId"))
        if (a.get("lapCount") or 0) > 2:
            splits = safe_call(client.get_activity_splits, activity_id)
            laps = (splits or {}).get("lapDTOs") or []
            lap_structure = classify_laps(laps)
            if lap_structure:
                a["lap_structure"] = lap_structure
        data["activities"][activity_id] = a
        write_activity_note(a)
        print(f"  wrote activity note for '{a.get('activityName', activity_id)}'")

    save_data_json(data)
    print(f"\nDone. {len(dates)} wellness note(s), {len(activities)} activity note(s).")
    print(f"Saved in {OUT_DIR}")


if __name__ == "__main__":
    main()
