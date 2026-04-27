#!/bin/bash
while true; do
  node node_modules/.bin/next dev -p 3000
  echo "[$(date)] Server died, restarting in 2s..." >> /home/z/my-project/server-restart.log
  sleep 2
done
