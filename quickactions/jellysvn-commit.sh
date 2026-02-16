#!/bin/bash
# jellysvn-commit.sh
# Opens JELLYSVN and navigates to the commit view for the selected folder.

SVN="/opt/homebrew/bin/svn"
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

if [ ! -x "$SVN" ]; then
    SVN="$(which svn 2>/dev/null)"
    if [ -z "$SVN" ]; then
        osascript -e 'display alert "JELLYSVN Commit" message "SVN not found. Install with: brew install svn" as warning'
        exit 0
    fi
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

# Check if there are any changes to commit
STATUS_OUTPUT=$("$SVN" status "$SVN_ROOT" 2>&1)
COMMITTABLE=$(echo "$STATUS_OUTPUT" | grep -cE "^[MADR]")

if [ "$COMMITTABLE" -eq 0 ]; then
    osascript -e "display alert \"JELLYSVN Commit — $(basename "$SVN_ROOT")\" message \"No changes to commit.\" as informational"
    exit 0
fi

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
    osascript -e 'display alert "JELLYSVN Commit" message "JELLYSVN app not found. Please install it first." as warning'
    exit 0
fi

open -a "$APP_PATH" --args "$SVN_ROOT" --commit

osascript -e "display alert \"JELLYSVN Commit — $(basename "$SVN_ROOT")\" message \"Opening commit view ($COMMITTABLE files ready)\""
