#!/bin/bash
# jellysvn-status.sh
# Shows SVN status for the selected folder as a macOS alert dialog.

SVN="/opt/homebrew/bin/svn"
FOLDER="$1"

if [ -z "$FOLDER" ]; then
    osascript -e 'display alert "JELLYSVN Status" message "No folder selected." as warning'
    exit 0
fi

# If it's a file, use its parent directory
if [ -f "$FOLDER" ]; then
    FOLDER="$(dirname "$FOLDER")"
fi

if [ ! -d "$FOLDER" ]; then
    osascript -e "display alert \"JELLYSVN Status\" message \"Path is not a directory.\" as warning"
    exit 0
fi

# Check if svn is available
if [ ! -x "$SVN" ]; then
    SVN="$(which svn 2>/dev/null)"
    if [ -z "$SVN" ]; then
        osascript -e 'display alert "JELLYSVN Status" message "SVN not found. Install with: brew install svn" as warning'
        exit 0
    fi
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
if [ -z "$SVN_ROOT" ]; then
    osascript -e "display alert \"JELLYSVN Status\" message \"Not an SVN working copy: $(basename "$FOLDER")\" as warning"
    exit 0
fi

# Run svn status on the selected folder
STATUS_OUTPUT=$("$SVN" status "$FOLDER" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    ERROR_MSG=$(echo "$STATUS_OUTPUT" | head -3 | cut -c1-300)
    osascript -e "display alert \"JELLYSVN Status — Error\" message \"$ERROR_MSG\" as critical"
    exit 0
fi

if [ -z "$STATUS_OUTPUT" ]; then
    osascript -e "display alert \"JELLYSVN Status\" message \"$(basename "$FOLDER"): Working copy is clean. No local changes.\" as informational"
    exit 0
fi

# Count changes by type
MODIFIED=$(echo "$STATUS_OUTPUT" | grep -c "^M")
ADDED=$(echo "$STATUS_OUTPUT" | grep -c "^A")
DELETED=$(echo "$STATUS_OUTPUT" | grep -c "^D")
UNTRACKED=$(echo "$STATUS_OUTPUT" | grep -c "^?")
CONFLICTED=$(echo "$STATUS_OUTPUT" | grep -c "^C")
MISSING=$(echo "$STATUS_OUTPUT" | grep -c "^!")
TOTAL=$(echo "$STATUS_OUTPUT" | wc -l | tr -d ' ')

# Build summary message
SUMMARY=""
[ "$MODIFIED" -gt 0 ] && SUMMARY="${SUMMARY}Modified: $MODIFIED\n"
[ "$ADDED" -gt 0 ] && SUMMARY="${SUMMARY}Added: $ADDED\n"
[ "$DELETED" -gt 0 ] && SUMMARY="${SUMMARY}Deleted: $DELETED\n"
[ "$UNTRACKED" -gt 0 ] && SUMMARY="${SUMMARY}Untracked: $UNTRACKED\n"
[ "$CONFLICTED" -gt 0 ] && SUMMARY="${SUMMARY}Conflicts: $CONFLICTED\n"
[ "$MISSING" -gt 0 ] && SUMMARY="${SUMMARY}Missing: $MISSING\n"
SUMMARY="${SUMMARY}\nTotal: $TOTAL files"

osascript -e "display alert \"JELLYSVN Status — $(basename "$FOLDER")\" message \"$SUMMARY\""
