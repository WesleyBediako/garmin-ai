#!/bin/bash
# Detects when the Mac actually wakes from sleep and triggers a sync.
#
# How it works: we ask for a 60-second nap, then check how much wall-clock
# time actually passed. If the Mac was asleep during that nap, this script
# was suspended right along with the OS, so far more than 60s will have
# elapsed by the time we wake up too. That gap is our signal.
cd "$(dirname "$0")"

while true; do
  before=$(date +%s)
  sleep 60
  after=$(date +%s)
  elapsed=$((after - before))

  if [ "$elapsed" -gt 120 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Wake erkannt (${elapsed}s statt 60s) - starte Sync" >> wake_watcher.log
    ./morning_sync.sh >> wake_watcher.log 2>&1
  fi
done
