#!/bin/bash
# jellysvn-commit.sh
# Opens JELLYSVN and navigates to the commit view for the selected folder.
# Optimized: opens app immediately, skips pre-check for faster launch.

FOLDER="$1"

if [ -z "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN Commit" message "No folder selected." as warning'
    exit 0
fi

if [ -f "$FOLDER" ]; then
    FOLDER="$(dirname "$FOLDER")"
fi

if [ ! -d "$FOLDER" ]; then
    osascript -e "display alert \"JELLYSVN Commit\" message \"Path is not a directory.\" as warning"
    exit 0
fi

find_svn_root() {
    local dir="$1"
    while [ "$dir" != "/" ]; do
        if [ -d "$dir/.svn" ]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

SVN_ROOT=$(find_svn_root "$FOLDER")
if [ -z "$SVN_ROOT" ]; then
    osascript -e "display alert \"JELLYSVN Commit\" message \"Not an SVN working copy: $(basename "$FOLDER")\" as warning"
    exit 0
fi

# Possible app locations
APP_PATHS=(
    "/Applications/JellySvn.app"
    "/Applications/SVN Antigravity.app"
    "/Applications/JELLYSVN.app"
    "/Applications/SVN GUI Tool.app"
    "$HOME/Applications/JellySvn.app"
    "$HOME/Applications/SVN Antigravity.app"
    "$HOME/Applications/JELLYSVN.app"
)

APP_PATH=""
for candidate in "${APP_PATHS[@]}"; do
    if [ -d "$candidate" ]; then
        APP_PATH="$candidate"
        break
    fi
done

if [ -z "$APP_PATH" ]; then
    osascript -e 'display alert "JELLYSVN Commit" message "JELLYSVN app not found. Please install it first." as warning'
    exit 0
fi

# Open app immediately — no svn status pre-check (app handles it internally)
open -a "$APP_PATH" --args "$SVN_ROOT" --commit

# Non-blocking notification instead of blocking alert
osascript -e "display notification \"Opening commit view for $(basename "$SVN_ROOT")\" with title \"JellySvn\""
