#!/bin/bash
# jellysvn-open.sh
# Opens the selected folder in JELLYSVN (SVN Antigravity) Electron app.

FOLDER="$1"

if [ -z "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN" message "No folder selected." as warning'
    exit 0
fi

if [ -f "$FOLDER" ]; then
    FOLDER="$(dirname "$FOLDER")"
fi

if [ ! -d "$FOLDER" ]; then
    osascript -e "display alert \"JELLYSVN\" message \"Path is not a directory.\" as warning"
    exit 0
fi

# Walk up directory tree to find SVN working copy root
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
TARGET="${SVN_ROOT:-$FOLDER}"

# Possible app locations
APP_PATHS=(
    "/Applications/SVN Antigravity.app"
    "/Applications/JELLYSVN.app"
    "/Applications/SVN GUI Tool.app"
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
    osascript -e 'display alert "JELLYSVN" message "JELLYSVN app not found. Please install it first." as warning'
    exit 0
fi

open -a "$APP_PATH" --args "$TARGET"
