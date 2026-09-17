#!/usr/bin/env bash
# LedgerLine Core — Phase 8 fix: clean reinstall to fix missing native
# optional dependency (@tailwindcss/oxide), per npm/cli#4828.
set -uo pipefail

if [ ! -d "frontend" ]; then
  echo "!!! Run this from inside the ledgerline-core repo root."
  exit 1
fi

set +u
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use --lts
set -u

echo "--- Active node version ---"
node --version
echo ""

cd frontend

echo "=================================================="
echo "Removing node_modules and package-lock.json, reinstalling clean"
echo "=================================================="
rm -rf node_modules package-lock.json
npm install
echo ""

cd ..

echo "=================================================="
echo "BUILD CHECK"
echo "=================================================="
( cd frontend && npm run build ) && BUILD_STATUS="SUCCESS" || BUILD_STATUS="FAILED"
echo ""

echo "=================================================="
echo "SUMMARY"
echo "=================================================="
echo "Node version: $(node --version)"
echo "Frontend build: $BUILD_STATUS"
echo ""

if [ "$BUILD_STATUS" = "SUCCESS" ]; then
  git add -A
  git add -f frontend/abi frontend/package-lock.json
  git commit -q -m "feat(frontend): Phase 8 -- institutional terminal dashboard + operator admin panel"
  echo "Committed."
else
  echo "NOT committed -- review errors above."
fi
echo ""
echo "Copy/paste this ENTIRE output back to Claude."
