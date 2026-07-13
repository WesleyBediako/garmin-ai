#!/bin/bash
cd "$(dirname "$0")"
echo "Starting dashboard at http://localhost:8765/dashboard/"
echo "Press Ctrl+C to stop."
./venv/bin/python3 -m http.server 8765 &
SERVER_PID=$!
sleep 1
open "http://localhost:8765/dashboard/"
wait $SERVER_PID
