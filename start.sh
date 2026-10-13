#!/usr/bin/env bash
# ============================================================
#  Code Breakers Judge - start the server
#  Run this on the SERVER PC only.
# ============================================================
set -e
cd "$(dirname "$0")"

echo "[1/3] Checking dependencies..."
if [ ! -d node_modules ]; then
  echo "      Installing npm packages (first run only)..."
  npm install
fi

echo "[2/3] Building the app..."
# Always rebuild so a stale .next can never run old code at the event.
npm run build

echo "[3/3] Starting server on http://0.0.0.0:3000"
echo
echo "  Open this address on the lab PCs:  http://YOUR-SERVER-IP:3000"
echo "  Admin login:  http://YOUR-SERVER-IP:3000/admin/login"
echo "  Press Ctrl+C to stop."
echo
exec npx next start -H 0.0.0.0 -p 3000
