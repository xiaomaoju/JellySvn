#!/bin/bash
# jellysvn-cleanup.sh
# Runs svn cleanup on the selected folder and shows result as a macOS alert dialog.

SVN="/opt/homebrew/bin/svn"
FOLDER="$1"

if [ -z "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN Cleanup" message "No folder selected." as warning'
    exit 0
fi

if [ -f "$FOLDER" ]; then
    FOLDER="$(dirname "$FOLDER")"
fi

if [ ! -d "$FOLDER" ]; then
    osascript -e "display alert \"JELLYSVN Cleanup\" message \"Path is not a directory.\" as warning"
    exit 0
fi

if [ ! -x "$SVN" ]; then
    SVN="$(which svn 2>/dev/null)"
    if [ -z "$SVN" ]; then
        osascript -e 'display alert "JELLYSVN Cleanup" message "SVN not found. Install with: brew install svn" as warning'
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
    osascript -e "display alert \"JELLYSVN Cleanup\" message \"Not an SVN working copy: $(basename "$FOLDER")\" as warning"
    exit 0
fi

# Progress notification
osascript -e "display notification \"Running cleanup...\" with title \"JELLYSVN Cleanup\" subtitle \"$(basename "$SVN_ROOT")\""

# Run svn cleanup on the SVN root
CLEANUP_OUTPUT=$("$SVN" cleanup "$SVN_ROOT" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    ERROR_MSG=$(echo "$CLEANUP_OUTPUT" | tail -3 | cut -c1-300)
    osascript -e "display alert \"JELLYSVN Cleanup — Error\" message \"$ERROR_MSG\" as critical"
    exit 0
fi

# Run vacuum if available (SVN 1.10+)
VACUUM_OUTPUT=$("$SVN" cleanup --vacuum-pristines "$SVN_ROOT" 2>&1)
VACUUM_CODE=$?

if [ $VACUUM_CODE -eq 0 ]; then
    osascript -e "display alert \"JELLYSVN Cleanup — $(basename "$SVN_ROOT")\" message \"Cleanup and vacuum completed successfully.\""
else
    osascript -e "display alert \"JELLYSVN Cleanup — $(basename "$SVN_ROOT")\" message \"Cleanup completed successfully.\""
fi
