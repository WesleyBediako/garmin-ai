"""
Parses the TBC training plan PDF (Berlin City Night 10K + Kopenhagen Half
Marathon 2026) into garmin/training_plan.json — one structured entry per
planned session, so the dashboard and sync script can reference it.

Usage:
    ./venv/bin/python3 parse_training_plan.py /path/to/plan.pdf
"""

import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).parent
OUT_PATH = ROOT / "garmin" / "training_plan.json"

DAY_CODES = {"MO", "DI", "MI", "DO", "FR", "SA", "SO"}
DAY_HEADER_RE = re.compile(r"^(MO|DI|MI|DO|FR|SA|SO)\s+(\S+)\s+(.+)$")
DATE_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.")
WEEK_RE = re.compile(r"^W(\d{2})$")

TYPE_LABELS = {
    "EASY": "Easy Run",
    "TRACK": "Track / Intervals",
    "FARTLEK": "Fartlek",
    "SCHWELLE": "Threshold",
    "LONG": "Long Run",
    "RACE": "Race",
    "RECOVERY": "Recovery",
    "REST": "Rest Day",
    "RAD": "Bike (cross-training)",
    "RAD+EASY": "Bike + Easy Run",
    "HMPACE": "Half-Marathon Pace",
}


def year_for_month(month):
    return 2026


def parse_date(day, month):
    return f"{year_for_month(month):04d}-{int(month):02d}-{int(day):02d}"


def parse_week_page(lines):
    """First few lines of a week page: week id, volume, date range/label."""
    week_id = lines[0].strip() if WEEK_RE.match(lines[0].strip()) else None
    volume = lines[1].strip() if len(lines) > 1 else None
    date_range_label = lines[2].strip() if len(lines) > 2 else None
    block_label = lines[3].strip() if len(lines) > 3 else None
    return week_id, volume, date_range_label, block_label


def parse_page(text, sessions):
    lines = [l for l in text.split("\n") if l.strip()]
    if not lines or not WEEK_RE.match(lines[0].strip()):
        return  # not a week page (e.g. cover page)

    week_id, volume, date_range_label, block_label = parse_week_page(lines)

    # Find indices of day-header lines
    header_idxs = [i for i, l in enumerate(lines) if DAY_HEADER_RE.match(l)]
    for n, idx in enumerate(header_idxs):
        m = DAY_HEADER_RE.match(lines[idx])
        day_code, type_code, header_rest = m.group(1), m.group(2), m.group(3)

        end = header_idxs[n + 1] if n + 1 < len(header_idxs) else len(lines) - 1
        block_lines = lines[idx + 1:end]

        date_str = None
        detail = None
        note_lines = []
        for i, bl in enumerate(block_lines):
            date_match = DATE_RE.search(bl)
            if date_str is None and date_match:
                day_n, month_n = date_match.groups()
                date_str = parse_date(day_n, month_n)
                continue
            if detail is None:
                detail = bl.strip()
            else:
                note_lines.append(bl.strip())

        if date_str is None:
            continue  # malformed entry, skip

        sessions.append({
            "date": date_str,
            "week": week_id,
            "day_code": day_code,
            "type": type_code,
            "type_label": TYPE_LABELS.get(type_code, type_code),
            "title_and_target": header_rest.strip(),
            "detail": detail,
            "note": " ".join(note_lines) if note_lines else None,
            "week_volume": volume,
            "block": block_label,
        })


def parse_plan_metadata(first_page_text):
    return {"raw_header": first_page_text}


def main():
    if len(sys.argv) != 2:
        print("Usage: parse_training_plan.py /path/to/plan.pdf")
        sys.exit(1)

    pdf_path = Path(sys.argv[1])
    sessions = []
    metadata = {}

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if i == 0:
                metadata = parse_plan_metadata(text)
            else:
                parse_page(text, sessions)

    sessions.sort(key=lambda s: s["date"])

    out = {
        "source_file": pdf_path.name,
        "metadata": metadata,
        "sessions": sessions,
    }
    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"Parsed {len(sessions)} sessions -> {OUT_PATH}")


if __name__ == "__main__":
    main()
