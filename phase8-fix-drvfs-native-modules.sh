#!/usr/bin/env bash
# LedgerLine Core — Phase 8 fix: node_modules native binaries break on
# DrvFs (/mnt/c). Same root cause class as the earlier Cargo target-dir
# issue. Fix: symlink node_modules to native Linux filesystem. Also adds
# the frontend/.gitignore that should have existed from the start.
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

echo "=================================================="
echo "Adding frontend/.gitignore (was missing -- would have committed"
echo "node_modules/ otherwise)"
echo "=================================================="
cat > frontend/.gitignore << 'EOF'
node_modules/
.next/
.env.local
npm-debug.log*
*.tsbuildinfo
next-env.d.ts
EOF
echo "Written."
echo ""

cd frontend

echo "=================================================="
echo "Removing old node_modules/package-lock, setting up native-fs symlink"
echo "=================================================="
rm -rf node_modules package-lock.json

NATIVE_MODULES="$HOME/.npm-native-modules/ledgerline-core-frontend"
mkdir -p "$NATIVE_MODULES"
ln -s "$NATIVE_MODULES" node_modules
echo "node_modules -> $NATIVE_MODULES"
echo ""

echo "=================================================="
echo "npm install (writing through the symlink to native ext4)"
echo "=================================================="
npm install
echo ""

echo "--- Confirm the native binary actually exists now ---"
find "$NATIVE_MODULES/@tailwindcss" -name "*.node" 2>&1

cd ..

echo ""
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
  git commit -q -m "feat(frontend): Phase 8 -- institutional terminal dashboard + operator admin panel

Also: node_modules symlinked to native Linux fs (DrvFs breaks native
binary resolution for optional deps like @tailwindcss/oxide, same root
cause as the earlier Cargo target-dir issue). Added missing
frontend/.gitignore."
  echo "Committed."
else
  echo "NOT committed -- review errors above."
fi
echo ""
echo "Copy/paste this ENTIRE output back to Claude."
