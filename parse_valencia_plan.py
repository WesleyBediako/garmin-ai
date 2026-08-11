"""
Merges the new 17-week Valencia Marathon block (parsed from a reference
HTML dashboard, itself based on the 10.08.2026 CPET/Leistungsdiagnostik)
into garmin/training_plan.json.

Keeps all existing sessions before the cutover date (the real training
history so far) and replaces everything from the cutover date onward with
the new block. New weeks are relabeled to continue the existing week
numbering (old plan ends at W05 / 2026-08-09) so week labels stay unique.

Usage:
    ./venv/bin/python3 parse_valencia_plan.py /path/to/valencia_dashboard.html
"""

import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).parent
PLAN_PATH = ROOT / "garmin" / "training_plan.json"
CUTOVER = date(2026, 8, 10)
WEEK_NUM_OFFSET = 5  # old plan's last week is W05 -> new plan starts at W06

PHASE_NAMES = {
    "p1": "PHASE 1 — BASIS",
    "p2": "PHASE 2 — KOPENHAGEN TUNE-UP",
    "p3": "PHASE 3 — MARATHONSPEZIFISCH",
    "p4": "PHASE 4 — TAPER",
}

TYPE_LABELS = {
    "REST": "Rest Day",
    "EASY": "Easy Run",
    "LONG": "Long Run",
    "SCHWELLE": "Threshold",
    "MPACE": "Marathon Pace",
    "RACE": "Race",
    "RECOVERY": "Recovery",
}


def classify(text):
    t = text.lower()
    if "marathon" in t and ("🏁" in text or "renntag" in t.lower()):
        return "RACE"
    if "kopenhagen halbmarathon" in t or ("halbmarathon" in t and "km" in t):
        return "RACE"
    if t.strip().startswith("rest"):
        return "REST"
    if "long run" in t or "marathon-simulation" in t or "progressiver lauf" in t:
        return "LONG"
    if "marathonpace" in t or "marathonblöcke" in t or "marathonblock" in t:
        return "MPACE"
    if "schwelle" in t or "tempodauerlauf" in t or "cruise-intervalle" in t:
        return "SCHWELLE"
    if "regeneration" in t:
        return "RECOVERY"
    return "EASY"


def split_title_detail(text):
    # Trailing " — NN km" (em dash) becomes a separate detail field so the
    # dashboard's distance/pace parsing (which expects detail to start with
    # a plain km figure) still works.
    m = re.search(r"[—-]\s*(\d+(?:[.,]\d+)?)\s*km\s*$", text)
    if m:
        title = text[: m.start()].strip(" —-")
        detail = f"{m.group(1)} km"
        return title, detail
    return text.strip(), None


def parse_date_range(range_str, fallback_month):
    # Formats seen: "10.–16.08." or "31.08.–06.09."
    parts = range_str.replace(" ", "").rstrip(".").split("–")
    if len(parts) != 2:
        parts = range_str.replace(" ", "").rstrip(".").split("-")
    a, b = parts[0], parts[1]
    b_parts = b.split(".")
    b_day, b_month = int(b_parts[0]), int(b_parts[1])
    a_parts = a.split(".")
    a_day = int(a_parts[0])
    a_month = int(a_parts[1]) if len(a_parts) > 1 and a_parts[1] else b_month
    return date(2026, a_month, a_day), date(2026, b_month, b_day)


def parse_html(html_path):
    html = html_path.read_text(encoding="utf-8")

    # Split into phase panels
    phase_blocks = re.findall(
        r'<div class="phase-panel[^"]*" id="(p\d)">(.*?)</div>\s*(?=<div class="phase-panel|<!-- ZONE)',
        html,
        re.S,
    )

    sessions = []
    week_index = 0

    for phase_id, phase_html in phase_blocks:
        week_matches = re.findall(
            r'<details class="week[^"]*">\s*<summary>.*?<span class="sw-week">(W\d+)[^<]*</span>'
            r'<span class="sw-dates">([^<]+)</span><span class="sw-vol">([^<]+)</span>'
            r'<span class="sw-focus">([^<]+)</span>.*?</summary>\s*<div class="week-body">(.*?)</div>\s*</details>',
            phase_html,
            re.S,
        )
        for orig_week, date_range, vol, focus, body in week_matches:
            week_index += 1
            new_week_label = f"W{week_index + WEEK_NUM_OFFSET:02d}"
            monday, sunday = parse_date_range(date_range, None)

            day_matches = re.findall(
                r'<div class="d">(\w+)</div>\s*<div class="s[^"]*">([^<]+)</div>', body
            )
            day_offsets = {"Mo": 0, "Di": 1, "Mi": 2, "Do": 3, "Fr": 4, "Sa": 5, "So": 6}

            block_label = f"{PHASE_NAMES[phase_id]} · {focus}"
            if "Taper" in focus or phase_id == "p4":
                block_label += " · TAPER"
            if "Rennen" in focus or "Rennwoche" in focus:
                block_label += " · WETTKAMPFWOCHE"
            if "Peak" in focus:
                block_label += " · PEAK"

            for day_code, text in day_matches:
                offset = day_offsets.get(day_code)
                if offset is None:
                    continue
                session_date = monday + timedelta(days=offset)
                text = text.strip()
                title, detail = split_title_detail(text)
                type_code = classify(text)
                sessions.append(
                    {
                        "date": session_date.isoformat(),
                        "week": new_week_label,
                        "day_code": day_code.upper(),
                        "type": type_code,
                        "type_label": TYPE_LABELS.get(type_code, type_code),
                        "title_and_target": title,
                        "detail": detail,
                        "note": None,
                        "week_volume": vol.strip(),
                        "block": block_label,
                    }
                )
    return sessions


def main():
    if len(sys.argv) != 2:
        print("Usage: parse_valencia_plan.py /path/to/valencia_dashboard.html")
        sys.exit(1)

    html_path = Path(sys.argv[1])
    new_sessions = parse_html(html_path)
    print(f"Parsed {len(new_sessions)} sessions from {html_path.name}")

    existing = json.loads(PLAN_PATH.read_text())
    kept = [s for s in existing["sessions"] if date.fromisoformat(s["date"]) < CUTOVER]
    print(f"Keeping {len(kept)} existing sessions before {CUTOVER}")

    merged = kept + new_sessions
    merged.sort(key=lambda s: s["date"])

    existing["sessions"] = merged
    existing["source_file"] = existing.get("source_file", "") + " + " + html_path.name
    PLAN_PATH.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
    print(f"Wrote {len(merged)} total sessions -> {PLAN_PATH}")
    print(f"Date range: {merged[0]['date']} to {merged[-1]['date']}")


if __name__ == "__main__":
    main()
