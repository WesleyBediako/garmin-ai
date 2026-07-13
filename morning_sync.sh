#!/bin/bash
set -e
cd "$(dirname "$0")"

./venv/bin/python3 garmin_sync.py --days 2

git add garmin/
if ! git diff --cached --quiet; then
  git commit -m "Auto-sync $(date +%Y-%m-%d)"
  git push
else
  echo "No changes to commit."
fi
