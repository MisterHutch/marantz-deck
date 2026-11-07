#!/usr/bin/env bash
set -euo pipefail

url=http://127.0.0.1:4174
for ((attempt = 0; attempt < 20; attempt++)); do
  if curl --silent --show-error --fail --max-time 1 "$url/api/config" >/dev/null 2>&1; then
    exec omarchy-launch-webapp "$url"
  fi
  sleep 0.25
done

notify-send 'Marantz Deck' 'Local server is unavailable. Install Node.js 20+ with mise, then re-enable the plugin.'
exit 1
