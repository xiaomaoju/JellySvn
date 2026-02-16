#!/bin/bash
# JellySvn FinderSync Extension - Build & Install Script
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TEAM_ID="L22GNGMAG4"
APP_NAME="JellySvnHelper"
EXT_ID="com.jellysvn.helper.finder-extension"

echo "=== JellySvn FinderSync Extension Builder ==="

# Step 1: Generate Xcode project
echo "[1/5] Generating Xcode project..."
xcodegen generate 2>&1

# Step 2: Build
echo "[2/5] Building..."
xcodebuild -project ${APP_NAME}.xcodeproj \
    -scheme ${APP_NAME} \
    -configuration Release \
    -derivedDataPath build \
    DEVELOPMENT_TEAM=${TEAM_ID} \
    clean build 2>&1 | grep -E "BUILD|error:|warning:" || true

echo "[3/5] Installing to /Applications..."
pkill -f ${APP_NAME} 2>/dev/null || true
sleep 1
rm -rf /Applications/${APP_NAME}.app
cp -R build/Build/Products/Release/${APP_NAME}.app /Applications/${APP_NAME}.app

echo "[4/5] Registering extension..."
pluginkit -a /Applications/${APP_NAME}.app/Contents/PlugIns/JellySvnFinder.appex
pluginkit -e use -i ${EXT_ID}

# Install scripts for sandbox
SCRIPTS_DIR="$HOME/Library/Application Scripts/${EXT_ID}"
mkdir -p "$SCRIPTS_DIR"
for script in jellysvn-update.sh jellysvn-cleanup.sh jellysvn-status.sh; do
    if [ -f "$SCRIPT_DIR/scripts/$script" ]; then
        cp "$SCRIPT_DIR/scripts/$script" "$SCRIPTS_DIR/$script"
        chmod +x "$SCRIPTS_DIR/$script"
    fi
done

echo "[5/5] Restarting Finder..."
killall Finder
sleep 3

# Verify
echo ""
echo "=== Verification ==="
pluginkit -m -p com.apple.FinderSync 2>&1

echo ""
echo "=== Installation Complete ==="
echo "Launch /Applications/${APP_NAME}.app to activate the extension."
open /Applications/${APP_NAME}.app
