#!/bin/bash
while true; do
  NODE_OPTIONS="--max-old-space-size=768" bun run dev 2>&1
  echo "[$(date)] Server died, restarting in 3s..." >> /home/z/my-project/server-restart.log
  sleep 3
done
