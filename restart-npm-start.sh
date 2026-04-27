#!/bin/bash

while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Build failed. Waiting 15 seconds before retry..."
        sleep 15
        continue
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting: npm start"
    npm start
    exit_code=$?
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] npm start exited with code $exit_code."
    echo "Waiting 15 seconds before restart..."
    sleep 15
done